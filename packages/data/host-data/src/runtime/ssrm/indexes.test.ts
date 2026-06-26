import { describe, it, expect } from 'vitest';
import { distinctValues, computeAggregates } from './indexes.js';

const ROWS = [
  { id: 1, side: 'BUY', n: 2, nested: { r: 'US' } },
  { id: 2, side: 'SELL', n: 1, nested: { r: 'EU' } },
  { id: 3, side: 'BUY', n: 2, nested: { r: 'US' } },
  { id: 4, side: '', n: null, nested: { r: 'EU' } },
];

describe('distinctValues', () => {
  it('dedups and locale-sorts string values', () => {
    expect(distinctValues(ROWS, 'side')).toEqual(['BUY', 'SELL']);
  });

  it('drops nullish and empty-string cells', () => {
    expect(distinctValues(ROWS, 'n')).toEqual([1, 2]);
  });

  it('resolves dot-path column ids', () => {
    expect(distinctValues(ROWS, 'nested.r')).toEqual(['EU', 'US']);
  });

  it('sorts numbers numerically', () => {
    const rows = [{ v: 10 }, { v: 2 }, { v: 10 }, { v: 1 }];
    expect(distinctValues(rows, 'v')).toEqual([1, 2, 10]);
  });
});

describe('computeAggregates', () => {
  const rows = [
    { qty: 100, px: 10 },
    { qty: 50, px: 20 },
    { qty: 25, px: null },
    { qty: null, px: 30 },
  ];

  it('sums numeric values, skipping nullish', () => {
    expect(computeAggregates(rows, [{ colId: 'qty', func: 'sum' }])).toEqual({ qty: 175 });
  });

  it('averages over the non-null count', () => {
    expect(computeAggregates(rows, [{ colId: 'px', func: 'avg' }])).toEqual({ px: 20 });
  });

  it('computes min/max/count over non-null cells', () => {
    expect(computeAggregates(rows, [
      { colId: 'qty', func: 'min' },
      { colId: 'px', func: 'max' },
    ])).toEqual({ qty: 25, px: 30 });
    expect(computeAggregates(rows, [{ colId: 'px', func: 'count' }])).toEqual({ px: 3 });
  });

  it('yields 0 for an all-null column', () => {
    expect(computeAggregates([{ x: null }], [{ colId: 'x', func: 'sum' }])).toEqual({ x: 0 });
  });
});
