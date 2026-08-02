/**
 * Does switching away from a client-side baseline RELEASE its book?
 *
 * Heap read immediately after a switch says nothing — V8 has not collected yet.
 * This forces a GC through CDP before each reading, so the number is retention
 * rather than garbage.
 */
import { chromium } from '@playwright/test';

const url = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:5301';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const cdp = await page.context().newCDPSession(page);

const pick = async (label) => {
  await page.click('button[role="combobox"]');
  await page.waitForTimeout(400);
  for (const o of await page.$$('[role="option"]')) {
    if (((await o.textContent()) ?? '').trim() === label) { await o.click(); break; }
  }
};
const settledHeap = async (label) => {
  await page.waitForTimeout(8000);
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(1500);
  const mb = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
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
    return big.slice(0, 5);
  });
  console.log(`${label.padEnd(46)} heap ${String(mb).padStart(4)} MB  bigArrays=${JSON.stringify(arrays)}`);
};

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.click('[data-testid="lab-tab-stress"]');
await page.waitForTimeout(3000);

await pick('MarketsGrid · 50k × 400 (modules)');
await page.waitForSelector('.ag-row', { timeout: 180_000 });
await settledHeap('markets 50k x 400, opened directly');

await pick('Plain AG Grid · 50k × 400');
await page.waitForSelector('.ag-row', { timeout: 180_000 });
await settledHeap('plain AG 50k x 400 (holds the book by design)');

await pick('MarketsGrid · 50k × 400 (modules)');
await page.waitForSelector('.ag-row', { timeout: 180_000 });
await settledHeap('back to markets — is the baseline book released?');

await browser.close();
