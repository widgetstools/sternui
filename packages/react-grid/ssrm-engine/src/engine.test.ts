import { describe, expect, it } from 'vitest';
import { createSsrmEngine } from './engine.js';
import { SSRM_CHILD_COUNT, SSRM_GROUP_FLAG, SSRM_GROUP_PATH, type SsrmSchema } from './types.js';

const SCHEMA: SsrmSchema = {
  keyField: 'id',
  fields: [
    { field: 'id', type: 'string' },
    { field: 'desk', type: 'string' },
    { field: 'sector', type: 'string' },
    { field: 'price', type: 'number' },
    { field: 'qty', type: 'number' },
    { field: 'active', type: 'boolean' },
    { field: 'asOf', type: 'date' },
  ],
};

const BOOK = [
  { id: 'a', desk: 'Rates', sector: 'Gov', price: 101.5, qty: 10, active: true, asOf: '2026-01-02' },
  { id: 'b', desk: 'Rates', sector: 'Gov', price: 99.25, qty: 20, active: false, asOf: '2026-01-03' },
  { id: 'c', desk: 'Credit', sector: 'IG', price: 105, qty: 5, active: true, asOf: '2026-01-04' },
  { id: 'd', desk: 'Credit', sector: 'HY', price: null, qty: 7, active: true, asOf: '2026-01-05' },
  { id: 'e', desk: null, sector: 'HY', price: 88, qty: 3, active: false, asOf: '2026-01-06' },
];

function engineWithBook() {
  const engine = createSsrmEngine({ schema: SCHEMA });
  engine.applySnapshot(BOOK);
  return engine;
}

describe('SsrmEngine — the flat contract', () => {
  it('returns the requested window and the EXACT row count', () => {
    // The engine holds the book, so the last row is always known. That is what
    // removes the "omit rowCount or cap the store forever" failure mode the
    // remote pull path has to live with.
    const engine = engineWithBook();
    const result = engine.getRows({ startRow: 1, endRow: 3 });
    expect(result.rowCount).toBe(5);
    expect(result.rowData).toHaveLength(2);
  });

  it('clamps a window past the end instead of inventing rows', () => {
    const engine = engineWithBook();
    const result = engine.getRows({ startRow: 4, endRow: 104 });
    expect(result.rowData).toHaveLength(1);
    expect(result.rowCount).toBe(5);
  });

  it('materialises every declared field, nulls included', () => {
    const engine = engineWithBook();
    const [row] = engine.getRows({ startRow: 0, endRow: 1 }).rowData;
    expect(Object.keys(row).sort()).toEqual(
      ['active', 'asOf', 'desk', 'id', 'price', 'qty', 'sector'],
    );
  });
});

describe('SsrmEngine — sorting', () => {
  it('sorts ascending and descending on a number', () => {
    const engine = engineWithBook();
    const asc = engine.getRows({ sortModel: [{ colId: 'qty', sort: 'asc' }] });
    expect(asc.rowData.map((r) => r.qty)).toEqual([3, 5, 7, 10, 20]);
    const desc = engine.getRows({ sortModel: [{ colId: 'qty', sort: 'desc' }] });
    expect(desc.rowData.map((r) => r.qty)).toEqual([20, 10, 7, 5, 3]);
  });

  it('puts NULLS LAST in both directions', () => {
    // AG's client-side model does this, and a null sorting to the top of a
    // desc price sort would put "no quote" above the best bid.
    const engine = engineWithBook();
    for (const sort of ['asc', 'desc'] as const) {
      const rows = engine.getRows({ sortModel: [{ colId: 'price', sort }] }).rowData;
      expect(rows[rows.length - 1].price).toBeNull();
    }
  });

  it('breaks ties deterministically, so a tick cannot reshuffle equal rows', () => {
    const engine = createSsrmEngine({ schema: SCHEMA });
    engine.applySnapshot([
      { id: 'x', desk: 'A', price: 1 },
      { id: 'y', desk: 'A', price: 1 },
      { id: 'z', desk: 'A', price: 1 },
    ]);
    const once = engine.getRows({ sortModel: [{ colId: 'price', sort: 'asc' }] });
    engine.applyUpdate([{ id: 'y', qty: 99 }]);
    const twice = engine.getRows({ sortModel: [{ colId: 'price', sort: 'asc' }] });
    expect(twice.rowData.map((r) => r.id)).toEqual(once.rowData.map((r) => r.id));
  });

  it('sorts on multiple columns in order', () => {
    const engine = engineWithBook();
    const rows = engine.getRows({
      sortModel: [
        { colId: 'sector', sort: 'asc' },
        { colId: 'qty', sort: 'desc' },
      ],
    }).rowData;
    expect(rows.map((r) => [r.sector, r.qty])).toEqual([
      ['Gov', 20], ['Gov', 10], ['HY', 7], ['HY', 3], ['IG', 5],
    ]);
  });
});

