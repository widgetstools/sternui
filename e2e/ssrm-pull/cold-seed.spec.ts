/**
 * (a) Cold seed: connecting → seeding (rowCount rising) → live at the
 * full count, grid fills progressively, and the loading overlay never
 * sticks. The V1 failure mode this pins down: a grid stuck on "Loading"
 * because "0 rows" was ambiguous during the seed.
 */
import { test, expect } from '@playwright/test';
import {
  openSpike,
  waitForLive,
  waitForGridRows,
  timeline,
  mounts,
  loadingOverlayVisible,
  loadingRowCount,
  viewportColumn,
  state,
} from './ssrmSpike';

const ROWS = 12_000;

test('cold seed reaches live at the full count with no stuck overlay', async ({ page }) => {
  await openSpike(page, { rows: ROWS, rate: 2, upt: 100 });

  const live = await waitForLive(page, ROWS);
  expect(live.generation).toBe(1);

  // The published lifecycle walked the seed: entries before `live` are
  // connecting/seeding only, with a monotonically non-decreasing
  // rowCount, and at least one MID-seed snapshot (progressive fill —
  // the seed is batched, not one blob).
  const entries = await timeline(page);
  const liveIdx = entries.findIndex((e) => e.phase === 'live');
  expect(liveIdx).toBeGreaterThan(0);
  const preLive = entries.slice(0, liveIdx);
  expect(preLive.every((e) => e.phase === 'connecting' || e.phase === 'seeding')).toBe(true);
  const seedCounts = preLive.filter((e) => e.phase === 'seeding').map((e) => e.rowCount);
  expect(seedCounts.length).toBeGreaterThan(0);
  expect(seedCounts.some((c) => c > 0 && c < ROWS)).toBe(true);
  for (let i = 1; i < seedCounts.length; i += 1) {
    expect(seedCounts[i]).toBeGreaterThanOrEqual(seedCounts[i - 1]!);
  }
  expect(entries[liveIdx]!.rowCount).toBe(ROWS);

  // The grid mounted once and shows the full book.
  await waitForGridRows(page, ROWS);
  expect(await mounts(page)).toBe(1);

  // No stuck overlay, no loading stubs in the viewport, real data on
  // screen.
  expect(await loadingOverlayVisible(page)).toBe(false);
  await expect.poll(() => loadingRowCount(page), { timeout: 10_000 }).toBe(0);
  const keys = await viewportColumn(page, 'positionId', 10);
  expect(keys.filter((k) => k != null)).toHaveLength(10);

  // Still live gen-1 after settling (nothing bounced the dataset).
  const settled = await state(page);
  expect(settled).toMatchObject({ phase: 'live', rowCount: ROWS, generation: 1 });
});
