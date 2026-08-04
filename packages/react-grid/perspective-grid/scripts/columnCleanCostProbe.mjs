/**
 * What a block read costs, with and without the column window — one book.
 *
 * ## What this used to be, and why it is different now
 *
 * It compared the Stress tab's "50k x 40" and "50k x 400" variants and reported
 * a 284x gap that justified building column-window fetching. Both halves of that
 * were wrong:
 *
 *   - the feed was not off. The probe read the Demo Console's pause switch, and
 *     `useLabPerspectiveRows` initialises `paused` in a `useState` INITIALISER
 *     that runs once per tab, so swapping variants left the switch reading
 *     "paused" over a ticking provider;
 *   - and the "400 columns" were not columns. MEASURED with
 *     `columnPayloadProbe.mjs`, a block on that variant carried 56 columns; 368
 *     of the 404 were `valueGetter` columns computed in the window.
 *
 * The Stress tab is now ONE surface of 50,000 rows x 120 columns, every one of
 * them a real Table field, so the comparison that means something is the same
 * book with the column window off and on. `?columnWindow=1` is the flag.
 *
 * ## The precondition, and why it is checked this hard
 *
 * A read timed while the feed is ticking measures contention, not columns. The
 * feed is paused through the UI (the only thing the lab turns into a
 * `restartLabProvider(..., { enableUpdates: false })`) and then VERIFIED against
 * the book — sample price cells, wait, sample again.
 *
 * Both parts are load-bearing and each replaced a check that could not fail: the
 * switch lies, and an earlier sampler watched the first 120 `.ag-cell` elements,
 * which AG's column virtualisation makes the leading TEXT columns that a price
 * feed never touches. This one scrolls a price column into view, watches only
 * price columns, and REFUSES to report if none is in the DOM.
 *
 *   node packages/react-grid/perspective-grid/scripts/columnCleanCostProbe.mjs
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('url', 'http://localhost:5301');

const stat = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, min: s[0], median: s[Math.floor(s.length / 2)], p90: s[Math.floor(s.length * 0.9)], max: s[s.length - 1] };
};
const fmt = (s) => (s ? `n=${String(s.n).padStart(3)}  min ${String(s.min).padStart(5)}  median ${String(s.median).padStart(5)}  p90 ${String(s.p90).padStart(5)}  max ${String(s.max).padStart(5)} ms` : '(none)');

/** Columns the mock feed actually MOVES. Sampling anything else proves nothing. */
const TICKING_COLUMNS = ['midPrice', 'bidPrice', 'askPrice', 'lastPrice', 'priceChange'];

const gridApi = () => {
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
  return api;
};

/** Bring a ticking column into the DOM. Nothing can be sampled until it is. */
async function showTickingColumns(page) {
  await page.evaluate(`(${gridApi.toString()})()?.ensureColumnVisible?.('midPrice')`);
  await page.waitForTimeout(1500);
}

const sampleCells = (page) =>
  page.evaluate((cols) => {
    const cells = cols.flatMap((id) => [
      ...document.querySelectorAll(`.ag-cell[col-id="${id}"]`),
    ]);
    return { n: cells.length, text: cells.map((c) => c.textContent ?? '').join('|') };
  }, TICKING_COLUMNS);

async function waitForStillFeed(page, budgetMs = 300_000) {
  await showTickingColumns(page);
  const deadline = Date.now() + budgetMs;
  let sampled = 0;
  while (Date.now() < deadline) {
    const before = await sampleCells(page);
    await page.waitForTimeout(8000);
    const after = await sampleCells(page);
    sampled = before.n;
    if (before.n === 0) throw new Error('no ticking columns in the DOM — cannot verify the feed');
    if (before.text === after.text) return { still: true, sampled };
    process.stdout.write('.');
  }
  return { still: false, sampled };
}

/**
 * @param label   what to print
 * @param query the URL query that selects the run (`''` or `'?columnWindow=1'`)
 */
async function measure(label, query) {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto(`${base}/${query}`, { waitUntil: 'domcontentloaded' });
    await page.click('[data-testid="lab-tab-stress"]');
    await page.waitForSelector('.ag-row', { timeout: 180_000 });
    await page.waitForTimeout(18_000);

    // Pause the PROVIDER, not the switch. The lab only calls
    // `restartLabProvider(..., { enableUpdates })` on a DELIBERATE change, so a
    // switch already reading "off" pushes nothing — on, settle, off.
    const sw = page.locator('[data-testid="lab-stream-pause"]');
    if ((await sw.count()) === 0) throw new Error('pause switch not found');
    if ((await sw.getAttribute('aria-checked')) !== 'true') {
      await sw.click();
      await page.waitForTimeout(20_000);
    }
    await sw.click();
    const feed = await waitForStillFeed(page);
    if (!feed.still) {
      throw new Error(
        `book still moving after the pause (${feed.sampled} price cells watched) — refusing to report`,
      );
    }

    const info = await page.evaluate(`(() => {
      const api = (${gridApi.toString()})();
      const rec = [];
      window.__cc = { api, rec };
      // Flat: the seeded profile opens GROUPED, and a group read is a different
      // question from a block read.
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
      const engine = api.getGridOption('context')?.perspectiveEngineHolder?.get?.();
      return {
        columns: api.getColumns()?.length ?? 0,
        bookRows: engine?.status?.bookRows ?? null,
      };
    })()`);

    if (typeof info.bookRows === 'number' && info.bookRows < 40_000) {
      throw new Error(`book is ${info.bookRows} rows, not ~50,000 — refusing to report`);
    }

    await page.waitForTimeout(6000);
    await page.evaluate(() => { window.__cc.rec.length = 0; });

    for (const row of [500, 5000, 12000, 20000, 30000, 41000, 8000, 25000, 47000, 15000]) {
      await page.evaluate((r) => window.__cc.api.ensureIndexVisible(r, 'top'), row);
      await page.waitForTimeout(3500);
    }

    /**
     * The payload, sampled AFTER the jumps — and this is the assertion that
     * makes the comparison mean anything.
     *
     * Read before them it came back `null` on both runs, because the ungroup
     * purges the store and there is no loaded row to sample. A comparison of
     * "window off" against "window on" with no evidence the window was ever
     * APPLIED is the same species of error as trusting the pause switch: both
     * sides look alike because neither is doing what it claims.
     */
    const payload = await page.evaluate(() => {
      let keys = null;
      window.__cc.api.forEachNode((n) => {
        if (keys === null && n.data) keys = Object.keys(n.data).length;
      });
      return keys;
    });

    const rec = await page.evaluate(() => window.__cc.rec);
    const s = stat(rec);
    info.payload = payload;
    console.log(
      `${label}  [feed verified STILL]\n  AG columns ${info.columns} · payload ${info.payload} · book ${info.bookRows} rows · getRows ${fmt(s)}`,
    );
    return { ...info, s };
  } catch (err) {
    console.log(`${label}\n  ABORTED: ${String(err).slice(0, 200)}`);
    return null;
  } finally {
    try { await browser.close(); } catch { /* */ }
  }
}

const off = await measure('50k x 120 · column window OFF', '');
const on = await measure('50k x 120 · column window ON', '?columnWindow=1');

if (off && on) {
  console.log('\n=== same book, feed verified still on both sides ===');
  console.log(`  payload   ${off.payload} -> ${on.payload} columns`);
  console.log(`  median    ${off.s.median} ms -> ${on.s.median} ms`);
  console.log(`  p90       ${off.s.p90} ms -> ${on.s.p90} ms`);
  console.log(`  max       ${off.s.max} ms -> ${on.s.max} ms`);
}
