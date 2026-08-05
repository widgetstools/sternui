/**
 * Three windows on ONE book — what the move into a SharedWorker was for.
 *
 * Session 1 measured the boundary (2.2 ms per block) and retired the memory
 * claim: Chrome hosts a SharedWorker INSIDE a renderer process, and the
 * engine's columnar book was only ~20 MB of a 400 MB renderer anyway. So the
 * prediction this probe exists to test is narrower and falsifiable:
 *
 *   three windows should cost ONE book and THREE block caches.
 *
 * If the renderer total scales like 3x the single-window figure, the shared
 * book is buying nothing measurable in memory and this has to say so. What it
 * should still buy is TIME: window 2 and window 3 open against a book that is
 * already built, where the Perspective path pays its 18.4 s snapshot per window.
 *
 * ## The checks that can fail
 *
 * "They share a book" is a claim. Three independent ones are made here, each
 * chosen because it would report a failure if the windows did NOT share:
 *
 *   1. the BROWSER's own target list holds exactly one live `shared_worker`
 *      running `ssrmBookWorker`. Two workers is two books;
 *   2. the worker's `introspect` reports ONE book id with THREE clients. A
 *      second book, or a book with one client, both show up here;
 *   3. an INSERT in window 1 is visible in window 3. Deliberately an insert and
 *      not a mutation: the book's own tick rewrites columns every 200 ms, so a
 *      value written in one window is gone before a read in another lands —
 *      two "the windows don't share a book" findings on the Perspective path
 *      came from exactly that, and they were wrong.
 *
 *   npm --prefix apps run build -w @starui/perspective-ssrm-lab
 *   cd apps/demos/perspective-ssrm-lab && npx vite preview --port 5301 --strictPort
 *   node packages/react-grid/ssrm-engine/scripts/multiWindowProbe.mjs
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import WebSocket from 'ws';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301/?engine=ssrm');
const windows = Number(opt('windows', '3'));
const settleMs = Number(opt('settle', '40000'));
const width = Number(opt('width', '1600'));
const height = Number(opt('height', '1000'));
const PORT = 9336;

const browser = await chromium.launch({
  headless: false,
  args: [`--remote-debugging-port=${PORT}`, `--window-size=${width},${height}`],
});

/** Browser-level CDP over a raw socket — the only view that includes SharedWorkers. */
const version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json());
const ws = new WebSocket(version.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((resolve) => ws.once('open', resolve));
let nextId = 1;
const pending = new Map();
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
});
const cdp = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

/** Working set per PID, from the OS — CDP does not report per-process memory. */
function workingSets() {
  const out = {};
  try {
    const csv = execSync('tasklist /FI "IMAGENAME eq chrome.exe" /FO CSV /NH', { encoding: 'utf8' });
    for (const line of csv.split(/\r?\n/)) {
      const m = line.match(/^"[^"]*","(\d+)",".*?",".*?","([\d,. ]+) K"/);
      if (m) out[Number(m[1])] = Math.round(Number(m[2].replace(/[^\d]/g, '')) / 1024);
    }
  } catch { /* tasklist unavailable */ }
  return out;
}

async function rendererMemory() {
  const sets = workingSets();
  let procs = [];
  try {
    const info = await cdp('SystemInfo.getProcessInfo');
    procs = info.processInfo ?? [];
  } catch { /* not all builds expose it */ }
  const renderers = procs
    .filter((p) => p.type === 'renderer')
    .map((p) => sets[p.id])
    .filter((n) => typeof n === 'number')
    .sort((a, b) => b - a);
  const byType = {};
  for (const p of procs) byType[p.type] = (byType[p.type] ?? 0) + 1;
  return {
    renderers,
    rendererTotal: renderers.reduce((a, b) => a + b, 0),
    chromeTotal: Object.values(sets).reduce((a, b) => a + b, 0),
    byType,
  };
}

/**
 * ONE context, N pages — and this is not a detail.
 *
 * `browser.newPage()` creates each page in a NEW BrowserContext, which is a
 * separate storage partition, so three windows opened that way get three
 * SharedWorkers and three books. MEASURED: the first run of this probe reported
 * `found 3` shared workers and a renderer total that scaled at exactly 2.86x,
 * which is what three independent books look like. The check above is what
 * caught it; without it the memory table would have been published as a
 * finding about sharing.
 */
const context = await browser.newContext({ viewport: { width, height } });

const pages = [];
const opens = [];
const stages = [];
const errors = [];

