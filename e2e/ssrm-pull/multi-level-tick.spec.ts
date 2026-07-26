/**
 * (h) Live ticking at EVERY row-group level.
 *
 * Group by region > desk > trader, aggregate pnl + marketValue, expand
 * all the way down, and assert the PAINTED aggregate cell changes at
 * each level while the feed runs — plus the grand total.
 *
 * Why this spec exists: two separate defects shipped where some levels
 * ticked and others silently froze —
 *  • the tick sweep refetched only the globally most-recently-used
 *    blocks, so scrolling leaves inside an expanded group evicted the
 *    group-level block and that level went quiet;
 *  • the rollup and group-level views were only PEEKED in the view
 *    cache, so once evicted nothing recreated them and the totals froze
 *    for the rest of the session.
 * Both presented as "the top and bottom move, the middle doesn't", which
 * is invisible to a spec that only checks one level.
 *
 * Assertions read the DOM (`.ag-row [col-id]` text), never the row
 * model: the model has been correct here while the screen painted stale
 * values, so only painted text proves a tick reached the user.
 */
import { test, expect } from '@playwright/test';
import {
  openSpike,
  waitForLive,
  waitForGridRows,
  groupByLevels,
  displayedRow,
  expandDisplayedRow,
  renderedRowCount,
  churnLeafBlocks,
  waitForCellText,
  waitForCellToTick,
  grandTotalData,
  loadingRowCount,
  mounts,
  pollUntil,
  state,
} from './ssrmSpike';

// `cols=all` so the feed's region/desk/trader columns exist at all — the
// curated `basic` set has none of them. That also puts the book over the
// wide-column threshold, so this exercises the DEGRADED sweep gate,
// which is the configuration the lab actually runs.
const OPTS = { rows: 8_000, rate: 5, upt: 400, cols: 'all' as const };

const LEVELS = ['region', 'desk', 'trader'];
const VALUE_COLS = [
  { colId: 'pnl', aggFunc: 'sum' },
  { colId: 'marketValue', aggFunc: 'sum' },
];

