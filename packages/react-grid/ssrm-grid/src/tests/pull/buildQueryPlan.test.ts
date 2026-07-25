import { describe, expect, it } from 'vitest';
import type { IServerSideGetRowsRequest } from 'ag-grid-community';
import {
  AUTO_COLUMN_ID,
  buildQueryPlan,
  buildRollupPlan,
  canonicalViewKey,
} from '../../pull/buildQueryPlan.js';
import { QUICK_FILTER_EXPR, ROLLUP_GROUP_EXPR } from '../../pull/filterExpressions.js';

function request(overrides: Partial<IServerSideGetRowsRequest> = {}): IServerSideGetRowsRequest {
  return {
    startRow: 0,
    endRow: 100,
    rowGroupCols: [],
    valueCols: [],
    pivotCols: [],
    pivotMode: false,
    groupKeys: [],
    filterModel: null,
    sortModel: [],
    ...overrides,
  };
}

describe('buildQueryPlan', () => {
  it('builds a flat rows plan with no sort/filter', () => {
    const plan = buildQueryPlan(request(), { keyColumn: 'positionId' });
    expect(plan.kind).toBe('rows');
    expect(plan.viewConfig).toEqual({});
    expect(plan.unsupportedFilters).toEqual([]);
  });

  it('maps the sortModel to Perspective sort pairs in order', () => {
    const plan = buildQueryPlan(
      request({
        sortModel: [
          { colId: 'marketValue', sort: 'desc' },
          { colId: 'cusip', sort: 'asc' },
        ],
      }),
      { keyColumn: 'positionId' },
    );
    expect(plan.viewConfig.sort).toEqual([
      ['marketValue', 'desc'],
      ['cusip', 'asc'],
    ]);
  });

  it('maps the filterModel to Perspective clauses', () => {
    const plan = buildQueryPlan(
      request({ filterModel: { pnl: { filterType: 'number', type: 'greaterThan', filter: 0 } } }),
      { keyColumn: 'positionId' },
    );
    expect(plan.viewConfig.filter).toEqual([['pnl', '>', 0]]);
  });

  it('projects configured columns and always includes the key column', () => {
    const plan = buildQueryPlan(request(), {
      keyColumn: 'positionId',
      columns: ['cusip', 'marketValue'],
    });
    expect(plan.viewConfig.columns).toEqual(['positionId', 'cusip', 'marketValue']);

    const withKey = buildQueryPlan(request(), {
      keyColumn: 'positionId',
      columns: ['positionId', 'cusip'],
    });
    expect(withKey.viewConfig.columns).toEqual(['positionId', 'cusip']);
  });

  it('pins leaf reads under expanded groups with ancestor equality filters', () => {
    const plan = buildQueryPlan(
      request({
        rowGroupCols: [
          { id: 'desk', displayName: 'Desk', field: 'desk' },
          { id: 'trader', displayName: 'Trader', field: 'trader' },
        ],
        groupKeys: ['Rates', 'T-1'],
        sortModel: [{ colId: 'pnl', sort: 'desc' }],
      }),
      { keyColumn: 'positionId' },
    );
    expect(plan.kind).toBe('rows'); // fully expanded route → leaf rows
    expect(plan.viewConfig.filter).toEqual([
      ['desk', '==', 'Rates'],
      ['trader', '==', 'T-1'],
    ]);
    expect(plan.viewConfig.group_by).toBeUndefined();
  });

  // ─── P4a: group-level plans ───────────────────────────────────────

  it('builds a group-level plan: next-level group_by, aggregates, label + child count', () => {
    const plan = buildQueryPlan(
      request({
        rowGroupCols: [{ id: 'desk', displayName: 'Desk', field: 'desk' }],
        valueCols: [
          { id: 'pnl', displayName: 'PnL', field: 'pnl', aggFunc: 'sum' },
          { id: 'mv', displayName: 'MV', field: 'mv', aggFunc: 'avg' },
        ],
        groupKeys: [],
      }),
      { keyColumn: 'positionId' },
    );
    expect(plan.kind).toBe('group-level');
    expect(plan.route).toEqual([]);
    expect(plan.group).toEqual({ field: 'desk', valueFields: ['pnl', 'mv'] });
    expect(plan.viewConfig).toEqual({
      group_by: ['desk'],
      columns: ['pnl', 'mv', 'desk', 'positionId'],
      aggregates: { pnl: 'sum', mv: 'avg', desk: 'unique', positionId: 'count' },
    });
  });

  it('multi-level: groups the NEXT level under ancestor equality filters', () => {
    const plan = buildQueryPlan(
      request({
        rowGroupCols: [
          { id: 'desk', displayName: 'Desk', field: 'desk' },
          { id: 'trader', displayName: 'Trader', field: 'trader' },
        ],
        valueCols: [{ id: 'pnl', displayName: 'PnL', field: 'pnl', aggFunc: 'sum' }],
        groupKeys: ['Rates'],
      }),
      { keyColumn: 'positionId' },
    );
    expect(plan.kind).toBe('group-level');
    expect(plan.route).toEqual(['Rates']);
    expect(plan.group?.field).toBe('trader');
    expect(plan.viewConfig.group_by).toEqual(['trader']);
    expect(plan.viewConfig.filter).toEqual([['desk', '==', 'Rates']]);
  });

  it('maps the auto-column sort to the level group field; leaf plans drop it', () => {
    const groupPlan = buildQueryPlan(
      request({
        rowGroupCols: [{ id: 'desk', displayName: 'Desk', field: 'desk' }],
        valueCols: [{ id: 'pnl', displayName: 'PnL', field: 'pnl', aggFunc: 'sum' }],
        sortModel: [
          { colId: AUTO_COLUMN_ID, sort: 'desc' },
          { colId: 'pnl', sort: 'asc' },
        ],
      }),
      { keyColumn: 'positionId' },
    );
    expect(groupPlan.viewConfig.sort).toEqual([
      ['desk', 'desc'],
      ['pnl', 'asc'],
    ]);

    const leafPlan = buildQueryPlan(
      request({
        rowGroupCols: [{ id: 'desk', displayName: 'Desk', field: 'desk' }],
        groupKeys: ['Rates'],
        sortModel: [
          { colId: AUTO_COLUMN_ID, sort: 'desc' },
          { colId: 'pnl', sort: 'asc' },
        ],
      }),
      { keyColumn: 'positionId' },
    );
    expect(leafPlan.kind).toBe('rows');
    expect(leafPlan.viewConfig.sort).toEqual([['pnl', 'asc']]); // auto column constant in-route
  });

  it('reports group-level sorts on columns not aggregated at that level', () => {
    const plan = buildQueryPlan(
      request({
        rowGroupCols: [{ id: 'desk', displayName: 'Desk', field: 'desk' }],
        valueCols: [{ id: 'pnl', displayName: 'PnL', field: 'pnl', aggFunc: 'sum' }],
        sortModel: [{ colId: 'cusip', sort: 'asc' }],
      }),
      { keyColumn: 'positionId' },
    );
    expect(plan.viewConfig.sort).toBeUndefined();
    expect(plan.unsupportedFilters).toEqual(["sort 'cusip' (not aggregated at this group level)"]);
  });

  it('reports unknown aggFuncs and omits their column — never guesses', () => {
    const plan = buildQueryPlan(
      request({
        rowGroupCols: [{ id: 'desk', displayName: 'Desk', field: 'desk' }],
        valueCols: [
          { id: 'pnl', displayName: 'PnL', field: 'pnl', aggFunc: 'sum' },
          { id: 'px', displayName: 'Px', field: 'px', aggFunc: 'first' },
        ],
      }),
      { keyColumn: 'positionId' },
    );
    expect(plan.group?.valueFields).toEqual(['pnl']);
    expect(plan.unsupportedFilters).toEqual(["px: aggFunc 'first'"]);
  });

  // ─── P4a: quick filter ────────────────────────────────────────────

  it('folds the quick filter into any plan as a boolean expression clause', () => {
    const plan = buildQueryPlan(request(), {
      keyColumn: 'positionId',
      quickFilter: 'gov bond',
      quickFilterColumns: ['cusip', 'desk'],
    });
    expect(plan.viewConfig.filter).toEqual([[QUICK_FILTER_EXPR, '==', true]]);
    expect(plan.viewConfig.expressions).toEqual({
      [QUICK_FILTER_EXPR]:
        `(match(lower("cusip"), 'gov') or match(lower("desk"), 'gov')) and ` +
        `(match(lower("cusip"), 'bond') or match(lower("desk"), 'bond'))`,
    });
  });

  it('reports a quick filter with no configured columns (never silently ignores)', () => {
    const plan = buildQueryPlan(request(), { keyColumn: 'positionId', quickFilter: 'x' });
    expect(plan.viewConfig.filter).toBeUndefined();
    expect(plan.unsupportedFilters).toEqual(["quick filter 'x' (no quickFilterColumns configured)"]);
  });

  // ─── P4a: grand-total rollup ──────────────────────────────────────

  it('buildRollupPlan: one constant-expression group over the filtered set', () => {
    const plan = buildRollupPlan(
      request({
        valueCols: [{ id: 'pnl', displayName: 'PnL', field: 'pnl', aggFunc: 'sum' }],
        filterModel: { pnl: { filterType: 'number', type: 'greaterThan', filter: 0 } },
        groupKeys: [],
      }),
      { keyColumn: 'positionId' },
    );
    expect(plan).not.toBeNull();
    expect(plan!.viewConfig).toEqual({
      filter: [['pnl', '>', 0]],
      expressions: { [ROLLUP_GROUP_EXPR]: "'total'" },
      group_by: [ROLLUP_GROUP_EXPR],
      columns: ['pnl'],
      aggregates: { pnl: 'sum' },
    });
    expect(plan!.valueFields).toEqual(['pnl']);
  });

  it('buildRollupPlan returns null when nothing is aggregated', () => {
    expect(buildRollupPlan(request(), { keyColumn: 'positionId' })).toBeNull();
  });

  it('produces a stable cache key per query shape', () => {
    const shape = { keyColumn: 'positionId' };
    const a = buildQueryPlan(request({ sortModel: [{ colId: 'pnl', sort: 'desc' }] }), shape);
    const b = buildQueryPlan(request({ sortModel: [{ colId: 'pnl', sort: 'desc' }] }), shape);
    const c = buildQueryPlan(request({ sortModel: [{ colId: 'pnl', sort: 'asc' }] }), shape);
    expect(a.key).toBe(b.key);
    expect(a.key).not.toBe(c.key);
    expect(a.key).toBe(canonicalViewKey(a.viewConfig));
  });

  it('cache keys distinguish expression/aggregate shapes', () => {
    const flat = buildQueryPlan(request(), { keyColumn: 'positionId' });
    const quick = buildQueryPlan(request(), {
      keyColumn: 'positionId',
      quickFilter: 'x',
      quickFilterColumns: ['cusip'],
    });
    const grouped = buildQueryPlan(
      request({
        rowGroupCols: [{ id: 'desk', displayName: 'Desk', field: 'desk' }],
        valueCols: [{ id: 'pnl', displayName: 'PnL', field: 'pnl', aggFunc: 'sum' }],
      }),
      { keyColumn: 'positionId' },
    );
    expect(new Set([flat.key, quick.key, grouped.key]).size).toBe(3);
  });
});
