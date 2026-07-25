/**
 * (d) Restart: THE generation token bumps, BOTH tabs adopt it — each
 * remounts its grid (mount-once-per-generation contract) and refills to
 * the full count. This is the race class V1 patched instead of
 * designing out: restart adoption across windows.
 */
import { test, expect } from '@playwright/test';
import {
  openSpike,
  waitForLive,
  waitForGridRows,
  timeline,
  mounts,
  restart,
  viewportColumn,
} from './ssrmSpike';

const OPTS = { rows: 6_000, rate: 2, upt: 50 };

test('restart bumps the generation and both tabs remount and refill', async ({
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
  expect(await mounts(page)).toBe(1);
  expect(await mounts(pageB)).toBe(1);

  // Restart from tab A — the ack itself must already carry generation 2.
  const ack = await restart(page);
  expect(ack.generation).toBe(2);

  // BOTH tabs converge on live gen-2 at the full count...
  const liveA = await waitForLive(page, OPTS.rows, { generation: 2 });
  const liveB = await waitForLive(pageB, OPTS.rows, { generation: 2 });
  expect(liveA.generation).toBe(2);
  expect(liveB.generation).toBe(2);

  // ...the reseed actually happened (gen-2 seeding was observed — this
  // was a real re-stream, not a stale table relabelled)...
  const sawGen2Seed = (entries: Awaited<ReturnType<typeof timeline>>) =>
    entries.some((e) => e.generation === 2 && (e.phase === 'seeding' || e.phase === 'connecting'));
  expect(sawGen2Seed(await timeline(page))).toBe(true);
  expect(sawGen2Seed(await timeline(pageB))).toBe(true);

  // ...and each grid REMOUNTED once for the new generation and refilled.
  expect(await mounts(page)).toBe(2);
  expect(await mounts(pageB)).toBe(2);
  await waitForGridRows(page, OPTS.rows);
  await waitForGridRows(pageB, OPTS.rows);
  const keysA = await viewportColumn(page, 'positionId', 5);
  const keysB = await viewportColumn(pageB, 'positionId', 5);
  expect(keysA.filter((k) => k != null)).toHaveLength(5);
  expect(keysB).toEqual(keysA);

  await pageB.close();
});
