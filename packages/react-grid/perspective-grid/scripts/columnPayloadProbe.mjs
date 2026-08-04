/**
 * How wide is a block, actually?
 *
 * This probe exists because the Stress tab used to answer that question wrong.
 * Its "50k x 400" variant put 404 columns on screen over a Table of ~53 fields —
 * 368 of them were `valueGetter` columns computed in the window and never
 * fetched — and a 284x read-cost figure was built on the confusion.
 *
 * So it asks the running system three things it can answer exactly, and the
 * third is the one that matters:
 *
 *   1. how many columns does AG have?
 *   2. how many keys does a row the datasource actually RETURNED carry?
 *   3. how many AG columns have no field in that row?
 *
 * (2) is the payload. On the current stress book (1) and (2) should agree to
 * within the index column and (3) should be ZERO. If they ever diverge again,
 * something has reintroduced a computed column and every wide-book measurement
 * on this tab is measuring the grid rather than the book.
 *
 *   node packages/react-grid/perspective-grid/scripts/columnPayloadProbe.mjs
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');

async function measure(page) {
  await page.waitForSelector('.ag-row', { timeout: 180_000 });
  await page.waitForTimeout(12_000);

  // Deep-jump first, so the row count read below is the settled one rather
  // than the transient 1 a purge leaves behind.
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
    window.__cp = api;
    // Ungroup first. The Stress tab restores a seeded profile that opens
    // GROUPED, and a group row is not a row of the book — sampling one reports
    // the aggregate shape rather than the payload.
    api.setRowGroupColumns([]);
    api.ensureIndexVisible(25_000, 'top');
  });
  await page.waitForTimeout(8000);

  return page.evaluate(async () => {
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

    // A row the datasource returned. Its keys ARE the View's columns.
    let rowKeys = null;
    let sample = null;
    api.forEachNode((node) => {
      if (rowKeys === null && node.data) {
        rowKeys = Object.keys(node.data);
        sample = node.data;
      }
    });

    // Which AG columns have NO value in that row — the client-side ones.
    //
    // `calc_*` and AG's own auto-group column are excluded: a calculated column
    // is published to the worker as a Perspective EXPRESSION column and is
    // resolved there, and the auto-group column is not a field at all. Neither
    // is the client-side computation this probe exists to catch.
    const agIds = (api.getColumns() ?? []).map((c) => c.getColDef().field ?? c.getColId());
    const computed = (id) => id.startsWith('calc_') || id.startsWith('ag-Grid-');
    const unbacked = sample
      ? agIds.filter((id) => !(id in sample) && !computed(id))
      : [];

    const engine = api.getGridOption('context')?.perspectiveEngineHolder?.get?.();
    return {
      agColumns: agIds.length,
      payloadColumns: rowKeys ? rowKeys.length : null,
      agColumnsWithNoTableField: unbacked.length,
      firstUnbacked: unbacked.slice(0, 5),
      firstPayload: rowKeys ? rowKeys.slice(0, 8) : null,
      bookRows: engine?.status?.bookRows ?? null,
      displayedRows: api.getDisplayedRowCount?.() ?? null,
    };
  });
}

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.click('[data-testid="lab-tab-stress"]');
  await page.waitForTimeout(3000);

  const r = await measure(page);
  console.log(`  AG columns                     ${r.agColumns}`);
  console.log(`  columns in a returned ROW      ${r.payloadColumns}   <- the block payload`);
  console.log(`  AG columns with no Table field ${r.agColumnsWithNoTableField}  e.g. ${JSON.stringify(r.firstUnbacked)}`);
  console.log(`  payload starts                 ${JSON.stringify(r.firstPayload)}`);
  console.log(`  book ${r.bookRows} rows · grid shows ${r.displayedRows} after a jump to row 25,000`);
  console.log('');
  console.log(
    r.agColumnsWithNoTableField === 0
      ? '  OK: every rendered column is a column of the book.'
      : `  *** ${r.agColumnsWithNoTableField} rendered columns are computed in the window, not fetched — this tab is measuring the grid, not the book.`,
  );
} finally {
  await browser.close();
}
