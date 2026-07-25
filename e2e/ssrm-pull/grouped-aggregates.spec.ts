/**
 * (f) Grouped aggregates + grand total under a LIVE feed: group-header
 * sums and the grand-total row keep ticking while the feed mutates the
 * book, with ZERO loading stubs and no remount — ticks patch rows in
 * place, they never purge stores.
 *
 * Exact child counts are asserted with the quiet-window sandwich
 * (control-read → probe → control-read) so a mid-assertion tick can
 * never fail the spec.
 */
import { test, expect } from '@playwright/test';
import {
  CHILD_COUNT_FIELD,
  openSpike,
  waitForLive,
  waitForGridRows,
  groupBy,
  displayedRow,
  stableGroupRows,
  expandDisplayedRow,
  grandTotalData,
  loadingRowCount,
  mounts,
  sandwichedControlCount,
  state,
  pollUntil,
} from './ssrmSpike';

const OPTS = { rows: 8_000, rate: 5, upt: 400 };

test('group aggregates and the grand total tick live with zero loading stubs', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openSpike(page, OPTS);
  await waitForLive(page, OPTS.rows);
  await waitForGridRows(page, OPTS.rows);

  await groupBy(page, 'bookName');

  // ─── exact child counts (sandwiched against the control plane) ────
  const groups = await stableGroupRows(page);
  expect(groups.length).toBeGreaterThan(1);
  let childSum = 0;
  for (let i = 0; i < groups.length; i += 1) {
    const book = groups[i]!.bookName;
    const { control, probed } = await sandwichedControlCount(
      page,
      [['bookName', '==', book]],
      async () => (await displayedRow(page, i))?.[CHILD_COUNT_FIELD],
    );
    expect(probed, `child count of book '${String(book)}'`).toBe(control);
    childSum += control;
  }
  expect(childSum).toBe(OPTS.rows);

  // ─── the aggregates TICK, and nothing ever shows a loading stub ───
  await pollUntil(
    async () => typeof (await grandTotalData(page))?.pnl === 'number',
    { label: 'grand total row to appear' },
  );

  const grandTotals = new Set<number>();
  const groupAggs = new Set<number>();
  for (let sample = 0; sample < 12; sample += 1) {
    const total = await grandTotalData(page);
    const firstGroup = await displayedRow(page, 0);
    grandTotals.add(total?.pnl as number);
    groupAggs.add(firstGroup?.pnl as number);
    expect(await loadingRowCount(page), `loading stubs at sample ${sample}`).toBe(0);
    await page.waitForTimeout(500);
  }
  expect(grandTotals.size, 'grand-total pnl ticked').toBeGreaterThanOrEqual(2);
  expect(groupAggs.size, 'group-header pnl ticked').toBeGreaterThanOrEqual(2);

  // Live feed + 6s of aggregate churn never bounced the dataset or the
  // grid: still live gen-1, one mount.
  expect(await state(page)).toMatchObject({ phase: 'live', generation: 1, rowCount: OPTS.rows });
  expect(await mounts(page)).toBe(1);

  // ─── expanding a group serves its leaves under the ticking feed ───
  await expandDisplayedRow(page, 0, true);
  await pollUntil(
    async () => {
      const leaf = await displayedRow(page, 1);
      return leaf !== null && leaf.__group === false && leaf.positionId != null;
    },
    { label: 'expanded leaf rows to render' },
  );
  const leaf = await displayedRow(page, 1);
  expect(leaf!.bookName).toBe(groups[0]!.bookName);
  await expect.poll(() => loadingRowCount(page), { timeout: 10_000 }).toBe(0);
});
