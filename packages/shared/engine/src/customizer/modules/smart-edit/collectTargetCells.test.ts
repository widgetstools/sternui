import { describe, expect, it } from 'vitest';
import {
  collectFocusedCell,
  collectTargetCells,
  scanTargetCells,
  type SmartEditGridReader,
} from './collectTargetCells.js';

function mockApi(overrides: Partial<SmartEditGridReader & {
  getFocusedCell(): { rowIndex: number; column: { getColId(): string } } | null;
}> = {}): SmartEditGridReader & {
  getFocusedCell(): { rowIndex: number; column: { getColId(): string } } | null;
} {
  return {
    getCellRanges: () => [{
      columns: [{ getColId: () => 'quantityFace' }],
      startRow: { rowIndex: 0 },
      endRow: { rowIndex: 0 },
    }],
    getDisplayedRowAtIndex: (i) =>
      i === 0 ? { id: 'r1', data: { id: 'r1', quantityFace: 1000 } } : undefined,
    getColumn: (colId) => ({
      getColDef: () => ({
        editable: true,
        field: colId,
        cellDataType: 'number',
      }),
    }),
    getCellValue: () => 1000,
    getFocusedCell: () => ({ rowIndex: 0, column: { getColId: () => 'quantityFace' } }),
    ...overrides,
  };
}

describe('collectTargetCells', () => {
  it('returns editable numeric cells in range', () => {
    const cells = collectTargetCells(mockApi(), (d) => String(d.id));
    expect(cells).toEqual([
      { rowId: 'r1', colId: 'quantityFace', field: 'quantityFace', value: 1000 },
    ]);
  });

  it('skips non-editable columns', () => {
    const api = mockApi({
      getColumn: () => ({
        getColDef: () => ({ editable: false, field: 'quantityFace', cellDataType: 'number' }),
      }),
    });
    expect(collectTargetCells(api, (d) => String(d.id))).toEqual([]);
  });

  it('skips text columns', () => {
    const api = mockApi({
      getColumn: () => ({
        getColDef: () => ({ editable: true, field: 'ticker', cellDataType: 'text' }),
      }),
    });
    expect(collectTargetCells(api, (d) => String(d.id))).toEqual([]);
  });

  it('dedupes cells', () => {
    const api = mockApi({
      getCellRanges: () => [{
        columns: [{ getColId: () => 'quantityFace' }, { getColId: () => 'quantityFace' }],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 0 },
      }],
    });
    expect(collectTargetCells(api, (d) => String(d.id))).toHaveLength(1);
  });
});

describe('scanTargetCells (worklog T6 — fetch-or-refuse)', () => {
  it('counts SSRM stub rows in the range as unloaded', () => {
    const api = mockApi({
      getCellRanges: () => [{
        columns: [{ getColId: () => 'quantityFace' }],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 2 },
      }],
      getDisplayedRowAtIndex: (i) => {
        if (i === 0) return { id: 'r1', data: { id: 'r1', quantityFace: 1 } };
        if (i === 1) return { stub: true };
        return undefined; // beyond loaded blocks — no node at all
      },
    });
    const scan = scanTargetCells(api, (d) => String(d.id));
    expect(scan.cells).toHaveLength(1);
    expect(scan.unloadedRowCount).toBe(2);
  });

  it('does not count group headers or footers as unloaded', () => {
    const api = mockApi({
      getCellRanges: () => [{
        columns: [{ getColId: () => 'quantityFace' }],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 2 },
      }],
      getDisplayedRowAtIndex: (i) => {
        if (i === 0) return { group: true };
        if (i === 1) return { footer: true };
        return { id: 'r1', data: { id: 'r1', quantityFace: 1 } };
      },
    });
    const scan = scanTargetCells(api, (d) => String(d.id));
    expect(scan.cells).toHaveLength(1);
    expect(scan.unloadedRowCount).toBe(0);
  });

  it('counts an unloaded row once across overlapping ranges', () => {
    const range = {
      columns: [{ getColId: () => 'quantityFace' }],
      startRow: { rowIndex: 1 },
      endRow: { rowIndex: 1 },
    };
    const api = mockApi({
      getCellRanges: () => [range, range],
      getDisplayedRowAtIndex: (i) => (i === 1 ? { stub: true } : undefined),
    });
    expect(scanTargetCells(api, (d) => String(d.id)).unloadedRowCount).toBe(1);
  });
});

describe('collectFocusedCell', () => {
  it('returns focused numeric editable cell', () => {
    const cells = collectFocusedCell(mockApi(), (d) => String(d.id));
    expect(cells).toHaveLength(1);
  });

  it('returns empty when no focus', () => {
    const api = mockApi({ getFocusedCell: () => null });
    expect(collectFocusedCell(api, (d) => String(d.id))).toEqual([]);
  });
});
