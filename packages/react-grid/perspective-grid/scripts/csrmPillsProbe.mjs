/** Do the saved-filter pills reach the CSRM lab's Stress tab at all? */
import { chromium } from '@playwright/test';

const url = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:5300';
const out = 'C:\\Users\\DEVELO~1\\AppData\\Local\\Temp\\claude\\C--Users-developer-projects-starui\\1007803d-790b-4109-ae56-d2160cb25279\\scratchpad';

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
for (const s of [10, 25, 45, 70]) {
  await page.waitForTimeout(s === 10 ? 10_000 : 15_000);
  const info = await page.evaluate(() => ({
    rows: document.querySelectorAll('.ag-row').length,
    pills: [...document.querySelectorAll('[data-testid^="filter-pill-"]')].map((e) => e.getAttribute('data-testid')),
    toolbar: !!document.querySelector('[data-testid="filters-toolbar"]'),
    collapsed: !!document.querySelector('[data-testid="filters-summary-chip"]'),
  }));
  console.log(`t+${s}s`, JSON.stringify(info));
}
await page.screenshot({ path: `${out}\\csrm_stress.png` });
await browser.close();
