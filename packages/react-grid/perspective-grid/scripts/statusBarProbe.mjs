/**
 * What do AG's stock status panels report on the pull path, and how does that
 * differ from the CSRM control on the same book?
 *
 * Three states, because they have different answers:
 *   1. nothing selected
 *   2. a cell range the window holds (a drag — every selection a user can make
 *      by hand)
 *   3. select-all (the header checkbox), which on a server row model selects
 *      rows this window has never seen
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');
const tab = opt('tab', 'stress');
const variant = opt('variant', 'MarketsGrid · 50k × 400 (modules)');
const settle = Number(opt('settle', '25000'));

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.click(`[data-testid="lab-tab-${tab}"]`);
await page.waitForTimeout(3000);
if (variant) {
  await page.click('button[role="combobox"]');
  await page.waitForTimeout(400);
  for (const o of await page.$$('[role="option"]')) {
    if (((await o.textContent()) ?? '').trim() === variant) { await o.click(); break; }
  }
}
await page.waitForSelector('.ag-row', { timeout: 180_000 });
await page.waitForTimeout(settle);

const read = async (label) => {
  const r = await page.evaluate(() => {
    const bar = document.querySelector('.ag-status-bar');
    const panels = [...(bar?.querySelectorAll('.ag-status-panel') ?? [])].map((p) => ({
      cls: [...p.classList].filter((c) => c.startsWith('ag-status-panel-')).join(','),
      text: p.textContent?.replace(/\s+/g, ' ').trim(),
    }));
    return { html: bar ? bar.innerHTML.length : 0, panels };
  });
  console.log(`\n--- ${label} ---`);
  for (const p of r.panels) console.log(`  ${(p.cls || '(none)').padEnd(46)} ${p.text}`);
  return r;
};

await read('nothing selected');

// A dragged cell range over rows this window holds.
const cells = await page.$$('.ag-row .ag-cell');
if (cells.length > 6) {
  const a = await cells[2].boundingBox();
  const b = await cells[Math.min(cells.length - 1, 40)].boundingBox();
  if (a && b) {
    await page.mouse.move(a.x + 5, a.y + 5);
    await page.mouse.down();
    await page.mouse.move(b.x + 5, b.y + 5, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(1500);
  }
}
await read('a dragged cell range');

// Select all, via the header checkbox if there is one.
const headerCb = await page.$('.ag-header-cell .ag-checkbox-input, .ag-header-select-all input');
if (headerCb) {
  await headerCb.click();
  await page.waitForTimeout(3000);
  await read('select all (header checkbox)');
} else {
  console.log('\n--- select all: no header checkbox on this grid ---');
}

// Ground truth from the engine, where there is one.
const truth = await page.evaluate(async () => {
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
  const engine = api.getGridOption('context')?.perspectiveEngineHolder?.get?.();
  return {
    rowModel: api.getGridOption('rowModelType'),
    displayed: api.getDisplayedRowCount(),
    selectedNodes: api.getSelectedNodes?.().length ?? null,
    engineStatus: engine ? engine.status : null,
  };
});
console.log('\nground truth:', JSON.stringify(truth));
await browser.close();
