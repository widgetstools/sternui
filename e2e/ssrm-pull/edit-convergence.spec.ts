/**
 * (e) Cross-tab edit convergence + schema coercion: a cell edit in tab
 * A posts a keyed partial row to the worker-hosted table
 * (`ssrm-update-rows`), and BOTH tabs converge on the coerced value —
 * the STRING '777.25' typed into the float `quantity` column lands as
 * the NUMBER 777.25 everywhere (grid rows and the table itself).
 *
 * Feed runs at 1 mutated row/sec over 6k rows so a tick colliding with
 * the edited row inside the assertion window is ~impossible.
 */
import { test, expect } from '@playwright/test';
import {
  openSpike,
  waitForLive,
  waitForGridRows,
  displayedRow,
  viewportColumn,
  setCellValue,
  readRowByKey,
  pollUntil,
} from './ssrmSpike';

const OPTS = { rows: 6_000, rate: 1, upt: 1 };
const EDIT_VALUE = 777.25;

test('an edit in one tab converges in both tabs with schema coercion', async ({
  page,
  context,
}) => {
  await openSpike(page, OPTS);
  await waitForLive(page, OPTS.rows);
  const pageB = await context.newPage();
  await openSpike(pageB, OPTS);
  await waitForLive(pageB, OPTS.rows);
  await waitForGridRows(page, OPTS.rows);
  await waitForGridRows(pageB, OPTS.rows);

  // Pick the top displayed row in A; remember its key.
  const target = await displayedRow(page, 0);
  expect(target).not.toBeNull();
  const key = target!.positionId as string;
  expect(typeof key).toBe('string');
  expect(target!.quantity).not.toBe(EDIT_VALUE);

  // Type a STRING into the float column (what a keyboard edit produces).
  expect(await setCellValue(page, 0, 'quantity', String(EDIT_VALUE))).toBe(true);

  // The hosted table converges to the coerced NUMBER (control read from
  // tab B's own connection — the worker wrote it, not tab A's grid).
  await pollUntil(
    async () => {
      const row = await readRowByKey(pageB, key);
      return row !== null && row.quantity === EDIT_VALUE;
    },
    { timeoutMs: 15_000, label: `table row ${key} quantity → ${EDIT_VALUE} (number)` },
  );

  // Tab B's GRID viewport shows the coerced number for that key...
  const findInViewport = async (p: typeof pageB): Promise<unknown> => {
    const keys = await viewportColumn(p, 'positionId', 25);
    const idx = keys.indexOf(key);
    if (idx < 0) return undefined;
    const row = await displayedRow(p, idx);
    return row?.quantity;
  };
  await pollUntil(
    async () => (await findInViewport(pageB)) === EDIT_VALUE,
    { timeoutMs: 15_000, label: `tab B viewport quantity → ${EDIT_VALUE}` },
  );

  // ...and tab A's own row converges from the raw string it typed to
  // the schema-coerced number on the next tick-refresh cycle (strict
  // equality — '777.25' !== 777.25 would fail this).
  await pollUntil(
    async () => (await findInViewport(page)) === EDIT_VALUE,
    { timeoutMs: 15_000, label: `tab A viewport quantity → ${EDIT_VALUE} (number)` },
  );

  await pageB.close();
});