try {
  for (let i = 0; i < windows; i++) {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`w${i + 1}: ${String(e).slice(0, 160)}`));
    pages.push(page);

    const started = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.click('[data-testid="lab-tab-stress"]');
    await page.waitForSelector('[data-testid="ssrm-engine-grid"] .ag-row', { timeout: 180_000 });
    const firstRowMs = Date.now() - started;
    opens.push(firstRowMs);
    console.log(`window ${i + 1}: first row painted in ${firstRowMs} ms`);

    // Settle before sampling. The block cache fills for some seconds after the
    // first row, and a figure taken at the first row is a figure for a grid
    // that has not finished loading.
    await page.waitForTimeout(settleMs);
    const memory = await rendererMemory();
    stages.push({ windows: i + 1, ...memory });
    console.log(
      `  settled with ${i + 1} window${i === 0 ? '' : 's'}: ` +
      `renderers [${memory.renderers.join(', ')}] MB · total ${memory.rendererTotal} MB` +
      ` · chrome ${memory.chromeTotal} MB`,
    );
  }

  // ── 1. ONE worker, and it really is a worker ────────────────────────────
  const { targetInfos } = await cdp('Target.getTargets');
  const bookWorkers = targetInfos.filter(
    (t) => t.type === 'shared_worker' && /ssrmBookWorker/i.test(t.url),
  );
  if (bookWorkers.length !== 1) {
    throw new Error(
      `expected exactly 1 shared_worker running ssrmBookWorker, found ${bookWorkers.length}. ` +
      `${bookWorkers.length === 0
        ? 'The surface is NOT worker-hosted and nothing above means anything.'
        : 'The windows are on separate workers, so they are on separate books.'}`,
    );
  }

  // ── 2. ONE book, N clients, as the WORKER reports it ────────────────────
  const seen = [];
  for (const page of pages) {
    seen.push(await page.evaluate(() => window.__ssrmEngineGrid.introspect()));
  }
  const first = seen[0];
  if (first.books.length !== 1) {
    throw new Error(`the worker holds ${first.books.length} books, not 1: ${JSON.stringify(first.books)}`);
  }
  if (first.books[0].clients !== windows) {
    throw new Error(
      `the worker reports ${first.books[0].clients} clients on '${first.books[0].bookId}', not ${windows} — ` +
      'the windows are not all attached to it',
    );
  }
  for (let i = 1; i < seen.length; i++) {
    if (JSON.stringify(seen[i].books) !== JSON.stringify(first.books)) {
      throw new Error(`window ${i + 1} sees a different set of books: ${JSON.stringify(seen[i].books)}`);
    }
  }

  // ── 3. An INSERT in window 1 reaches window N ───────────────────────────
  const key = `PROBE-${process.pid}-${Date.now()}`;
  const before = await Promise.all(
    pages.map((p) => p.evaluate(() => window.__ssrmEngineGrid.client.fetchSize())),
  );
  await pages[0].evaluate(
    (id) => window.__ssrmEngineGrid.client.applyUpdate([{ id, symbol: 'PROBE' }]),
    key,
  );
  await pages[0].waitForTimeout(1500);
  const after = await Promise.all(
    pages.map((p) => p.evaluate(() => window.__ssrmEngineGrid.client.fetchSize())),
  );
  const grew = after.map((n, i) => n - before[i]);
  if (!grew.every((d) => d === 1)) {
    throw new Error(
      `an insert in window 1 changed the book by [${grew.join(', ')}] per window, not [${grew.map(() => 1).join(', ')}] — ` +
      'these windows are NOT reading one book',
    );
  }
  // And the same row is readable from the LAST window, not just counted there.
  const readBack = await pages[pages.length - 1].evaluate(async (id) => {
    const result = await window.__ssrmEngineGrid.client.getRows({
      startRow: 0,
      endRow: 1,
      filterModel: { id: { filterType: 'text', type: 'equals', filter: id } },
    });
    return result.rowData.length;
  }, key);

  // ── 4. What does the per-subscriber viewport actually save? ─────────────
  //
  // A/B on ONE window against ONE feed, because two windows would differ in
  // scroll position, viewport height and block cache as well. Rows RECEIVED is
  // the honest counter: it is what crossed the port, before the pump conflates
  // or drops anything.
  const target = pages[pages.length - 1];
  const sampleReceived = async (ms) => {
    const before = await target.evaluate(() => window.__ssrmEngineGrid.pump().received);
    await target.waitForTimeout(ms);
    const after = await target.evaluate(() => window.__ssrmEngineGrid.pump().received);
    return after - before;
  };

  const WINDOW_MS = 20_000;
  const narrowedRows = await sampleReceived(WINDOW_MS);
  await target.evaluate(() => window.__ssrmEngineGrid.viewportReporting(false));
  await target.waitForTimeout(1500);
  const wideRows = await sampleReceived(WINDOW_MS);
  await target.evaluate(() => window.__ssrmEngineGrid.viewportReporting(true));

  // ── 5. Push: does a tick in the worker reach every window? ──────────────
  const pumps = [];
  const openCosts = [];
  for (const page of pages) {
    pumps.push(await page.evaluate(() => window.__ssrmEngineGrid.pump()));
    openCosts.push(await page.evaluate(() => window.__ssrmEngineGrid.open()));
  }

  // ── Report ─────────────────────────────────────────────────────────────
  console.log(`\n=== ${windows} windows, one book ===\n`);
  console.log(`  shared_worker targets        ${bookWorkers.length} (ssrmBookWorker)`);
  console.log(`  chrome processes             ${JSON.stringify(stages.at(-1).byType)}`);
  console.log(
    `  a process for the worker?    ${
      stages.at(-1).byType.worker || stages.at(-1).byType.shared_worker
        ? 'YES'
        : 'NO — hosted inside a renderer, as measured in session 1'
    }`,
  );
  console.log(`  book id                      ${first.books[0].bookId}`);
  console.log(`  clients on it                ${first.books[0].clients}`);
  console.log(`  clients declaring a viewport ${first.books[0].viewports}`);
  console.log(`  ports reaped as stale        ${first.reaped}`);
  console.log(`  insert in w1 seen everywhere ${grew.every((d) => d === 1) ? 'YES' : 'NO'}   (+1 row per window)`);
  console.log(`  and readable in w${windows}            ${readBack === 1 ? 'YES' : `NO — read back ${readBack} rows`}`);

  console.log(`\n  time to first row painted   (app boot + grid mount + the book)`);
  opens.forEach((ms, i) => {
    const versus = i === 0 ? '' : `   ${(ms / opens[0]).toFixed(2)}x window 1`;
    console.log(`    window ${i + 1}                    ${String(ms).padStart(6)} ms${versus}`);
  });

  console.log(`\n  of which, GETTING THE BOOK  (the only part sharing can change)`);
  openCosts.forEach((cost, i) => {
    if (!cost) return console.log(`    window ${i + 1}                       (not reported)`);
    const built = cost.clientsAtOpen === 1 ? 'built it' : `joined ${cost.clientsAtOpen - 1} client(s)`;
    console.log(
      `    window ${i + 1}                    ${cost.ms.toFixed(0).padStart(6)} ms   ${built}`,
    );
  });

  console.log(`\n  renderer working set, settled`);
  for (const stage of stages) {
    const scale = stage.rendererTotal / stages[0].rendererTotal;
    console.log(
      `    ${stage.windows} window${stage.windows === 1 ? ' ' : 's'}                  ` +
      `[${stage.renderers.join(', ')}] MB   total ${String(stage.rendererTotal).padStart(5)} MB` +
      `   ${scale.toFixed(2)}x the 1-window total`,
    );
  }
  const scale = stages.at(-1).rendererTotal / stages[0].rendererTotal;
  console.log(
    `\n  VERDICT  ${windows} windows cost ${scale.toFixed(2)}x one window. ` +
    `${scale >= windows - 0.25
      ? `That is ~${windows}x: the shared book is buying no measurable memory, only time.`
      : `Below ${windows}x: something is genuinely shared beyond the block caches.`}`,
  );

  console.log(`\n  push pump per window`);
  pumps.forEach((p, i) => {
    if (!p) return console.log(`    window ${i + 1}                    (no pump)`);
    console.log(
      `    window ${i + 1}                    received ${p.received}  applied ${p.applied}` +
      `  dropped ${p.dropped}  flushes ${p.flushes}  sliced ${p.sliced}  maxPending ${p.maxPending}`,
    );
  });

  const perTickNarrow = (narrowedRows / (WINDOW_MS / 200)).toFixed(1);
  const perTickWide = (wideRows / (WINDOW_MS / 200)).toFixed(1);
  console.log(`\n  per-subscriber viewport, A/B on window ${windows} over ${WINDOW_MS / 1000}s each`);
  console.log(`    rows pushed, viewport ON     ${String(narrowedRows).padStart(6)}   ~${perTickNarrow} per tick`);
  console.log(`    rows pushed, viewport OFF    ${String(wideRows).padStart(6)}   ~${perTickWide} per tick`);
  console.log(
    `    narrowing                    ${
      wideRows === 0 ? 'n/a — nothing was pushed either way' : `${(wideRows / Math.max(1, narrowedRows)).toFixed(0)}x fewer rows on the wire`
    }`,
  );

  console.log(`\n  page errors                  ${errors.length === 0 ? 'none' : errors.slice(0, 3).join(' | ')}`);
  console.log(`\n  For comparison: the Perspective path pays its 18.4 s snapshot per window.\n`);
} catch (error) {
  console.log(`\nFAILED: ${String(error).slice(0, 600)}\n`);
  process.exitCode = 1;
} finally {
  ws.close();
  await browser.close();
}
