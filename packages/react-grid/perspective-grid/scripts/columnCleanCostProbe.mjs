/**
 * The clean 40-vs-400 column read cost: the feed provably still on BOTH sides.
 *
 * ## Why this was rewritten
 *
 * The first version read the Demo Console's pause switch (`aria-checked`) and
 * treated it as the feed's state. It is not. MEASURED in the lab source:
 * `useLabPerspectiveRows` initialises `paused` from `opts.enableUpdates` in a
 * `useState` INITIALISER, which runs once for the tab — and the stress tab
 * swaps its variant without remounting the hook. So switching from the 40-column
 * variant (`enableUpdates: false`) to the 400-column one (`enableUpdates ?? true`)
 * leaves the switch reading "paused" over a provider that is ticking. The
 * effect that pushes the state to the worker is deliberately skipped on mount,
 * so nothing ever corrects it. That is exactly the `false -> false` both probe
 * runs saw, and it means the previous run could not tell treatment from control.
 *
 * ## What this does instead
 *
 * 1. Forces a DELIBERATE change, which is the only thing the lab turns into a
 *    `restartLabProvider(client, providerId, { enableUpdates })` call: toggle
 *    the switch on, let the restart land, toggle it off.
 * 2. VERIFIES the result against the book rather than against the UI — sample
 *    the rendered cells, wait, sample again. A ticking book repaints them; a
 *    paused one does not. If they move, this REFUSES to report a number.
 *
 * ## The second trap, hit while writing (2)
 *
 * The first sampler took the leading 120 `.ag-cell` elements. AG virtualises
 * COLUMNS, so at the default scroll position those are the leading TEXT columns
 * — cusip, ticker, description, assetClass — and a price feed never touches
 * one. The check therefore said "still" for a book that was ticking hard: a
 * verification that cannot fail is not a verification. It now scrolls a price
 * column into view and samples that, and REFUSES outright if no price cell is
 * in the DOM to watch.
 *
 * Rule this file exists to enforce: a probe that cannot verify its own
 * precondition must not report — and "the precondition" includes the probe
 * looking at something capable of showing the failure.
 *
 *   node packages/react-grid/perspective-grid/scripts/columnCleanCostProbe.mjs
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

/**
 * Columns the mock feed actually MOVES. Sampling anything else proves nothing.
 *
 * The first version of this sampler took the first 120 `.ag-cell` elements in
 * the DOM. AG virtualises columns, so at the default scroll position those are
 * the leading TEXT columns — cusip, ticker, description, assetClass — and a
 * price feed does not touch any of them. It therefore reported "still" for a
 * book that was ticking hard, which is the same class of error as reading the
 * pause switch: a check that cannot fail is not a check.
 */
const TICKING_COLUMNS = ['midPrice', 'bidPrice', 'askPrice', 'lastPrice', 'priceChange'];

/** Bring a ticking column into the DOM. Nothing can be sampled until it is. */
async function showTickingColumns(page) {
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
    api?.ensureColumnVisible?.('midPrice');
  });
  await page.waitForTimeout(1500);
}

/** What the ticking columns are painting right now, as a comparable string. */
const sampleCells = (page, ids = TICKING_COLUMNS) =>
  page.evaluate((cols) => {
    const cells = cols.flatMap((id) => [
      ...document.querySelectorAll(`.ag-cell[col-id="${id}"]`),
    ]);
    return { n: cells.length, text: cells.map((c) => c.textContent ?? '').join('|') };
  }, ids);

/**
 * Prove the feed is off by watching the book, not the switch.
 *
 * Two samples `waitMs` apart. Identical means nothing is arriving — the live
 * refresh runs every 250 ms at idle, so a ticking book cannot hide across this
 * window.
 *
 * Polled to a budget rather than asked once, because a pause is delivered as a
 * provider RESTART and a restart re-generates the whole book: on the 50k x 400
 * variant the snapshot alone rewrites 20,000,000 cells, and the grid repaints
 * throughout. A single check 25 s after the click reported "still moving" for
 * that reason and aborted a run that would have been fine a minute later.
 */
async function waitForStillFeed(page, budgetMs = 300_000) {
  await showTickingColumns(page);
  const deadline = Date.now() + budgetMs;
  let sampled = 0;
  while (Date.now() < deadline) {
    const before = await sampleCells(page);
    await page.waitForTimeout(8000);
    const after = await sampleCells(page);
    sampled = before.n;
    // Zero price cells in the DOM means the sampler is looking at nothing, and
    // "nothing did not change" is not evidence of a paused feed.
    if (before.n === 0) throw new Error('no ticking columns in the DOM — cannot verify the feed');
    if (before.text === after.text) return { still: true, sampled };
    process.stdout.write('.');
  }
  return { still: false, sampled };
}

