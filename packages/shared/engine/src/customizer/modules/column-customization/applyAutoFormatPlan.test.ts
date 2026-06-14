import { describe, it, expect } from 'vitest';
import { applyAutoFormatPlanReducer } from './formattingActions';
import type { ColumnCustomizationState } from './state';
import type { AutoFormatAssignment } from '../../../colDef/fieldFormatCatalog/types.js';

const plan: Record<string, AutoFormatAssignment> = {
  bidPrice: {
    alignment: 'right',
    valueFormatterTemplate: { kind: 'preset', preset: 'number', options: { decimals: 4, thousands: false } },
  },
  unrealizedPnl: { alignment: 'right', cellRendererId: 'pnl-value' },
};

describe('applyAutoFormatPlanReducer', () => {
  it('applies formatter, renderer and alignment (both theme slots) to a fresh state', () => {
    const next = applyAutoFormatPlanReducer(plan)(undefined);
    const price = next.assignments['bidPrice'];
    expect(price.valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'number', options: { decimals: 4, thousands: false } });
    expect(price.cellStyleOverrides?.dark?.alignment?.horizontal).toBe('right');
    expect(price.cellStyleOverrides?.light?.alignment?.horizontal).toBe('right');

    const pnl = next.assignments['unrealizedPnl'];
    expect(pnl.cellRendererId).toBe('pnl-value');
    expect(pnl.cellStyleOverrides?.dark?.alignment?.horizontal).toBe('right');
    expect(pnl.valueFormatterTemplate).toBeUndefined();
  });

  it('is non-destructive by default — skips already-formatted columns', () => {
    const prev: ColumnCustomizationState = {
      assignments: {
        bidPrice: { colId: 'bidPrice', valueFormatterTemplate: { kind: 'excelFormat', format: '0.00' } },
      },
    };
    const next = applyAutoFormatPlanReducer(plan)(prev);
    // existing formatting preserved
    expect(next.assignments['bidPrice'].valueFormatterTemplate).toEqual({ kind: 'excelFormat', format: '0.00' });
    expect(next.assignments['bidPrice'].cellStyleOverrides).toBeUndefined();
    // the other column still gets formatted
    expect(next.assignments['unrealizedPnl'].cellRendererId).toBe('pnl-value');
  });

  it('formats structural-only assignments (width/pin are not "formatting")', () => {
    const prev: ColumnCustomizationState = {
      assignments: { bidPrice: { colId: 'bidPrice', initialWidth: 120 } },
    };
    const next = applyAutoFormatPlanReducer(plan)(prev);
    expect(next.assignments['bidPrice'].initialWidth).toBe(120);
    expect(next.assignments['bidPrice'].valueFormatterTemplate).toBeDefined();
  });

  it('overwrites existing formatting when onlyUnstyled is false', () => {
    const prev: ColumnCustomizationState = {
      assignments: { bidPrice: { colId: 'bidPrice', valueFormatterTemplate: { kind: 'excelFormat', format: '0.00' } } },
    };
    const next = applyAutoFormatPlanReducer(plan, { onlyUnstyled: false })(prev);
    expect(next.assignments['bidPrice'].valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'number', options: { decimals: 4, thousands: false } });
  });

  it('overwrite swaps the formatter slot: a renderer clears a prior value formatter', () => {
    const prev: ColumnCustomizationState = {
      assignments: {
        unrealizedPnl: { colId: 'unrealizedPnl', valueFormatterTemplate: { kind: 'excelFormat', format: '0.00' } },
      },
    };
    const next = applyAutoFormatPlanReducer(plan, { onlyUnstyled: false })(prev);
    const pnl = next.assignments['unrealizedPnl'];
    expect(pnl.cellRendererId).toBe('pnl-value');
    expect(pnl.valueFormatterTemplate).toBeUndefined();
  });

  it('overwrite preserves user fields the catalog does not own (e.g. typography)', () => {
    const prev: ColumnCustomizationState = {
      assignments: {
        bidPrice: {
          colId: 'bidPrice',
          cellStyleOverrides: { dark: { typography: { bold: true } }, light: { typography: { bold: true } } },
        },
      },
    };
    const next = applyAutoFormatPlanReducer(plan, { onlyUnstyled: false })(prev);
    const price = next.assignments['bidPrice'];
    expect(price.valueFormatterTemplate).toBeDefined();
    expect(price.cellStyleOverrides?.dark?.typography?.bold).toBe(true);
    expect(price.cellStyleOverrides?.dark?.alignment?.horizontal).toBe('right');
  });

  it('returns the same reference for an empty plan', () => {
    const prev: ColumnCustomizationState = { assignments: {} };
    expect(applyAutoFormatPlanReducer({})(prev)).toBe(prev);
  });
});
