import { describe, it, expect } from 'vitest';
import { runQuery, SSRM_CHILD_COUNT_FIELD } from './queryEngine.js';
import type { SsrmGetRowsRequest } from './types.js';

interface Row {
  id: number;
  region: string;
  desk: string;
  qty: number;
}

const ROWS: Row[] = [
  { id: 1, region: 'US', desk: 'Rates', qty: 100 },
  { id: 2, region: 'US', desk: 'Rates', qty: 50 },
  { id: 3, region: 'US', desk: 'Credit', qty: 25 },
  { id: 4, region: 'EU', desk: 'Rates', qty: 200 },
];

const GROUP_COLS = [
  { id: 'region', field: 'region' },
  { id: 'desk', field: 'desk' },
];
const VALUE_COLS = [{ id: 'qty', field: 'qty', aggFunc: 'sum' }];

const run = (req: SsrmGetRowsRequest) => runQuery(ROWS, req);

describe('runQuery — grouping', () => {
  it('top level returns distinct group rows with aggregated value cols + child counts', () => {
    const res = run({
      rowGroupCols: GROUP_COLS,
      valueCols: VALUE_COLS,
      groupKeys: [],
      startRow: 0,
      endRow: 100,
    });
    expect(res.lastRow).toBe(2); // US, EU
    const byRegion = Object.fromEntries(
      (res.rows as Array<Record<string, unknown>>).map((r) => [r.region, r]),
    );
    expect(byRegion.US.qty).toBe(175); // 100 + 50 + 25
    expect(byRegion.US[SSRM_CHILD_COUNT_FIELD]).toBe(3);
    expect(byRegion.EU.qty).toBe(200);
    expect(byRegion.EU[SSRM_CHILD_COUNT_FIELD]).toBe(1);
  });

  it('expanding a group returns the next level under the group path', () => {
    const res = run({
      rowGroupCols: GROUP_COLS,
      valueCols: VALUE_COLS,
      groupKeys: ['US'],
      startRow: 0,
      endRow: 100,
    });
    // Sub-groups of US by desk: Rates (150), Credit (25).
    expect(res.lastRow).toBe(2);
    const byDesk = Object.fromEntries(
      (res.rows as Array<Record<string, unknown>>).map((r) => [r.desk, r]),
    );
    expect(byDesk.Rates.qty).toBe(150);
    expect(byDesk.Credit.qty).toBe(25);
  });

  it('leaf level (all group cols consumed) returns the actual rows', () => {
    const res = run({
      rowGroupCols: GROUP_COLS,
      valueCols: VALUE_COLS,
      groupKeys: ['US', 'Rates'],
      startRow: 0,
      endRow: 100,
    });
    expect((res.rows as Row[]).map((r) => r.id).sort()).toEqual([1, 2]);
    expect(res.lastRow).toBe(2);
  });

  it('applies filters before grouping', () => {
    const res = run({
      rowGroupCols: GROUP_COLS,
      valueCols: VALUE_COLS,
      groupKeys: [],
      filterModel: { desk: { filterType: 'set', values: ['Rates'] } },
      startRow: 0,
      endRow: 100,
    });
    // Only Rates rows remain: US Rates = 150, EU Rates = 200.
    const byRegion = Object.fromEntries(
      (res.rows as Array<Record<string, unknown>>).map((r) => [r.region, r]),
    );
    expect(byRegion.US.qty).toBe(150);
    expect(byRegion.EU.qty).toBe(200);
  });
});
