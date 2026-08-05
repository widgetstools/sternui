/**
 * `@starui/ssrm-engine` driving a real AG Grid, in a real browser.
 *
 * The bench in `benchProbe.mjs` measures the ENGINE in Node. This measures the
 * whole path — engine, datasource adapter, AG Grid, DOM — against the lab's
 * Stress tab on `?engine=ssrm`, so the figures sit next to the Perspective ones
 * in `perspective-grid/ARCHITECTURE.md` and mean the same thing.
 *
 * Requires the lab built and served:
 *   npm --prefix apps run build -w @starui/perspective-ssrm-lab
 *   cd apps/demos/perspective-ssrm-lab && npx vite preview --port 5301 --strictPort
 *   node packages/react-grid/ssrm-engine/scripts/browserSmokeProbe.mjs
 *
 * ## Two module-registration traps this probe exists to catch
 *
 * Both cost a build-and-measure cycle and neither announced itself usefully:
 *
 *   1. **No modules** — AG error #200, and the surface mounts with no rows at
 *      all. That one at least logs.
 *   2. **PARTIAL modules** — rows render, but AG Grid 36 gates its API behind
 *      modules, so `getColumns()` returned null and `getDisplayedRowCount()`
 *      returned undefined on a live, undestroyed api while 28 rows were on
 *      screen. A probe reading those would have reported a confident zero.
 *
 * Hence the assertions below on column and row counts before anything is timed.
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301/?engine=ssrm');

/** The AG trial watermark and the app's own seed 404 are not failures. */
const benign = (text) =>
  /License Key Not Found|AG Grid Enterprise|ag-grid\.com|^\*+$|Failed to load resource|seed-config|ConfigManager|unlocked for trial|hide the watermark/i.test(
    text,
  );

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => { const t = String(e).slice(0, 240); if (!benign(t)) errors.push(t); });
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text().slice(0, 240);
  if (!benign(t)) errors.push(t);
});

try {
  const started = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.click('[data-testid="lab-tab-stress"]');
  await page.waitForSelector('[data-testid="ssrm-engine-grid"] .ag-row', { timeout: 120_000 });
  const firstRowMs = Date.now() - started;
  await page.waitForTimeout(5000);

  const state = await page.evaluate(() => {
    const api = window.__ssrmEngineGrid?.api;
    if (!api) return { fatal: 'no measurement handle — is ?engine=ssrm set?' };
    let sample = null;
    api.forEachNode((n) => { if (!sample && n.data) sample = n.data; });
    return {
      columns: api.getColumns()?.length ?? null,
      rows: api.getDisplayedRowCount?.() ?? null,
      payload: sample ? Object.keys(sample).length : null,
      book: window.__ssrmEngineGrid.engine.size,
    };
  });
  if (state.fatal) throw new Error(state.fatal);
  if (!state.columns || !state.rows) {
    throw new Error(
      `api reported columns=${state.columns} rows=${state.rows} on a live grid — partial module registration, see the note at the top`,
    );
  }

  console.log(`\n=== @starui/ssrm-engine, in the browser ===\n`);
  console.log(`  first row painted            ${firstRowMs} ms`);
  console.log(`  columns                      ${state.columns}`);
  console.log(`  rows the store reports       ${state.rows.toLocaleString()}`);
  console.log(`  book in the engine           ${state.book.toLocaleString()} rows`);
  console.log(`  columns in a returned row    ${state.payload}`);

  // SORT — the operation that costs 0.4-1.1 s on the Perspective path.
  const sort = await page.evaluate(async () => {
    const api = window.__ssrmEngineGrid.api;
    let settled = 0;
    const start = performance.now();
    const ds = api.getGridOption('serverSideDatasource');
    const inner = ds.getRows.bind(ds);
    ds.getRows = (p) => {
      const ok = p.success;
      p.success = (x) => { if (!settled) settled = performance.now() - start; ok(x); };
      return inner(p);
    };
    api.applyColumnState({
      state: [{ colId: 'marketValue', sort: 'desc' }],
      defaultState: { sort: null },
    });
    await new Promise((r) => setTimeout(r, 3000));
    return { firstBlockMs: Math.round(settled), rows: api.getDisplayedRowCount() };
  });
  console.log(`\n  SORT, first block settled    ${sort.firstBlockMs} ms`);
  console.log(`  rows after the sort          ${sort.rows.toLocaleString()}  (must not collapse)`);

  // GROUP + aggregate.
  const grouped = await page.evaluate(async () => {
    const api = window.__ssrmEngineGrid.api;
    const start = performance.now();
    api.setRowGroupColumns(['assetClass']);
    api.setValueColumns(['marketValue']);
    api.setColumnAggFunc('marketValue', 'sum');
    await new Promise((r) => setTimeout(r, 2500));
    const rows = [];
    api.forEachNode((n) => {
      if (n.data && rows.length < 4) rows.push({ group: n.key ?? n.data.assetClass, sum: n.data.marketValue });
    });
    return { ms: Math.round(performance.now() - start), count: api.getDisplayedRowCount(), rows };
  });
  console.log(`\n  GROUP by assetClass + sum    ${grouped.count} rows`);
  for (const r of grouped.rows) console.log(`    ${String(r.group).padEnd(12)} ${r.sum}`);

  // PIVOT — the secondary columns AG builds from `pivotResultFields`.
  const pivot = await page.evaluate(async () => {
    const api = window.__ssrmEngineGrid.api;
    api.setRowGroupColumns(['desk']);
    api.setPivotColumns(['currency']);
    api.setValueColumns(['marketValue']);
    api.setColumnAggFunc('marketValue', 'sum');
    // AG 36 has no `setPivotMode`; it is a managed grid option.
    api.setGridOption('pivotMode', true);
    await new Promise((r) => setTimeout(r, 3000));
    // Pivot result columns are SECONDARY columns — `getColumns()` returns the
    // primary ones and will always report zero here.
    const secondary = (api.getPivotResultColumns?.() ?? []).map((c) => c.getColId());
    let sample = null;
    api.forEachNode((n) => { if (!sample && n.data) sample = n.data; });
    /**
     * Show a POPULATED cell.
     *
     * The lab's generated book correlates its dimensions — every row with
     * desk=Alpha also has currency=Golf — so most cells of a pivot row are
     * legitimately null, and printing the first two makes a working pivot look
     * broken.
     */
    const named = sample ? Object.entries(sample).filter(([k]) => !k.startsWith('__')) : [];
    const populated = named.filter(([k, v]) => k.includes('_') && v !== null);
    const cells = [...named.slice(0, 1), ...populated.slice(0, 2)];
    return {
      rows: api.getDisplayedRowCount(),
      secondaryCount: secondary.length,
      secondary: secondary.slice(0, 4),
      cell: cells,
    };
  });
  console.log(`\n  PIVOT desk x currency        ${pivot.rows} rows · ${pivot.secondaryCount} generated columns`);
  console.log(`    e.g. ${JSON.stringify(pivot.secondary)}`);
  console.log(`    pivoted cells: ${JSON.stringify(pivot.cell)}`);

  console.log(`\n  console errors               ${errors.length === 0 ? 'none' : errors.length}`);
  for (const e of errors.slice(0, 5)) console.log(`    ${e}`);

  console.log('\n  Perspective, same book, same tab:');
  console.log('    first row (cold attach)      12,000-15,000 ms');
  console.log('    SORT, first block               400-1,100 ms\n');
} finally {
  await browser.close();
}
