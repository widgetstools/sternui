import { describe, expect, it } from 'vitest';
import type { IServerSideGetRowsRequest } from 'ag-grid-community';
import { buildQueryPlan, canonicalViewKey } from '../../pull/buildQueryPlan.js';

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

  it('flags group-level requests (P4) and carries group_by for it', () => {
    const plan = buildQueryPlan(
      request({
        rowGroupCols: [{ id: 'desk', displayName: 'Desk', field: 'desk' }],
        groupKeys: [],
      }),
      { keyColumn: 'positionId' },
    );
    expect(plan.kind).toBe('group-level');
    expect(plan.viewConfig.group_by).toEqual(['desk']);
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
});
