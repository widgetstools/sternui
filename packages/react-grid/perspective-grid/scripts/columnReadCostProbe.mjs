/**
 * Is the per-request cost the COLUMNS, or the transport?
 *
 * Same book size (50,000 rows), same engine, same browser build, same block
 * size — only the column count differs:
 *
 *   MarketsGrid SSRM · 50k x 40
 *   MarketsGrid · 50k x 400 (modules)
 *
 * Times `getRows` end to end, and splits the engine work inside it into the
 * View build, `num_rows()` and `to_columns()`. If transport dominated, the two
 * would land close together; if payload dominates, they scale with columns.
 *
 * Fresh browser per variant, so the previous one's live Views are not in the
 * engine when the next is measured.
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');

const stat = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return {
    n: s.length,
    min: s[0],
    median: s[Math.floor(s.length / 2)],
    p90: s[Math.floor(s.length * 0.9)],
    max: s[s.length - 1],
  };
};

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
    await page.waitForTimeout(20_000);

    const cols = await page.evaluate(() => {
      const el = document.querySelector('.ag-root-wrapper');
      const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
      let f = el[k], api = null, table = null;
      while (f && (!api || !table)) {
        const pr = f.memoizedProps;
        if (!api && typeof pr?.api?.getColumns === 'function') api = pr.api;
        if (!table && pr?.table && typeof pr.table.view === 'function') table = pr.table;
        let h = f.memoizedState;
        while (h && !api) { if (typeof h.memoizedState?.getColumns === 'function') api = h.memoizedState; h = h.next; }
        f = f.return;
      }
      const rec = { getRows: [], build: [], numRows: [], toColumns: [] };
      window.__rc = { api, rec };

      // Flat: a leaf block read, no group tree, so the numbers are comparable.
      api.setRowGroupColumns([]);

      if (table && !table.__rcWrapped) {
        const view = table.view.bind(table);
        table.view = async (config) => {
          const s = performance.now();
          const v = await view(config);
          rec.build.push(Math.round(performance.now() - s));
          if (typeof v?.num_rows === 'function') {
            const nr = v.num_rows.bind(v);
            v.num_rows = async () => {
              const t = performance.now();
              const n = await nr();
              rec.numRows.push(Math.round(performance.now() - t));
              return n;
            };
          }
          if (typeof v?.to_columns === 'function') {
            const tc = v.to_columns.bind(v);
            v.to_columns = async (w) => {
              const t = performance.now();
              const c = await tc(w);
              rec.toColumns.push(Math.round(performance.now() - t));
              return c;
            };
          }
          return v;
        };
        table.__rcWrapped = true;
      }

      const ds = api.getGridOption('serverSideDatasource');
      if (ds && !ds.__rcWrapped) {
        const g = ds.getRows.bind(ds);
        ds.getRows = (params) => {
          const s = performance.now();
          const sc = params.success, fc = params.fail;
          params.success = (x) => { rec.getRows.push(Math.round(performance.now() - s)); sc(x); };
          params.fail = () => { fc(); };
          return g(params);
        };
        ds.__rcWrapped = true;
      }
      return api.getColumns()?.length ?? 0;
    });

    await page.waitForTimeout(6000);
    await page.evaluate(() => { const r = window.__rc.rec; r.getRows.length = 0; r.build.length = 0; r.numRows.length = 0; r.toColumns.length = 0; });

    // Force fresh blocks: jump around the book rather than scrolling one screen.
    for (const row of [500, 5000, 12000, 20000, 30000, 41000, 8000, 25000, 47000, 15000]) {
      await page.evaluate((r) => window.__rc.api.ensureIndexVisible(r, 'top'), row);
      await page.waitForTimeout(3500);
    }

    const rec = await page.evaluate(() => window.__rc.rec);
    console.log(`\n=== ${variant} · ${cols} columns ===`);
    for (const [k, v] of Object.entries(rec)) {
      const s = stat(v);
      console.log(`  ${k.padEnd(10)} ${s ? `n=${String(s.n).padStart(3)}  min ${String(s.min).padStart(5)}  median ${String(s.median).padStart(5)}  p90 ${String(s.p90).padStart(5)}  max ${String(s.max).padStart(5)} ms` : '(none)'}`);
    }
    return { variant, cols, rec };
  } finally {
    try { await browser.close(); } catch { /* */ }
  }
}

const a = await measure('MarketsGrid SSRM · 50k × 40');
const b = await measure('MarketsGrid · 50k × 400 (modules)');

const med = (xs) => (stat(xs)?.median ?? 0);
console.log('\n=== ratio, 400 columns vs 40 ===');
for (const k of ['getRows', 'build', 'numRows', 'toColumns']) {
  const x = med(a.rec[k]), y = med(b.rec[k]);
  console.log(`  ${k.padEnd(10)} ${String(x).padStart(5)} ms -> ${String(y).padStart(5)} ms   ${x ? `${(y / x).toFixed(1)}x` : 'n/a'}`);
}
console.log(`  columns    ${a.cols} -> ${b.cols}   ${(b.cols / a.cols).toFixed(1)}x`);
