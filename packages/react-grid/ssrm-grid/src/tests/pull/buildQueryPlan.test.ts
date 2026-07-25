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

  // ─── P4b-2: tree data (treePathFields) ────────────────────────────

  const TREE = { keyColumn: 'positionId', treePathFields: ['bookName', 'trader'] };

  it('tree root (no groupKeys, no rowGroupCols) is a group-level plan on level 0', () => {
    const plan = buildQueryPlan(request(), TREE);
    expect(plan.kind).toBe('group-level');
    expect(plan.route).toEqual([]);
    expect(plan.group?.field).toBe('bookName');
    expect(plan.viewConfig.group_by).toEqual(['bookName']);
    expect(plan.viewConfig.aggregates).toEqual({ bookName: 'unique', positionId: 'count' });
    expect(plan.viewConfig.filter).toBeUndefined();
  });

  it('tree mid-level groups the NEXT path field under ancestor filters', () => {
    const plan = buildQueryPlan(request({ groupKeys: ['BOOKA'] }), TREE);
    expect(plan.kind).toBe('group-level');
    expect(plan.route).toEqual(['BOOKA']);
    expect(plan.group?.field).toBe('trader');
    expect(plan.viewConfig.group_by).toEqual(['trader']);
    expect(plan.viewConfig.filter).toEqual([['bookName', '==', 'BOOKA']]);
  });

  it('tree full-depth route reads leaf rows pinned by every ancestor', () => {
    const plan = buildQueryPlan(request({ groupKeys: ['BOOKA', 'Jane'] }), TREE);
    expect(plan.kind).toBe('rows');
    expect(plan.route).toEqual(['BOOKA', 'Jane']);
    expect(plan.viewConfig.group_by).toBeUndefined();
    expect(plan.viewConfig.filter).toEqual([
      ['bookName', '==', 'BOOKA'],
      ['trader', '==', 'Jane'],
    ]);
  });

  it('tree group levels map the auto-column sort to the level path field', () => {
    const plan = buildQueryPlan(
      request({ sortModel: [{ colId: AUTO_COLUMN_ID, sort: 'desc' }] }),
      TREE,
    );
    expect(plan.viewConfig.sort).toEqual([['bookName', 'desc']]);
  });

  it('row grouping wins over treePathFields when rowGroupCols are present', () => {
    // AG never issues rowGroupCols under treeData — but a consumer
    // misconfig must not corrupt plain grouping.
    const plan = buildQueryPlan(
      request({
        rowGroupCols: [{ id: 'desk', displayName: 'Desk', field: 'desk' }],
        groupKeys: [],
      }),
      TREE,
    );
    expect(plan.group?.field).toBe('desk');
  });

  it('empty treePathFields disables tree mode (queryAll leaf strip)', () => {
    const plan = buildQueryPlan(request(), { ...TREE, treePathFields: [] });
    expect(plan.kind).toBe('rows');
  });

  // ─── P4b-2: calc/expression columns ───────────────────────────────

  const CALC = {
    keyColumn: 'positionId',
    calcExpressions: { pnlPerUnit: '"pnl" / "quantity"' },
  };

  it('attaches calc expressions to flat plans; alias sorts/filters natively', () => {
    const plan = buildQueryPlan(
      request({
        sortModel: [{ colId: 'pnlPerUnit', sort: 'desc' }],
        filterModel: {
          pnlPerUnit: { filterType: 'number', type: 'greaterThan', filter: 5 },
        },
      }),
      CALC,
    );
    expect(plan.viewConfig.expressions).toEqual({ pnlPerUnit: '"pnl" / "quantity"' });
    expect(plan.viewConfig.sort).toEqual([['pnlPerUnit', 'desc']]);
    expect(plan.viewConfig.filter).toEqual([['pnlPerUnit', '>', 5]]);
    expect(plan.unsupportedFilters).toEqual([]);
  });

  it('attaches calc expressions to group-level plans (alias aggregates)', () => {
    const plan = buildQueryPlan(
      request({
        rowGroupCols: [{ id: 'desk', displayName: 'Desk', field: 'desk' }],
        valueCols: [{ id: 'pnlPerUnit', displayName: 'PPU', field: 'pnlPerUnit', aggFunc: 'sum' }],
      }),
      CALC,
    );
    expect(plan.kind).toBe('group-level');
    expect(plan.viewConfig.expressions).toEqual({ pnlPerUnit: '"pnl" / "quantity"' });
    expect(plan.viewConfig.aggregates?.pnlPerUnit).toBe('sum');
    expect(plan.viewConfig.columns).toContain('pnlPerUnit');
  });

  it('attaches calc expressions to the rollup plan alongside the rollup group', () => {
    const plan = buildRollupPlan(
      request({
        valueCols: [{ id: 'pnlPerUnit', displayName: 'PPU', field: 'pnlPerUnit', aggFunc: 'avg' }],
      }),
      CALC,
    );
    expect(plan!.viewConfig.expressions).toEqual({
      pnlPerUnit: '"pnl" / "quantity"',
      [ROLLUP_GROUP_EXPR]: "'total'",
    });
    expect(plan!.viewConfig.aggregates).toEqual({ pnlPerUnit: 'avg' });
  });

  it('drops + reports internal filter expressions that reference a calc alias', () => {
    // Engine limit: expressions cannot reference other expression
    // columns — an OR-combined condition on a calc column is
    // inexpressible, never guessed.
    const plan = buildQueryPlan(
      request({
        filterModel: {
          pnlPerUnit: {
            filterType: 'number',
            operator: 'OR',
            conditions: [
              { filterType: 'number', type: 'greaterThan', filter: 100 },
              { filterType: 'number', type: 'lessThan', filter: -100 },
            ],
          },
        },
      }),
      CALC,
    );
    expect(plan.viewConfig.filter).toBeUndefined();
    expect(plan.viewConfig.expressions).toEqual({ pnlPerUnit: '"pnl" / "quantity"' });
    expect(plan.unsupportedFilters.some((m) => m.includes("calc column 'pnlPerUnit'"))).toBe(true);
  });

  it('reports calc names using the reserved __ssrm_ prefix — never accepts them', () => {
    const plan = buildQueryPlan(request(), {
      keyColumn: 'positionId',
      calcExpressions: { __ssrm_evil: '1' },
    });
    expect(plan.viewConfig.expressions).toBeUndefined();
    expect(plan.unsupportedFilters).toEqual(["calc column '__ssrm_evil' (reserved '__ssrm_' prefix)"]);
  });

  it('calc columns project only when listed in explicit columns (first-class rule)', () => {
    const listed = buildQueryPlan(request(), {
      ...CALC,
      columns: ['pnl', 'pnlPerUnit'],
    });
    expect(listed.viewConfig.columns).toEqual(['positionId', 'pnl', 'pnlPerUnit']);
    expect(listed.viewConfig.expressions).toEqual({ pnlPerUnit: '"pnl" / "quantity"' });
    const unlisted = buildQueryPlan(request(), { ...CALC, columns: ['pnl'] });
    expect(unlisted.viewConfig.columns).toEqual(['positionId', 'pnl']);
    // unreferenced on an explicit-columns plan → pruned (per-row compute)
    expect(unlisted.viewConfig.expressions).toBeUndefined();
  });

  it('prunes calc expressions unreferenced by explicit-columns plans, keeps referenced ones', () => {
    // group-level plan that never touches the calc column → pruned
    const grouped = buildQueryPlan(
      request({
        rowGroupCols: [{ id: 'desk', displayName: 'Desk', field: 'desk' }],
        valueCols: [{ id: 'pnl', displayName: 'PnL', field: 'pnl', aggFunc: 'sum' }],
      }),
      CALC,
    );
    expect(grouped.viewConfig.expressions).toBeUndefined();
    // referenced by a sort on an explicit-columns rows plan → kept
    const sorted = buildQueryPlan(
      request({ sortModel: [{ colId: 'pnlPerUnit', sort: 'desc' }] }),
      { ...CALC, columns: ['pnl'] },
    );
    expect(sorted.viewConfig.expressions).toEqual({ pnlPerUnit: '"pnl" / "quantity"' });
    // rollup without a calc aggregate → only the rollup group expression
    const rollup = buildRollupPlan(
      request({ valueCols: [{ id: 'pnl', displayName: 'PnL', field: 'pnl', aggFunc: 'sum' }] }),
      CALC,
    );
    expect(rollup!.viewConfig.expressions).toEqual({ [ROLLUP_GROUP_EXPR]: "'total'" });
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
