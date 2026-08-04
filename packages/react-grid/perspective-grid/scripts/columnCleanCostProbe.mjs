/**
 * The clean 40-vs-400 column read cost: live ticks OFF on BOTH sides.
 *
 * The first attempt at this compared a variant that ships with ticks off
 * against one ticking at 200 ms, so part of the gap was live-refresh contention
 * rather than columns. This pauses the feed through the Demo Console's own
 * switch (`data-testid="lab-stream-pause"`, checked === running) and VERIFIES
 * the switch actually flipped before measuring — the previous probe silently
 * failed to find it and reported a number anyway.
 *
 * Fresh browser per variant, flat (ungrouped), same jump pattern, same block
 * size. Only the column count differs.
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');

const stat = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, min: s[0], median: s[Math.floor(s.length / 2)], p90: s[Math.floor(s.length * 0.9)], max: s[s.length - 1] };
};
const fmt = (s) => (s ? `n=${String(s.n).padStart(3)}  min ${String(s.min).padStart(5)}  median ${String(s.median).padStart(5)}  p90 ${String(s.p90).padStart(5)}  max ${String(s.max).padStart(5)} ms` : '(none)');

async function measure(variant) {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.click('[data-testid="lab-tab-stress"]');
    await page.waitForTimeout(3000);
    await page.click('button[role="combobox"]');
    await page.waitForTimeout(400);
    for (const o of await page.$$('[role="option"]')) {
      if (((await o.textContent()) ?? '').trim() === variant) { await o.click(); break; }
    }
    await page.waitForSelector('.ag-row', { timeout: 180_000 });
    await page.waitForTimeout(18_000);

    // Ticks OFF, and prove it. `checked` means RUNNING.
    let tickState = 'not found';
    const sw = await page.$('[data-testid="lab-stream-pause"]');
    if (sw) {
      const before = await sw.getAttribute('aria-checked');
      if (before === 'true') {
        await sw.click();
        await page.waitForTimeout(2500);
      }
      const after = await page.getAttribute('[data-testid="lab-stream-pause"]', 'aria-checked');
      tickState = `${before} -> ${after}`;
      if (after === 'true') throw new Error('feed still running — refusing to report a contaminated number');
    } else {
      throw new Error('pause switch not found — refusing to report a contaminated number');
    }
    // Let any in-flight refresh drain now that nothing new is arriving.
    await page.waitForTimeout(10_000);

    const cols = await page.evaluate(() => {
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
      const rec = [];
      window.__cc = { api, rec };
      api.setRowGroupColumns([]);
      const ds = api.getGridOption('serverSideDatasource');
      if (ds && !ds.__ccWrapped) {
        const g = ds.getRows.bind(ds);
        ds.getRows = (params) => {
          const s = performance.now();
          const sc = params.success;
          params.success = (x) => { rec.push(Math.round(performance.now() - s)); sc(x); };
          return g(params);
        };
        ds.__ccWrapped = true;
      }
      return api.getColumns()?.length ?? 0;
    });

    await page.waitForTimeout(6000);
    await page.evaluate(() => { window.__cc.rec.length = 0; });

    for (const row of [500, 5000, 12000, 20000, 30000, 41000, 8000, 25000, 47000, 15000]) {
      await page.evaluate((r) => window.__cc.api.ensureIndexVisible(r, 'top'), row);
      await page.waitForTimeout(3500);
    }

    const rec = await page.evaluate(() => window.__cc.rec);
    const s = stat(rec);
    console.log(`${variant}\n  columns ${cols} · ticks ${tickState} · getRows ${fmt(s)}`);
    return { cols, s };
  } catch (err) {
    console.log(`${variant}\n  ABORTED: ${String(err).slice(0, 160)}`);
    return null;
  } finally {
    try { await browser.close(); } catch { /* */ }
  }
}

const a = await measure('MarketsGrid SSRM · 50k × 40');
const b = await measure('MarketsGrid · 50k × 400 (modules)');

if (a && b) {
  console.log('\n=== clean comparison, ticks off both sides ===');
  console.log(`  columns   ${a.cols} -> ${b.cols}  (${(b.cols / a.cols).toFixed(1)}x)`);
  console.log(`  median    ${a.s.median} ms -> ${b.s.median} ms  (${(b.s.median / a.s.median).toFixed(0)}x)`);
  console.log(`  min       ${a.s.min} ms -> ${b.s.min} ms  (${(b.s.min / a.s.min).toFixed(0)}x)`);
  console.log(`  p90       ${a.s.p90} ms -> ${b.s.p90} ms  (${(b.s.p90 / a.s.p90).toFixed(0)}x)`);
  const perCol = (b.s.median / b.cols) / (a.s.median / a.cols);
  console.log(`  cost per column is ${perCol.toFixed(1)}x higher at ${b.cols} columns — >1 means super-linear`);
}
