/**
 * How often, and for how long, does a trader see a row with no data?
 *
 * Under AG's server row model a scroll is committed IMMEDIATELY and the rows are
 * filled in when the datasource settles, so any row whose block has not arrived
 * renders with `node.data === undefined`. On this surface those cells paint
 * BLANK (`BlankLoadingCellRenderer`), and blank is indistinguishable from a real
 * null — on a blotter that reads as "this position has no bid", not as "not
 * loaded yet".
 *
 * This measures the exposure rather than arguing about it:
 *
 *   - what fraction of samples show at least one dataless row in the viewport;
 *   - the longest unbroken stretch of them;
 *   - how much of the viewport is affected at the worst moment.
 *
 * Driven with REAL wheel events at three speeds, because the answer is entirely
 * about how fast the user is moving. A Playwright viewport is required: the
 * preview pane reports `visibilityState: 'hidden'`, so rAF never fires there.
 *
 *   node packages/react-grid/perspective-grid/scripts/stubVisibilityProbe.mjs
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');

const gridApi = () => {
  const el = document.querySelector('.ag-root-wrapper');
  const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
  let f = el[k], api = null;
  while (f && !api) {
    const pr = f.memoizedProps;
    if (typeof pr?.api?.getColumns === 'function') api = pr.api;
    let h = f.memoizedState;
    while (h && !api) { if (typeof h.memoizedState?.getColumns === 'function') api = h.memoizedState; h = h.next; }
    f = f.return;
  }
  return api;
};

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.click('[data-testid="lab-tab-stress"]');
await page.waitForSelector('.ag-row', { timeout: 180_000 });
await page.waitForTimeout(15_000);

// Leaf rows. The seeded profile opens grouped, and a group row is never a stub.
await page.evaluate(`(${gridApi.toString()})().setRowGroupColumns([])`);
await page.waitForTimeout(8000);

/**
 * Sample from INSIDE the page on a timer, not by round-tripping per sample:
 * a stub can appear and be filled inside one CDP round trip.
 */
await page.evaluate(`(() => {
  const api = (${gridApi.toString()})();
  const samples = [];
  const reqs = [];
  window.__sv = { api, samples, reqs, stop: null };

  // Instrument the datasource: is a block even REQUESTED while rows are blank,
  // and how long does it take to settle? "Not asked for" and "asked for and
  // slow" are different problems and look identical on screen.
  const ds = api.getGridOption('serverSideDatasource');
  if (ds && !ds.__svWrapped) {
    const inner = ds.getRows.bind(ds);
    ds.getRows = (params) => {
      const started = performance.now();
      const rec = { at: started, ms: null, rows: params.request.endRow - params.request.startRow };
      reqs.push(rec);
      const ok = params.success, bad = params.fail;
      params.success = (x) => { rec.ms = Math.round(performance.now() - started); ok(x); };
      params.fail = () => { rec.ms = -1; bad(); };
      return inner(params);
    };
    ds.__svWrapped = true;
  }
  const tick = () => {
    // Rows AG is currently displaying, and how many have no data behind them.
    const first = api.getFirstDisplayedRowIndex?.() ?? 0;
    const last = api.getLastDisplayedRowIndex?.() ?? -1;
    let shown = 0, dataless = 0;
    for (let i = first; i <= last; i++) {
      const node = api.getDisplayedRowAtIndex(i);
      if (!node) continue;
      shown += 1;
      if (node.data === undefined || node.data === null) dataless += 1;
    }
    samples.push({ t: performance.now(), shown, dataless });
  };
  window.__sv.stop = () => clearInterval(id);
  const id = setInterval(tick, 50);
})()`);

const box = await (await page.$('.ag-root-wrapper')).boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

/** notches per burst, pause between bursts, label */
const PASSES = [
  { delta: 300, pause: 400, notches: 12, label: 'slow read (300px, pause)' },
  { delta: 900, pause: 120, notches: 20, label: 'normal scroll (900px)' },
  { delta: 2500, pause: 40, notches: 25, label: 'fast fling (2500px)' },
];

for (const pass of PASSES) {
  await page.evaluate((l) => { window.__sv.samples.push({ mark: l }); }, pass.label);
  for (let i = 0; i < pass.notches; i++) {
    await page.mouse.wheel(0, pass.delta);
    await page.waitForTimeout(pass.pause);
  }
  // Let it settle, so "how long until it is whole again" is included.
  await page.waitForTimeout(4000);
}

const { samples, reqs } = await page.evaluate(() => {
  window.__sv.stop();
  return { samples: window.__sv.samples, reqs: window.__sv.reqs };
});
await browser.close();

// ── report ────────────────────────────────────────────────────────────────
let label = '(before first pass)';
const passes = new Map();
let prev = null;
for (const s of samples) {
  if (s.mark) { label = s.mark; prev = null; continue; }
  const p = passes.get(label) ?? { n: 0, withStub: 0, worstFrac: 0, run: 0, longestMs: 0 };
  p.n += 1;
  if (s.dataless > 0) {
    p.withStub += 1;
    p.worstFrac = Math.max(p.worstFrac, s.shown ? s.dataless / s.shown : 0);
    p.run += prev === null ? 50 : Math.round(s.t - prev);
    p.longestMs = Math.max(p.longestMs, p.run);
  } else {
    p.run = 0;
  }
  prev = s.t;
  passes.set(label, p);
}

const settled = reqs.filter((r) => typeof r.ms === 'number' && r.ms >= 0).map((r) => r.ms);
settled.sort((a, b) => a - b);
console.log(`\n=== block requests: ${reqs.length} issued, ${settled.length} settled ===`);
if (settled.length) {
  console.log(
    `  getRows  min ${settled[0]} ms · median ${settled[Math.floor(settled.length / 2)]} ms` +
      ` · p90 ${settled[Math.floor(settled.length * 0.9)]} ms · max ${settled[settled.length - 1]} ms`,
  );
}
console.log(`  never settled: ${reqs.length - settled.length}`);

console.log('\n=== rows with NO DATA in the viewport (what paints blank) ===\n');
console.log('pass                          samples   with a blank row   worst % of viewport   longest unbroken');
for (const [name, p] of passes) {
  const pct = p.n ? ((p.withStub / p.n) * 100).toFixed(0) : '0';
  console.log(
    `${name.padEnd(28)} ${String(p.n).padStart(7)} ${(pct + '%').padStart(18)} ` +
    `${(Math.round(p.worstFrac * 100) + '%').padStart(21)} ${(p.longestMs + ' ms').padStart(18)}`,
  );
}
