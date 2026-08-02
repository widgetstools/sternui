/**
 * What does the Stress tab actually do when it opens, and how long does the
 * 50k x 400 book take to reach the grid? Screenshots + row counts over time.
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');
const variant = opt('variant', 'MarketsGrid · 50k × 400 (modules)');
const out = opt('out', 'C:\\Users\\DEVELO~1\\AppData\\Local\\Temp\\claude\\C--Users-developer-projects-starui\\1007803d-790b-4109-ae56-d2160cb25279\\scratchpad');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => console.log(`[${m.type()}]`, m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.click('[data-testid="lab-tab-stress"]');
await page.waitForTimeout(2000);

const combo = await page.$('button[role="combobox"]');
console.log('combobox present:', !!combo, 'text:', combo ? await combo.textContent() : null);
if (combo) {
  await combo.click();
  await page.waitForTimeout(500);
  const options = await page.$$eval('[role="option"]', (els) => els.map((e) => e.textContent));
  console.log('options:', options);
  const opts = await page.$$('[role="option"]');
  for (const o of opts) {
    const txt = (await o.textContent()) ?? '';
    if (txt.includes(variant) || variant.includes(txt.trim())) {
      await o.click();
      console.log('selected:', txt);
      break;
    }
  }
}

for (const t of [5, 15, 30, 60, 90]) {
  await page.waitForTimeout(t === 5 ? 5000 : (t - (t === 15 ? 5 : t === 30 ? 15 : t === 60 ? 30 : 60)) * 1000);
  const info = await page.evaluate(() => ({
    rows: document.querySelectorAll('.ag-row').length,
    status: document.querySelector('.ag-status-bar')?.textContent?.trim().slice(0, 120) ?? null,
    overlay: document.querySelector('.ag-overlay-loading-center')?.textContent ?? null,
    pills: document.querySelectorAll('[data-testid^="filter-pill-"]').length,
  }));
  console.log(`t+${t}s`, JSON.stringify(info));
}
await page.screenshot({ path: `${out}\\stress.png`, fullPage: false });
console.log('screenshot written');
await browser.close();
