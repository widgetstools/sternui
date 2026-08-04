/**
 * Does the Stress tab RATCHET memory until the renderer is killed?
 *
 * The first OOM fix removed one holder (the pull-path window was subscribing to
 * the client-side supply as well). The tab still dies, so this drives the way a
 * person actually uses the tab — switching variants, scrolling, grouping — and
 * reports the heap after a FORCED GC each cycle. A number that climbs cycle over
 * cycle is a retention leak; a flat one means the crash is elsewhere.
 *
 *   node stressRatchetProbe.mjs [--cycles 8] [--mode switch|markets|plain]
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');
const cycles = Number(opt('cycles', '8'));
const mode = opt('mode', 'switch');

const MARKETS = 'MarketsGrid · 50k × 400 (modules)';
const PLAIN = 'Plain AG Grid · 50k × 400';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const cdp = await page.context().newCDPSession(page);

let crashed = false;
page.on('crash', () => { crashed = true; console.log('!!! RENDERER CRASHED (Aw, Snap)'); });

const pick = async (label) => {
  await page.click('button[role="combobox"]');
  await page.waitForTimeout(400);
  for (const o of await page.$$('[role="option"]')) {
    if (((await o.textContent()) ?? '').trim() === label) { await o.click(); break; }
  }
  await page.waitForSelector('.ag-row', { timeout: 180_000 }).catch(() => {});
};

const report = async (label) => {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await page.waitForTimeout(1200);
  const m = await cdp.send('Performance.getMetrics').catch(() => null);
  const by = m ? Object.fromEntries(m.metrics.map((x) => [x.name, x.value])) : {};
  const arrays = await page.evaluate(() => {
    const big = [];
    const visited = new Set();
    const root = document.querySelector('#root') ?? document.body;
    const key = Object.keys(root).find((k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'));
    const scan = (v, where, d) => {
      if (!v || typeof v !== 'object' || d > 2) return;
      if (Array.isArray(v)) { if (v.length >= 1000) big.push(`${where}:${v.length}`); return; }
      if (visited.has(v)) return;
      visited.add(v);
      for (const k of Object.keys(v)) { try { scan(v[k], `${where}.${k}`, d + 1); } catch { /* */ } }
    };
    const walk = (f, d) => {
      if (!f || d > 400) return;
      const name = typeof f.type === 'function' ? (f.type.name || 'anon') : String(f.type ?? '');
      let h = f.memoizedState, i = 0;
      while (h && i < 40) { scan(h.memoizedState, `${name}#${i}`, 0); h = h.next; i += 1; }
      walk(f.child, d + 1); walk(f.sibling, d + 1);
    };
    try { const c = root[key]; walk(c?.current ?? c, 0); } catch { /* */ }
    return big.slice(0, 4);
  }).catch(() => ['(page gone)']);
  console.log(
    `${label.padEnd(30)} heap ${String(Math.round((by.JSHeapUsedSize ?? 0) / 1048576)).padStart(5)} MB` +
    ` · nodes ${String(by.Nodes ?? 0).padStart(6)} · listeners ${String(by.JSEventListeners ?? 0).padStart(6)}` +
    ` · big=${JSON.stringify(arrays)}`,
  );
};

await cdp.send('Performance.enable');
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.click('[data-testid="lab-tab-stress"]');
await page.waitForTimeout(3000);

for (let i = 1; i <= cycles && !crashed; i++) {
  if (mode === 'switch') {
    await pick(PLAIN);
    await report(`c${i} plain 50k x 400`);
    await pick(MARKETS);
    await report(`c${i} markets 50k x 400`);
  } else {
    await pick(mode === 'plain' ? PLAIN : MARKETS);
    await report(`c${i} ${mode}`);
  }
  if (crashed) break;

  // Use it: scroll and group, the way the tab is meant to be exercised.
  const box = await page.$('.ag-body-viewport, .ag-root-wrapper').then((h) => h?.boundingBox()).catch(() => null);
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let s = 0; s < 20 && !crashed; s++) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(30);
    }
  }
  await page.waitForTimeout(3000);
}

console.log(crashed ? 'RESULT: renderer died' : 'RESULT: survived');
try { await browser.close(); } catch { /* */ }
