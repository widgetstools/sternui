import { describe, expect, it } from 'vitest';
import {
  toGroupColumns,
  toPerspectiveAggregate,
  toPerspectiveFilter,
  toPerspectiveFilterClauses,
  toPerspectiveGroupLevel,
  toPerspectiveSort,
  toPerspectiveViewConfig,
  viewConfigKey,
} from './viewConfig.js';

describe('toPerspectiveSort', () => {
  it('maps colId + direction, preserving multi-sort order', () => {
    expect(
      toPerspectiveSort([
        { colId: 'desk', sort: 'asc' },
        { colId: 'pnl', sort: 'desc' },
      ]),
    ).toEqual([
      ['desk', 'asc'],
      ['pnl', 'desc'],
    ]);
  });

  it('is undefined when empty, so the key stays stable', () => {
    expect(toPerspectiveSort([])).toBeUndefined();
    expect(toPerspectiveSort(undefined)).toBeUndefined();
  });

  it('drops unknown directions rather than guessing', () => {
    expect(toPerspectiveSort([{ colId: 'a', sort: 'sideways' }])).toBeUndefined();
  });
});

describe('toPerspectiveAggregate', () => {
  it('maps AG agg funcs, including min/max -> low/high', () => {
    expect(toPerspectiveAggregate('sum')).toBe('sum');
    expect(toPerspectiveAggregate('avg')).toBe('avg');
    expect(toPerspectiveAggregate('min')).toBe('low');
    expect(toPerspectiveAggregate('max')).toBe('high');
    expect(toPerspectiveAggregate('count')).toBe('count');
  });

  it('returns null for unmappable funcs so the column is left alone', () => {
    // Notably `weighted mean` is NOT a valid 4.5.2 aggregate — passing it
    // through as a bare string triggers a wasm abort.
    expect(toPerspectiveAggregate('weightedAvg')).toBeNull();
    expect(toPerspectiveAggregate(null)).toBeNull();
    expect(toPerspectiveAggregate(undefined)).toBeNull();
  });
});

describe('toPerspectiveFilterClauses', () => {
  it('maps numeric comparisons', () => {
    expect(
      toPerspectiveFilterClauses('pnl', { filterType: 'number', type: 'greaterThan', filter: 100 }),
    ).toEqual([['pnl', '>', 100]]);
    expect(
      toPerspectiveFilterClauses('pnl', { filterType: 'number', type: 'lessThanOrEqual', filter: 5 }),
    ).toEqual([['pnl', '<=', 5]]);
  });

  it('maps text equality and contains', () => {
    expect(
      toPerspectiveFilterClauses('desk', { filterType: 'text', type: 'equals', filter: 'RATES' }),
    ).toEqual([['desk', '==', 'RATES']]);
    expect(
      toPerspectiveFilterClauses('desk', { filterType: 'text', type: 'contains', filter: 'RAT' }),
    ).toEqual([['desk', 'contains', 'RAT']]);
  });

  it('maps a set filter to `in`', () => {
    expect(
      toPerspectiveFilterClauses('desk', { filterType: 'set', values: ['RATES', 'FX'] }),
    ).toEqual([['desk', 'in', ['RATES', 'FX']]]);
  });

  it('expands inRange into two AND clauses', () => {
    expect(
      toPerspectiveFilterClauses('qty', {
        filterType: 'number',
        type: 'inRange',
        filter: 10,
        filterTo: 20,
      }),
    ).toEqual([
      ['qty', '>=', 10],
      ['qty', '<=', 20],
    ]);
  });

  it('maps blank / notBlank to null checks', () => {
    expect(toPerspectiveFilterClauses('desk', { type: 'blank' })).toEqual([['desk', 'is null']]);
    expect(toPerspectiveFilterClauses('desk', { type: 'notBlank' })).toEqual([
      ['desk', 'is not null'],
    ]);
  });

  it('flattens AND compound conditions', () => {
    expect(
      toPerspectiveFilterClauses('qty', {
        operator: 'AND',
        conditions: [
          { filterType: 'number', type: 'greaterThan', filter: 10 },
          { filterType: 'number', type: 'lessThan', filter: 90 },
        ],
      }),
    ).toEqual([
      ['qty', '>', 10],
      ['qty', '<', 90],
    ]);
  });

  // Perspective clause lists are conjunctive; emitting OR conditions as AND
  // would silently narrow the book, so we emit nothing instead.
  it('refuses OR compounds rather than mistranslating them as AND', () => {
    expect(
      toPerspectiveFilterClauses('qty', {
        operator: 'OR',
        conditions: [
          { filterType: 'number', type: 'greaterThan', filter: 90 },
          { filterType: 'number', type: 'lessThan', filter: 10 },
        ],
      }),
    ).toEqual([]);
  });

  it('refuses unknown operators and missing operands', () => {
    expect(toPerspectiveFilterClauses('qty', { type: 'startsWith', filter: 'x' })).toEqual([]);
    expect(toPerspectiveFilterClauses('qty', { type: 'greaterThan' })).toEqual([]);
    expect(toPerspectiveFilterClauses('qty', { type: 'inRange', filter: 1 })).toEqual([]);
  });
});

