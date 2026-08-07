/**
 * The engine at a given book size — and specifically, what a WRITE costs there.
 *
 * ## The question this exists to answer
 *
 * Session 7 (incremental index maintenance) is gated on a number nobody had.
 * The engine's trade today is stated plainly in the README: **any write clears
 * the query cache and the index.** So under a live feed the next block read
 * after each tick re-derives the whole ordering for the current query shape.
 * At 50,000 rows that is a trade worth making. Whether it still is at 500,000
 * is the entire content of the session-7 decision, and it is measurable rather
 * than arguable.
 *
 * The measurement is a DIFFERENCE, not an absolute. Two identical read series
 * over the same book:
 *
 *   - **cold-cached** (`?tick=0`): nothing writes, so the index for a sort or
 *     filter is built once and every later block reads it back;
 *   - **live** (`?tick=200`): a write lands between reads, so each block pays
 *     to rebuild what the previous one built.
 *
 * The gap between them IS what session 7 would remove. An absolute block time
 * cannot separate that cost from the cost of the book simply being larger, and
 * a probe that reported only the live number would credit session 7 with work
 * it cannot avoid.
 *
 * ## What this refuses to be satisfied by
 *
 *   - **the wrong book.** The worker memoises a book per id and hands the
 *     existing one to the next client that asks, IGNORING its options — so a
 *     stale worker serves the previous size with a plausible row count and no
 *     complaint. The size asked for, the size the handle reports and the size
 *     the engine reports are all compared before any timing is kept;
 *   - **a warm read reported as a cold one.** Every series purges and re-reads,
 *     and the first sample after a query-shape change is reported SEPARATELY
 *     rather than folded into a median that would hide it;
 *   - **an unsorted read.** A block read with no sort touches no index at all,
 *     so it would show no difference between the two runs and read as "writes
 *     are free". Every series below sorts, and one also filters.
 *
 *   node packages/react-grid/ssrm-engine/scripts/bookScaleProbe.mjs \
 *     --url http://localhost:5321/ --rows 500000
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('url', 'http://localhost:5321/');
const rows = Number.parseInt(opt('rows', '500000'), 10);
const tickMs = Number.parseInt(opt('tick', '200'), 10);

const q = (t) => `${base}?rows=${rows}&tick=${t}`;

const stat = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
  return { n: s.length, min: s[0], p50: at(0.5), p95: at(0.95), max: s[s.length - 1] };
};
const ms = (v) => (v === null || v === undefined ? '—' : `${v.toFixed(1)} ms`);
const row = (label, st) =>
  st === null
    ? `  ${label.padEnd(26)} —`
    : `  ${label.padEnd(26)} n=${String(st.n).padStart(3)}  p50 ${ms(st.p50).padStart(9)}  p95 ${ms(st.p95).padStart(9)}  max ${ms(st.max).padStart(9)}`;

const failures = [];
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

/**
 * One run at one tick rate. A FRESH context each time: the SharedWorker dies
 * with its last client, and reusing one would let a book built under the
 * previous tick rate answer the next run.
 */
