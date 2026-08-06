import { describe, expect, it } from 'vitest';
import { createSsrmEngine } from './engine.js';
import {
  SSRM_CHILD_COUNT,
  SSRM_GROUP_FLAG,
  SSRM_GROUP_PATH,
  SSRM_TREE_GROUP,
  SSRM_TREE_KEY,
  type SsrmSchema,
} from './types.js';

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

  /**
   * ONE definition of a row id, and this is it — AG's own documented form,
   * where `parentKeys` prefixes a LEAF as well as a group.
   *
   * This test used to call `getRowId({ data })` with no level and no parent
   * keys, which is a shape AG never uses (`RowNode.setId` always supplies both)
   * and which the shipped MarketsGrid surface never produced. It therefore
   * pinned a spelling the product did not have — the same defect that let a
   * 100%-drop bug through 260 frames of the delta-path fuzz.
   */
  it('keys a GROUP row by its path, and a leaf by its path too', async () => {
    const { makeSsrmGetRowId } = await import('./datasource.js');
    const getRowId = makeSsrmGetRowId('id');
    const groupFields = ['desk', 'sector'];
    const engine = engineWithBook();
    const groups = engine.getRows({
      rowGroupCols: [{ id: 'desk' }, { id: 'sector' }],
      groupKeys: ['Credit'],
    });
    // A block answering `groupKeys: ['Credit']` is level 1 with those parent
    // keys — which is exactly what AG hands `getRowId` for every row in it.
    const ids = groups.rowData.map((data) =>
      getRowId({ data, level: 1, parentKeys: ['Credit'], groupFields }),
    );
    expect(ids).toEqual(['Credit/HY', 'Credit/IG']);
    // Distinct ids across levels is the whole point — a leaf key would collide.
    expect(new Set(ids).size).toBe(ids.length);

    // A leaf UNDER those groups carries the path as well, and that is what a
    // sparse patch cannot reconstruct: it has the key and no group columns.
    const leaf = engine.getRows({
      rowGroupCols: [{ id: 'desk' }, { id: 'sector' }],
      groupKeys: ['Credit', 'HY'],
      startRow: 0,
      endRow: 1,
    }).rowData[0];
    expect(getRowId({ data: leaf, level: 2, parentKeys: ['Credit', 'HY'], groupFields })).toBe(
      `Credit/HY/${String(leaf.id)}`,
    );

    // Ungrouped, the same function answers the bare key — which is the only id
    // the push path can build, and why it is off while grouping.
    expect(
      getRowId({ data: engine.getRows({ startRow: 0, endRow: 1 }).rowData[0], level: 0, groupFields: [] }),
    ).toBe('a');
  });
});

describe('SsrmEngine — pivot mode', () => {
  const pivotRequest = {
    rowGroupCols: [{ id: 'desk' }],
    groupKeys: [],
    pivotCols: [{ id: 'sector' }],
    pivotMode: true,
    valueCols: [{ id: 'qty', aggFunc: 'sum' }],
  };

  it('produces one field per pivot value per value column', () => {
    const engine = engineWithBook();
    const result = engine.getRows(pivotRequest);
    // Sectors are Gov, IG, HY; one value column.
    expect(result.pivotResultFields?.sort()).toEqual(['Gov_qty', 'HY_qty', 'IG_qty']);
  });

  it('aggregates each cell over the rows in BOTH the group and the pivot value', () => {
    const engine = engineWithBook();
    const result = engine.getRows(pivotRequest);
    const rates = result.rowData.find((r) => r.desk === 'Rates')!;
    // Rates is a=Gov/10 and b=Gov/20; nothing in IG or HY.
    expect(rates.Gov_qty).toBe(30);
    expect(rates.IG_qty).toBeNull();
    expect(rates.HY_qty).toBeNull();

    const credit = result.rowData.find((r) => r.desk === 'Credit')!;
    expect(credit.IG_qty).toBe(5);
    expect(credit.HY_qty).toBe(7);
    expect(credit.Gov_qty).toBeNull();
  });

  it('names fields so AG can split them on the separator', () => {
    // AG rebuilds its secondary columns by splitting on
    // `serverSidePivotResultFieldSeparator`, so the separator has to be the one
    // the grid is configured with.
    const engine = createSsrmEngine({ schema: SCHEMA, pivotResultFieldSeparator: '|' });
    engine.applySnapshot(BOOK);
    const result = engine.getRows(pivotRequest);
    expect(result.pivotResultFields?.sort()).toEqual(['Gov|qty', 'HY|qty', 'IG|qty']);
  });

  it('pivots the totals row too', () => {
    const engine = engineWithBook();
    const result = engine.getRows(pivotRequest);
    expect(result.groupLevelInfo?.Gov_qty).toBe(30);
    expect(result.groupLevelInfo?.HY_qty).toBe(10);
  });

  it('is inert without pivotMode, so a stale pivotCols cannot reshape the grid', () => {
    const engine = engineWithBook();
    const result = engine.getRows({ ...pivotRequest, pivotMode: false });
    expect(result.pivotResultFields).toBeUndefined();
    expect(result.rowData[0].qty).toBeDefined();
  });

  it('ignores a pivot column the store does not have', () => {
    const engine = engineWithBook();
    const result = engine.getRows({ ...pivotRequest, pivotCols: [{ id: 'gone' }] });
    expect(result.pivotResultFields).toBeUndefined();
  });
});

