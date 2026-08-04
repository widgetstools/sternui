/**
 * How wide is a block, actually?
 *
 * Every number behind column-window fetching was taken against the Stress tab's
 * "50k x 400" variant, and every one of them said "400 columns". That is AG's
 * column count. It is NOT the width of a block: a Perspective View carries the
 * columns of the TABLE, and this lab's Tables are all built from one declared
 * schema (`TABLE_FIELDS` in `perspectiveProvider.ts`).
 *
 * So this asks the running system three questions it can answer exactly, and
 * the third is the one that matters:
 *
 *   1. how many columns does AG have?
 *   2. how many fields does the Table have?
 *   3. how many keys does a row the datasource actually returned carry?
 *
 * (3) is the payload. If it is far below (1), the difference is client-side
 * value getters and nothing a narrower View could ever remove.
 *
 *   node packages/react-grid/perspective-grid/scripts/columnPayloadProbe.mjs
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://localhost:5301');

async function measure(page, variant) {
  await page.click('button[role="combobox"]');
  await page.waitForTimeout(400);
  for (const o of await page.$$('[role="option"]')) {
    if (((await o.textContent()) ?? '').trim() === variant) { await o.click(); break; }
  }
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
    const agIds = (api.getColumns() ?? []).map((c) => c.getColDef().field ?? c.getColId());
    const unbacked = sample ? agIds.filter((id) => !(id in sample)) : [];

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

// A FRESH browser per variant. Switching the variant in place leaves the grid
// waiting on a Table the previous surface still holds open, and the second one
// never renders a row inside three minutes.
for (const variant of ['MarketsGrid SSRM · 50k × 40', 'MarketsGrid · 50k × 400 (modules)']) {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.click('[data-testid="lab-tab-stress"]');
    await page.waitForTimeout(3000);

    const r = await measure(page, variant);
    console.log(`\n${variant}`);
    console.log(`  AG columns                     ${r.agColumns}`);
    console.log(`  columns in a returned ROW      ${r.payloadColumns}   <- the block payload`);
    console.log(`  AG columns with no Table field ${r.agColumnsWithNoTableField}  e.g. ${JSON.stringify(r.firstUnbacked)}`);
    console.log(`  payload starts                 ${JSON.stringify(r.firstPayload)}`);
    console.log(`  book ${r.bookRows} rows · grid shows ${r.displayedRows} after a jump to row 25,000`);
  } catch (err) {
    console.log(`
${variant}
  ABORTED: ${String(err).slice(0, 200)}`);
  } finally {
    await browser.close();
  }
}
