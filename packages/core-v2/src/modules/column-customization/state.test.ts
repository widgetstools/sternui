import { describe, expect, it, vi } from 'vitest';
import { columnCustomizationModule, INITIAL_COLUMN_CUSTOMIZATION } from './index';
import type { ColumnCustomizationState } from './state';

describe('column-customization — migrate (schemaVersion 1 → 3)', () => {
  it('passes a v1 snapshot through unchanged (new v2 + v3 fields default to undefined)', () => {
    const v1State = {
      assignments: {
        symbol: { colId: 'symbol', headerName: 'Ticker', initialWidth: 120 },
      },
    };
    const out = columnCustomizationModule.migrate!(v1State, 1) as ColumnCustomizationState;
    expect(out).toEqual(v1State);
    // None of the new v2 fields should be auto-populated.
    expect(out.assignments.symbol.cellStyleOverrides).toBeUndefined();
    expect(out.assignments.symbol.headerStyleOverrides).toBeUndefined();
    expect(out.assignments.symbol.valueFormatterTemplate).toBeUndefined();
    expect(out.assignments.symbol.templateIds).toBeUndefined();
    // None of the new v3 fields should be auto-populated either.
    expect(out.assignments.symbol.cellEditorName).toBeUndefined();
    expect(out.assignments.symbol.cellEditorParams).toBeUndefined();
    expect(out.assignments.symbol.cellRendererName).toBeUndefined();
  });

  it('falls back to initial state with a warning for unknown older versions', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = columnCustomizationModule.migrate!({ junk: true }, 0) as ColumnCustomizationState;
    expect(out).toEqual(INITIAL_COLUMN_CUSTOMIZATION);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('column-customization'),
      expect.stringContaining('schemaVersion 0'),
    );
    warnSpy.mockRestore();
  });

  it('falls back to initial state with a warning when raw is not an object at v1', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(columnCustomizationModule.migrate!(null, 1)).toEqual(INITIAL_COLUMN_CUSTOMIZATION);
    expect(columnCustomizationModule.migrate!('garbage', 1)).toEqual(INITIAL_COLUMN_CUSTOMIZATION);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('column-customization'),
      expect.stringContaining('malformed v1 snapshot'),
    );
    warnSpy.mockRestore();
  });
});

describe('column-customization — migrate from v2 (lossless pass-through)', () => {
  it('migrates a v2 snapshot to v3 unchanged (v3 is a strict superset)', () => {
    const v2Snapshot = {
      assignments: {
        symbol: {
          colId: 'symbol',
          headerName: 'Symbol',
          sortable: true,
          cellStyleOverrides: { typography: { bold: true } },
        },
      },
    };
    const result = columnCustomizationModule.migrate!(v2Snapshot, 2) as ColumnCustomizationState;
    // Pass-through: every v2 field survives, new v3 fields are absent (undefined).
    expect(result).toEqual(v2Snapshot);
    expect(result.assignments.symbol.cellEditorName).toBeUndefined();
    expect(result.assignments.symbol.cellEditorParams).toBeUndefined();
    expect(result.assignments.symbol.cellRendererName).toBeUndefined();
  });

  it('falls back to initial state on a malformed v2 snapshot (defensive)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = columnCustomizationModule.migrate!(null, 2) as ColumnCustomizationState;
    expect(result).toEqual(INITIAL_COLUMN_CUSTOMIZATION);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('column-customization'),
      expect.stringMatching(/malformed v2 snapshot/),
    );
    warnSpy.mockRestore();
  });
});
