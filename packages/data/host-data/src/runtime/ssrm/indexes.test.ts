import { describe, it, expect } from 'vitest';
import { distinctValues } from './indexes.js';

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
