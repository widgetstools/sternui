import { describe, expect, it } from 'vitest';
import {
  toPerspectiveAggregate,
  toPerspectiveFilter,
  toPerspectiveFilterClauses,
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