describe('toPerspectiveFilter', () => {
  it('ANDs clauses across columns', () => {
    expect(
      toPerspectiveFilter({
        desk: { filterType: 'text', type: 'equals', filter: 'RATES' },
        pnl: { filterType: 'number', type: 'greaterThan', filter: 0 },
      }),
    ).toEqual([
      ['desk', '==', 'RATES'],
      ['pnl', '>', 0],
    ]);
  });

  it('is undefined when nothing translated', () => {
    expect(toPerspectiveFilter(null)).toBeUndefined();
    expect(toPerspectiveFilter({})).toBeUndefined();
    expect(toPerspectiveFilter({ a: { type: 'startsWith', filter: 'z' } })).toBeUndefined();
  });
});

describe('toPerspectiveViewConfig', () => {
  it('omits every key that has no content, so unchanged requests reuse the View', () => {
    expect(toPerspectiveViewConfig({})).toEqual({});
    expect(toPerspectiveViewConfig({ sortModel: [], rowGroupCols: [], valueCols: [] })).toEqual({});
  });

  it('builds group_by + aggregates from AG row-group/value columns', () => {
    expect(
      toPerspectiveViewConfig({
        rowGroupCols: [{ id: 'desk' }],
        valueCols: [
          { id: 'pnl', aggFunc: 'sum' },
          { id: 'price', aggFunc: 'avg' },
          { id: 'note', aggFunc: 'weightedAvg' }, // unmappable -> omitted
        ],
      }),
    ).toEqual({
      group_by: ['desk'],
      aggregates: { pnl: 'sum', price: 'avg' },
    });
  });

  it('passes calculated columns through as an expression map', () => {
    const cfg = toPerspectiveViewConfig({
      expressions: { notional: '"quantity" * "price"' },
      sortModel: [{ colId: 'notional', sort: 'desc' }],
    });
    // Expression columns are sortable server-side — verified against 4.5.2.
    expect(cfg.expressions).toEqual({ notional: '"quantity" * "price"' });
    expect(cfg.sort).toEqual([['notional', 'desc']]);
  });

  it('copies the expressions map so later caller mutation cannot leak in', () => {
    const expressions = { a: '1' };
    const cfg = toPerspectiveViewConfig({ expressions });
    expressions.a = '2';
    expect(cfg.expressions).toEqual({ a: '1' });
  });
});

describe('viewConfigKey', () => {
  it('is stable across key order and object identity', () => {
    const a = toPerspectiveViewConfig({
      rowGroupCols: [{ id: 'desk' }],
      valueCols: [
        { id: 'pnl', aggFunc: 'sum' },
        { id: 'price', aggFunc: 'avg' },
      ],
    });
    const b = toPerspectiveViewConfig({
      rowGroupCols: [{ id: 'desk' }],
      valueCols: [
        { id: 'price', aggFunc: 'avg' },
        { id: 'pnl', aggFunc: 'sum' },
      ],
    });
    expect(viewConfigKey(a)).toBe(viewConfigKey(b));
  });

  it('changes when the config meaningfully changes', () => {
    const base = viewConfigKey(toPerspectiveViewConfig({ sortModel: [{ colId: 'a', sort: 'asc' }] }));
    const sorted = viewConfigKey(
      toPerspectiveViewConfig({ sortModel: [{ colId: 'a', sort: 'desc' }] }),
    );
    expect(base).not.toBe(sorted);
  });

  it('does not change for a repeated identical request (no needless View rebuild)', () => {
    const make = () =>
      toPerspectiveViewConfig({
        sortModel: [{ colId: 'pnl', sort: 'desc' }],
        filterModel: { desk: { filterType: 'text', type: 'equals', filter: 'RATES' } },
      });
    expect(viewConfigKey(make())).toBe(viewConfigKey(make()));
  });
});

