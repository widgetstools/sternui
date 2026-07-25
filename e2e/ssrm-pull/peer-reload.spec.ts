/**
 * (c) Reload one tab while a peer holds the worker: the reloaded tab
 * repopulates from the live table instantly — no re-dial, no re-seed,
 * same generation. (Design fact #4: peers keep the SharedWorker warm;
 * only a SOLO tab's reload re-streams by design.)
 */
import { test, expect } from '@playwright/test';
import {
  openSpike,
  waitForLive,
  waitForGridRows,
  timeline,
  mounts,
  state,
  viewportColumn,
  expectAttachedWithoutReseed,
} from './ssrmSpike';

const OPTS = { rows: 8_000, rate: 2, upt: 100 };

test('reloading a tab while its peer holds the worker repopulates live without a re-seed', async ({
  page,
  context,
}) => {
  await openSpike(page, OPTS);
  await waitForLive(page, OPTS.rows);

  const pageB = await context.newPage();
  await openSpike(pageB, OPTS);
  await waitForLive(pageB, OPTS.rows);
  await waitForGridRows(pageB, OPTS.rows);

  // Reload B while A keeps the worker (and the book) alive.
  const reloadStartedAt = Date.now();
  await pageB.reload();
  await pageB.waitForFunction(() => '__ssrmGridSpike' in window, undefined, {
    timeout: 60_000,
  });
  const live = await waitForLive(pageB, OPTS.rows);
  expect(live.generation).toBe(1);

  // The fresh page's ENTIRE timeline is live gen-1 — the worker never
  // went back to connecting/seeding, so nothing was re-streamed.
  expectAttachedWithoutReseed(await timeline(pageB), 1);

  // Repopulation is immediate (live table read, not a broker snapshot).
  await waitForGridRows(pageB, OPTS.rows, 20_000);
  const repopulatedInMs = Date.now() - reloadStartedAt;
  expect(repopulatedInMs).toBeLessThan(20_000);
  expect(await mounts(pageB)).toBe(1);
  const keys = await viewportColumn(pageB, 'positionId', 10);
  expect(keys.filter((k) => k != null)).toHaveLength(10);

  // The peer that held the worker is untouched.
  expect(await state(page)).toMatchObject({
    phase: 'live',
    generation: 1,
    rowCount: OPTS.rows,
  });
  expect(await mounts(page)).toBe(1);

  await pageB.close();
});
