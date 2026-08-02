/**
 * Stress tab (a): why do rows take a while to appear after scrolling STOPS?
 *
 * Two candidates, different fixes:
 *   - the scroll-pause in PerspectiveMarketsGridSurface (`SCROLL_RESUME_MS`,
 *     150 ms after the last bodyScroll) gating the block fetches, or
 *   - the read cost of a 400-column block.
 *
 * Told apart by timing `getRows` against the last scroll event: if the first
 * block STARTS ~150 ms after the last scroll, the resume timer gates it; if it
 * starts immediately and takes seconds, it is the read.
 *
 *   node stressScrollProbe.mjs [--group none] [--settle 30000]
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');
const variant = opt('variant', 'MarketsGrid · 50k × 400 (modules)');
const groupBy = opt('group', 'none');
const settle = Number(opt('settle', '30000'));

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.click('[data-testid="lab-tab-stress"]');
await page.waitForTimeout(3000);
await page.click('button[role="combobox"]');
await page.waitForTimeout(400);
for (const o of await page.$$('[role="option"]')) {
  if (((await o.textContent()) ?? '').trim() === variant) { await o.click(); break; }
}
await page.waitForSelector('.ag-row', { timeout: 180_000 });
await page.waitForTimeout(settle);

const setup = await page.evaluate((groupBy) => {
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
  if (!api) return { ok: false };

  const log = [];
  const t = () => Math.round(performance.now());
  window.__sp = { api, log, mark: () => { window.__sp.t0 = t(); }, t0: 0 };

  api.addEventListener('bodyScroll', () => log.push({ at: t(), ev: 'scroll' }));
  api.addEventListener('bodyScrollEnd', () => log.push({ at: t(), ev: 'scrollEnd' }));

  const ds = api.getGridOption('serverSideDatasource');
  if (ds && !ds.__spWrapped) {
    const g = ds.getRows.bind(ds);
    ds.getRows = (params) => {
      const s = performance.now();
      const r = params.request ?? {};
      log.push({ at: t(), ev: 'getRows', rows: `${r.startRow}-${r.endRow}` });
      const sc = params.success, fc = params.fail;
      params.success = (x) => {
        log.push({ at: t(), ev: 'served', ms: Math.round(performance.now() - s), rows: `${r.startRow}-${r.endRow}`, n: x?.rowData?.length });
        sc(x);
      };
      params.fail = () => { log.push({ at: t(), ev: 'failed' }); fc(); };
      return g(params);
    };
    ds.__spWrapped = true;
  }

  // Live/paused, which is what the scroll-pause flips.
  const holder = api.getGridOption('context')?.perspectiveEngineHolder;
  let wasLive = null;
  setInterval(() => {
    const now = holder?.get()?.status?.live ?? null;
    if (now !== wasLive) { wasLive = now; log.push({ at: t(), ev: now ? 'live' : 'paused' }); }
  }, 10);

  // First row-paint burst — rows becoming visible is what the user waits for.
  new MutationObserver((muts) => {
    let added = 0;
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType === 1 && n.classList?.contains('ag-row')) added += 1;
    }
    if (added > 0) log.push({ at: t(), ev: 'rows+', n: added });
  }).observe(el, { childList: true, subtree: true });

  if (groupBy) api.setRowGroupColumns(groupBy === 'none' ? [] : groupBy.split(','));
  return { ok: true, groups: (api.getRowGroupColumns?.() ?? []).length, displayed: api.getDisplayedRowCount() };
}, groupBy);
console.log('setup:', JSON.stringify(setup));
if (!setup.ok) { await browser.close(); process.exit(1); }
await page.waitForTimeout(8000);

const body = await page.$('.ag-body-viewport, .ag-body');
const box = await (body ?? (await page.$('.ag-root-wrapper'))).boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

for (const round of [1, 2]) {
  await page.evaluate(() => { window.__sp.log.length = 0; });
  // A real wheel scroll, several notches, then stop dead.
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(40);
  }
  await page.evaluate(() => { window.__sp.mark(); window.__sp.log.push({ at: Math.round(performance.now()), ev: 'STOP' }); });
  await page.waitForTimeout(9000);

  const out = await page.evaluate(() => window.__sp.log);
  const stop = out.find((e) => e.ev === 'STOP')?.at ?? 0;
  console.log(`\n=== round ${round} · ms relative to the last wheel notch ===`);
  for (const e of out) {
    const extra = Object.entries(e).filter(([k]) => k !== 'at' && k !== 'ev').map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`${String(e.at - stop).padStart(6)}  ${e.ev.padEnd(10)} ${extra}`);
  }
  const firstAfter = out.find((e) => e.ev === 'getRows' && e.at >= stop);
  const servedAfter = out.find((e) => e.ev === 'served' && e.at >= stop);
  const paintAfter = out.find((e) => e.ev === 'rows+' && e.at >= stop && e.n > 3);
  console.log(
    `SUMMARY  stop -> first block asked ${firstAfter ? firstAfter.at - stop : null} ms · served ${servedAfter ? servedAfter.at - stop : null} ms (read ${servedAfter?.ms} ms) · rows painted ${paintAfter ? paintAfter.at - stop : null} ms`,
  );
  await page.waitForTimeout(3000);
}

await browser.close();