describe('SsrmEngine — tree data', () => {
  const treeEngine = () => {
    const engine = createSsrmEngine({
      schema: SCHEMA,
      treeFields: ['desk', 'sector'],
    });
    engine.applySnapshot(BOOK);
    return engine;
  };

  it('stands the hierarchy in for rowGroupCols, which AG does not send', () => {
    const engine = treeEngine();
    const level0 = engine.getRows({ groupKeys: [] });
    expect(level0.rowCount).toBe(3);
    expect(level0.rowData.every((r) => r[SSRM_TREE_GROUP] === true)).toBe(true);
  });

  it('stamps the key AG reads the hierarchy from', () => {
    const engine = treeEngine();
    const rows = engine.getRows({ groupKeys: [] }).rowData;
    const keys = rows.map((r) => r[SSRM_TREE_KEY]);
    expect(new Set(keys)).toEqual(new Set(['Rates', 'Credit', '']));
  });

  it('descends a path and serves LEAF rows at the bottom', () => {
    const engine = treeEngine();
    const level1 = engine.getRows({ groupKeys: ['Rates'] });
    expect(level1.rowData.map((r) => r[SSRM_TREE_KEY])).toEqual(['Gov']);
    const leaves = engine.getRows({ groupKeys: ['Rates', 'Gov'] });
    expect(leaves.rowCount).toBe(2);
    expect(leaves.rowData.every((r) => r[SSRM_TREE_GROUP] === undefined)).toBe(true);
  });

  it('lets an explicit rowGroupCols WIN over the configured hierarchy', () => {
    // The user dragged a column into the group panel; that intent beats a
    // configured tree rather than silently merging with it.
    const engine = treeEngine();
    const result = engine.getRows({ rowGroupCols: [{ id: 'sector' }], groupKeys: [] });
    expect(result.rowCount).toBe(3);
    expect(result.rowData.every((r) => r[SSRM_TREE_GROUP] === undefined)).toBe(true);
    expect(new Set(result.rowData.map((r) => r.sector))).toEqual(new Set(['Gov', 'IG', 'HY']));
  });

  it('still counts the filtered book flat', () => {
    const engine = treeEngine();
    expect(engine.countFiltered({ groupKeys: [] })).toBe(5);
  });
});

describe('createSsrmDatasource — pivot passthrough', () => {
  it('forwards pivotResultFields, which AG needs to build secondary columns', async () => {
    // Dropping them fails SILENTLY: the rows arrive with pivoted cells that no
    // column renders, so the grid shows a correct hierarchy with nothing in it.
    // The browser probe caught this as "8 rows · 0 generated columns" after the
    // unit tests were all green.
    const { createSsrmDatasource } = await import('./datasource.js');
    const engine = engineWithBook();
    const ds = createSsrmDatasource(engine);
    let got: { pivotResultFields?: string[] } | null = null;
    ds.getRows({
      request: {
        rowGroupCols: [{ id: 'desk' }],
        groupKeys: [],
        pivotCols: [{ id: 'sector' }],
        pivotMode: true,
        valueCols: [{ id: 'qty', aggFunc: 'sum' }],
      },
      success: (r) => { got = r; },
      fail: () => {},
    });
    expect(got!.pivotResultFields?.sort()).toEqual(['Gov_qty', 'HY_qty', 'IG_qty']);
  });

  it('omits the field entirely when not pivoting', async () => {
    const { createSsrmDatasource } = await import('./datasource.js');
    const engine = engineWithBook();
    const ds = createSsrmDatasource(engine);
    let got: { pivotResultFields?: string[] } | null = null;
    ds.getRows({
      request: { startRow: 0, endRow: 5 },
      success: (r) => { got = r; },
      fail: () => {},
    });
    expect(got!.pivotResultFields).toBeUndefined();
  });
});

