/**
 * Hunt the 50k x 400 crash.
 *
 * Captures, per second: renderer JS heap, DOM nodes, listener count, plus every
 * page crash, page error, and console error. Then drives the tab the way a user
 * does — scroll, group, ungroup, filter — until something dies.
 *
 *   node stressCrashProbe.mjs [--variant "..."] [--minutes 5]
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');
const variant = opt('variant', 'MarketsGrid · 50k × 400 (modules)');
const minutes = Number(opt('minutes', '4'));

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

let crashed = false;
page.on('crash', () => { crashed = true; console.log('!!! PAGE CRASHED'); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !t.includes('License') && !t.includes('***')) {
    console.log('[console.error]', t.slice(0, 300));
  }
});

const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
const metrics = async () => {
  try {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const by = Object.fromEntries(metrics.map((m) => [m.name, m.value]));
    return {
      heapMB: Math.round((by.JSHeapUsedSize ?? 0) / 1048576),
      heapTotalMB: Math.round((by.JSHeapTotalSize ?? 0) / 1048576),
      nodes: by.Nodes ?? 0,
      listeners: by.JSEventListeners ?? 0,
    };
  } catch {
    return null;
  }
};

const stamp = () => new Date().toISOString().slice(11, 19);
let phase = 'boot';
const poll = setInterval(async () => {
  const m = await metrics();
  if (m) console.log(`${stamp()} ${phase.padEnd(16)} heap ${String(m.heapMB).padStart(5)} / ${String(m.heapTotalMB).padStart(5)} MB · nodes ${m.nodes} · listeners ${m.listeners}`);
}, 2000);

try {
  phase = 'load app';
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.click('[data-testid="lab-tab-stress"]');
  await page.waitForTimeout(3000);

  phase = 'pick variant';
  await page.click('button[role="combobox"]');
  await page.waitForTimeout(400);
  for (const o of await page.$$('[role="option"]')) {
    if (((await o.textContent()) ?? '').trim() === variant) { await o.click(); break; }
  }

  phase = 'attach';
  await page.waitForSelector('.ag-row', { timeout: 180_000 });
  phase = 'settle';
  await page.waitForTimeout(30_000);

  await page.evaluate(() => {
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
    window.__cp = { api };
  });

  const deadline = Date.now() + minutes * 60_000;
  const body = (await page.$('.ag-body-viewport, .ag-root-wrapper'));
  const box = await body.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  let round = 0;
  while (Date.now() < deadline && !crashed) {
    round += 1;

    phase = `r${round} ungroup`;
    await page.evaluate(() => window.__cp?.api?.setRowGroupColumns([])).catch(() => {});
    await page.waitForTimeout(6000);

    phase = `r${round} scroll`;
    for (let i = 0; i < 40 && !crashed; i++) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(5000);

    phase = `r${round} group`;
    await page.evaluate(() => window.__cp?.api?.setRowGroupColumns(['assetClass', 'issuerSector'])).catch(() => {});
    await page.waitForTimeout(8000);

    phase = `r${round} filter`;
    await page.evaluate(() => {
      window.__cp?.api?.setFilterModel({ assetClass: { filterType: 'set', values: ['CorpIG'] } });
      window.__cp?.api?.onFilterChanged();
    }).catch(() => {});
    await page.waitForTimeout(6000);
    await page.evaluate(() => {
      window.__cp?.api?.setFilterModel(null);
      window.__cp?.api?.onFilterChanged();
    }).catch(() => {});
    await page.waitForTimeout(6000);
  }
} catch (err) {
  console.log('DRIVER ERROR:', String(err).slice(0, 300));
} finally {
  clearInterval(poll);
  console.log(crashed ? 'RESULT: page crashed' : 'RESULT: survived the run');
  try { await browser.close(); } catch { /* already gone */ }
}
