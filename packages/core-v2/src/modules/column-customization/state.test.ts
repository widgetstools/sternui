import { describe, expect, it, vi } from 'vitest';
import { columnCustomizationModule, INITIAL_COLUMN_CUSTOMIZATION } from './index';
import type { ColumnCustomizationState } from './state';

describe('column-customization — migrate (schemaVersion 1 → 2)', () => {
  it('passes a v1 snapshot through unchanged (new fields default to undefined)', () => {
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