/**
 * The index cache keys EMPTY and ABSENT the same.
 *
 * `countFiltered` and `grandTotal` strip grouping to `[]` where a plain block
 * request omits it, so an identical row set was keyed twice and materialised
 * twice — on a ticking book, where every write clears the cache, that is a
 * second whole-book pass in front of the block the user is scrolling towards.
 *
 * What this file can assert is the correctness half: the two spellings answer
 * the same, and a request that is genuinely different still does not. The other
 * hazard of a shared key — two DIFFERENT requests colliding onto one index — is
 * what `engine.fuzz.test.ts` covers, since it rotates request shapes over a
 * book being mutated underneath them.
 */
describe('SsrmEngine — request-shape identity', () => {
  it('answers an omitted and an EMPTY grouping identically', () => {
    const engine = engineWithBook();
    const omitted = engine.getRows({ startRow: 0, endRow: 10 });
    const empty = engine.getRows({ startRow: 0, endRow: 10, rowGroupCols: [], groupKeys: [] });
    expect(empty.rowCount).toBe(omitted.rowCount);
    expect(empty.rowData.map((r) => r.id)).toEqual(omitted.rowData.map((r) => r.id));
  });

  it('answers an omitted and an EMPTY filter model identically', () => {
    const engine = engineWithBook();
    expect(engine.countFiltered({ filterModel: {} })).toBe(engine.countFiltered({}));
  });

  // The check that stops the one above being satisfied by an engine that
  // ignores the request entirely.
  it('still separates a request that is genuinely different', () => {
    const engine = engineWithBook();
    const all = engine.getRows({ startRow: 0, endRow: 10 });
    const grouped = engine.getRows({
      startRow: 0,
      endRow: 10,
      rowGroupCols: [{ id: 'desk' }],
      groupKeys: [],
    });
    expect(grouped.rowCount).toBeLessThan(all.rowCount);
    expect(
      engine.countFiltered({
        filterModel: { desk: { filterType: 'set', values: ['Rates'] } },
      }),
    ).toBeLessThan(engine.countFiltered({}));
  });
});

/**
 * The whole-book expression seam — what `headerPainter` asks and no window can
 * answer, because `forEachNodeAfterFilter` visits ZERO nodes under a server row
 * model.
 *
 * Two questions with deliberately OPPOSITE scopes, which is the part worth
 * pinning: the count follows the grid's filter (its client-side original is
 * `forEachNodeAfterFilter`, and a header must not light for rows the user has
 * filtered away), while the aggregate measures the whole book (the threshold in
 * "above average" is a property of the book — Excel's convention).
 */