/** Wait until the book IS moving — the control for the paused runs. */
async function waitForMovingFeed(page, budgetMs = 180_000) {
  await showTickingColumns(page);
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const before = await sampleCells(page);
    await page.waitForTimeout(4000);
    const after = await sampleCells(page);
    if (before.n === 0) throw new Error('no ticking columns in the DOM — cannot verify the feed');
    if (before.text !== after.text) return { moving: true, sampled: before.n };
    process.stdout.write(',');
  }
  return { moving: false, sampled: 0 };
}

/**
 * @param variant  the Stress tab variant label
 * @param feed     'still' or 'running' — VERIFIED either way, never assumed
 */
async function measure(variant, feed = 'still') {
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

    // ── Pause the PROVIDER, not the switch ────────────────────────────────
    //
    // The lab only calls `restartLabProvider(..., { enableUpdates })` on a
    // deliberate change, so a switch that already reads "off" pushes nothing.
    // On -> settle -> off is what guarantees the second restart carries
    // `enableUpdates: false`.
    const sw = page.locator('[data-testid="lab-stream-pause"]');
    if ((await sw.count()) === 0) throw new Error('pause switch not found');
    const claimed = await sw.getAttribute('aria-checked');
    if (claimed !== 'true') {
      await sw.click();                 // -> running
      await page.waitForTimeout(20_000); // the restart re-snapshots the book
    }
    if (feed === 'still') {
      await sw.click();                 // -> paused, and this one is real
      const state = await waitForStillFeed(page);
      if (!state.still) {
        throw new Error(
          `book still moving after the pause (${state.sampled} price cells watched) — refusing to report a contaminated number`,
        );
      }
    } else {
      const state = await waitForMovingFeed(page);
      if (!state.moving) {
        throw new Error('book is NOT moving — this run was supposed to be the ticking control');
      }
    }

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
      const engine = api.getGridOption('context')?.perspectiveEngineHolder?.get?.();
      return {
        columns: api.getColumns()?.length ?? 0,
        // The book, read from the worker-held Table. A restart that had quietly
        // rebuilt a SMALLER book would make every read fast for the wrong
        // reason, and nothing on screen would say so.
        bookRows: engine?.status?.bookRows ?? null,
        displayedRows: api.getDisplayedRowCount?.() ?? null,
      };
    });

    await page.waitForTimeout(6000);
    await page.evaluate(() => { window.__cc.rec.length = 0; });

    for (const row of [500, 5000, 12000, 20000, 30000, 41000, 8000, 25000, 47000, 15000]) {
      await page.evaluate((r) => window.__cc.api.ensureIndexVisible(r, 'top'), row);
      await page.waitForTimeout(3500);
    }

    // A restart is how the feed is paused, and a restart REBUILDS the book. One
    // that quietly came back smaller would make every read fast for the wrong
    // reason, with nothing on screen to say so.
    if (typeof cols.bookRows === 'number' && cols.bookRows < 40_000) {
      throw new Error(
        `book is ${cols.bookRows} rows, not the ~50,000 this variant declares — refusing to report`,
      );
    }

    const rec = await page.evaluate(() => window.__cc.rec);
    const s = stat(rec);
    console.log(
      `${variant}  [feed verified ${feed.toUpperCase()}]\n  columns ${cols.columns} · book ${cols.bookRows} rows (grid shows ${cols.displayedRows}) · getRows ${fmt(s)}`,
    );
    return { cols: cols.columns, book: cols.bookRows, s };
  } catch (err) {
    console.log(`${variant}\n  ABORTED: ${String(err).slice(0, 200)}`);
    return null;
  } finally {
    try { await browser.close(); } catch { /* */ }
  }
}

const a = await measure('MarketsGrid SSRM · 50k × 40', 'still');
const b = await measure('MarketsGrid · 50k × 400 (modules)', 'still');
/**
 * The control that settles WHY a 400-column read was ever measured in seconds:
 * same variant, same book, same everything, feed verified RUNNING. If the
 * paused runs above are fast and this one is slow, the cost was never the
 * columns.
 */
const c = await measure('MarketsGrid · 50k × 400 (modules)', 'running');

if (a && b) {
  console.log('\n=== clean comparison, feed verified still on both sides ===');
  console.log(`  columns   ${a.cols} -> ${b.cols}  (${(b.cols / a.cols).toFixed(1)}x)`);
  console.log(`  median    ${a.s.median} ms -> ${b.s.median} ms  (${(b.s.median / a.s.median).toFixed(0)}x)`);
  console.log(`  min       ${a.s.min} ms -> ${b.s.min} ms  (${(b.s.min / a.s.min).toFixed(0)}x)`);
  console.log(`  p90       ${a.s.p90} ms -> ${b.s.p90} ms  (${(b.s.p90 / a.s.p90).toFixed(0)}x)`);
  const perCol = (b.s.median / b.cols) / (a.s.median / a.cols);
  console.log(`  cost per column is ${perCol.toFixed(1)}x higher at ${b.cols} columns — >1 means super-linear`);
  if (c) {
    console.log(
      `  same 400 columns, feed running: median ${c.s.median} ms — ${(c.s.median / b.s.median).toFixed(0)}x the paused reading`,
    );
  }
}
