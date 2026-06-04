import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColDef, ValueGetterParams } from 'ag-grid-community';
import { buildColumnDefs, __resetColumnDefExpressionCache } from './buildColumnDefs.js';

beforeEach(() => {
  __resetColumnDefExpressionCache();
  vi.restoreAllMocks();
});

/** Invoke a colDef's valueGetter against a row, the way AG-Grid would. */
function getValue(def: ColDef, data: unknown): unknown {
  const vg = def.valueGetter;
  if (typeof vg !== 'function') throw new Error('expected a function valueGetter');
  return vg({ data } as ValueGetterParams);
}

describe('buildColumnDefs', () => {
  it('returns null for empty / missing input', () => {
    expect(buildColumnDefs(null)).toBeNull();
    expect(buildColumnDefs(undefined)).toBeNull();
    expect(buildColumnDefs([])).toBeNull();
  });

  it('leaves a flat field with no expression untouched (native fast path)', () => {
    const [def] = buildColumnDefs([{ field: 'cusip' }])!;
    expect(def.field).toBe('cusip');
    expect(def.valueGetter).toBeUndefined();
  });

  it('installs a nested-path getter for a dotted field (no expression)', () => {
    const [def] = buildColumnDefs([{ field: 'pnl.wrapper.value' }])!;
    expect(def.colId).toBe('pnl.wrapper.value');
    expect(getValue(def, { pnl: { wrapper: { value: 42 } } })).toBe(42);
    // literal flat dotted key wins first
    expect(getValue(def, { 'pnl.wrapper.value': 7 })).toBe(7);
  });

  describe('expression valueGetter', () => {
    it('evaluates the CUSIP / inventoryName example end-to-end', () => {
      const expr =
        'STARTS_WITH([cusip], "SPCL") AND [inventoryName] == null' +
        ' ? [pnlDetailsFinal.pnlWrapper.PnlCalcInputInOutput.rdiInventoryName]' +
        ' : [inventoryName]';
      const [def] = buildColumnDefs([
        { field: 'inventoryName', headerName: 'Inventory', valueGetter: expr },
      ] as ColDef[])!;

      // SPCL + null inventoryName → falls back to the nested pnl path
      expect(
        getValue(def, {
          cusip: 'SPCL123',
          inventoryName: null,
          pnlDetailsFinal: {
            pnlWrapper: { PnlCalcInputInOutput: { rdiInventoryName: 'RDI-NAME' } },
          },
        }),
      ).toBe('RDI-NAME');

      // SPCL but inventoryName present → keep inventoryName
      expect(
        getValue(def, { cusip: 'SPCL123', inventoryName: 'Normal' }),
      ).toBe('Normal');

      // non-SPCL → keep inventoryName regardless
      expect(
        getValue(def, { cusip: 'ABC999', inventoryName: 'Other' }),
      ).toBe('Other');
    });

    it('optional-chains deep nested paths — missing intermediates yield null, never throw', () => {
      const [def] = buildColumnDefs([
        { field: 'x', valueGetter: '[a.b.c.d]' },
      ] as ColDef[])!;

      // every intermediate missing
      expect(() => getValue(def, {})).not.toThrow();
      expect(getValue(def, {})).toBeNull();
      // partial path present, leaf missing
      expect(getValue(def, { a: { b: {} } })).toBeNull();
      // null row data (group rows)
      expect(getValue(def, null)).toBeNull();
      expect(getValue(def, undefined)).toBeNull();
      // full path present
      expect(getValue(def, { a: { b: { c: { d: 99 } } } })).toBe(99);
    });

    it('does not coalesce a legitimate null result to the field value', () => {
      const [def] = buildColumnDefs([
        { field: 'inventoryName', valueGetter: '[inventoryName]' },
      ] as ColDef[])!;
      // expression resolves to null even though field has a different value path
      expect(getValue(def, { inventoryName: null })).toBeNull();
      expect(getValue(def, { inventoryName: 'Z' })).toBe('Z');
    });

    it('falls back to the field value (not crash) on a runtime error', () => {
      // NOPE is not a registered function → evaluator throws → caught.
      const [def] = buildColumnDefs([
        { field: 'cusip', valueGetter: 'NOPE([cusip])' },
      ] as ColDef[])!;
      expect(() => getValue(def, { cusip: 'ABC' })).not.toThrow();
      expect(getValue(def, { cusip: 'ABC' })).toBe('ABC');
    });

    it('drops an unparseable expression and falls back to the field binding', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Unbalanced bracket → parse error.
      const [def] = buildColumnDefs([
        { field: 'cusip', valueGetter: '[cusip' },
      ] as ColDef[])!;
      // flat field → stripped to native binding (no function getter)
      expect(def.valueGetter).toBeUndefined();
      expect(def.field).toBe('cusip');
      expect(warn).toHaveBeenCalledOnce();
    });

    it('an unparseable expression on a DOTTED field falls back to the nested getter', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const [def] = buildColumnDefs([
        { field: 'pnl.value', valueGetter: 'STILL [bad' },
      ] as ColDef[])!;
      expect(typeof def.valueGetter).toBe('function');
      expect(getValue(def, { pnl: { value: 5 } })).toBe(5);
    });

    it('memoises parsing — repeated identical expressions warn at most once', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      buildColumnDefs([{ field: 'a', valueGetter: '@@@' }] as ColDef[]);
      buildColumnDefs([{ field: 'b', valueGetter: '@@@' }] as ColDef[]);
      expect(warn).toHaveBeenCalledOnce();
    });
  });
});
