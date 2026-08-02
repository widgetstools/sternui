/**
 * Stress tab (b): how slow are grouping and ungrouping, and where does the time
 * go — the View per level, or the read?
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');
const variant = opt('variant', 'MarketsGrid · 50k × 400 (modules)');
const settle = Number(opt('settle', '30000'));

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.click('[data-testid="lab-tab-stress"]');
await page.waitForTimeout(3000);
await page.click('button[role="combobox"]');
await page.waitForTimeout(400);
for (const o of await page.$$('[role="option"]')) {
  if (((await o.textContent()) ?? '').trim() === variant) { await o.click(); break; }
}
await page.waitForSelector('.ag-row', { timeout: 180_000 });
await page.waitForTimeout(settle);

await page.evaluate(() => {
  const el = document.querySelector('.ag-root-wrapper');
  const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
  let f = el[k], api = null, table = null;
  while (f && (!api || !table)) {
    const pr = f.memoizedProps;
    if (!api && typeof pr?.api?.getColumns === 'function') api = pr.api;
    if (!table && pr?.table && typeof pr.table.view === 'function') table = pr.table;
    let h = f.memoizedState;
    while (h && !api) { if (typeof h.memoizedState?.getColumns === 'function') api = h.memoizedState; h = h.next; }
    f = f.return;
  }
  const log = [];
  const t = () => Math.round(performance.now());
  window.__gp = { api, log, t0: 0 };

  if (table && !table.__gpWrapped) {
    const view = table.view.bind(table);
    table.view = async (config) => {
      const s = performance.now();
      const shape = `by=[${(config?.group_by || []).join('+')}] f=${(config?.filter || []).length}`;
      const v = await view(config);
      log.push({ at: t(), ev: 'view:built', ms: Math.round(performance.now() - s), shape });
      return v;
    };
    table.__gpWrapped = true;
  }
  const ds = api.getGridOption('serverSideDatasource');
  if (ds && !ds.__gpWrapped) {
    const g = ds.getRows.bind(ds);
    ds.getRows = (params) => {
      const s = performance.now();
      const r = params.request ?? {};
      const tag = `${r.startRow}-${r.endRow} grp=${(r.rowGroupCols || []).length} keys=${(r.groupKeys || []).length}`;
      log.push({ at: t(), ev: 'getRows', tag });
      const sc = params.success, fc = params.fail;
      params.success = (x) => {
        log.push({ at: t(), ev: 'served', ms: Math.round(performance.now() - s), tag, n: x?.rowData?.length });
        sc(x);
      };
      params.fail = () => { log.push({ at: t(), ev: 'failed', tag }); fc(); };
      return g(params);
    };
    ds.__gpWrapped = true;
  }
});

const run = async (label, cols) => {
  await page.evaluate((cols) => {
    const { api, log } = window.__gp;
    log.length = 0;
    window.__gp.t0 = performance.now();
    api.setRowGroupColumns(cols);
  }, cols);
  await page.waitForTimeout(15_000);
  const out = await page.evaluate(() => ({ log: window.__gp.log, t0: window.__gp.t0 }));
  console.log(`\n=== ${label} ===`);
  for (const e of out.log.slice(0, 24)) {
    const extra = Object.entries(e).filter(([k]) => k !== 'at' && k !== 'ev').map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`${String(Math.round(e.at - out.t0)).padStart(6)}  ${e.ev.padEnd(11)} ${extra}`);
  }
  const firstServed = out.log.find((e) => e.ev === 'served');
  console.log(`SUMMARY ${label}: first block served ${firstServed ? Math.round(firstServed.at - out.t0) : null} ms · ${out.log.filter((e) => e.ev === 'view:built').length} Views built`);
};

await run('GROUP by assetClass + issuerSector', ['assetClass', 'issuerSector']);
await run('UNGROUP', []);
await run('GROUP by assetClass only', ['assetClass']);

await browser.close();
