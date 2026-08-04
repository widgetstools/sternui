/**
 * The 400-column read cost with the LIVE FEED PAUSED.
 *
 * The 40-vs-400 comparison has a confound: the 50k x 40 variant ships with
 * ticks OFF and the 50k x 400 one ticks every 200 ms, so part of that gap is
 * contention from the live re-read rather than the column count. Pausing the
 * feed isolates the columns.
 */
import { chromium } from '@playwright/test';

const url = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:5301';

const stat = (xs) => {
  if (!xs.length) return '(none)';
  const s = [...xs].sort((a, b) => a - b);
  return `n=${s.length}  min ${s[0]}  median ${s[Math.floor(s.length / 2)]}  p90 ${s[Math.floor(s.length * 0.9)]}  max ${s[s.length - 1]} ms`;
};

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.click('[data-testid="lab-tab-stress"]');
await page.waitForTimeout(3000);
await page.click('button[role="combobox"]');
await page.waitForTimeout(400);
for (const o of await page.$$('[role="option"]')) {
  if (((await o.textContent()) ?? '').trim() === 'MarketsGrid · 50k × 400 (modules)') { await o.click(); break; }
}
await page.waitForSelector('.ag-row', { timeout: 180_000 });
await page.waitForTimeout(20_000);

// Pause the feed through the Demo Console's own switch — the same thing a user
// clicks, rather than reaching past the UI into the provider.
const switches = await page.$$('[role="switch"]');
let paused = false;
for (const s of switches) {
  const on = await s.getAttribute('aria-checked');
  if (on === 'true') { await s.click(); paused = true; break; }
}
console.log('live ticks paused via the console switch:', paused);
await page.waitForTimeout(8000);

const cols = await page.evaluate(() => {
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
  const rec = [];
  window.__rp = { api, rec };
  api.setRowGroupColumns([]);
  const ds = api.getGridOption('serverSideDatasource');
  if (ds && !ds.__rpWrapped) {
    const g = ds.getRows.bind(ds);
    ds.getRows = (params) => {
      const s = performance.now();
      const sc = params.success;
      params.success = (x) => { rec.push(Math.round(performance.now() - s)); sc(x); };
      return g(params);
    };
    ds.__rpWrapped = true;
  }
  return api.getColumns()?.length ?? 0;
});

await page.waitForTimeout(6000);
await page.evaluate(() => { window.__rp.rec.length = 0; });

for (const row of [500, 5000, 12000, 20000, 30000, 41000, 8000, 25000, 47000, 15000]) {
  await page.evaluate((r) => window.__rp.api.ensureIndexVisible(r, 'top'), row);
  await page.waitForTimeout(3500);
}

const rec = await page.evaluate(() => window.__rp.rec);
console.log(`\n50k x ${cols} columns, feed PAUSED · getRows ${stat(rec)}`);
await browser.close();
