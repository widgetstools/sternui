import { describe, expect, it } from 'vitest';
import { getActiveTheme, resolveActiveStyle } from '../colDef/themedStyle.js';
import {
  buildColumnAssignmentForColId,
  classifyFiFieldFromPath,
  fiFormatMetaForColId,
} from './fiAutoFormat.js';
import { applyFiAutoFormatReducer } from './fiAutoFormatReducers.js';


describe('fiAutoFormat', () => {
  it('classifies nested paths by leaf segment', () => {
    expect(classifyFiFieldFromPath('marketData.bidPrice')).toBe('price');
    expect(classifyFiFieldFromPath('rating.sp')).toBe('set');
    expect(classifyFiFieldFromPath('dailyPnl')).toBe('pnl');
  });

  it('right-aligns numeric columns and headers', () => {
    const meta = fiFormatMetaForColId('notionalAmount');
    expect(meta.cellAlign).toBe('right');
    expect(meta.headerAlign).toBe('right');
    expect(meta.excelFormat).toBe('#,##0');
  });

  it('left-aligns identifiers', () => {
    const meta = fiFormatMetaForColId('cusip');
    expect(meta.cellAlign).toBe('left');
    expect(meta.headerAlign).toBe('left');
  });

  it('uses plain px3 for price columns (tick arrows come from conditional styling)', () => {
    const meta = fiFormatMetaForColId('currentPrice');
    expect(meta.excelFormat).toBe('#,##0.000');
    expect(meta.excelFormat).not.toContain('▲');
  });

  it('applyFiAutoFormatReducer merges assignments for all columns', () => {
    const next = applyFiAutoFormatReducer(['dailyPnl', 'cusip'])({ assignments: {} });
    expect(next.assignments.dailyPnl?.valueFormatterTemplate).toEqual({
      kind: 'excelFormat',
      format: '[Green]+#,##0;[Red]−#,##0;[Blue]0',
    });
    const active = getActiveTheme();
    expect(
      resolveActiveStyle(next.assignments.dailyPnl?.cellStyleOverrides, active).alignment?.horizontal,
    ).toBe('right');
    expect(next.assignments.cusip?.valueFormatterTemplate).toBeUndefined();
    expect(
      resolveActiveStyle(next.assignments.cusip?.cellStyleOverrides, active).alignment?.horizontal,
    ).toBe('left');
  });

  it('buildColumnAssignmentForColId left-aligns text columns without a formatter', () => {
    const a = buildColumnAssignmentForColId('desk');
    expect(a?.valueFormatterTemplate).toBeUndefined();
    expect(
      resolveActiveStyle(a.cellStyleOverrides, getActiveTheme()).alignment?.horizontal,
    ).toBe('left');
  });
});