describe('SsrmEngine — whole-book style-rule questions', () => {
  const col = (columnId: string) => ({ type: 'columnRef' as const, columnId });
  const lit = (value: number | string | boolean | null) => ({
    type: 'literal' as const,
    value,
  });
  const gt = (columnId: string, value: number) => ({
    type: 'binary' as const,
    operator: '>',
    left: col(columnId),
    right: lit(value),
  });

  it('counts the rows a boolean expression matches', () => {
    const engine = engineWithBook();
    // qty over 6: a(10), b(20), d(7) — and NOT c(5) or e(3).
    expect(engine.countMatchingExpression(gt('qty', 6))).toBe(3);
    // A rule nothing matches leaves the header unlit, and that is 0, not null.
    expect(engine.countMatchingExpression(gt('qty', 10_000))).toBe(0);
  });

  it('FOLLOWS the grid filter, because the client-side original does', () => {
    const engine = engineWithBook();
    const filterModel = { desk: { filterType: 'set' as const, values: ['Rates'] } };
    // Rates holds a(10) and b(20); both are over 6, and d(7) is filtered away.
    expect(engine.countMatchingExpression(gt('qty', 6), { filterModel })).toBe(2);
    // The check that stops the one above passing on an engine ignoring filters.
    expect(engine.countMatchingExpression(gt('qty', 6))).toBe(3);
  });

  it('uses the ENGINE truthiness, where NaN is TRUE and 0 is not', () => {
    const engine = engineWithBook();
    // `price - price` is 0 for every row with a price and NaN for the null one
    // (`null - null` is 0 in JavaScript, so force a NaN through arithmetic on
    // the null price instead). `isTruthy(NaN)` is TRUE here and false in
    // JavaScript — a second definition of truthiness in the count would show up
    // exactly here and nowhere else.
    const zero = { type: 'binary' as const, operator: '-', left: col('qty'), right: col('qty') };
    expect(engine.countMatchingExpression(zero)).toBe(0);
    const nan = {
      type: 'binary' as const,
      operator: '*',
      left: { type: 'binary' as const, operator: '/', left: col('price'), right: lit(0) },
      right: lit(0),
    };
    // `price / 0` is null on this engine and `null * 0` is 0 — so still falsy,
    // and the row with a NULL price divides null by zero to the same place.
    expect(engine.countMatchingExpression(nan)).toBe(0);
    // SQRT(-1) is a real NaN, and every row of the book is then truthy.
    const sqrtOfNegative = {
      type: 'call' as const,
      name: 'SQRT',
      args: [lit(-1)],
    };
    expect(engine.countMatchingExpression(sqrtOfNegative)).toBe(BOOK.length);
  });

  it('answers NULL for a refused expression, which is not the same as 0', () => {
    const engine = engineWithBook();
    // A cross-row aggregate is refused by name — `SUM([qty])` reads every row
    // and there is no per-offset equivalent.
    const crossRow = { type: 'call' as const, name: 'SUM', args: [col('qty')] };
    expect(engine.countMatchingExpression(crossRow)).toBeNull();
    // `.old` / `.new` are viewport-only: the book holds one value per cell.
    expect(engine.countMatchingExpression(gt('qty.old', 1))).toBeNull();
  });

  it('aggregates a scalar over the WHOLE book, dropping the filter', () => {
    const engine = engineWithBook();
    const qty = [10, 20, 5, 7, 3];
    const mean = qty.reduce((a, b) => a + b, 0) / qty.length;
    expect(engine.aggregateScalar('qty', 'avg')).toBe(mean);
    expect(engine.aggregateScalar('qty', 'sum')).toBe(45);
    expect(engine.aggregateScalar('qty', 'high')).toBe(20);
    expect(engine.aggregateScalar('qty', 'low')).toBe(3);
    expect(engine.aggregateScalar('qty', 'count')).toBe(5);
    expect(engine.aggregateScalar('qty', 'median')).toBe(7);
    // A quick filter narrowing the book must NOT move it — the whole point.
    engine.setQuickFilter('Rates');
    expect(engine.countFiltered({})).toBe(2);
    expect(engine.aggregateScalar('qty', 'avg')).toBe(mean);
    engine.setQuickFilter('');
  });

  it('skips nulls rather than counting them as zero, and refuses what it cannot measure', () => {
    const engine = engineWithBook();
    // `price` has a null — 101.5, 99.25, 105, 88 — so the mean is over four.
    expect(engine.aggregateScalar('price', 'avg')).toBeCloseTo((101.5 + 99.25 + 105 + 88) / 4, 10);
    // A column the book does not have has no honest answer. An "above average"
    // rule with no average is not a rule with a default.
    expect(engine.aggregateScalar('nope', 'avg')).toBeNull();
    // Nor does a column with no numeric value in it at all.
    expect(engine.aggregateScalar('desk', 'avg')).toBeNull();
  });

  it('answers a CALCULATED column too, through the one accessor', () => {
    const engine = engineWithBook();
    engine.setCalcColumns([
      {
        colId: 'notional',
        ast: {
          type: 'binary',
          operator: '*',
          left: { type: 'columnRef', columnId: 'qty' },
          right: { type: 'literal', value: 2 },
        },
      },
    ]);
    expect(engine.calcDiagnostics().filter((d) => d.phase === 'compile')).toEqual([]);
    expect(engine.aggregateScalar('notional', 'sum')).toBe(90);
    // qty x 2 is 20, 40, 10, 14, 6 — three of them over 13.
    expect(engine.countMatchingExpression(gt('notional', 13))).toBe(3);
  });
});

/**
 * ══ TREE DATA, ON THE REQUEST RATHER THAN ON THE ENGINE ══
 *
 * AG's SSRM tree mode sends no `rowGroupCols` at all, so something has to stand
 * in for them. The engine has had a `treeFields` CONSTRUCTION option since
 * session 3 and it is in the differential fuzz — but a construction option is a
 * property of the BOOK, and the book is held once in a SharedWorker and read by
 * N windows. One blotter viewing `desk -> sector` while another views the same
 * book flat is the ordinary case, and it is the case sort, filter and grouping
 * already support by travelling on the request.
 */