describe('SsrmEngine — filtering', () => {
  it('applies number operators, and a NULL never satisfies a comparison', () => {
    // The rule that differs between engines. `null > 95` is false in
    // JavaScript, so the client-side model excludes it; Perspective answers
    // true for the same clause and painted different rows for the same rule.
    const engine = engineWithBook();
    const result = engine.getRows({
      filterModel: { price: { filterType: 'number', type: 'greaterThan', filter: 95 } },
    });
    expect(result.rowData.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('matches a null only through blank', () => {
    const engine = engineWithBook();
    expect(
      engine.getRows({ filterModel: { price: { type: 'blank' } } }).rowData.map((r) => r.id),
    ).toEqual(['d']);
    expect(
      engine.getRows({ filterModel: { price: { type: 'notBlank' } } }).rowCount,
    ).toBe(4);
  });

  it('applies text operators case-insensitively', () => {
    const engine = engineWithBook();
    const result = engine.getRows({
      filterModel: { desk: { filterType: 'text', type: 'contains', filter: 'RAT' } },
    });
    expect(result.rowCount).toBe(2);
  });

  it('applies a set filter, including its blank entry', () => {
    const engine = engineWithBook();
    expect(
      engine.getRows({ filterModel: { desk: { filterType: 'set', values: ['Credit'] } } }).rowCount,
    ).toBe(2);
    expect(
      engine.getRows({ filterModel: { desk: { filterType: 'set', values: [null] } } }).rowData
        .map((r) => r.id),
    ).toEqual(['e']);
  });

  it('composes compound conditions with AND and OR', () => {
    const engine = engineWithBook();
    const or = engine.getRows({
      filterModel: {
        qty: {
          filterType: 'number',
          operator: 'OR',
          conditions: [
            { filterType: 'number', type: 'lessThan', filter: 5 },
            { filterType: 'number', type: 'greaterThan', filter: 15 },
          ],
        },
      },
    });
    expect(or.rowData.map((r) => r.id).sort()).toEqual(['b', 'e']);

    const and = engine.getRows({
      filterModel: {
        qty: {
          filterType: 'number',
          operator: 'AND',
          conditions: [
            { filterType: 'number', type: 'greaterThan', filter: 4 },
            { filterType: 'number', type: 'lessThan', filter: 11 },
          ],
        },
      },
    });
    expect(and.rowData.map((r) => r.id).sort()).toEqual(['a', 'c', 'd']);
  });

  it('ANDs across columns', () => {
    const engine = engineWithBook();
    const result = engine.getRows({
      filterModel: {
        desk: { filterType: 'set', values: ['Credit'] },
        qty: { filterType: 'number', type: 'greaterThan', filter: 6 },
      },
    });
    expect(result.rowData.map((r) => r.id)).toEqual(['d']);
  });

  it('IGNORES a filter on a field the store does not have', () => {
    // A stale filter for a removed column must not empty the blotter with no
    // way to tell why.
    const engine = engineWithBook();
    const result = engine.getRows({
      filterModel: { gone: { filterType: 'text', type: 'equals', filter: 'x' } },
    });
    expect(result.rowCount).toBe(5);
  });

  it('applies a date range', () => {
    const engine = engineWithBook();
    const result = engine.getRows({
      filterModel: {
        asOf: { filterType: 'date', type: 'inRange', dateFrom: '2026-01-03', dateTo: '2026-01-05' },
      },
    });
    expect(result.rowData.map((r) => r.id).sort()).toEqual(['b', 'c', 'd']);
  });
});

describe('SsrmEngine — quick filter', () => {
  it('requires every token, in any column', () => {
    const engine = engineWithBook();
    expect(engine.setQuickFilter('rates gov')).toBe(true);
    expect(engine.getRows({}).rowCount).toBe(2);
    engine.setQuickFilter('rates hy');
    expect(engine.getRows({}).rowCount).toBe(0);
  });

  it('reports an unchanged search as unchanged, so a caller does not purge', () => {
    const engine = engineWithBook();
    expect(engine.setQuickFilter('gov')).toBe(true);
    expect(engine.setQuickFilter('gov')).toBe(false);
  });
});

describe('SsrmEngine — grouping', () => {
  it('returns one row per distinct value, with a child count', () => {
    const engine = engineWithBook();
    const result = engine.getRows({ rowGroupCols: [{ id: 'desk' }], groupKeys: [] });
    expect(result.rowCount).toBe(3);
    for (const row of result.rowData) expect(row[SSRM_GROUP_FLAG]).toBe(true);
    const byDesk = Object.fromEntries(result.rowData.map((r) => [String(r.desk), r[SSRM_CHILD_COUNT]]));
    expect(byDesk).toEqual({ Rates: 2, Credit: 2, null: 1 });
  });

  it('identifies a group row by its PATH, not a leaf key', () => {
    // RULE 3: a leaf key collides across groups at the same level and AG
    // discards the whole block (warn 205) rather than warning visibly.
    const engine = engineWithBook();
    const level1 = engine.getRows({
      rowGroupCols: [{ id: 'desk' }, { id: 'sector' }],
      groupKeys: ['Credit'],
    });
    expect(level1.rowData.map((r) => r[SSRM_GROUP_PATH])).toEqual([
      ['Credit', 'HY'],
      ['Credit', 'IG'],
    ]);
  });

  it('descends into the requested path only', () => {
    const engine = engineWithBook();
    const result = engine.getRows({
      rowGroupCols: [{ id: 'desk' }, { id: 'sector' }],
      groupKeys: ['Rates'],
    });
    expect(result.rowCount).toBe(1);
    expect(result.rowData[0].sector).toBe('Gov');
    expect(result.rowData[0][SSRM_CHILD_COUNT]).toBe(2);
  });

  it('groups a NULL into its own bucket and descends into it', () => {
    const engine = engineWithBook();
    const leaves = engine.getRows({ rowGroupCols: [{ id: 'desk' }], groupKeys: [null] });
    expect(leaves.rowData.map((r) => r.id)).toEqual(['e']);
  });

  it('serves LEAF rows once every group column is consumed', () => {
    const engine = engineWithBook();
    const leaves = engine.getRows({
      rowGroupCols: [{ id: 'desk' }, { id: 'sector' }],
      groupKeys: ['Rates', 'Gov'],
    });
    expect(leaves.rowCount).toBe(2);
    expect(leaves.rowData.every((r) => r[SSRM_GROUP_FLAG] === undefined)).toBe(true);
  });

  it('applies the filter BEFORE grouping', () => {
    const engine = engineWithBook();
    const result = engine.getRows({
      rowGroupCols: [{ id: 'desk' }],
      groupKeys: [],
      filterModel: { qty: { filterType: 'number', type: 'greaterThan', filter: 6 } },
    });
    const byDesk = Object.fromEntries(result.rowData.map((r) => [String(r.desk), r[SSRM_CHILD_COUNT]]));
    expect(byDesk).toEqual({ Rates: 2, Credit: 1 });
  });
});

describe('SsrmEngine — aggregation', () => {
  const valueCols = [
    { id: 'qty', aggFunc: 'sum' },
    { id: 'price', aggFunc: 'avg' },
  ];

  it('aggregates each group over its own members', () => {
    const engine = engineWithBook();
    const result = engine.getRows({ rowGroupCols: [{ id: 'desk' }], groupKeys: [], valueCols });
    const rates = result.rowData.find((r) => r.desk === 'Rates')!;
    expect(rates.qty).toBe(30);
    expect(rates.price).toBeCloseTo((101.5 + 99.25) / 2, 10);
  });

  it('SKIPS nulls rather than counting them as zero', () => {
    // Credit is price 105 and null. Counting the null as 0 would report 52.5 —
    // an average that says the desk is half its real level.
    const engine = engineWithBook();
    const result = engine.getRows({ rowGroupCols: [{ id: 'desk' }], groupKeys: [], valueCols });
    const credit = result.rowData.find((r) => r.desk === 'Credit')!;
    expect(credit.price).toBe(105);
    expect(credit.qty).toBe(12);
  });

  it('answers null for a group with no non-null members', () => {
    const engine = createSsrmEngine({ schema: SCHEMA });
    engine.applySnapshot([{ id: 'a', desk: 'X', price: null }]);
    const result = engine.getRows({
      rowGroupCols: [{ id: 'desk' }],
      groupKeys: [],
      valueCols: [{ id: 'price', aggFunc: 'sum' }],
    });
    expect(result.rowData[0].price).toBeNull();
  });

  it('counts ROWS for count, including null-valued ones', () => {
    const engine = engineWithBook();
    const result = engine.getRows({
      rowGroupCols: [{ id: 'desk' }],
      groupKeys: [],
      valueCols: [{ id: 'price', aggFunc: 'count' }],
    });
    expect(result.rowData.find((r) => r.desk === 'Credit')!.price).toBe(2);
  });

  it('ignores an aggFunc it cannot map rather than guessing one', () => {
    const engine = engineWithBook();
    const result = engine.getRows({
      rowGroupCols: [{ id: 'desk' }],
      groupKeys: [],
      valueCols: [{ id: 'qty', aggFunc: 'stddev' }],
    });
    expect(result.rowData[0].qty).toBeUndefined();
  });

  it('totals the FILTERED book, not the whole one', () => {
    const engine = engineWithBook();
    const total = engine.grandTotal({
      valueCols: [{ id: 'qty', aggFunc: 'sum' }],
      filterModel: { desk: { filterType: 'set', values: ['Rates'] } },
    });
    expect(total.qty).toBe(30);
  });
});

describe('SsrmEngine — live updates', () => {
  it('upserts sparsely, leaving unnamed columns alone', () => {
    const engine = engineWithBook();
    engine.applyUpdate([{ id: 'a', price: 111 }]);
    const row = engine.getRows({}).rowData.find((r) => r.id === 'a')!;
    expect(row.price).toBe(111);
    expect(row.desk).toBe('Rates');
    expect(row.qty).toBe(10);
  });

  it('reports the keys that changed, so a host can PUSH instead of purging', () => {
    const engine = engineWithBook();
    const delta = engine.applyUpdate([{ id: 'a', price: 1 }, { id: 'c', price: 2 }]);
    expect(delta.changed).toEqual(['a', 'c']);
    expect(delta.removed).toEqual([]);
  });

  it('adds an unseen key as a new row', () => {
    const engine = engineWithBook();
    engine.applyUpdate([{ id: 'zz', desk: 'New', qty: 1 }]);
    expect(engine.size).toBe(6);
    expect(engine.getRows({}).rowCount).toBe(6);
  });

  it('drops rows a snapshot no longer carries, and says which', () => {
    const engine = engineWithBook();
    const delta = engine.applySnapshot([{ id: 'a', desk: 'Rates', qty: 1 }]);
    expect(delta.removed.sort()).toEqual(['b', 'c', 'd', 'e']);
    expect(engine.getRows({}).rowCount).toBe(1);
  });

  it('a removed row leaves every live index valid', () => {
    const engine = engineWithBook();
    engine.applyRemove(['a']);
    const rows = engine.getRows({ sortModel: [{ colId: 'qty', sort: 'asc' }] });
    expect(rows.rowCount).toBe(4);
    expect(rows.rowData.map((r) => r.id)).not.toContain('a');
  });

  it('re-sorts after a tick changes the sort key', () => {
    const engine = engineWithBook();
    engine.applyUpdate([{ id: 'e', qty: 999 }]);
    const rows = engine.getRows({ sortModel: [{ colId: 'qty', sort: 'desc' }] });
    expect(rows.rowData[0].id).toBe('e');
  });

  it('notifies subscribers', () => {
    const engine = engineWithBook();
    const seen: unknown[][] = [];
    const off = engine.subscribe((d) => seen.push(d.changed));
    engine.applyUpdate([{ id: 'a', price: 5 }]);
    off();
    engine.applyUpdate([{ id: 'b', price: 5 }]);
    expect(seen).toEqual([['a']]);
  });
});

describe('SsrmEngine — set filter values and counts', () => {
  it('lists distinct values including the null', () => {
    const engine = engineWithBook();
    const values = engine.distinctValues('desk')!;
    expect(new Set(values)).toEqual(new Set(['Rates', 'Credit', null]));
  });

  it('REFUSES a list above the ceiling rather than truncating it', () => {
    // A set filter has no "there are more" affordance, so a partial list reads
    // as the whole domain and its Select All silently excludes the rest.
    const engine = createSsrmEngine({ schema: SCHEMA, maxSetFilterValues: 2 });
    engine.applySnapshot(BOOK);
    expect(engine.distinctValues('id')).toBeNull();
  });

  it('counts the filtered book ignoring grouping', () => {
    // Not the grouped rowCount, which is the number of top-level GROUPS —
    // reading that produced "9 of 50,000" over a book grouped into nine.
    const engine = engineWithBook();
    const request = { rowGroupCols: [{ id: 'desk' }], groupKeys: [] };
    expect(engine.getRows(request).rowCount).toBe(3);
    expect(engine.countFiltered(request)).toBe(5);
  });
});

describe('createSsrmDatasource — the AG boundary', () => {
  it('settles exactly once on success', async () => {
    const { createSsrmDatasource } = await import('./datasource.js');
    const engine = engineWithBook();
    const ds = createSsrmDatasource(engine);
    let calls = 0;
    ds.getRows({
      request: { startRow: 0, endRow: 10 },
      success: () => { calls += 1; },
      fail: () => { calls += 1; },
    });
    expect(calls).toBe(1);
  });

  it('FAILS rather than leaking when the engine throws', async () => {
    // RULE 1: `outboundRequests` is grid-global and only decremented in
    // success/fail, with a default limit of 2. A datasource that throws without
    // calling back wedges the grid permanently and no purge recovers it.
    const { createSsrmDatasource } = await import('./datasource.js');
    const engine = engineWithBook();
    const errors: unknown[] = [];
    const ds = createSsrmDatasource(engine, { onError: (e) => errors.push(e) });
    // A sort model naming a getter that throws is the closest reachable
    // failure; force it directly instead.
    const boom = new Error('engine exploded');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (engine as any).getRows = () => { throw boom; };
    let failed = 0;
    let succeeded = 0;
    ds.getRows({
      request: { startRow: 0, endRow: 10 },
      success: () => { succeeded += 1; },
      fail: () => { failed += 1; },
    });
    expect(failed).toBe(1);
    expect(succeeded).toBe(0);
    expect(errors).toEqual([boom]);
  });

  it('keys a GROUP row by its path, and a leaf by its key', async () => {
    const { makeSsrmGetRowId } = await import('./datasource.js');
    const getRowId = makeSsrmGetRowId('id');
    const engine = engineWithBook();
    const groups = engine.getRows({
      rowGroupCols: [{ id: 'desk' }, { id: 'sector' }],
      groupKeys: ['Credit'],
    });
    const ids = groups.rowData.map((data) => getRowId({ data }));
    expect(ids).toEqual(['g:Credit/HY', 'g:Credit/IG']);
    // Distinct ids across levels is the whole point — a leaf key would collide.
    expect(new Set(ids).size).toBe(ids.length);
    expect(getRowId({ data: engine.getRows({ startRow: 0, endRow: 1 }).rowData[0] })).toBe('a');
  });
});
