/**
 * Milestone 1, step 1 — prove the ProxySession plumbing end-to-end.
 *
 * What has to be true for the whole architecture to stand up:
 *
 *   - the Perspective engine boots in a SharedWorker (no DOM);
 *   - a window's Client reaches it over a ProxySession and can SEE a Table it
 *     did not create;
 *   - opening that Table costs a handle, not 20,000 rows;
 *   - windowed reads are cheap and FLAT with scroll depth, which is the one
 *     property CSRM cannot have;
 *   - the Table keeps ticking underneath without disturbing either.
 */
import { createHostHandle } from './hostClient.mjs';
import { createSafeView } from '../src/safeView.js';
import { BOOK_NAME } from './mockBook.mjs';

const steps = document.getElementById('steps');
const footnote = document.getElementById('footnote');

function begin(label) {
  const li = document.createElement('li');
  li.className = 'run';
  li.innerHTML = `<span class="label">${label}</span> — running…`;
  steps.appendChild(li);
  return {
    ok: (detail) => {
      li.className = 'ok';
      li.innerHTML = `<span class="label">${label}</span> — ${detail}`;
    },
    bad: (detail) => {
      li.className = 'bad';
      li.innerHTML = `<span class="label">${label}</span> — ${detail}`;
    },
  };
}

const ms = (n) => `${n.toFixed(1)}ms`;

async function timed(fn) {
  const t0 = performance.now();
  const value = await fn();
  return [value, performance.now() - t0];
}

async function run() {
  const pageStart = performance.now();

  // 1. Attach. The Client is created by `worker(port)` in THIS window; the
  //    host answered the handshake from a ProxySession bound to the far end.
  const step1 = begin('1. attach to SharedWorker host');
  const host = createHostHandle();
  // A SharedWorker has no visible console, so its boot progress is broadcast
  // over the control port. Without this a stall in there is a blank page.
  host.onMessage((message) => {
    if (message?.type === 'boot' || message?.type === 'connected') {
      footnote.textContent = `host: ${message.stage} (${ms(message.at)})`;
    } else if (message?.type === 'error') {
      begin('host').bad(message.detail);
    }
  });
  let client;
  try {
    const [value, attachMs] = await timed(() => host.client);
    client = value;
    const ready = await host.ready;
    const t = ready.timings;
    step1.ok(
      `Client live in ${ms(attachMs)} — this is window #${ready.attached}. ` +
        `Host boot: engine ${ms(t.clientMs)}, table ${ms(t.tableMs)}, ` +
        `generate ${ms(t.generateMs)}, load ${ms(t.loadMs)} (total ${ms(t.totalMs)}).`,
    );
  } catch (err) {
    step1.bad(String(err?.message ?? err));
    return;
  }

  // 2. The window can enumerate a Table it never created — that is the proxy
  //    working, not a local fallback.
  const step2 = begin('2. see the worker-held Table');
  let table;
  try {
    const [names, namesMs] = await timed(() => client.get_hosted_table_names());
    if (!names.includes(BOOK_NAME)) throw new Error(`hosted tables = [${names.join(', ')}]`);
    const [openedTable, openMs] = await timed(() => client.open_table(BOOK_NAME));
    table = openedTable;
    const [size, sizeMs] = await timed(() => table.size());
    step2.ok(
      `hosted=[${names.join(', ')}] in ${ms(namesMs)}; open_table in ${ms(openMs)}; ` +
        `${size.toLocaleString()} rows reported in ${ms(sizeMs)} — no rows crossed the port.`,
    );
  } catch (err) {
    step2.bad(String(err?.message ?? err));
    return;
  }

  // 3. Sorted View + windowed reads at three depths. Flat cost with depth is
  //    the claim the migration rests on.
  const step3 = begin('3. open a sorted View and read three windows');
  let safe;
  try {
    const [view, viewMs] = await timed(() => table.view({ sort: [['pnl', 'desc']] }));
    safe = createSafeView(view);
    const [rows] = await timed(() => view.num_rows());

    const depths = [0, 10_000, 19_900];
    const reads = [];
    for (const start of depths) {
      const [columns, readMs] = await timed(() =>
        safe.read({ start_row: start, end_row: start + 100 }),
      );
      const cols = Object.keys(columns ?? {}).length;
      reads.push(`@${start.toLocaleString()} ${ms(readMs)} (${cols} cols)`);
    }
    step3.ok(
      `view built in ${ms(viewMs)} over ${rows.toLocaleString()} rows; ` +
        `100-row reads — ${reads.join(', ')}.`,
    );
  } catch (err) {
    step3.bad(String(err?.message ?? err));
    return;
  }

  // 4. Deletion has to survive a read in flight. `createSafeView` drains
  //    first; deleting directly here is what throws the uncatchable borrow
  //    error that can take the worker down with it.
  const step4 = begin('4. close the View with a read in flight');
  try {
    const inFlight = safe.read({ start_row: 5_000, end_row: 5_100 });
    const [, closeMs] = await timed(() => safe.close());
    const columns = await inFlight;
    step4.ok(
      `read started, close() drained it and deleted in ${ms(closeMs)}; ` +
        `the in-flight read still returned ${Object.keys(columns ?? {}).length} columns, ` +
        `no borrow error.`,
    );
  } catch (err) {
    step4.bad(String(err?.message ?? err));
  }

  // 5. Reads while the book ticks. In production the feed writes continuously;
  //    a read path that only performs on a quiet table proves nothing.
  const step5 = begin('5. read while the book ticks (500 rows / 200ms)');
  try {
    host.send({ cmd: 'tick', on: true, rows: 500, everyMs: 200 });
    await host.once('tick');

    const view = await table.view({ sort: [['pnl', 'desc']] });
    const live = createSafeView(view);
    const samples = [];
    for (let i = 0; i < 8; i++) {
      const start = (i * 2_500) % 19_000;
      const [, readMs] = await timed(() => live.read({ start_row: start, end_row: start + 100 }));
      samples.push(readMs);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    await live.close();

    const status = (host.send({ cmd: 'status' }), await host.once('status'));
    host.send({ cmd: 'tick', on: false });

    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    step5.ok(
      `8 windowed reads under load — mean ${ms(mean)}, max ${ms(Math.max(...samples))}; ` +
        `host absorbed ${status.ticks} ticks at ${status.meanTickMs === null ? 'n/a' : ms(status.meanTickMs)} each.`,
    );
  } catch (err) {
    step5.bad(String(err?.message ?? err));
  }

  footnote.textContent =
    `Page to fully proven in ${ms(performance.now() - pageStart)}. ` +
    'Open this URL again in another window: step 1 reports a higher window number and the ' +
    'host boot timings of the FIRST window, because the engine and the book are not rebuilt.';
}

window.addEventListener('unhandledrejection', (event) => {
  const li = begin('unhandled rejection');
  li.bad(String(event.reason?.message ?? event.reason));
});

void run();
