/**
 * (g) Tree data (`?tree=1` — the config's `treePathFields:
 * ['bookName','trader']` synthesize the hierarchy): expanding levels
 * serves exactly the right children, with child counts EXACT against
 * control reads of the hosted table, down to leaves pinned to their
 * two-key route.
 *
 * Tree nodes are detected by the plane's `GROUP_KEY_FIELD` stamp (AG's
 * `node.group` is a row-grouping flag; tree data drives expandability
 * through `isServerSideGroup`, which reads the same stamp).
 */
import { test, expect } from '@playwright/test';
import {
  CHILD_COUNT_FIELD,
  GROUP_KEY_FIELD,
  openSpike,
  waitForLive,
  displayedRow,
  displayedRowCount,
  stableGroupRows,
  expandDisplayedRow,
  getDistinctValues,
  queryAllRows,
  sandwichedControlCount,
  loadingRowCount,
  pollUntil,
} from './ssrmSpike';

const OPTS = { rows: 8_000, rate: 2, upt: 100, tree: true };

/** Tree-node predicate: the plane stamps every group-level row. */
const isTreeNode = (row: Record<string, unknown>): boolean => row[GROUP_KEY_FIELD] != null;

test('tree levels expand with exact child counts down to route-pinned leaves', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openSpike(page, OPTS);
  await waitForLive(page, OPTS.rows);

  // ─── root level: one node per book, child counts exact, Σ = book ──
  const roots = await stableGroupRows(page, { isGroup: isTreeNode });
  const books = await getDistinctValues(page, 'bookName');
  expect(roots.length).toBe(books.length);
  expect(new Set(roots.map((r) => r[GROUP_KEY_FIELD]))).toEqual(new Set(books));

  let rootSum = 0;
  for (let i = 0; i < roots.length; i += 1) {
    const book = roots[i]![GROUP_KEY_FIELD];
    const { control, probed } = await sandwichedControlCount(
      page,
      [['bookName', '==', book]],
      async () => (await displayedRow(page, i))?.[CHILD_COUNT_FIELD],
    );
    expect(probed, `child count of book '${String(book)}'`).toBe(control);
    rootSum += control;
  }
  expect(rootSum).toBe(OPTS.rows);

  // ─── level 2: traders under the first book — exact set + counts ──
  const book0 = roots[0]![GROUP_KEY_FIELD];
  const leafRows = await queryAllRows(page, ['bookName', 'trader']);
  expect(leafRows.length).toBe(OPTS.rows);
  const expectedTraders = new Set(
    leafRows.filter((r) => r.bookName === book0).map((r) => r.trader),
  );

  const countBefore = await displayedRowCount(page);
  await expandDisplayedRow(page, 0, true);
  await pollUntil(async () => (await displayedRowCount(page)) > countBefore, {
    label: 'book node to expand',
  });

  const traderNodes: Array<Record<string, unknown>> = [];
  for (let i = 1; i <= expectedTraders.size; i += 1) {
    const node = await pollUntil(
      async () => {
        const row = await displayedRow(page, i);
        return row && isTreeNode(row) && row[CHILD_COUNT_FIELD] != null ? row : null;
      },
      { label: `trader node at index ${i}` },
    );
    traderNodes.push(node);
  }
  expect(new Set(traderNodes.map((n) => n[GROUP_KEY_FIELD]))).toEqual(expectedTraders);
  // The row AFTER the last trader is the next book (nothing leaked).
  const nextRoot = await displayedRow(page, expectedTraders.size + 1);
  expect(nextRoot?.[GROUP_KEY_FIELD]).toBe(roots[1]![GROUP_KEY_FIELD]);

  let traderSum = 0;
  const book0Count = roots[0]![CHILD_COUNT_FIELD] as number;
  for (let i = 1; i <= traderNodes.length; i += 1) {
    const trader = traderNodes[i - 1]![GROUP_KEY_FIELD];
    const { control, probed } = await sandwichedControlCount(
      page,
      [
        ['bookName', '==', book0],
        ['trader', '==', trader],
      ],
      async () => (await displayedRow(page, i))?.[CHILD_COUNT_FIELD],
    );
    expect(probed, `child count of trader '${String(trader)}'`).toBe(control);
    traderSum += control;
  }
  expect(traderSum).toBe(book0Count);

  // ─── level 3: leaves pinned to their (book, trader) route ─────────
  const trader0 = traderNodes[0]![GROUP_KEY_FIELD];
  const trader0Count = traderNodes[0]![CHILD_COUNT_FIELD] as number;
  const beforeLeafExpand = await displayedRowCount(page);
  await expandDisplayedRow(page, 1, true);
  await pollUntil(
    async () => (await displayedRowCount(page)) === beforeLeafExpand + trader0Count,
    { label: `trader node to expand by exactly ${trader0Count} leaves` },
  );
  const leaf = await pollUntil(
    async () => {
      const row = await displayedRow(page, 2);
      return row && !isTreeNode(row) && row.positionId != null ? row : null;
    },
    { label: 'first leaf row to render' },
  );
  expect(leaf.bookName).toBe(book0);
  expect(leaf.trader).toBe(trader0);
  await expect.poll(() => loadingRowCount(page), { timeout: 10_000 }).toBe(0);
});