async function run(browser, tick) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const crashes = [];
  page.on('crash', () => crashes.push('the tab crashed'));
  page.on('pageerror', (e) => {
    const t = String(e.message ?? e);
    if (!/License Key|ag-grid\.com|\*{10}|Failed to load resource|ERR_NAME_NOT_RESOLVED/i.test(t)) {
      crashes.push(t.slice(0, 160));
    }
  });

  const stage = (m) => console.error(`      [tick=${tick}] ${m}`);
  const startedAt = Date.now();
  stage('goto');
  await page.goto(q(tick), { waitUntil: 'domcontentloaded' });
  // Generous: building 500,000 x 120 in a worker is not instant, and a timeout
  // here would be reported as a failure of the engine rather than of the wait.
  await page.waitForSelector('.ag-row', { timeout: 600_000 });
  const firstRowMs = Date.now() - startedAt;
  stage(`first row after ${firstRowMs} ms — entering the read series`);

  const out = await page.evaluate(async ({ tick }) => {
    const settle = (ms) => new Promise((r) => setTimeout(r, ms));
    const handle = window.__ssrmEngineGrid;
    const api = handle?.api;
    if (!api) return { fatal: 'no grid api' };

    /** Time ONE cold read of a query shape, and then a series of warm ones. */
    const readSeries = async (label, apply, samples = 12, afterApply) => {
      apply();
      await settle(1_500);
      if (afterApply) await afterApply();
      // Purge so the next reads are genuinely served by the engine rather than
      // by AG's block cache, which would time nothing at all.
      api.refreshServerSide({ purge: true });
      const before = handle.blocks().ms.length;
      await settle(4_000);
      const afterCold = handle.blocks().ms;
      const cold = afterCold.slice(before);

      // Warm series: scroll through the book so AG asks for new blocks under
      // the SAME query shape. Under a live feed the index each of these needs
      // has been discarded by a write since the last one.
      const marks = [];
      const total = api.getDisplayedRowCount();
      for (let i = 0; i < samples; i += 1) {
        const at = Math.floor((total / (samples + 1)) * (i + 1));
        const n = handle.blocks().ms.length;
        api.ensureIndexVisible(at, 'top');
        await settle(700);
        marks.push(...handle.blocks().ms.slice(n));
      }
      return { label, cold, warm: marks };
    };

    const series = [];
    // Sorted: the index is the thing a write discards, and a sort is the
    // cheapest way to require one.
    series.push(
      await readSeries('sorted', () =>
        api.applyColumnState({ state: [{ colId: 'midPrice', sort: 'desc' }], defaultState: { sort: null } }),
      ),
    );
    // Sorted AND filtered: two derived structures per read rather than one.
    series.push(
      await readSeries('sorted + filtered', () => {
        api.setFilterModel({ esgScore: { filterType: 'number', type: 'greaterThan', filter: 50 } });
      }),
    );
    api.setFilterModel(null);
    await settle(1_500);
    // Grouped: the folded aggregate is derived per read as well.
    //
    // The group is EXPANDED first, and that is not cosmetic. Every string field
    // in this book has exactly 8 distinct values, so a grouped root is 8 rows —
    // scrolling it asks for no further blocks, and the warm series came back
    // empty, which reads identically to "grouping costs nothing". The leaves
    // under one group are ~1/8th of the book, which is a real series.
    series.push(
      await readSeries('grouped by desk', () => {
        api.applyColumnState({ state: [{ colId: 'desk', rowGroup: true }], defaultState: { rowGroup: false } });
      }, 6, async () => {
        const first = api.getDisplayedRowAtIndex(0);
        if (first) api.setRowNodeExpanded(first, true);
        await settle(4_000);
      }),
    );

    return {
      tick,
      surface: handle.surface,
      rowsAsked: handle.rows,
      tickAsked: handle.tickMs,
      bookRows: await handle.client.countFiltered({}),
      open: handle.open(),
      rpc: handle.rpc(),
      blocks: handle.blocks(),
      /**
       * PROOF that the feed was what this run asked for.
       *
       * The book id carries the row count but NOT the tick rate, and the worker
       * memoises per id and ignores a later client's `bookOptions`. So if the
       * worker outlived the previous run, the live run would attach to a book
       * that is not ticking, measure the ticking-off cost twice, and report
       * that writes are free at this size — the exact false conclusion this
       * probe exists to prevent, arrived at with clean-looking numbers.
       */
      pump: handle.pump(),
      clientsAtOpen: handle.open()?.clientsAtOpen ?? null,
      series,
    };
  }, { tick });

  /**
   * Two heaps, because the book is not in the one that is easy to read.
   *
   * A SharedWorker shares the renderer PROCESS but has its own V8 ISOLATE, so
   * `Runtime.getHeapUsage` against the page returns the grid's heap and not a
   * byte of the book. Reporting that single number as the cost of a 500,000-row
   * book would understate it by whatever the book actually weighs — and it
   * would look reassuring, which is worse than looking wrong. The worker target
   * is attached separately and reported separately.
   */
  stage('read series done — reading heaps');
  let pageHeapMb = null;
  let workerHeapMb = null;
  try {
    const cdp = await context.newCDPSession(page);
    const { usedSize } = await cdp.send('Runtime.getHeapUsage');
    pageHeapMb = usedSize / (1024 * 1024);
  } catch { /* not fatal to the measurement */ }
  /**
   * Every CDP call here is RACED against a deadline, and that is not belt and
   * braces. `Target.attachToTarget` against a SharedWorker returns a promise
   * that can simply never settle — MEASURED: the first version of this hung the
   * whole probe at every book size, printing the header and then nothing, which
   * looks exactly like a 500,000-row book being too slow to build. A `try`
   * block does not catch a hang. The heap is a nice-to-have; the timings are
   * the measurement, and nothing optional may be able to take them down.
   */
  const withDeadline = (promise, ms) =>
    Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('cdp timeout')), ms))]);
  try {
    const browserCdp = await withDeadline(browser.newBrowserCDPSession(), 5_000);
    // Workers are NOT in the default target list — without discovery the find
    // below simply returns nothing and the heap reads as "unread", which is
    // indistinguishable from a worker that has already exited.
    await withDeadline(browserCdp.send('Target.setDiscoverTargets', { discover: true }), 5_000)
      .catch(() => {});
    const { targetInfos } = await withDeadline(browserCdp.send('Target.getTargets'), 5_000);
    const worker = targetInfos.find((t) => t.type === 'shared_worker');
    if (worker) {
      const { sessionId } = await withDeadline(
        browserCdp.send('Target.attachToTarget', { targetId: worker.targetId, flatten: true }),
        5_000,
      );
      const session = browserCdp.connection?.session?.(sessionId)
        ?? browserCdp._connection?.session?.(sessionId);
      try {
        if (session) {
          const { usedSize } = await withDeadline(session.send('Runtime.getHeapUsage'), 5_000);
          workerHeapMb = usedSize / (1024 * 1024);
        }
      } finally {
        /**
         * DETACH, always. An attached SharedWorker target stays suspended, and
         * a suspended worker from the first run stopped the SECOND run from
         * ever serving a row — the probe printed its header and hung, at every
         * book size, which reads exactly like a book too large to build. The
         * measurement is two runs; anything the first run leaves behind is a
         * defect in the second.
         */
        await withDeadline(
          browserCdp.send('Target.detachFromTarget', { sessionId }),
          5_000,
        ).catch(() => {});
      }
    }
  } catch { /* the book's own heap stays unreported rather than guessed */ }

  stage('closing context');
  await context.close();
  stage('done');
  return { ...out, firstRowMs, pageHeapMb, workerHeapMb, crashes };
}

