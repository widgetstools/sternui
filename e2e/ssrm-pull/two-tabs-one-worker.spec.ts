/**
 * (b) Two tabs, ONE SharedWorker: the second tab attaches straight to
 * the live generation-1 dataset — zero re-stream, zero re-seed, and the
 * first tab's dataset is completely undisturbed by the attach.
 *
 * Both pages live in the SAME browser context so they resolve to the
 * same SharedWorker (`starui-ssrm:{appId}:{providerId}`), exactly like
 * two real tabs of the app.
 */
import { test, expect } from '@playwright/test';
import {
  openSpike,
  waitForLive,
  waitForGridRows,
  timeline,
  mounts,
  viewportColumn,
  expectAttachedWithoutReseed,
} from './ssrmSpike';

const OPTS = { rows: 8_000, rate: 2, upt: 100 };

test('second tab attaches live with zero re-stream', async ({ page, context }) => {
  await openSpike(page, OPTS);
  await waitForLive(page, OPTS.rows);
  await waitForGridRows(page, OPTS.rows);

  const timelineABefore = await timeline(page);

  // Second tab, same context → same SharedWorker.
  const pageB = await context.newPage();
  await openSpike(pageB, OPTS);
  await waitForLive(pageB, OPTS.rows);

  // The attaching tab NEVER saw connecting/seeding for the dataset —
  // its whole timeline is `live` gen-1 at the full count (the configure
  // ack handed it the worker's current state; nothing re-dialed).
  expectAttachedWithoutReseed(await timeline(pageB), 1);
  for (const entry of await timeline(pageB)) {
    expect(entry.rowCount).toBe(OPTS.rows);
  }

  // ...and its grid fills straight from the live table.
  await waitForGridRows(pageB, OPTS.rows);
  expect(await mounts(pageB)).toBe(1);
  const keysB = await viewportColumn(pageB, 'positionId', 10);
  expect(keysB.filter((k) => k != null)).toHaveLength(10);

  // Tab A was not disturbed: any state entries that arrived since are
  // still live gen-1 at the same count (no reseed broadcast, no bounce).
  const timelineAAfter = await timeline(page);
  for (const entry of timelineAAfter.slice(timelineABefore.length)) {
    expect(entry).toMatchObject({ phase: 'live', generation: 1, rowCount: OPTS.rows });
  }
  expect(await mounts(page)).toBe(1);

  // Both tabs read THE SAME table: same first viewport keys.
  const keysA = await viewportColumn(page, 'positionId', 10);
  expect(keysB).toEqual(keysA);

  await pageB.close();
});
