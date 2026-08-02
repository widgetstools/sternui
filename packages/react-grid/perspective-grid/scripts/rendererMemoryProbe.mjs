/**
 * "Aw, Snap! Error code: Out of Memory" on the 50k x 400 tab.
 *
 * The renderer died, so the question is what the WINDOW is holding. JS heap
 * alone answers badly — wasm memory is not counted in it — so this reports
 * both, plus the biggest arrays reachable from React's fiber tree, which is
 * where a client-side row supply would be hiding.
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');
const variant = opt('variant', 'MarketsGrid · 50k × 400 (modules)');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('crash', () => console.log('!!! PAGE CRASHED (renderer gone)'));

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.click('[data-testid="lab-tab-stress"]');
await page.waitForTimeout(3000);
await page.click('button[role="combobox"]');
await page.waitForTimeout(400);
for (const o of await page.$$('[role="option"]')) {
  if (((await o.textContent()) ?? '').trim() === variant) { await o.click(); break; }
}
await page.waitForSelector('.ag-row', { timeout: 180_000 });
await page.waitForTimeout(25_000);

const report = await page.evaluate(() => {
  // Every WebAssembly.Memory this window has grown. Not in the JS heap figure,
  // and on this path the window runs its own Perspective client.
  let wasmBytes = 0;
  const seen = new Set();
  const walkWasm = (obj, depth) => {
    if (!obj || depth > 3 || seen.has(obj)) return;
    seen.add(obj);
    for (const k of Object.getOwnPropertyNames(obj)) {
      let v;
      try { v = obj[k]; } catch { continue; }
      if (v instanceof WebAssembly.Memory) wasmBytes += v.buffer.byteLength;
      else if (v && typeof v === 'object' && depth < 3) walkWasm(v, depth + 1);
    }
  };
  try { walkWasm(globalThis, 0); } catch { /* best effort */ }

  // The biggest arrays React is keeping alive — a client-side row supply on a
  // pull-path window would be exactly this.
  const big = [];
  const visited = new Set();
  const root = document.querySelector('#root') ?? document.body;
  const key = Object.keys(root).find((k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'));
  const scan = (value, where, depth) => {
    if (!value || typeof value !== 'object' || depth > 2) return;
    if (Array.isArray(value)) {
      if (value.length >= 1000) big.push({ where, length: value.length, sample: Object.keys(value[0] ?? {}).length });
      return;
    }
    if (visited.has(value)) return;
    visited.add(value);
    for (const k of Object.keys(value)) {
      try { scan(value[k], `${where}.${k}`, depth + 1); } catch { /* */ }
    }
  };
  const walkFiber = (fiber, depth) => {
    if (!fiber || depth > 400) return;
    const name = typeof fiber.type === 'function' ? (fiber.type.name || 'anon') : String(fiber.type ?? '');
    let hook = fiber.memoizedState;
    let i = 0;
    while (hook && i < 40) {
      scan(hook.memoizedState, `${name}#hook${i}`, 0);
      hook = hook.next;
      i += 1;
    }
    walkFiber(fiber.child, depth + 1);
    walkFiber(fiber.sibling, depth + 1);
  };
  try {
    const container = root[key];
    walkFiber(container?.current ?? container, 0);
  } catch { /* */ }

  big.sort((a, b) => b.length - a.length);
  return {
    jsHeapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576),
    jsHeapLimitMB: Math.round((performance.memory?.jsHeapSizeLimit ?? 0) / 1048576),
    wasmMB: Math.round(wasmBytes / 1048576),
    domRows: document.querySelectorAll('.ag-row').length,
    domCells: document.querySelectorAll('.ag-cell').length,
    biggestArrays: big.slice(0, 8),
  };
});

console.log(JSON.stringify(report, null, 1));
await browser.close();
