// @vitest-environment node
/**
 * The datasource driven against a REAL Perspective engine.
 *
 * Every other test in this directory runs against `fakePerspective`,
 * whose filter stub passes every row for any `__ssrm_*` clause — so
 * quick filter and all expression-based filtering are faked away and
 * "it filters" is unfalsifiable there. These tests execute the actual
 * wasm engine in-process, which is the only way to catch a query that
 * builds cleanly and then returns the wrong rows.
 *
 * `@finos/perspective/node` compiles wasm at module evaluation, so it is
 * imported DYNAMICALLY inside the suite (a top-level import breaks the
 * jsdom-environment files that share this project).
 */

import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import type { GridApi, IServerSideGetRowsParams, IServerSideGetRowsRequest } from 'ag-grid-community';
import type { DatasetStateSnapshot } from '@starui/host-data/runtime/ssrm';
import { createSsrmPullDatasource } from '../../pull/createSsrmPullDatasource.js';
import type { PullDatasourceConnection, PullTable } from '../../pull/types.js';

interface PerspectiveModule {
  table(schema: unknown, options?: unknown): Promise<PullTable & { update(rows: unknown): Promise<void>; delete(): Promise<void> }>;
}

let perspective: PerspectiveModule;

const SCHEMA = {
  positionId: 'string',
  cusip: 'string',
  bookName: 'string',
  trader: 'string',
  quantity: 'float',
  pnl: 'float',
} as const;

const QF_COLUMNS = ['positionId', 'cusip', 'bookName', 'trader'];

function seedRows(n: number): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i += 1) {
    rows.push({
      positionId: `P${i}`,
      cusip: i === 7 ? 'J2N98VOLO' : `CUSIP${i}`,
      bookName: i % 3 === 0 ? 'ALPHA' : 'BETA',
      trader: i % 5 === 0 ? 'jdoe' : 'asmith',
      quantity: i,
      pnl: i * 1.5,
    });
  }
  return rows;
}

/** A PullDatasourceConnection backed by a genuine hosted table. */
async function realConnection(rowCount: number): Promise<
  PullDatasourceConnection & { dispose(): Promise<void> }
> {
  const table = await perspective.table(SCHEMA, { index: 'positionId', name: 'positions' });
  await table.update(seedRows(rowCount));
  const snapshot: DatasetStateSnapshot = {
    phase: 'live',
    rowCount,
    generation: 1,
  } as DatasetStateSnapshot;
  const listeners = new Set<(s: DatasetStateSnapshot) => void>();
  return {
    get state() {
      return snapshot;
    },
    onState(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
    async openTable() {
      return table;
    },
    async dispose() {
      await table.delete();
    },
  };
}

function fakeApi(): GridApi & { refreshes: Array<{ purge?: boolean } | undefined> } {
  const refreshes: Array<{ purge?: boolean } | undefined> = [];
  return {
    refreshes,
    setRowCount: () => undefined,
    applyServerSideTransactionAsync: () => undefined,
    applyServerSideRowData: () => undefined,
    refreshServerSide: (p?: { purge?: boolean }) => refreshes.push(p),
    getRowNode: () => undefined,
    refreshCells: () => undefined,
  } as unknown as GridApi & { refreshes: Array<{ purge?: boolean } | undefined> };
}

function agRequest(overrides: Partial<IServerSideGetRowsRequest> = {}): IServerSideGetRowsRequest {
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
  } as IServerSideGetRowsRequest;
}

function loadParams(api: GridApi, overrides: Partial<IServerSideGetRowsRequest> = {}) {
  return {
    request: agRequest(overrides),
    api,
    success: vi.fn(),
    fail: vi.fn(),
    parentNode: {},
    needsGrandTotal: false,
    context: undefined,
  } as unknown as IServerSideGetRowsParams & {
    success: ReturnType<typeof vi.fn>;
    fail: ReturnType<typeof vi.fn>;
  };
}

