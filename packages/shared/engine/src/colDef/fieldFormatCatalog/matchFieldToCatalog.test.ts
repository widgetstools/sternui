import { describe, it, expect } from 'vitest';
import { matchFieldToCatalog, normalizeToken } from './matchFieldToCatalog.js';
import { buildAutoFormatPlan } from './buildAutoFormatPlan.js';

describe('normalizeToken', () => {
  it('lowercases and strips non-alphanumerics', () => {
    expect(normalizeToken('unrealizedPnL')).toBe('unrealizedpnl');
    expect(normalizeToken('rating.moody')).toBe('ratingmoody');
    expect(normalizeToken('day_chg_pct')).toBe('daychgpct');
  });
});

describe('matchFieldToCatalog — P&L aliases (case / abbreviation variants)', () => {
  for (const field of ['unrealizedPnL', 'unrealizedPnl', 'unrealPnl', 'dailyPnL', 'mtdPnl', 'pnl']) {
    it(`maps ${field} to a sign-coloured excelFormat, right-aligned`, () => {
      const r = matchFieldToCatalog(field, undefined, 'number');
      expect(r?.alignment).toBe('right');
      // Native sign colouring rides on the value formatter's [Green]/[Red]
      // tags — no opaque cell renderer.
      expect(r?.valueFormatterTemplate).toEqual({
        kind: 'excelFormat',
        format: '[Green]#,##0.00;[Red]-#,##0.00;#,##0.00',
      });
    });
  }
});

describe('matchFieldToCatalog — suffix (last element) matching', () => {
  it('matches *Price via the price suffix', () => {
    const r = matchFieldToCatalog('bidPrice', undefined, 'number');
    expect(r?.alignment).toBe('right');
    expect(r?.valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'number', options: { decimals: 4, thousands: false } });
  });

  it('matches a dotted leaf (rating.moody) to centred (no renderer)', () => {
    const r = matchFieldToCatalog('rating.moody', undefined, 'text');
    expect(r?.alignment).toBe('center');
    expect(r?.valueFormatterTemplate).toBeUndefined();
  });

  it('matches *Date to a localised date format', () => {
    const r = matchFieldToCatalog('settlementDate', undefined, 'date');
    expect(r?.valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'date' });
  });

  it('matches *Status to centred (no renderer)', () => {
    const r = matchFieldToCatalog('tradeStatus', undefined, 'text');
    expect(r?.alignment).toBe('center');
    expect(r?.valueFormatterTemplate).toBeUndefined();
  });

  it('matches symbol to bold typography (no renderer)', () => {
    const r = matchFieldToCatalog('symbol', undefined, 'text');
    expect(r?.typography).toEqual({ bold: true });
    expect(r?.alignment).toBe('left');
  });
});

describe('matchFieldToCatalog — exact alias outranks suffix', () => {
  it('rfqStatus matches the rfq-status entry (centred), not generic', () => {
    const r = matchFieldToCatalog('rfqStatus', undefined, 'text');
    expect(r?.alignment).toBe('center');
    expect(r?.valueFormatterTemplate).toBeUndefined();
  });
});

describe('matchFieldToCatalog — generic fallback by data type', () => {
  it('unknown numeric field right-aligns with grouped 2dp', () => {
    const r = matchFieldToCatalog('someUnknownMetric', undefined, 'number');
    expect(r?.alignment).toBe('right');
    expect(r?.valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'number', options: { decimals: 2, thousands: true } });
  });

  it('unknown date field gets a localised date format', () => {
    const r = matchFieldToCatalog('wheneverField', undefined, 'dateString');
    expect(r?.valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'date' });
  });

  it('boolean field centres', () => {
    expect(matchFieldToCatalog('isActive', undefined, 'boolean')).toEqual({ alignment: 'center' });
  });

  it('plain untyped string field is left untouched', () => {
    expect(matchFieldToCatalog('freeText', undefined, 'text')).toBeNull();
  });
});

describe('buildAutoFormatPlan', () => {
  it('keys results by colId and skips untouchable columns', () => {
    const plan = buildAutoFormatPlan([
      { colId: 'bidPrice', field: 'bidPrice', cellDataType: 'number' },
      { colId: 'note', field: 'note', cellDataType: 'text' },
      { colId: 'rating.moody', field: 'rating.moody', cellDataType: 'text' },
    ]);
    expect(Object.keys(plan).sort()).toEqual(['bidPrice', 'rating.moody']);
    expect(plan['bidPrice'].alignment).toBe('right');
    expect(plan['rating.moody'].alignment).toBe('center');
  });

  it('falls back to colId when field is absent', () => {
    const plan = buildAutoFormatPlan([{ colId: 'marketValue', cellDataType: 'number' }]);
    expect(plan['marketValue'].valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'number', options: { decimals: 2, thousands: true } });
  });
});
