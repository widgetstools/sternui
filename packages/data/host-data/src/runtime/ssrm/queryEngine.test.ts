import { describe, it, expect } from 'vitest';
import { runQuery } from './queryEngine.js';
import type { SsrmGetRowsRequest } from './types.js';

interface Row {
  id: number;
  ticker: string;
  qty: number | null;
  side: string;
  nested?: { region: string };
}

const ROWS: Row[] = [
  { id: 1, ticker: 'AAPL', qty: 100, side: 'BUY', nested: { region: 'US' } },
  { id: 2, ticker: 'MSFT', qty: 50, side: 'SELL', nested: { region: 'US' } },
  { id: 3, ticker: 'GOOG', qty: 200, side: 'BUY', nested: { region: 'US' } },
  { id: 4, ticker: 'TSLA', qty: null, side: 'SELL', nested: { region: 'EU' } },
  { id: 5, ticker: 'amzn', qty: 75, side: 'BUY', nested: { region: 'EU' } },
];

const run = (req: SsrmGetRowsRequest) => runQuery(ROWS, req);

describe('runQuery — paging', () => {
  it('returns the full set with exact lastRow when no block bounds', () => {
    const res = run({});
    expect(res.rows).toHaveLength(5);
    expect(res.lastRow).toBe(5);
  });

  it('slices to the requested block but reports the true total', () => {
    const res = run({ startRow: 1, endRow: 3 });
    expect((res.rows as Row[]).map((r) => r.id)).toEqual([2, 3]);
    expect(res.lastRow).toBe(5);
  });

  it('clamps an over-long block to the dataset', () => {
    const res = run({ startRow: 3, endRow: 999 });
    expect(res.rows).toHaveLength(2);
    expect(res.lastRow).toBe(5);
  });
});

describe('runQuery — sorting', () => {
  it('sorts ascending numerically with nulls last', () => {
    const res = run({ sortModel: [{ colId: 'qty', sort: 'asc' }] });
    expect((res.rows as Row[]).map((r) => r.id)).toEqual([2, 5, 1, 3, 4]);
  });

  it('sorts descending; nulls still sort last', () => {
    const res = run({ sortModel: [{ colId: 'qty', sort: 'desc' }] });
    expect((res.rows as Row[]).map((r) => r.id)).toEqual([3, 1, 5, 2, 4]);
  });

  it('sorts strings case-insensitively via locale compare', () => {
    const res = run({ sortModel: [{ colId: 'ticker', sort: 'asc' }] });
    // amzn collates with the A-group, not after the uppercase letters.
    expect((res.rows as Row[]).map((r) => r.ticker)[0]).toBe('AAPL');
    expect((res.rows as Row[]).map((r) => r.ticker)[1]).toBe('amzn');
  });

  it('applies multi-column sort in order', () => {
    const res = run({
      sortModel: [
        { colId: 'side', sort: 'asc' },
        { colId: 'qty', sort: 'desc' },
      ],
    });
    // BUY group first (by side asc), within it qty desc: 200,100,75 → 3,1,5
    expect((res.rows as Row[]).map((r) => r.id)).toEqual([3, 1, 5, 2, 4]);
  });

  it('does not mutate the input row order', () => {
    run({ sortModel: [{ colId: 'qty', sort: 'asc' }] });
    expect(ROWS.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('runQuery — filtering', () => {
  it('text contains is case-insensitive', () => {
    const res = run({ filterModel: { ticker: { filterType: 'text', type: 'contains', filter: 'a' } } });
    expect((res.rows as Row[]).map((r) => r.ticker).sort()).toEqual(['AAPL', 'TSLA', 'amzn']);
  });

  it('number greaterThan', () => {
    const res = run({ filterModel: { qty: { filterType: 'number', type: 'greaterThan', filter: 75 } } });
    expect((res.rows as Row[]).map((r) => r.id).sort()).toEqual([1, 3]);
  });

  it('number inRange is inclusive', () => {
    const res = run({ filterModel: { qty: { filterType: 'number', type: 'inRange', filter: 50, filterTo: 100 } } });
    expect((res.rows as Row[]).map((r) => r.id).sort()).toEqual([1, 2, 5]);
  });

  it('set filter matches listed values', () => {
    const res = run({ filterModel: { side: { filterType: 'set', values: ['SELL'] } } });
    expect((res.rows as Row[]).map((r) => r.id).sort()).toEqual([2, 4]);
  });

  it('combined OR conditions', () => {
    const res = run({
      filterModel: {
        ticker: {
          filterType: 'text',
          operator: 'OR',
          conditions: [
            { filterType: 'text', type: 'equals', filter: 'AAPL' },
            { filterType: 'text', type: 'equals', filter: 'MSFT' },
          ],
        },
      },
    });
    expect((res.rows as Row[]).map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it('multiple columns AND together', () => {
    const res = run({
      filterModel: {
        side: { filterType: 'set', values: ['BUY'] },
        qty: { filterType: 'number', type: 'greaterThan', filter: 80 },
      },
    });
    expect((res.rows as Row[]).map((r) => r.id).sort()).toEqual([1, 3]);
  });

  it('resolves nested dot-path column ids', () => {
    const res = run({ filterModel: { 'nested.region': { filterType: 'set', values: ['EU'] } } });
    expect((res.rows as Row[]).map((r) => r.id).sort()).toEqual([4, 5]);
  });

  it('filters then reports lastRow of the filtered set, not the whole cache', () => {
    const res = run({
      filterModel: { side: { filterType: 'set', values: ['BUY'] } },
      startRow: 0,
      endRow: 1,
    });
    expect(res.rows).toHaveLength(1);
    expect(res.lastRow).toBe(3); // three BUY rows total
  });
});
