/**
 * Does AG's grand-total row node survive a filter change (i.e. a store purge)?
 *
 * Decides whether a block can stop carrying `grandTotalData` inline: the total
 * can only be UPDATED by transaction once the row exists, so if a purge destroys
 * it, every filter change would have to pay for the inline build again.
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');
const GT = 'rowGroupFooter_ROOT_NODE_ID';

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
await page.waitForTimeout(30_000);

await page.evaluate(() => {
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
  window.__gt = api;
});

const look = async (label) => {
  const r = await page.evaluate((GT) => {
    const api = window.__gt;
    const node = api.getRowNode(GT);
    return { present: !!node, data: node?.data ? Object.keys(node.data).length : 0, displayed: api.getDisplayedRowCount() };
  }, GT);
  console.log(label, JSON.stringify(r));
};

await look('before filter        ');
await page.evaluate(() => {
  window.__gt.setFilterModel({ assetClass: { filterType: 'set', values: ['CorpIG'] } });
  window.__gt.onFilterChanged();
});
for (const ms of [50, 250, 1000, 3000, 8000]) {
  await page.waitForTimeout(ms === 50 ? 50 : ms - (ms === 250 ? 50 : ms === 1000 ? 250 : ms === 3000 ? 1000 : 3000));
  await look(`t+${String(ms).padStart(5)}ms after filter`);
}
await browser.close();
