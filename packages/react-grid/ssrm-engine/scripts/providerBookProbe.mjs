/**
 * Is the book actually being driven by the PROVIDER?
 *
 * `?engine=ssrm` runs a book generated inside the app's own SharedWorker.
 * `?engine=ssrm&book=provider` runs the same engine and the same grid over a
 * book filled by `host-data`: the provider emits, `createSsrmBookFeed`
 * decorates that emit, and `applySnapshot` / `applyUpdate` are driven by the
 * feed. This probe exists to tell those two apart, because on screen they look
 * identical — same rows, same columns, same ticking.
 *
 * ## What it refuses to accept
 *
 *   1. a `shared_worker` running `dataServicesSsrmWorker` must be live. If the
 *      app fell back to the Perspective worker asset there is no SSRM host in
 *      it at all, and every number below would be from the generated book;
 *   2. `ssrmBookWorker` must NOT be running. Its presence would mean the
 *      generated book is up too, and a figure taken with both is a figure for
 *      two books recorded as one — the contamination that made a renderer
 *      reading on this surface 1,114 MB instead of 411 MB;
 *   3. the book must TICK. A snapshot that loaded and then went silent is a
 *      feed that delivered its first frame and stopped, which is
 *      indistinguishable from a working one in a screenshot;
 *   4. two windows must share it — one book, two clients, as the worker itself
 *      reports.
 *
 *   npm --prefix apps run build -w @starui/perspective-ssrm-lab
 *   cd apps/demos/perspective-ssrm-lab && npx vite preview --port 5301 --strictPort
 *   node packages/react-grid/ssrm-engine/scripts/providerBookProbe.mjs
 */
import { chromium } from '@playwright/test';
import WebSocket from 'ws';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301/?engine=ssrm&book=provider');
const PORT = 9337;

const browser = await chromium.launch({
  headless: false,
  args: [`--remote-debugging-port=${PORT}`],
});

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

// One context, so both pages share a storage partition and therefore a
// SharedWorker. `browser.newPage()` would give each its own of both.
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const errors = [];

try {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  const started = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.click('[data-testid="lab-tab-stress"]');
  await page.waitForSelector('[data-testid="ssrm-engine-grid"] .ag-row', { timeout: 180_000 });
  const firstRowMs = Date.now() - started;
  await page.waitForTimeout(8000);

  // ── 1 & 2. Which workers are alive ──────────────────────────────────────
  const { targetInfos } = await cdp('Target.getTargets');
  const workers = targetInfos.filter((t) => t.type === 'shared_worker');
  const dataServices = workers.filter((t) => /dataServicesSsrmWorker/i.test(t.url));
  const generated = workers.filter((t) => /ssrmBookWorker/i.test(t.url));

  if (dataServices.length !== 1) {
    throw new Error(
      `expected 1 shared_worker running dataServicesSsrmWorker, found ${dataServices.length}. ` +
      `Live shared workers: ${workers.map((t) => t.url.split('/').pop()).join(', ') || 'none'}. ` +
      'Without it there is no SSRM host in the data-services worker and the rows are not from a provider.',
    );
  }
  if (generated.length !== 0) {
    throw new Error(
      `ssrmBookWorker is ALSO running (${generated.length}). Two books are up, and any figure ` +
      'taken here would be of both recorded as one.',
    );
  }

  // ── 3. Does it tick? ────────────────────────────────────────────────────
  const before = await page.evaluate(() => ({
    size: window.__ssrmEngineGrid.client.size,
    pump: window.__ssrmEngineGrid.pump(),
  }));
  await page.waitForTimeout(6000);
  const after = await page.evaluate(() => ({
    size: window.__ssrmEngineGrid.client.size,
    pump: window.__ssrmEngineGrid.pump(),
    columns: window.__ssrmEngineGrid.api.getColumns()?.length ?? 0,
    rowCount: window.__ssrmEngineGrid.api.getDisplayedRowCount?.(),
  }));

  if (before.size === 0) {
    throw new Error('the book is EMPTY — the feed built a book and put no rows in it');
  }
  if (after.pump.received === before.pump.received) {
    throw new Error(
      `no rows were pushed in 6 s (received stuck at ${before.pump.received}) — the feed ` +
      'delivered its snapshot and stopped, which looks identical to a live one on screen',
    );
  }

  // ── 4. Two windows, one book ────────────────────────────────────────────
  const second = await context.newPage();
  second.on('pageerror', (e) => errors.push(`w2: ${String(e).slice(0, 200)}`));
  const secondStarted = Date.now();
  await second.goto(url, { waitUntil: 'domcontentloaded' });
  await second.click('[data-testid="lab-tab-stress"]');
  await second.waitForSelector('[data-testid="ssrm-engine-grid"] .ag-row', { timeout: 180_000 });
  const secondRowMs = Date.now() - secondStarted;
  await second.waitForTimeout(3000);

  const held = await page.evaluate(() => window.__ssrmEngineGrid.introspect());
  if (held.books.length !== 1) {
    throw new Error(`the worker holds ${held.books.length} books, not 1: ${JSON.stringify(held.books)}`);
  }
  if (held.books[0].clients !== 2) {
    throw new Error(
      `the worker reports ${held.books[0].clients} clients on '${held.books[0].bookId}', not 2 — ` +
      'the two windows are not on one book',
    );
  }

  const opens = [
    await page.evaluate(() => window.__ssrmEngineGrid.open()),
    await second.evaluate(() => window.__ssrmEngineGrid.open()),
  ];

  console.log(`\n=== the SSRM book, driven by a provider ===\n`);
  console.log(`  data-services shared worker  ${dataServices[0].url.split('/').pop()}`);
  console.log(`  ssrmBookWorker also running  NO   (a second book would contaminate every figure)`);
  console.log(`  book id                      ${held.books[0].bookId}`);
  console.log(`  rows the book holds          ${after.size.toLocaleString()}`);
  console.log(`  columns AG reports           ${after.columns}`);
  console.log(`  rows AG displays             ${after.rowCount?.toLocaleString?.() ?? after.rowCount}`);
  console.log(`  rows pushed in 6 s           ${after.pump.received - before.pump.received}   (0 would mean the feed stopped)`);
  console.log(`  of those, applied to the DOM ${after.pump.applied - before.pump.applied}`);
  console.log(`  clients on the book          ${held.books[0].clients}`);
  console.log(`  declaring a viewport         ${held.books[0].viewports}`);
  console.log(`\n  time to first row painted    w1 ${firstRowMs} ms · w2 ${secondRowMs} ms`);
  console.log(
    `  of which, ATTACHING          w1 ${opens[0] ? opens[0].ms.toFixed(0) : '?'} ms · ` +
    `w2 ${opens[1] ? opens[1].ms.toFixed(0) : '?'} ms`,
  );
  console.log(`\n  page errors                  ${errors.length === 0 ? 'none' : errors.slice(0, 3).join(' | ')}\n`);
} catch (error) {
  console.log(`\nFAILED: ${String(error).slice(0, 700)}\n`);
  process.exitCode = 1;
} finally {
  ws.close();
  await browser.close();
}
