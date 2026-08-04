/**
 * WHERE the renderer's memory is, not just how much.
 *
 * `performance.measureUserAgentSpecificMemory()` breaks the renderer down by
 * type — JavaScript, WebAssembly, DOM, Canvas — which is the only way to tell a
 * JS-heap problem from a wasm one from inside the page. Needs
 * `--enable-blink-features=ForceEagerMeasureMemory` to answer promptly.
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');
const variant = opt('variant', 'MarketsGrid · 50k × 400 (modules)');

const browser = await chromium.launch({
  headless: false,
  args: ['--enable-blink-features=ForceEagerMeasureMemory'],
});
const page = await browser.newPage({ viewport: { width: 2200, height: 1300 } });

const breakdown = async (label) => {
  const r = await page.evaluate(async () => {
    if (typeof performance.measureUserAgentSpecificMemory !== 'function') {
      return { unsupported: true, crossOriginIsolated: globalThis.crossOriginIsolated };
    }
    try {
      const m = await performance.measureUserAgentSpecificMemory();
      const byType = {};
      for (const b of m.breakdown ?? []) {
        for (const t of b.types.length ? b.types : ['(untyped)']) {
          byType[t] = (byType[t] ?? 0) + b.bytes;
        }
      }
      return {
        totalMB: Math.round(m.bytes / 1048576),
        byTypeMB: Object.fromEntries(
          Object.entries(byType)
            .map(([k, v]) => [k, Math.round(v / 1048576)])
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]),
        ),
      };
    } catch (err) {
      return { error: String(err).slice(0, 120) };
    }
  });
  console.log(`${label}: ${JSON.stringify(r)}`);
};

await page.goto(url, { waitUntil: 'domcontentloaded' });
await breakdown('app shell, before the tab');

await page.click('[data-testid="lab-tab-stress"]');
await page.waitForTimeout(3000);
await page.click('button[role="combobox"]');
await page.waitForTimeout(400);
for (const o of await page.$$('[role="option"]')) {
  if (((await o.textContent()) ?? '').trim() === variant) { await o.click(); break; }
}
await page.waitForSelector('.ag-row', { timeout: 180_000 });
await page.waitForTimeout(20_000);
await breakdown('50k x 400 attached, idle');

const box = await (await page.$('.ag-body-viewport, .ag-root-wrapper')).boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let round = 1; round <= 3; round++) {
  for (let i = 0; i < 60; i++) { await page.mouse.wheel(700, 0); await page.waitForTimeout(35); }
  for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(30); }
  await page.waitForTimeout(3000);
  await breakdown(`after ${round} round(s) of horizontal + vertical scroll`);
}

await browser.close();