const browser = await chromium.launch({ headless: false });
try {
  console.log(`\n=== ssrm-engine at ${rows.toLocaleString()} rows · ${base}\n`);

  const cold = await run(browser, 0);
  if (cold.fatal) throw new Error(`tick=0: ${cold.fatal}`);
  const live = await run(browser, tickMs);
  if (live.fatal) throw new Error(`tick=${tickMs}: ${live.fatal}`);

  for (const r of [cold, live]) {
    const tag = r.tick === 0 ? 'TICKING OFF' : `TICKING every ${r.tick} ms`;
    console.log(`--- ${tag}`);
    console.log(`  surface ${r.surface} · asked ${r.rowsAsked.toLocaleString()} · book reports ${r.bookRows.toLocaleString()}`);
    console.log(
      `  book open ${r.open ? `${r.open.ms.toFixed(0)} ms` : '—'} · first row ${r.firstRowMs} ms` +
        ` · grid heap ${r.pageHeapMb ? `${r.pageHeapMb.toFixed(0)} MB` : '—'}` +
        ` · BOOK heap ${r.workerHeapMb ? `${r.workerHeapMb.toFixed(0)} MB` : 'unread'}`,
    );
    for (const s of r.series) {
      console.log(row(`${s.label} · cold`, stat(s.cold)));
      console.log(row(`${s.label} · warm`, stat(s.warm)));
    }
    console.log(`  blocks served ${r.blocks.served}, failed ${r.blocks.failed}\n`);
  }

  console.log('--- WHAT A WRITE COSTS (live minus ticking-off, warm reads)\n');
  for (let i = 0; i < cold.series.length; i += 1) {
    const a = stat(cold.series[i].warm);
    const b = stat(live.series[i].warm);
    if (!a || !b) continue;
    const delta = b.p50 - a.p50;
    const factor = a.p50 > 0 ? b.p50 / a.p50 : 0;
    console.log(
      `  ${cold.series[i].label.padEnd(20)} ${ms(a.p50).padStart(9)} → ${ms(b.p50).padStart(9)}` +
        `   +${delta.toFixed(1)} ms  (${factor.toFixed(2)}x)`,
    );
  }
  console.log('');

  check('both runs got the book they ASKED for', cold.bookRows === rows && live.bookRows === rows,
    `${cold.bookRows.toLocaleString()} / ${live.bookRows.toLocaleString()} vs ${rows.toLocaleString()} asked`);
  // Without these two the whole comparison is unfalsifiable: a live run that
  // silently attached to a non-ticking book produces the tidiest possible
  // "writes are free" result.
  check('each run BUILT its own book — no memoised one from the other',
    cold.clientsAtOpen === 1 && live.clientsAtOpen === 1,
    `clients at open: ${cold.clientsAtOpen} / ${live.clientsAtOpen}`);
  check('the live run actually saw WRITES, and the other saw none',
    (live.pump?.received ?? 0) > 0 && (cold.pump?.received ?? 0) === 0,
    `received ${live.pump?.received ?? '—'} live vs ${cold.pump?.received ?? '—'} with ticking off`);
  check('no failed blocks', cold.blocks.failed === 0 && live.blocks.failed === 0,
    `${cold.blocks.failed} + ${live.blocks.failed}`);
  check('the tab survived both runs', cold.crashes.length === 0 && live.crashes.length === 0,
    [...cold.crashes, ...live.crashes].slice(0, 2).join(' | ') || 'no crashes, no page errors');

  console.log('');
  if (failures.length > 0) {
    console.log(`  ${failures.length} FAILURES:`);
    for (const f of failures) console.log(`    - ${f}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
