/**
 * Is the Stress tab's attach failure a RACE between `configStore.save` and the
 * worker catalog, or is the row never written?
 *
 * Test: attach to a variant (expect failure on a fresh profile), then switch
 * away and back. The second attach finds a row that has been in the catalog for
 * seconds. If it succeeds, the failure is a race, not a missing write.
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const pick = async (label) => {
  await page.click('button[role="combobox"]');
  await page.waitForTimeout(300);
  for (const o of await page.$$('[role="option"]')) {
    if (((await o.textContent()) ?? '').trim() === label) { await o.click(); return true; }
  }
  return false;
};
const snap = async (label) => {
  const info = await page.evaluate(() => ({
    rows: document.querySelectorAll('.ag-row').length,
    notice: document.body.textContent?.includes('This provider holds no Table')
      ? (document.querySelector('pre, code')?.textContent ?? 'notice').slice(0, 80)
      : null,
  }));
  console.log(label, JSON.stringify(info));
  return info;
};

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.click('[data-testid="lab-tab-stress"]');
await page.waitForTimeout(12_000);
await snap('A default(markets-50k40) t+12s');

await pick('MarketsGrid · 50k × 400 (modules)');
await page.waitForTimeout(12_000);
await snap('B modules first attach');

await pick('Plain AG Grid · 20k × 40');
await page.waitForTimeout(4000);
await pick('MarketsGrid · 50k × 400 (modules)');
for (const s of [5, 15, 30, 60]) {
  await page.waitForTimeout(s === 5 ? 5000 : 10_000);
  const i = await snap(`C modules re-attach t+${s}s`);
  if (i.rows > 0) break;
}

await pick('MarketsGrid SSRM · 50k × 40');
await page.waitForTimeout(4000);
for (const s of [5, 20, 40]) {
  await page.waitForTimeout(s === 5 ? 5000 : 15_000);
  const i = await snap(`D 50k40 re-attach t+${s}s`);
  if (i.rows > 0) break;
}

await browser.close();
