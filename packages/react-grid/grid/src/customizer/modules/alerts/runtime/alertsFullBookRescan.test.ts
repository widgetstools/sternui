import { describe, expect, it } from 'vitest';
import { createPreviousValuesStore } from './previousValues.js';
import {
  registerAlertsBaselineSeedBinding,
  registerAlertsSsrmLeafFetcher,
  rescanAlertsFullBook,
} from './alertsFullBookRescan.js';
import type { AlertRule } from '@starui/engine';

const RULES = [
  {
    id: 'r1',
    enabled: true,
    name: 'pnl move',
    trigger: {
      kind: 'relativeChange',
      column: 'pnl',
      mode: 'PERCENT_CHANGE',
      threshold: 5,
      direction: 'both',
    },
  },
] as unknown as AlertRule[];

/** Bind both halves the rescan needs, as the module activate + host do. */
function bind(gridId: string, fetch: () => Promise<Record<string, unknown>[]>) {
  const platform = { gridId };
  const prevValues = createPreviousValuesStore();
  registerAlertsBaselineSeedBinding(platform, { prevValues, getRules: () => RULES });
  registerAlertsSsrmLeafFetcher(platform, { rowIdField: 'positionId', fetch });
  return { platform, prevValues };
}

describe('rescanAlertsFullBook', () => {
  it('seeds baselines from whatever the fetcher returns', () => {
    // Under a server row model the live deltas only ever carry the rows this
    // window holds, so `relativeChange` has nothing to compare against until
    // the full book is read once.
    const rows = Array.from({ length: 500 }, (_, i) => ({ positionId: `p${i}`, pnl: i }));
    const { platform } = bind('grid-a', async () => rows);

    return rescanAlertsFullBook(platform).then((result) => {
      expect(result).not.toBeNull();
      expect(result!.seededRows).toBe(500);
      expect(result!.seededCells).toBeGreaterThan(0);
    });
  });

  it('returns null when no fetcher is registered — the old Perspective state', async () => {
    // This is exactly what the pull path used to do: the registration was
    // skipped, so a rescan found nothing and silently seeded nothing.
    registerAlertsSsrmLeafFetcher({ gridId: 'grid-none' }, null);
    registerAlertsBaselineSeedBinding({ gridId: 'grid-none' }, {
      prevValues: createPreviousValuesStore(),
      getRules: () => RULES,
    });

    expect(await rescanAlertsFullBook({ gridId: 'grid-none' })).toBeNull();
  });

  it('keeps bindings separate per grid id', async () => {
    bind('grid-1', async () => [{ positionId: 'a', pnl: 1 }]);
    bind('grid-2', async () => [
      { positionId: 'b', pnl: 2 },
      { positionId: 'c', pnl: 3 },
    ]);

    expect((await rescanAlertsFullBook({ gridId: 'grid-1' }))!.seededRows).toBe(1);
    expect((await rescanAlertsFullBook({ gridId: 'grid-2' }))!.seededRows).toBe(2);
  });

  it('tolerates a fetcher that returns nothing', async () => {
    // `readAllRows` answers null past the export ceiling, and the host maps
    // that to an empty list rather than throwing into the click handler.
    const { platform } = bind('grid-empty', async () => []);
    const result = await rescanAlertsFullBook(platform);
    expect(result!.seededRows).toBe(0);
  });

  it('unregisters cleanly', async () => {
    const { platform } = bind('grid-gone', async () => [{ positionId: 'a', pnl: 1 }]);
    registerAlertsSsrmLeafFetcher(platform, null);
    expect(await rescanAlertsFullBook(platform)).toBeNull();
  });
});
