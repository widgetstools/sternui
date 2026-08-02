/**
 * Every Stress-tab variant still renders rows.
 *
 * The client-side supply is now subscribed only for the surfaces that read from
 * it, so the ones that DO read from it have to be checked — a memory fix that
 * blanks the baselines would be a worse bug than the one it fixed.
 */
import { chromium } from '@playwright/test';

const url = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:5301';

const VARIANTS = [
  'MarketsGrid SSRM · 50k × 40',
  'Plain AG Grid · 20k × 40',
  'Perspective · 20k × 40',
  'Plain AG Grid · 50k × 400',
  'MarketsGrid · 50k × 400 (modules)',
];

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.click('[data-testid="lab-tab-stress"]');
await page.waitForTimeout(3000);

for (const want of VARIANTS) {
  await page.click('button[role="combobox"]');
  await page.waitForTimeout(400);
  for (const o of await page.$$('[role="option"]')) {
    if (((await o.textContent()) ?? '').trim() === want) { await o.click(); break; }
  }
  const t0 = Date.now();
  let rows = 0;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000);
    rows = await page.evaluate(() => {
      // The FINOS viewer paints inside a shadow root, so a light-DOM query
      // sees nothing and would read as "broken" when it is fine.
      const light = document.querySelectorAll('.ag-row').length;
      const viewer = document.querySelector('perspective-viewer');
      let shadow = 0;
      if (viewer?.shadowRoot) {
        shadow = viewer.shadowRoot.querySelectorAll('tr').length
          || viewer.shadowRoot.querySelectorAll('regular-table tr').length;
      }
      return light + shadow;
    });
    if (rows > 0) break;
  }
  const heap = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
  console.log(`${want.padEnd(36)} rows=${String(rows).padStart(4)} after ${String(Date.now() - t0).padStart(6)} ms · heap ${heap} MB`);
}

await browser.close();
