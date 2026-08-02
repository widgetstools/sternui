/**
 * Does the Stress tab's 50k x 400 MarketsGrid variant fail because the provider
 * row is written AFTER the attach (a variant switch changes providerId while
 * `seeded` is already true), or for some other reason?
 *
 * Run A: open the tab, let the DEFAULT variant attach, then switch.
 * Run B: open the tab, switch immediately (what the first probe did).
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');
const settleMs = Number(opt('settle', '25000'));
const target = opt('variant', 'MarketsGrid · 50k × 400 (modules)');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

const snap = async (label) => {
  const info = await page.evaluate(() => ({
    rows: document.querySelectorAll('.ag-row').length,
    status: document.querySelector('.ag-status-bar')?.textContent?.trim().slice(0, 80) ?? null,
    notice: document.body.textContent?.includes('This provider holds no Table')
      ? (document.querySelector('code, pre')?.textContent ?? 'notice shown')
      : null,
  }));
  console.log(label, JSON.stringify(info));
  return info;
};

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.click('[data-testid="lab-tab-stress"]');

// Phase 1 — the DEFAULT variant (markets-50k40) gets to attach first.
const t0 = Date.now();
await page.waitForSelector('.ag-row', { timeout: 120_000 }).catch(() => {});
console.log(`default variant first row after ${Date.now() - t0} ms`);
await page.waitForTimeout(settleMs);
await snap('default variant');

// Phase 2 — switch to the 50k x 400 modules variant.
await page.click('button[role="combobox"]');
await page.waitForTimeout(300);
const opts = await page.$$('[role="option"]');
for (const o of opts) {
  const txt = (await o.textContent()) ?? '';
  if (txt.trim() === target) { await o.click(); break; }
}
const t1 = Date.now();
for (const wait of [3000, 7000, 15000, 30000, 60000]) {
  await page.waitForTimeout(wait - (Date.now() - t1) > 0 ? wait - (Date.now() - t1) : 0);
  const info = await snap(`switched t+${Math.round((Date.now() - t1) / 1000)}s`);
  if (info.rows > 0) { console.log(`ROWS APPEARED after ${Date.now() - t1} ms`); break; }
}

await browser.close();