/** Drive one load to completion and return what AG was handed. */
async function load(
  ds: ReturnType<typeof createSsrmPullDatasource>,
  api: GridApi,
  overrides: Partial<IServerSideGetRowsRequest> = {},
): Promise<{ rowData: Record<string, unknown>[]; rowCount?: number }> {
  const params = loadParams(api, overrides);
  ds.getRows(params);
  for (let i = 0; i < 30 && params.success.mock.calls.length + params.fail.mock.calls.length === 0; i += 1) {
    await new Promise((r) => setTimeout(r, 5));
  }
  expect(params.fail).not.toHaveBeenCalled();
  expect(params.success).toHaveBeenCalledTimes(1);
  return params.success.mock.calls[0]![0] as { rowData: Record<string, unknown>[]; rowCount?: number };
}

describe('pull datasource against a REAL Perspective engine', () => {
  beforeAll(async () => {
    perspective = (await import('@finos/perspective/node')) as unknown as PerspectiveModule;
  }, 60_000);

  let disposers: Array<() => Promise<void>> = [];
  afterAll(async () => {
    // LIFO, and the datasource always tears down before its table:
    // deleting a table out from under live views is the same class of
    // borrow race these tests exist to catch.
    for (const d of disposers.reverse()) await d().catch(() => undefined);
    disposers = [];
  });

  const harness = async (rows = 201) => {
    const connection = await realConnection(rows);
    disposers.push(() => connection.dispose());
    const api = fakeApi();
    const ds = createSsrmPullDatasource({
      connection,
      keyColumn: 'positionId',
      quickFilterColumns: QF_COLUMNS,
      quickFilterDebounceMs: 0,
      tickRefreshMs: 0,
      seedCountRefreshMs: 0,
      warn: () => undefined,
    });
    disposers.push(async () => {
      ds.destroy();
      // Let retired views finish draining before the table goes.
      await new Promise((r) => setTimeout(r, 20));
    });
    return { connection, api, ds };
  };

  it('serves the unfiltered book', async () => {
    const { api, ds } = await harness();
    const result = await load(ds, api);
    expect(result.rowCount).toBe(201);
    expect(result.rowData).toHaveLength(100);
  });

  it('QUICK FILTER actually reduces the rows AG is handed', async () => {
    const { api, ds } = await harness();
    await load(ds, api); // establish the root plan

    ds.setQuickFilter('volo');
    await new Promise((r) => setTimeout(r, 10));
    expect(api.refreshes).toEqual([{ route: [], purge: true }]);

    // AG's purge re-requests block 0 — this is that reload.
    const filtered = await load(ds, api);
    expect(filtered.rowCount).toBe(1);
    expect(filtered.rowData).toHaveLength(1);
    expect(filtered.rowData[0]!.cusip).toBe('J2N98VOLO');
  });

  it('quick filter matches across every configured column, and clears', async () => {
    const { api, ds } = await harness();
    await load(ds, api);

    ds.setQuickFilter('alpha'); // bookName
    await new Promise((r) => setTimeout(r, 10));
    expect((await load(ds, api)).rowCount).toBe(67);

    ds.setQuickFilter('alpha jdoe'); // two tokens, ANDed
    await new Promise((r) => setTimeout(r, 10));
    expect((await load(ds, api)).rowCount).toBe(14);

    ds.setQuickFilter(null); // cleared
    await new Promise((r) => setTimeout(r, 10));
    expect((await load(ds, api)).rowCount).toBe(201);
  });

  it('column filter actually filters', async () => {
    const { api, ds } = await harness();
    await load(ds, api);
    const filtered = await load(ds, api, {
      filterModel: { pnl: { filterType: 'number', type: 'greaterThan', filter: 100 } },
    });
    // pnl = i * 1.5 > 100  =>  i >= 67  =>  201 - 67 = 134
    expect(filtered.rowCount).toBe(134);
  });

  it('sort actually sorts', async () => {
    const { api, ds } = await harness();
    const asc = await load(ds, api, { sortModel: [{ colId: 'pnl', sort: 'asc' }] });
    expect(asc.rowData[0]!.pnl).toBe(0);
    const desc = await load(ds, api, { sortModel: [{ colId: 'pnl', sort: 'desc' }] });
    expect(desc.rowData[0]!.pnl).toBe(300);
  });
});