describe('SsrmEngine — tree data comes from the REQUEST', () => {
  it('builds a hierarchy the engine was never constructed with', () => {
    const engine = engineWithBook();
    const roots = engine.getRows({ treeFields: ['desk'], groupKeys: [] });
    expect(roots.rowData.every((r) => r[SSRM_TREE_GROUP] === true)).toBe(true);
    expect(roots.rowData.map((r) => r[SSRM_TREE_KEY]).sort()).toEqual(['', 'Credit', 'Rates']);
  });

  it('walks to a leaf level, and a leaf does NOT claim to be a parent', () => {
    const engine = engineWithBook();
    const leaves = engine.getRows({ treeFields: ['desk'], groupKeys: ['Rates'] });
    expect(leaves.rowData.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(leaves.rowData.some((r) => r[SSRM_TREE_GROUP])).toBe(false);
  });

  it('a REQUEST hierarchy wins over the engine construction option', () => {
    // The two must not be able to disagree silently: a window asking through
    // `sector` must not be served the book's default `desk` levels.
    const engine = createSsrmEngine({ schema: SCHEMA, treeFields: ['desk'] });
    engine.applySnapshot(BOOK);
    const bySector = engine.getRows({ treeFields: ['sector'], groupKeys: [] });
    expect(bySector.rowData.map((r) => r[SSRM_TREE_KEY]).sort()).toEqual(['Gov', 'HY', 'IG']);
    // And the construction option still answers a request that names none.
    const byDesk = engine.getRows({ groupKeys: [] });
    expect(byDesk.rowData.map((r) => r[SSRM_TREE_KEY]).sort()).toEqual(['', 'Credit', 'Rates']);
  });

  it('keys its index separately, so two hierarchies cannot share one', () => {
    /**
     * The failure this prevents is silent and total: an index materialised for
     * one hierarchy, reused for another, applies the first one's ancestor
     * predicate to the second one's levels.
     *
     * Compared by KEY rather than by row count — both hierarchies happen to
     * produce three top-level rows on this book, so a count comparison passes
     * whatever the cache does. Interleaved, so the second read cannot simply
     * be the first one repeated: desk, then sector, then desk again, and the
     * two desk reads must agree with each other and not with the sector one.
     */
    const engine = engineWithBook();
    const keys = (request: Parameters<typeof engine.getRows>[0]) =>
      engine.getRows(request).rowData.map((r) => String(r[SSRM_TREE_KEY])).sort();

    const desk = keys({ treeFields: ['desk'], groupKeys: [] });
    const sector = keys({ treeFields: ['sector'], groupKeys: [] });
    const deskAgain = keys({ treeFields: ['desk'], groupKeys: [] });

    expect(desk).toEqual(['', 'Credit', 'Rates']);
    expect(sector).toEqual(['Gov', 'HY', 'IG']);
    expect(deskAgain).toEqual(desk);
  });

  it('and a CHILD level of one hierarchy is never served from another’s index', () => {
    /**
     * The collision the index key exists to prevent, made REACHABLE.
     *
     * At the root level the index is the same whatever the hierarchy — the
     * ancestor predicate is a no-op at depth 0 — so no root-level comparison
     * can catch a missing key component, and the first version of this test
     * passed with `treeFields` dropped from the key entirely. It only matters
     * one level down, where the predicate is built from the tree fields, and
     * only when two hierarchies can produce the SAME group key.
     *
     * So the book below puts the value `X` in both columns: without
     * `treeFields` in the query key, `groupKeys: ['X']` through `desk` and
     * through `sector` are the same cache entry, and the second read is served
     * the first one's rows.
     */
    const engine = createSsrmEngine({ schema: SCHEMA });
    engine.applySnapshot([
      { id: 'p', desk: 'X', sector: 'Gov', price: 1, qty: 1 },
      { id: 'q', desk: 'Rates', sector: 'X', price: 2, qty: 2 },
    ]);
    const byDesk = engine.getRows({ treeFields: ['desk'], groupKeys: ['X'] });
    const bySector = engine.getRows({ treeFields: ['sector'], groupKeys: ['X'] });
    expect(byDesk.rowData.map((r) => r.id)).toEqual(['p']);
    expect(bySector.rowData.map((r) => r.id)).toEqual(['q']);
  });

  it('an explicit rowGroupCols still WINS over a tree hierarchy', () => {
    // Grouping is a user action on the grid; a tree is how the surface is
    // configured. A row-group column the user dragged in has to beat it.
    const engine = engineWithBook();
    const grouped = engine.getRows({
      treeFields: ['desk'],
      rowGroupCols: [{ id: 'sector' }],
      groupKeys: [],
    });
    expect(grouped.rowData.some((r) => r[SSRM_TREE_GROUP])).toBe(false);
    expect(grouped.rowData.every((r) => r[SSRM_GROUP_FLAG] === true)).toBe(true);
  });
});