describe('toPerspectiveGroupLevel', () => {
  const groups = [{ id: 'sector' }, { id: 'book' }];
  const values = [{ id: 'pnl', aggFunc: 'sum' }];

  it('groups by ONE column at the requested depth, not the whole tree', () => {
    const root = toPerspectiveGroupLevel({ rowGroupCols: groups, valueCols: values, groupKeys: [] });
    expect(root.config.group_by).toEqual(['sector']);
    expect(root.groupColId).toBe('sector');
    expect(root.depth).toBe(0);
    expect(root.config.filter).toBeUndefined();
  });

  it('pushes ancestor keys down as filter clauses', () => {
    const level = toPerspectiveGroupLevel({
      rowGroupCols: groups,
      valueCols: values,
      groupKeys: ['Energy'],
    });
    expect(level.config.group_by).toEqual(['book']);
    expect(level.config.filter).toEqual([['sector', '==', 'Energy']]);
    expect(level.depth).toBe(1);
  });

  it('keeps the user filter and appends the ancestor clauses after it', () => {
    const level = toPerspectiveGroupLevel({
      rowGroupCols: groups,
      groupKeys: ['Energy'],
      filterModel: { quantity: { filterType: 'number', type: 'greaterThan', filter: 100 } },
    });
    expect(level.config.filter).toEqual([
      ['quantity', '>', 100],
      ['sector', '==', 'Energy'],
    ]);
  });

  it('uses the null predicate for a blank group key — `== null` is not a comparison', () => {
    const level = toPerspectiveGroupLevel({ rowGroupCols: groups, groupKeys: [null] });
    expect(level.config.filter).toEqual([['sector', 'is null']]);
  });

  it('drops group_by at the leaf level so the View returns real rows', () => {
    const leaf = toPerspectiveGroupLevel({
      rowGroupCols: groups,
      valueCols: values,
      groupKeys: ['Energy', 'FI-GOVT'],
    });
    expect(leaf.config.group_by).toBeUndefined();
    expect(leaf.groupColId).toBeNull();
    expect(leaf.config.filter).toEqual([
      ['sector', '==', 'Energy'],
      ['book', '==', 'FI-GOVT'],
    ]);
  });

  it('carries sort and aggregates into every level', () => {
    const level = toPerspectiveGroupLevel({
      rowGroupCols: groups,
      valueCols: values,
      groupKeys: ['Energy'],
      sortModel: [{ colId: 'pnl', sort: 'desc' }],
    });
    expect(level.config.sort).toEqual([['pnl', 'desc']]);
    expect(level.config.aggregates).toEqual({ pnl: 'sum' });
  });

  it('is a flat view when nothing is grouped', () => {
    const flat = toPerspectiveGroupLevel({ sortModel: [{ colId: 'pnl', sort: 'desc' }] });
    expect(flat.config.group_by).toBeUndefined();
    expect(flat.groupColId).toBeNull();
    expect(flat.depth).toBe(0);
  });

  it('gives each level a distinct view key so levels never share a View', () => {
    const root = toPerspectiveGroupLevel({ rowGroupCols: groups, groupKeys: [] });
    const child = toPerspectiveGroupLevel({ rowGroupCols: groups, groupKeys: ['Energy'] });
    const sibling = toPerspectiveGroupLevel({ rowGroupCols: groups, groupKeys: ['Technology'] });
    const keys = [root, child, sibling].map((l) => viewConfigKey(l.config));
    expect(new Set(keys).size).toBe(3);
  });
});

describe('toGroupColumns', () => {
  it('moves the deepest __ROW_PATH__ entry onto the group column and drops the path', () => {
    const columns = { __ROW_PATH__: [['Energy'], ['Technology']], pnl: [10, 20] };
    expect(toGroupColumns(columns, 'sector')).toEqual({
      sector: ['Energy', 'Technology'],
      pnl: [10, 20],
    });
  });

  it('takes the LAST path entry, so a nested level shows its own key', () => {
    const columns = { __ROW_PATH__: [['Energy', 'FI-GOVT'], ['Energy', 'FX-SPOT']], pnl: [10, 20] };
    expect(toGroupColumns(columns, 'book').book).toEqual(['FI-GOVT', 'FX-SPOT']);
  });

  it('overwrites the aggregated column of the same name with the group key', () => {
    const columns = { __ROW_PATH__: [['Energy']], sector: ['whatever the agg produced'], pnl: [10] };
    expect(toGroupColumns(columns, 'sector').sector).toEqual(['Energy']);
  });

  it('maps the grand-total row (empty path) to null rather than undefined', () => {
    expect(toGroupColumns({ __ROW_PATH__: [[]], pnl: [1] }, 'sector').sector).toEqual([null]);
  });

  it('passes an ungrouped window through untouched', () => {
    const columns = { positionId: ['a'], pnl: [1] };
    expect(toGroupColumns(columns, 'sector')).toBe(columns);
  });
});
