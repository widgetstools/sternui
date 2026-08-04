/**
 * Does "Loading..." appear in the grid while scrolling?
 *
 * Counts the actual rendered text during a fast drag, because the first attempt
 * at this (a blank `loadingCellRenderer` on the colDef) shipped INERT: AG's
 * server row model paints a full-width loading row and only consults that
 * renderer when `suppressServerSideFullWidthLoadingRow` is set. A probe that
 * counts what is on screen is the only way to tell the two apart.
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');
const variant = opt('variant', 'MarketsGrid · 50k × 400 (modules)');

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
await page.waitForTimeout(15_000);

// Ungrouped, so scrolling actually crosses unloaded blocks.
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
  api.setRowGroupColumns([]);
  window.__lp = { api };
});
await page.waitForTimeout(8000);

const sample = () => page.evaluate(() => {
  const root = document.querySelector('.ag-root-wrapper');
  const text = root?.innerText ?? '';
  const loadingWords = (text.match(/Loading/g) ?? []).length;
  return {
    loadingWords,
    fullWidthLoadingRows: root?.querySelectorAll('.ag-full-width-row .ag-loading, .ag-loading').length ?? 0,
    stubRows: root?.querySelectorAll('.ag-row-loading').length ?? 0,
    rows: root?.querySelectorAll('.ag-row').length ?? 0,
  };
});

const box = await (await page.$('.ag-body-viewport, .ag-root-wrapper')).boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

let worst = { loadingWords: 0 };
const seen = [];
for (let i = 0; i < 90; i++) {
  await page.mouse.wheel(0, 1400);
  await page.waitForTimeout(25);
  const s = await sample();
  seen.push(s.loadingWords);
  if (s.loadingWords > worst.loadingWords) worst = s;
}
await page.waitForTimeout(2500);
const settled = await sample();

console.log(`peak while scrolling : ${JSON.stringify(worst)}`);
console.log(`after it settles     : ${JSON.stringify(settled)}`);
console.log(`samples with "Loading": ${seen.filter((n) => n > 0).length} of ${seen.length}`);
console.log(seen.some((n) => n > 0) ? 'RESULT: "Loading..." still shows' : 'RESULT: no "Loading..." at any point');

await browser.close();
