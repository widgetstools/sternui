import { describe, expect, it } from 'vitest';
import {
  compileFilter,
  compileSort,
  distinctValues,
  runQuery,
  type FilterModel,
  type Row,
} from './serverSideQuery';

const rows: Row[] = [
  { id: 'a', ccy: 'USD', qty: 10, desk: 'EQ' },
  { id: 'b', ccy: 'EUR', qty: 30, desk: 'FI' },
  { id: 'c', ccy: 'USD', qty: 20, desk: 'EQ' },
  { id: 'd', ccy: 'GBP', qty: 5, desk: 'FI' },
];

describe('compileFilter', () => {
  it('no model → everything passes', () => {
    expect(rows.filter(compileFilter(undefined))).toHaveLength(4);
    expect(rows.filter(compileFilter({}))).toHaveLength(4);
  });

  it('text contains / equals / startsWith', () => {
    const contains: FilterModel = { ccy: { filterType: 'text', type: 'contains', filter: 'us' } };
    expect(rows.filter(compileFilter(contains)).map((r) => r.id)).toEqual(['a', 'c']);
    const eq: FilterModel = { desk: { filterType: 'text', type: 'equals', filter: 'FI' } };
    expect(rows.filter(compileFilter(eq)).map((r) => r.id)).toEqual(['b', 'd']);
  });

  it('number greaterThan / inRange', () => {
    const gt: FilterModel = { qty: { filterType: 'number', type: 'greaterThan', filter: 15 } };
    expect(rows.filter(compileFilter(gt)).map((r) => r.id)).toEqual(['b', 'c']);
    const range: FilterModel = { qty: { filterType: 'number', type: 'inRange', filter: 10, filterTo: 20 } };
    expect(rows.filter(compileFilter(range)).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('set filter keeps only listed values; absent values = inactive', () => {
    const set: FilterModel = { ccy: { filterType: 'set', values: ['USD', 'GBP'] } };
    expect(rows.filter(compileFilter(set)).map((r) => r.id)).toEqual(['a', 'c', 'd']);
    const inactive: FilterModel = { ccy: { filterType: 'set' } };
    expect(rows.filter(compileFilter(inactive))).toHaveLength(4);
    const none: FilterModel = { ccy: { filterType: 'set', values: [] } };
    expect(rows.filter(compileFilter(none))).toHaveLength(0);
  });

  it('ANDs across columns', () => {
    const m: FilterModel = {
      ccy: { filterType: 'set', values: ['USD'] },
      qty: { filterType: 'number', type: 'greaterThan', filter: 15 },
    };
    expect(rows.filter(compileFilter(m)).map((r) => r.id)).toEqual(['c']);
  });

  it('combined OR conditions on one column', () => {
    const m = {
      desk: {
        filterType: 'text',
        operator: 'OR',
        conditions: [
          { filterType: 'text', type: 'equals', filter: 'EQ' },
          { filterType: 'text', type: 'equals', filter: 'FI' },
        ],
      },
    } as unknown as FilterModel;
    expect(rows.filter(compileFilter(m))).toHaveLength(4);
  });

  it('multi filter requires passing every active sub-filter', () => {
    const m = {
      qty: {
        filterType: 'multi',
        filterModels: [
          { filterType: 'number', type: 'greaterThan', filter: 8 },
          { filterType: 'set', values: ['10', '20'] },
        ],
      },
    } as unknown as FilterModel;
    expect(rows.filter(compileFilter(m)).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('unknown filter type fails OPEN (does not blank the grid)', () => {
    const m = { ccy: { filterType: 'mystery', type: 'whatever' } } as unknown as FilterModel;
    expect(rows.filter(compileFilter(m))).toHaveLength(4);
  });
});

describe('compileSort', () => {
  it('null when no sort', () => {
    expect(compileSort(undefined)).toBeNull();
    expect(compileSort([])).toBeNull();
  });

  it('numbers sort numerically, asc/desc', () => {
    const asc = [...rows].sort(compileSort([{ colId: 'qty', sort: 'asc' }])!);
    expect(asc.map((r) => r.id)).toEqual(['d', 'a', 'c', 'b']);
    const desc = [...rows].sort(compileSort([{ colId: 'qty', sort: 'desc' }])!);
    expect(desc.map((r) => r.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('multi-column: primary then tiebreak', () => {
    const cmp = compileSort([{ colId: 'desk', sort: 'asc' }, { colId: 'qty', sort: 'desc' }])!;
    const sorted = [...rows].sort(cmp);
    expect(sorted.map((r) => r.id)).toEqual(['c', 'a', 'b', 'd']);
  });
});

describe('distinctValues', () => {
  it('returns sorted distinct stringified values for the Set Filter', () => {
    expect(distinctValues(rows, 'ccy')).toEqual(['EUR', 'GBP', 'USD']);
    expect(distinctValues(rows, 'desk')).toEqual(['EQ', 'FI']);
  });

  it('preserves a null/blank entry first', () => {
    const withBlank: Row[] = [...rows, { id: 'e', ccy: null, qty: 1, desk: 'EQ' }];
    expect(distinctValues(withBlank, 'ccy')).toEqual([null, 'EUR', 'GBP', 'USD']);
  });
});

describe('runQuery', () => {
  it('flat (no grouping): filter + sort', () => {
    const out = runQuery(rows, {
      filterModel: { ccy: { filterType: 'set', values: ['USD', 'EUR'] } },
      sortModel: [{ colId: 'qty', sort: 'desc' }],
    });
    expect(out.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('top group level: group by desk + sum(qty), sorted by group key', () => {
    const out = runQuery(rows, {
      rowGroupCols: [{ id: 'desk' }],
      valueCols: [{ id: 'qty', aggFunc: 'sum' }],
      groupKeys: [],
    });
    expect(out).toEqual([
      { desk: 'EQ', qty: 30 }, // a(10)+c(20)
      { desk: 'FI', qty: 35 }, // b(30)+d(5)
    ]);
  });

  it('expanding a group returns its leaf rows', () => {
    const out = runQuery(rows, {
      rowGroupCols: [{ id: 'desk' }],
      valueCols: [{ id: 'qty', aggFunc: 'sum' }],
      groupKeys: ['EQ'],
      sortModel: [{ colId: 'qty', sort: 'asc' }],
    });
    expect(out.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('aggregates: avg', () => {
    const out = runQuery(rows, {
      rowGroupCols: [{ id: 'desk' }],
      valueCols: [{ id: 'qty', field: 'qty', aggFunc: 'avg' }],
      groupKeys: [],
    });
    expect(out.find((r) => r.desk === 'EQ')).toMatchObject({ qty: 15 }); // avg(10,20)
    expect(out.find((r) => r.desk === 'FI')).toMatchObject({ qty: 17.5 }); // avg(30,5)
  });

  it('group level honours the filter before grouping', () => {
    const out = runQuery(rows, {
      filterModel: { qty: { filterType: 'number', type: 'greaterThan', filter: 8 } },
      rowGroupCols: [{ id: 'desk' }],
      valueCols: [{ id: 'qty', aggFunc: 'count' }],
      groupKeys: [],
    });
    // d (qty 5) filtered out → FI has only b.
    expect(out).toEqual([{ desk: 'EQ', qty: 2 }, { desk: 'FI', qty: 1 }]);
  });
});
