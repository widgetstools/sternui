/**
 * What does moving the book into a SharedWorker COST per block?
 *
 * The engine reads a warm 100-row block in 0.6 ms in Node. Everything above
 * that, once the book is behind a port, is the boundary — and if the boundary
 * is expensive then hosting the book elsewhere bought latency back at the price
 * of the thing the engine was faster at. The session that built this said it
 * FAILS above ~10 ms per block.
 *
 * ## What this probe refuses to do
 *
 * Report anything before proving the book is actually in a worker. A surface
 * that silently fell back to an in-window engine would produce beautiful
 * numbers here — sub-millisecond, no boundary at all — and they would mean the
 * opposite of what they appear to mean. So the first thing it does is ask the
 * BROWSER for its target list and require a live `shared_worker` running
 * `ssrmBookWorker`. No worker, no measurement.
 *
 * Playwright's page-level CDP session cannot see SharedWorkers at all, hence the
 * raw WebSocket to the browser endpoint — the same technique as
 * `perspective-grid/scripts/workerCrashProbe.mjs`.
 *
 * ## Three numbers, because "the boundary" is three different things
 *
 *   1. `size` round trip — a call that does NO engine work. This is the port,
 *      the structured clone of two small objects, and nothing else: the floor.
 *   2. `getRows` round trip — the same, plus materialising the block and
 *      cloning 100 rows x 121 columns back. Against the 0.6 ms Node figure,
 *      this difference IS the cost of hosting the book elsewhere.
 *   3. AG end to end — entry to `getRows` until the grid is answered, recorded
 *      by the datasource itself while a real scroll drives it.
 *
 *   npm --prefix apps run build -w @starui/perspective-ssrm-lab
 *   cd apps/demos/perspective-ssrm-lab && npx vite preview --port 5301 --strictPort
 *   node packages/react-grid/ssrm-engine/scripts/workerBoundaryProbe.mjs
 */
import { chromium } from '@playwright/test';
import WebSocket from 'ws';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301/?engine=ssrm');
/**
 * `--tab` picks the surface: `stress` (the default) is the plain `AgGridReact`
 * control, `ssrm-engine-mg` is the same book under MarketsGrid. Both publish
 * the same `__ssrmEngineGrid` handle, which is what makes the A/B a flag change
 * rather than a second probe — and the A/B must be run by ALTERNATING them in
 * one series, because this metric is bimodal on identical code.
 */
const tab = opt('tab', 'stress');
/** The surface container's testid — it differs per tab, the handle does not. */
const grid = opt('grid', tab === 'stress' ? 'ssrm-engine-grid' : 'ssrm-engine-marketsgrid');
const rounds = Number(opt('rounds', '80'));
const PORT = 9335;

const pct = (xs, p) => (xs.length === 0 ? NaN : [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]);
const ms = (n) => (Number.isNaN(n) ? '   n/a' : `${n.toFixed(2)} ms`);
const row = (label, xs) =>
  `  ${label.padEnd(30)} n=${String(xs.length).padStart(4)}  median ${ms(pct(xs, 0.5))}  p90 ${ms(pct(xs, 0.9))}  max ${ms(Math.max(...xs))}`;

