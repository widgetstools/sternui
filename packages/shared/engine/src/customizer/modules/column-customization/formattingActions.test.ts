import { describe, it, expect } from 'vitest';
import { applyRowGroupingReducer } from './formattingActions';

describe('applyRowGroupingReducer', () => {
  it('sets enableRowGroup on each selected column', () => {
    const next = applyRowGroupingReducer(['a', 'b'], { enableRowGroup: true })(undefined);
    expect(next.assignments.a.rowGrouping?.enableRowGroup).toBe(true);
    expect(next.assignments.b.rowGrouping?.enableRowGroup).toBe(true);
  });

  it('sets aggFunc and enableValue together', () => {
    const next = applyRowGroupingReducer(['a'], { aggFunc: 'sum', enableValue: true })(undefined);
    expect(next.assignments.a.rowGrouping?.aggFunc).toBe('sum');
    expect(next.assignments.a.rowGrouping?.enableValue).toBe(true);
  });

  it('clears aggFunc + enableValue when set to undefined, leaving enableRowGroup', () => {
    const seeded = applyRowGroupingReducer(['a'], {
      enableRowGroup: true,
      aggFunc: 'avg',
      enableValue: true,
    })(undefined);
    const next = applyRowGroupingReducer(['a'], { aggFunc: undefined, enableValue: undefined })(seeded);
    expect(next.assignments.a.rowGrouping?.aggFunc).toBeUndefined();
    expect(next.assignments.a.rowGrouping?.enableValue).toBeUndefined();
    expect(next.assignments.a.rowGrouping?.enableRowGroup).toBe(true);
  });

  it('removes the rowGrouping object entirely when it becomes empty', () => {
    const seeded = applyRowGroupingReducer(['a'], { enableRowGroup: true })(undefined);
    const next = applyRowGroupingReducer(['a'], { enableRowGroup: undefined })(seeded);
    expect(next.assignments.a.rowGrouping).toBeUndefined();
  });

  it('is a no-op for empty colIds', () => {
    const prev = { assignments: {} };
    expect(applyRowGroupingReducer([], { enableRowGroup: true })(prev)).toBe(prev);
  });

  it('preserves other assignment fields (does not clobber valueFormatterTemplate)', () => {
    const prev = {
      assignments: {
        a: { colId: 'a', valueFormatterTemplate: { kind: 'excelFormat' as const, format: '0.00' } },
      },
    };
    const next = applyRowGroupingReducer(['a'], { enableRowGroup: true })(prev);
    expect(next.assignments.a.valueFormatterTemplate).toEqual({ kind: 'excelFormat', format: '0.00' });
    expect(next.assignments.a.rowGrouping?.enableRowGroup).toBe(true);
  });
});