test('aggregates tick at every group level: region > desk > trader', async ({ page }) => {
  test.setTimeout(300_000);

  await openSpike(page, OPTS);
  await waitForLive(page, OPTS.rows);
  await waitForGridRows(page, OPTS.rows);

  const mountsBefore = await mounts(page);

  await groupByLevels(page, LEVELS, VALUE_COLS);

  // Level 0 — region rows at the root route.
  await pollUntil(
    async () => {
      const row = await displayedRow(page, 0);
      return row?.__group === true ? row : null;
    },
    { timeoutMs: 60_000, label: 'region (level 0) group rows never appeared' },
  );
  expect(await renderedRowCount(page)).toBeGreaterThan(0);

  // Every level must paint a NUMBER before we can claim it ticks: a
  // group row exists before its aggregate arrives, and treating that
  // first paint ("" -> "123") as a tick would make this spec vacuous.
  expect((await waitForCellText(page, 0, 'pnl')).trim()).toBeTruthy();

  // ── level 0: region ──
  const region = await waitForCellToTick(page, 0, 'pnl', {
    label: 'region-level pnl never repainted',
  });
  expect(region.after).not.toBe(region.before);

  // ── level 1: desk ── expand the first region.
  await expandDisplayedRow(page, 0, true);
  const deskRow = await pollUntil(
    async () => {
      const row = await displayedRow(page, 1);
      return row?.__group === true ? row : null;
    },
    { timeoutMs: 60_000, label: 'desk (level 1) group rows never appeared' },
  );
  expect(deskRow.__group).toBe(true);
  expect((await waitForCellText(page, 1, 'marketValue')).trim()).toBeTruthy();

  const desk = await waitForCellToTick(page, 1, 'pnl', {
    label: 'desk-level pnl never repainted (intermediate level starved?)',
  });
  expect(desk.after).not.toBe(desk.before);

  // ── level 2: trader ── expand the first desk.
  await expandDisplayedRow(page, 1, true);
  const traderRow = await pollUntil(
    async () => {
      const row = await displayedRow(page, 2);
      return row?.__group === true ? row : null;
    },
    { timeoutMs: 60_000, label: 'trader (level 2) group rows never appeared' },
  );
  expect(traderRow.__group).toBe(true);

  const trader = await waitForCellToTick(page, 2, 'pnl', {
    label: 'trader-level pnl never repainted',
  });
  expect(trader.after).not.toBe(trader.before);

  // ── MRU PRESSURE: the precondition for the real defect ──
  // Expand a trader and read its leaves, as a user does. The tick sweep
  // refetches only the most-recently-used blocks, so churning leaves is
  // what pushes the group levels out of that window. WITHOUT this the
  // spec passes even with the bug reintroduced — verified by putting the
  // root-only reserve back and watching it stay green.
  // Pressure comes from many DISTINCT routes, not from scrolling inside
  // one: with three levels on this book a single trader holds ~100 rows,
  // i.e. barely one block. Expanding sibling traders (each its own leaf
  // route, each its own blocks) is what actually fills the sweep window.
  for (let i = 2; i < 8; i += 1) {
    const row = await displayedRow(page, i);
    if (row?.__group === true) await expandDisplayedRow(page, i, true);
  }
  await churnLeafBlocks(page, [10, 60, 140, 220, 300, 380, 220, 60, 10], 200);

  // Now every level must STILL be repainting.
  for (const [rowIndex, level] of [
    [0, 'region (root)'],
    [1, 'desk (intermediate)'],
    [2, 'trader'],
  ] as const) {
    const row = await displayedRow(page, rowIndex);
    expect(row?.__group, `row ${rowIndex} should still be a ${level} group row`).toBe(true);
    const tick = await waitForCellToTick(page, rowIndex, 'pnl', {
      label: `${level} level stopped ticking after leaf-block churn`,
    });
    expect(tick.after).not.toBe(tick.before);
  }

  // ── the second aggregated column ticks too ──
  // pnl alone could pass on a code path that happened to carry only the
  // first value column.
  const marketValue = await waitForCellToTick(page, 0, 'marketValue', {
    label: 'marketValue never repainted at the region level',
  });
  expect(marketValue.after).not.toBe(marketValue.before);

  // ── the grand total ──
  // Read from the grand-total node: it lives OUTSIDE every store, so it
  // is patched through a different path than the group rows and has
  // frozen independently of them before.
  const totalBefore = (await grandTotalData(page))?.pnl;
  expect(totalBefore).toBeDefined();
  const totalAfter = await pollUntil(
    async () => {
      const now = (await grandTotalData(page))?.pnl;
      return now !== undefined && now !== totalBefore ? now : null;
    },
    { timeoutMs: 60_000, label: 'the grand total never changed' },
  );
  expect(totalAfter).not.toBe(totalBefore);

  // ── ticks must not disturb the grid ──
  // No loading stubs: ticks patch rows in place and never purge a store.
  expect(await loadingRowCount(page)).toBe(0);
  // No remount: a remount would reset expansion and mask a frozen level.
  expect(await mounts(page)).toBe(mountsBefore);
  // Still live on the same generation — nothing restarted underneath us.
  expect((await state(page))?.phase).toBe('live');
});

test('collapsed levels keep ticking after re-expansion', async ({ page }) => {
  // Collapsing drops a route's blocks; re-expanding must re-establish
  // ticking rather than leaving a level permanently silent. This is the
  // sequence that produced the frozen middle level in the field.
  test.setTimeout(300_000);

  await openSpike(page, OPTS);
  await waitForLive(page, OPTS.rows);
  await waitForGridRows(page, OPTS.rows);
  await groupByLevels(page, LEVELS, VALUE_COLS);

  await pollUntil(
    async () => {
      const row = await displayedRow(page, 0);
      return row?.__group === true ? row : null;
    },
    { timeoutMs: 60_000, label: 'region rows never appeared' },
  );

  await expandDisplayedRow(page, 0, true);
  await pollUntil(
    async () => {
      const row = await displayedRow(page, 1);
      return row?.__group === true ? row : null;
    },
    { timeoutMs: 60_000, label: 'desk rows never appeared' },
  );

  // Collapse, let a few ticks pass with the route gone, then re-expand.
  await expandDisplayedRow(page, 0, false);
  await page.waitForTimeout(3_000);
  await expandDisplayedRow(page, 0, true);

  await pollUntil(
    async () => {
      const row = await displayedRow(page, 1);
      return row?.__group === true ? row : null;
    },
    { timeoutMs: 60_000, label: 'desk rows did not come back after re-expansion' },
  );

  const desk = await waitForCellToTick(page, 1, 'pnl', {
    label: 're-expanded desk level never resumed ticking',
  });
  expect(desk.after).not.toBe(desk.before);
  expect(await loadingRowCount(page)).toBe(0);
});