const browser = await chromium.launch({
  headless: false,
  args: [`--remote-debugging-port=${PORT}`],
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

const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.click(`[data-testid="lab-tab-${tab}"]`);
  await page.waitForSelector(`[data-testid="${grid}"] .ag-row`, { timeout: 180_000 });
  await page.waitForTimeout(4000);

  // ── 1. Is the book actually in a worker? ────────────────────────────────
  const { targetInfos } = await cdp('Target.getTargets');
  const workers = targetInfos.filter((t) => t.type === 'shared_worker');
  const book = workers.find((t) => /ssrmBookWorker/i.test(t.url));
  if (!book) {
    throw new Error(
      `no shared_worker running ssrmBookWorker — targets: ${targetInfos
        .map((t) => `${t.type}`)
        .join(', ')}. The surface is NOT worker-hosted and no timing below would mean anything.`,
    );
  }
  console.log(`\n=== @starui/ssrm-engine, worker-hosted ===\n`);
  console.log(`  shared_worker target         ${book.url.split('/').pop()}`);

  // ── 2. Did Chrome give it its own PROCESS? ──────────────────────────────
  // On the Perspective path it did NOT — `SystemInfo.getProcessInfo` reported
  // no worker process at all, so the book competed with the grid for one
  // renderer's ~4 GB. Asking rather than assuming is the whole point.
  let processes = [];
  try {
    const info = await cdp('SystemInfo.getProcessInfo');
    processes = info.processInfo ?? [];
  } catch (error) {
    console.log(`  SystemInfo.getProcessInfo     unavailable: ${String(error).slice(0, 80)}`);
  }
  const byType = {};
  for (const p of processes) byType[p.type] = (byType[p.type] ?? 0) + 1;
  console.log(`  chrome processes              ${JSON.stringify(byType)}`);
  console.log(
    `  a process for the worker?     ${
      byType.worker || byType.shared_worker
        ? 'YES'
        : 'NO — Chrome hosts it inside a renderer, so the book shares that process'
    }`,
  );

  // ── 3. The boundary, decomposed ─────────────────────────────────────────
  const timing = await page.evaluate(async (n) => {
    const handle = window.__ssrmEngineGrid;
    if (!handle?.client) return { fatal: 'no worker client on the measurement handle' };
    const client = handle.client;

    const sizeMs = [];
    for (let i = 0; i < n; i++) {
      const start = performance.now();
      await client.fetchSize();
      sizeMs.push(performance.now() - start);
    }

    // Offsets are perturbed per iteration. The engine caches a materialised
    // index per query SHAPE, so repeating one request measures the cache — the
    // mistake that once reported a sort as 0.8 ms.
    const blockMs = [];
    const rowsSeen = [];
    for (let i = 0; i < n; i++) {
      const startRow = ((i * 997) % 19_800) + 1;
      const start = performance.now();
      const result = await client.getRows({ startRow, endRow: startRow + 100 });
      blockMs.push(performance.now() - start);
      rowsSeen.push(result.rowData.length);
    }

    return {
      sizeMs,
      blockMs,
      rowsPerBlock: Math.min(...rowsSeen),
      columnsPerRow: null,
      book: client.size,
      rpc: client.stats(),
    };
  }, rounds);

  if (timing.fatal) throw new Error(timing.fatal);
  if (timing.rowsPerBlock !== 100) {
    throw new Error(
      `a block came back with ${timing.rowsPerBlock} rows, not 100 — the reads are not doing what this is timing`,
    );
  }

  console.log(`\n  book the worker reports      ${timing.book.toLocaleString()} rows\n`);
  console.log(row('port round trip (size)', timing.sizeMs));
  console.log(row('block round trip (100 rows)', timing.blockMs));

  // ── 4. AG end to end, under a real scroll ───────────────────────────────
  const box = await (await page.$('.ag-body-viewport, .ag-root-wrapper')).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 50; i++) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(3000);

  const blocks = await page.evaluate(() => window.__ssrmEngineGrid.blocks());
  if (blocks.served === 0) {
    throw new Error('the datasource served no blocks — nothing was measured end to end');
  }
  console.log(row('AG getRows end to end', blocks.ms));
  console.log(`\n  blocks served                ${blocks.served}`);
  console.log(`  blocks FAILED                ${blocks.failed}`);

  const rpc = await page.evaluate(() => window.__ssrmEngineGrid.rpc());
  console.log(`  rpc calls sent               ${rpc.sent}`);
  console.log(`  rpc timed out                ${rpc.timedOut}   (any non-zero is a wedge avoided, and a defect)`);
  console.log(`  rpc late replies             ${rpc.late}`);
  console.log(`  rpc still pending            ${rpc.pending}`);
  console.log(`  page errors                  ${errors.length === 0 ? 'none' : errors.slice(0, 3).join(' | ')}`);

  console.log(`\n  For comparison, the same operations elsewhere:`);
  console.log(`    engine in Node, warm block   0.6 ms`);
  console.log(`    Perspective block, paused    8 ms`);
  console.log(`    Perspective block, live      119-145 ms\n`);
} finally {
  ws.close();
  await browser.close();
}
