import { describe, expect, it } from 'vitest';
import { createPreviousValuesStore } from './previousValues.js';
import { seedAlertBaselinesFromRows } from './seedAlertBaselinesFromRows.js';
import type { AlertRule } from '@wellsfargo-starui/engine';

describe('seedAlertBaselinesFromRows', () => {
  it('seeds watched columns without firing', () => {
    const prevValues = createPreviousValuesStore();
    const rules = [
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

    const result = seedAlertBaselinesFromRows({
      rows: [
        { positionId: 'a', pnl: 100 },
        { positionId: 'b', pnl: 200 },
      ],
      rowIdField: 'positionId',
      rules,
      prevValues,
    });

    expect(result).toEqual({ seededRows: 2, seededCells: 2 });
    expect(prevValues.get('a', 'pnl')).toBe(100);
    expect(prevValues.get('b', 'pnl')).toBe(200);
  });

  it('no-ops when no enabled cell rules', () => {
    const prevValues = createPreviousValuesStore();
    const result = seedAlertBaselinesFromRows({
      rows: [{ id: '1', pnl: 1 }],
      rowIdField: 'id',
      rules: [],
      prevValues,
    });
    expect(result).toEqual({ seededRows: 0, seededCells: 0 });
  });
});
