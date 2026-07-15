import { describe, expect, it } from 'vitest';
import { getSsrmShareOfTotal } from './ssrmShareOfTotal.js';

describe('ssrmShareOfTotal', () => {
  it('computes share from __ssrm_aggs sum', () => {
    expect(
      getSsrmShareOfTotal({
        value: 100,
        field: 'pnl',
        data: { __ssrm_aggs: { pnl: { sum: 1000 } } },
      }),
    ).toBe(0.1);
  });

  it('uses context aggregates when row stamps are missing', () => {
    expect(
      getSsrmShareOfTotal({
        value: 50,
        field: 'pnl',
        context: { aggregates: { pnl: { sum: 200 } } },
      }),
    ).toBe(0.25);
  });

  it('supports non-sum aggFunc via __ssrm_aggs', () => {
    expect(
      getSsrmShareOfTotal({
        value: 25,
        field: 'pnl',
        aggFunc: 'avg',
        data: { __ssrm_aggs: { pnl: { avg: 100 } } },
      }),
    ).toBe(0.25);
  });

  it('returns null when denominator is zero or missing', () => {
    expect(
      getSsrmShareOfTotal({
        value: 100,
        field: 'pnl',
        data: { __ssrm_aggs: { pnl: { sum: 0 } } },
      }),
    ).toBeNull();
    expect(
      getSsrmShareOfTotal({
        value: 100,
        field: 'pnl',
        data: {},
      }),
    ).toBeNull();
  });
});
