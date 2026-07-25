import { describe, expect, it, vi } from 'vitest';
import { GRAND_TOTAL_ROW_ID } from 'ag-grid-community';
import type { GridApi, IServerSideGetRowsParams, IServerSideGetRowsRequest } from 'ag-grid-community';
import type { DatasetStateSnapshot } from '@starui/host-data/runtime/ssrm';
import { createSsrmPullDatasource, diffRowsByKey } from '../../pull/createSsrmPullDatasource.js';
import {
  CHILD_COUNT_FIELD,
  GROUP_ID_FIELD,
  GROUP_KEY_FIELD,
  encodeGroupRowId,
} from '../../pull/groupRows.js';
import { WIDE_SWEEP_MAX_BLOCKS } from '../../pull/sweepGate.js';
import { QUICK_FILTER_EXPR } from '../../pull/filterExpressions.js';
import { FakeConnection, type Row } from './fakePerspective.js';

// ─── grid-api fake ───────────────────────────────────────────────────

interface FakeNode {
  data: Row;
  updateData: ReturnType<typeof vi.fn>;
}

function fakeApi(): GridApi & {
  calls: {
    setRowCount: Array<[number, boolean | undefined]>;
    transactions: Array<{ route?: string[]; update?: Row[] }>;
    rowData: Array<{
      startRow?: number;
      route?: string[];
      successParams: { rowData: Row[]; rowCount?: number };
    }>;
    refreshes: Array<{ purge?: boolean } | undefined>;
    refreshCells: Array<unknown>;
  };
  nodes: Map<string, FakeNode>;
  seedNode(id: string, data: Row): FakeNode;
} {
  const calls = {
    setRowCount: [] as Array<[number, boolean | undefined]>,
    transactions: [] as Array<{ route?: string[]; update?: Row[] }>,
    rowData: [] as Array<{
      startRow?: number;
      route?: string[];
      successParams: { rowData: Row[]; rowCount?: number };
    }>,
    refreshes: [] as Array<{ purge?: boolean } | undefined>,
    refreshCells: [] as Array<unknown>,
  };
  const nodes = new Map<string, FakeNode>();
  return {
    calls,
    nodes,
    seedNode(id: string, data: Row): FakeNode {
      const node: FakeNode = {
        data,
        updateData: vi.fn((next: Row) => {
          node.data = next;
        }),
      };
      nodes.set(id, node);
      return node;
    },
    setRowCount: (count: number, known?: boolean) => calls.setRowCount.push([count, known]),
    applyServerSideTransactionAsync: (txn: { route?: string[]; update?: Row[] }) =>
      calls.transactions.push(txn),
    applyServerSideRowData: (p: never) => calls.rowData.push(p),
    refreshServerSide: (p?: { purge?: boolean }) => calls.refreshes.push(p),
    getRowNode: (id: string) => nodes.get(id),
    refreshCells: (p: unknown) => calls.refreshCells.push(p),
  } as unknown as ReturnType<typeof fakeApi>;
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
  };
}

function loadParams(
  api: GridApi,
  overrides: Partial<IServerSideGetRowsRequest> = {},
  extras: { needsGrandTotal?: boolean } = {},
): IServerSideGetRowsParams & { success: ReturnType<typeof vi.fn>; fail: ReturnType<typeof vi.fn> } {
  return {
    request: agRequest(overrides),
    api,
    success: vi.fn(),
    fail: vi.fn(),
    parentNode: {},
    needsGrandTotal: extras.needsGrandTotal ?? false,
    context: undefined,
  } as unknown as IServerSideGetRowsParams & {
    success: ReturnType<typeof vi.fn>;
    fail: ReturnType<typeof vi.fn>;
  };
}

const flush = async (times = 4): Promise<void> => {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const seedRows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ positionId: `POS${i}`, px: i * 10, pnl: i }));

/** Rows with a categorical column for grouping tests: books A/B/C. */
const bookRows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    positionId: `POS${i}`,
    book: `BOOK${String.fromCharCode(65 + (i % 3))}`,
    pnl: i,
    px: i * 10,
  }));

function liveState(rowCount: number, generation = 1): DatasetStateSnapshot {
  return { phase: 'live', rowCount, generation };
}

function makeDatasource(connection: FakeConnection, overrides = {}) {
  return createSsrmPullDatasource({
    connection,
    keyColumn: 'positionId',
    tickRefreshMs: 0,
    seedCountRefreshMs: 0,
    quickFilterDebounceMs: 0, // synchronous in tests; debounce covered explicitly
    warn: () => undefined,
    ...overrides,
  });
}

const GROUP_REQUEST: Partial<IServerSideGetRowsRequest> = {
  rowGroupCols: [{ id: 'book', displayName: 'Book', field: 'book' }],
  valueCols: [{ id: 'pnl', displayName: 'PnL', field: 'pnl', aggFunc: 'sum' }],
};

// ─── tests ───────────────────────────────────────────────────────────

describe('createSsrmPullDatasource', () => {
  it('serves a block with a finalized rowCount when live', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(250);
    connection.emit(liveState(250));
    const ds = makeDatasource(connection);
    const api = fakeApi();
    const params = loadParams(api);
    ds.getRows(params);
    await flush();
    expect(params.fail).not.toHaveBeenCalled();
    expect(params.success).toHaveBeenCalledTimes(1);
    const arg = params.success.mock.calls[0]![0] as { rowData: Row[]; rowCount?: number };
    expect(arg.rowData).toHaveLength(100);
    expect(arg.rowData[0]).toEqual({ positionId: 'POS0', px: 0, pnl: 0 });
    expect(arg.rowCount).toBe(250);
    ds.destroy();
  });

  it('maps sortModel and filterModel onto the Perspective view config', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(10);
    connection.emit(liveState(10));
    const ds = makeDatasource(connection);
    const params = loadParams(fakeApi(), {
      sortModel: [{ colId: 'px', sort: 'desc' }],
      filterModel: { pnl: { filterType: 'number', type: 'greaterThan', filter: 3 } },
    });
    ds.getRows(params);
    await flush();
    expect(connection.table.views).toHaveLength(1);
    expect(connection.table.views[0]!.config).toEqual({
      sort: [['px', 'desc']],
      filter: [['pnl', '>', 3]],
    });
    ds.destroy();
  });

  it('reuses one view per query shape across blocks', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(300);
    connection.emit(liveState(300));
    const ds = makeDatasource(connection);
    const api = fakeApi();
    ds.getRows(loadParams(api));
    ds.getRows(loadParams(api, { startRow: 100, endRow: 200 }));
    await flush();
    expect(connection.table.views).toHaveLength(1);
    ds.destroy();
  });

  it('NEVER finalizes while seeding: success without rowCount + reopened count', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(37); // partial seed so far
    connection.emit({ phase: 'seeding', rowCount: 37, generation: 1 });
    const ds = makeDatasource(connection);
    const api = fakeApi();
    const params = loadParams(api);
    ds.getRows(params);
    await flush();
    const arg = params.success.mock.calls[0]![0] as { rowData: Row[]; rowCount?: number };
    expect(arg.rowData).toHaveLength(37);
    expect('rowCount' in arg).toBe(false);
    // the under-filled block finalizes AG's lazy count — must be reopened
    expect(api.calls.setRowCount).toContainEqual([37, false]);
    ds.destroy();
  });

  it('grows the AG row count from seeding DatasetState events', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(10);
    connection.emit({ phase: 'seeding', rowCount: 10, generation: 1 });
    const ds = makeDatasource(connection);
    const api = fakeApi();
    ds.getRows(loadParams(api));
    await flush();
    connection.emit({ phase: 'seeding', rowCount: 5000, generation: 1 });
    await flush();
    expect(api.calls.setRowCount).toContainEqual([5000, false]);
    ds.destroy();
  });

  it('refreshes without purge on the seeding→live transition', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(10);
    connection.emit({ phase: 'seeding', rowCount: 10, generation: 1 });
    const ds = makeDatasource(connection);
    const api = fakeApi();
    ds.getRows(loadParams(api));
    await flush();
    connection.table.rows = seedRows(20000);
    connection.emit(liveState(20000));
    await flush();
    expect(api.calls.refreshes).toEqual([{ purge: false }]);
    ds.destroy();
  });

  it('finalizes an honest 0 for an empty dataset', async () => {
    const connection = new FakeConnection();
    connection.emit({ phase: 'empty', rowCount: 0, generation: 1 });
    const ds = makeDatasource(connection);
    const params = loadParams(fakeApi());
    ds.getRows(params);
    await flush();
    expect(params.success).toHaveBeenCalledWith({ rowData: [], rowCount: 0 });
    ds.destroy();
  });

  it('fails loads in the error phase', async () => {
    const connection = new FakeConnection();
    connection.emit({ phase: 'error', rowCount: 0, generation: 1, error: 'broker down' });
    const ds = makeDatasource(connection);
    const params = loadParams(fakeApi());
    ds.getRows(params);
    await flush();
    expect(params.fail).toHaveBeenCalledTimes(1);
    expect(params.success).not.toHaveBeenCalled();
    ds.destroy();
  });

  it('DROPS a response whose generation went stale mid-flight (no success, no fail)', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(100);
    connection.emit(liveState(100, 1));
    connection.holdTable();
    const ds = makeDatasource(connection);
    const params = loadParams(fakeApi());
    ds.getRows(params);
    await flush();
    connection.emit({ phase: 'connecting', rowCount: 0, generation: 2 }); // restart adopted
    connection.releaseTable();
    await flush();
    expect(params.success).not.toHaveBeenCalled();
    expect(params.fail).not.toHaveBeenCalled();
    ds.destroy();
  });

  it('patches ticked rows via update transactions — never a purge, never a store reset', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(50);
    connection.emit(liveState(50));
    const ds = makeDatasource(connection);
    const api = fakeApi();
    const params = loadParams(api, { startRow: 0, endRow: 50 });
    ds.getRows(params);
    await flush();
    expect(params.success).toHaveBeenCalledTimes(1);

    // a tick lands in the table
    connection.table.rows = connection.table.rows.map((row) =>
      row.positionId === 'POS3' ? { ...row, px: 999 } : row,
    );
    connection.table.views[0]!.fireUpdate();
    await flush();

    expect(api.calls.transactions).toHaveLength(1);
    expect(api.calls.transactions[0]!.update).toEqual([{ positionId: 'POS3', px: 999, pnl: 3 }]);
    expect(api.calls.transactions[0]!.route).toEqual([]);
    expect(api.calls.refreshes).toEqual([]); // no purge path ever taken
    expect(params.success).toHaveBeenCalledTimes(1); // block not re-served
    expect(api.calls.setRowCount).toContainEqual([50, true]);
    ds.destroy();
  });

  it('serve-then-refresh: cache hits answer synchronously, fresh read replaces the block', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(120);
    connection.emit(liveState(120));
    const ds = makeDatasource(connection);
    const api = fakeApi();
    ds.getRows(loadParams(api));
    await flush();

    connection.table.rows = connection.table.rows.map((row) =>
      row.positionId === 'POS0' ? { ...row, px: -1 } : row,
    );
    const second = loadParams(api);
    ds.getRows(second);
    // cache hit is synchronous — served before any await resolves
    expect(second.success).toHaveBeenCalledTimes(1);
    const served = second.success.mock.calls[0]![0] as { rowData: Row[] };
    expect(served.rowData[0]).toEqual({ positionId: 'POS0', px: 0, pnl: 0 }); // cached
    await flush();
    // the fresh read lands as an index-addressed block replacement
    expect(api.calls.rowData).toHaveLength(1);
    expect(api.calls.rowData[0]!.startRow).toBe(0);
    expect(api.calls.rowData[0]!.successParams.rowData[0]).toEqual({
      positionId: 'POS0',
      px: -1,
      pnl: 0,
    });
    ds.destroy();
  });

  it('destroy() removes the tick subscription and deletes cached views', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(10);
    connection.emit(liveState(10));
    const ds = makeDatasource(connection);
    ds.getRows(loadParams(fakeApi()));
    await flush();
    const view = connection.table.views[0]!;
    expect(view.updateCallbacks.size).toBe(1);
    ds.destroy();
    await flush();
    expect(view.deleted).toBe(true);
    expect(view.updateCallbacks.size).toBe(0);
  });

  // ─── P4a: row grouping ───────────────────────────────────────────

  it('serves group rows with labels, aggregates, child counts and stable path ids', async () => {
    const connection = new FakeConnection();
    connection.table.rows = bookRows(9); // A: 0,3,6 → pnl 9; B: 1,4,7 → 12; C: 2,5,8 → 15
    connection.emit(liveState(9));
    const ds = makeDatasource(connection);
    const api = fakeApi();
    const params = loadParams(api, GROUP_REQUEST);
    ds.getRows(params);
    await flush();
    expect(params.fail).not.toHaveBeenCalled();
    const arg = params.success.mock.calls[0]![0] as { rowData: Row[]; rowCount?: number };
    expect(arg.rowCount).toBe(3); // groups, NOT the leading total row
    expect(arg.rowData).toEqual([
      {
        book: 'BOOKA',
        pnl: 9,
        [CHILD_COUNT_FIELD]: 3,
        [GROUP_ID_FIELD]: encodeGroupRowId(['BOOKA']),
        [GROUP_KEY_FIELD]: 'BOOKA',
      },
      {
        book: 'BOOKB',
        pnl: 12,
        [CHILD_COUNT_FIELD]: 3,
        [GROUP_ID_FIELD]: encodeGroupRowId(['BOOKB']),
        [GROUP_KEY_FIELD]: 'BOOKB',
      },
      {
        book: 'BOOKC',
        pnl: 15,
        [CHILD_COUNT_FIELD]: 3,
        [GROUP_ID_FIELD]: encodeGroupRowId(['BOOKC']),
        [GROUP_KEY_FIELD]: 'BOOKC',
      },
    ]);
    // group view shape: group_by next level, unique label agg, key count
    expect(connection.table.views[0]!.config.group_by).toEqual(['book']);
    expect(connection.table.views[0]!.config.aggregates).toEqual({
      pnl: 'sum',
      book: 'unique',
      positionId: 'count',
    });
    ds.destroy();
  });

  it('group row ids are identical across refreshes (path-encoded, not positional)', async () => {
    const connection = new FakeConnection();
    connection.table.rows = bookRows(9);
    connection.emit(liveState(9));
    const ds = makeDatasource(connection);
    const api = fakeApi();
    const first = loadParams(api, GROUP_REQUEST);
    ds.getRows(first);
    await flush();
    const firstArg = first.success.mock.calls[0]![0] as { rowData: Row[] };
    const firstIds = firstArg.rowData.map((r) => r[GROUP_ID_FIELD]);
    expect(firstIds.every((id) => typeof id === 'string')).toBe(true);

    // aggregates change; a second load of the same block (cache hit +
    // serve-then-refresh) delivers fresh values under the SAME ids
    connection.table.rows = connection.table.rows.map((row) => ({
      ...row,
      pnl: (row.pnl as number) + 100,
    }));
    ds.getRows(loadParams(api, GROUP_REQUEST));
    await flush();
    const refreshed = api.calls.rowData.at(-1)!.successParams.rowData;
    expect(refreshed.map((r) => r[GROUP_ID_FIELD])).toEqual(firstIds);
    expect(refreshed.map((r) => r.pnl)).toEqual([309, 312, 315]); // fresh aggregates
    ds.destroy();
  });

  it('serves leaf rows under an expanded group and routes their tick patches', async () => {
    const connection = new FakeConnection();
    connection.table.rows = bookRows(9);
    connection.emit(liveState(9));
    const ds = makeDatasource(connection);
    const api = fakeApi();
    const params = loadParams(api, { ...GROUP_REQUEST, groupKeys: ['BOOKA'] });
    ds.getRows(params);
    await flush();
    const arg = params.success.mock.calls[0]![0] as { rowData: Row[]; rowCount?: number };
    expect(arg.rowData.map((r) => r.positionId)).toEqual(['POS0', 'POS3', 'POS6']);
    expect(arg.rowCount).toBe(3);

    // leaf tick under the route → transaction routed to the child store
    connection.table.rows = connection.table.rows.map((row) =>
      row.positionId === 'POS3' ? { ...row, pnl: 777 } : row,
    );
    connection.table.fireAll();
    await flush();
    const leafTxn = api.calls.transactions.find((t) =>
      t.update?.some((r) => r.positionId === 'POS3'),
    );
    expect(leafTxn).toBeDefined();
    expect(leafTxn!.route).toEqual(['BOOKA']);
    ds.destroy();
  });

  it('keeps loaded group headers live on ticks (keyed group-row transactions, no purge)', async () => {
    const connection = new FakeConnection();
    connection.table.rows = bookRows(9);
    connection.emit(liveState(9));
    const ds = makeDatasource(connection);
    const api = fakeApi();
    ds.getRows(loadParams(api, GROUP_REQUEST));
    await flush();

    connection.table.rows = connection.table.rows.map((row) =>
      row.positionId === 'POS0' ? { ...row, pnl: 1000 } : row, // BOOKA: 9 → 1009
    );
    connection.table.fireAll();
    await flush();

    const groupTxn = api.calls.transactions.find((t) =>
      t.update?.some((r) => typeof r[GROUP_ID_FIELD] === 'string'),
    );
    expect(groupTxn).toBeDefined();
    expect(groupTxn!.route).toEqual([]);
    expect(groupTxn!.update).toEqual([
      {
        book: 'BOOKA',
        pnl: 1009,
        [CHILD_COUNT_FIELD]: 3,
        [GROUP_ID_FIELD]: encodeGroupRowId(['BOOKA']),
        [GROUP_KEY_FIELD]: 'BOOKA',
      },
    ]);
    expect(api.calls.refreshes).toEqual([]);
    ds.destroy();
  });

  it('NEVER calls setRowCount for grouped stores (AG #28) — counts ride on successes', async () => {
    const connection = new FakeConnection();
    connection.table.rows = bookRows(9);
    connection.emit({ phase: 'seeding', rowCount: 9, generation: 1 });
    const ds = makeDatasource(connection);
    const api = fakeApi();
    const params = loadParams(api, GROUP_REQUEST);
    ds.getRows(params);
    await flush();
    // grouped store: success carries the group count even while seeding
    const arg = params.success.mock.calls[0]![0] as { rowData: Row[]; rowCount?: number };
    expect(arg.rowCount).toBe(3);
    // seeding growth events must not touch setRowCount under grouping
    connection.emit({ phase: 'seeding', rowCount: 5000, generation: 1 });
    await flush();
    connection.table.fireAll(); // nor may the tick refresh
    await flush();
    expect(api.calls.setRowCount).toEqual([]);
    ds.destroy();
  });

  // ─── P4a: grand total ────────────────────────────────────────────

  it('answers needsGrandTotal with grandTotalData from a rollup read', async () => {
    const connection = new FakeConnection();
    connection.table.rows = bookRows(9);
    connection.emit(liveState(9));
    const ds = makeDatasource(connection);
    const api = fakeApi();
    const params = loadParams(api, GROUP_REQUEST, { needsGrandTotal: true });
    ds.getRows(params);
    await flush();
    const arg = params.success.mock.calls[0]![0] as { grandTotalData?: Row };
    expect(arg.grandTotalData).toEqual({ pnl: 36 }); // Σ 0..8
    ds.destroy();
  });

  it('keeps the grand total live: ticks patch the grand-total node in place', async () => {
    const connection = new FakeConnection();
    connection.table.rows = bookRows(9);
    connection.emit(liveState(9));
    const ds = makeDatasource(connection);
    const api = fakeApi();
    ds.getRows(loadParams(api, GROUP_REQUEST, { needsGrandTotal: true }));
    await flush();
    const node = api.seedNode(GRAND_TOTAL_ROW_ID, { pnl: 36 });

    connection.table.rows = connection.table.rows.map((row) =>
      row.positionId === 'POS0' ? { ...row, pnl: 1000 } : row,
    );
    connection.table.fireAll();
    await flush();

    expect(node.updateData).toHaveBeenCalled();
    expect(node.data).toEqual({ pnl: 1036 });
    expect(api.calls.refreshCells.length).toBeGreaterThan(0);
    ds.destroy();
  });

  // ─── P4a: quick filter + distinct values ─────────────────────────

  it('folds the quick filter into the plan and refreshes without purging', async () => {
    const connection = new FakeConnection();
    connection.table.rows = bookRows(9);
    connection.emit(liveState(9));
    const ds = makeDatasource(connection, { quickFilterColumns: ['book', 'positionId'] });
    const api = fakeApi();
    ds.getRows(loadParams(api));
    await flush();

    ds.setQuickFilter('bookA');
    // Structural store change → PURGE (a soft refresh cannot shrink AG's
    // lazy-store row count; the pre-fix purge:false left the scrollbar on
    // the unfiltered total forever).
    expect(api.calls.refreshes).toEqual([{ purge: true }]);
    const params = loadParams(api); // the refresh re-issues getRows
    ds.getRows(params);
    await flush();
    const view = connection.table.views.at(-1)!;
    expect(view.config.filter).toEqual([[QUICK_FILTER_EXPR, '==', true]]);
    expect(view.config.expressions).toEqual({
      [QUICK_FILTER_EXPR]:
        `(match(lower("book"), 'booka') or match(lower("positionId"), 'booka'))`,
    });

    ds.setQuickFilter(null); // clears — back to the original flat shape
    const cleared = loadParams(api);
    ds.getRows(cleared);
    await flush();
    // the cleared plan reuses the ORIGINAL unfiltered view (same key) —
    // exactly one quick-filter view was ever created
    expect(connection.table.views.filter((v) => v.config.expressions).length).toBe(1);
    const clearedArg = cleared.success.mock.calls[0]![0] as { rowCount?: number };
    expect(clearedArg.rowCount).toBe(9);
    ds.destroy();
  });

  it('debounces per-keystroke setQuickFilter into ONE purge refresh (perf fix)', () => {
    // Pre-fix, each keystroke built a full Perspective view and queued a
    // refresh behind it — typing "BOOK003" cost 7 stacked re-queries.
    vi.useFakeTimers();
    try {
      const connection = new FakeConnection();
      connection.table.rows = bookRows(9);
      connection.emit(liveState(9));
      const ds = makeDatasource(connection, {
        quickFilterColumns: ['book'],
        quickFilterDebounceMs: 200,
      });
      const api = fakeApi();
      ds.getRows(loadParams(api));

      // Simulate typing: 7 calls, 50ms apart — inside the debounce window.
      for (const prefix of ['B', 'BO', 'BOO', 'BOOK', 'BOOK0', 'BOOK00', 'BOOK003']) {
        ds.setQuickFilter(prefix);
        vi.advanceTimersByTime(50);
      }
      expect(api.calls.refreshes).toEqual([]); // nothing applied mid-typing

      vi.advanceTimersByTime(200); // trailing edge
      expect(api.calls.refreshes).toEqual([{ purge: true }]); // exactly one

      // Re-setting the SAME settled value must not refresh again.
      ds.setQuickFilter('BOOK003');
      vi.advanceTimersByTime(300);
      expect(api.calls.refreshes).toEqual([{ purge: true }]);

      // destroy() cancels a pending apply.
      ds.setQuickFilter('other');
      ds.destroy();
      vi.advanceTimersByTime(300);
      expect(api.calls.refreshes).toEqual([{ purge: true }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('getDistinctValues reads group labels and deletes the transient view', async () => {
    const connection = new FakeConnection();
    connection.table.rows = [...bookRows(9), { positionId: 'POSX', book: null, pnl: 0, px: 0 }];
    connection.emit(liveState(10));
    const ds = makeDatasource(connection);
    const values = await ds.getDistinctValues('book');
    expect(values).toEqual(['BOOKA', 'BOOKB', 'BOOKC', null]);
    expect(connection.table.views.at(-1)!.deleted).toBe(true);
    ds.destroy();
  });

  // ─── P4b-2: tree data ─────────────────────────────────────────────

  /** book (2) × trader (2) × 2 leaves = 8 rows. */
  const treeRows = (): Row[] =>
    Array.from({ length: 8 }, (_, i) => ({
      positionId: `POS${i}`,
      book: `BOOK${String.fromCharCode(65 + (i % 2))}`,
      trader: `T${Math.floor(i / 2) % 2}`,
      pnl: i,
    }));

  const TREE_OPTS = { treePathFields: ['book', 'trader'] };

  it('tree root: serves level-0 group rows with keys, child counts and path ids', async () => {
    const connection = new FakeConnection();
    connection.table.rows = treeRows();
    connection.emit(liveState(8));
    const ds = makeDatasource(connection, TREE_OPTS);
    const params = loadParams(fakeApi()); // tree requests carry NO rowGroupCols
    ds.getRows(params);
    await flush();
    const arg = params.success.mock.calls[0]![0] as { rowData: Row[]; rowCount?: number };
    expect(arg.rowCount).toBe(2);
    expect(arg.rowData.map((r) => r.book)).toEqual(['BOOKA', 'BOOKB']);
    expect(arg.rowData.map((r) => r[GROUP_KEY_FIELD])).toEqual(['BOOKA', 'BOOKB']);
    expect(arg.rowData.map((r) => r[CHILD_COUNT_FIELD])).toEqual([4, 4]);
    expect(arg.rowData.map((r) => r[GROUP_ID_FIELD])).toEqual([
      encodeGroupRowId(['BOOKA']),
      encodeGroupRowId(['BOOKB']),
    ]);
    expect(connection.table.views[0]!.config.group_by).toEqual(['book']);
    ds.destroy();
  });

  it('tree mid-level: groups the next path field under the ancestor filter', async () => {
    const connection = new FakeConnection();
    connection.table.rows = treeRows();
    connection.emit(liveState(8));
    const ds = makeDatasource(connection, TREE_OPTS);
    const params = loadParams(fakeApi(), { groupKeys: ['BOOKA'] });
    ds.getRows(params);
    await flush();
    const arg = params.success.mock.calls[0]![0] as { rowData: Row[]; rowCount?: number };
    expect(arg.rowCount).toBe(2);
    expect(arg.rowData.map((r) => r[GROUP_KEY_FIELD])).toEqual(['T0', 'T1']);
    expect(arg.rowData.map((r) => r[CHILD_COUNT_FIELD])).toEqual([2, 2]);
    expect(arg.rowData.map((r) => r[GROUP_ID_FIELD])).toEqual([
      encodeGroupRowId(['BOOKA', 'T0']),
      encodeGroupRowId(['BOOKA', 'T1']),
    ]);
    expect(connection.table.views[0]!.config.filter).toEqual([['book', '==', 'BOOKA']]);
    ds.destroy();
  });

  it('tree full-depth route: serves leaf rows pinned by every ancestor', async () => {
    const connection = new FakeConnection();
    connection.table.rows = treeRows();
    connection.emit(liveState(8));
    const ds = makeDatasource(connection, TREE_OPTS);
    const params = loadParams(fakeApi(), { groupKeys: ['BOOKA', 'T1'] });
    ds.getRows(params);
    await flush();
    const arg = params.success.mock.calls[0]![0] as { rowData: Row[]; rowCount?: number };
    expect(arg.rowCount).toBe(2);
    expect(arg.rowData.map((r) => r.positionId)).toEqual(['POS2', 'POS6']);
    expect(arg.rowData.every((r) => !(GROUP_ID_FIELD in r))).toBe(true); // leaves, not groups
    expect(connection.table.views[0]!.config.filter).toEqual([
      ['book', '==', 'BOOKA'],
      ['trader', '==', 'T1'],
    ]);
    ds.destroy();
  });

  it('queryAll strips tree levels to leaves like it strips grouping', async () => {
    const connection = new FakeConnection();
    connection.table.rows = treeRows();
    connection.emit(liveState(8));
    const ds = makeDatasource(connection, TREE_OPTS);
    ds.getRows(loadParams(fakeApi())); // tree root shape is the live root
    await flush();
    const { rows, total } = await ds.queryAll();
    expect(total).toBe(8);
    expect(rows.map((r) => r.positionId)).toHaveLength(8);
    ds.destroy();
  });

  // ─── P4b-2: calc expressions through the datasource ───────────────

  it('attaches calcExpressions to block views and distinct-value reads', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(10);
    connection.emit(liveState(10));
    const calcExpressions = { pnlPerUnit: '"pnl" / "px"' };
    const ds = makeDatasource(connection, { calcExpressions });
    ds.getRows(loadParams(fakeApi()));
    await flush();
    expect(connection.table.views[0]!.config.expressions).toEqual(calcExpressions);

    await ds.getDistinctValues('pnlPerUnit'); // calc alias → expression attached
    expect(connection.table.views.at(-1)!.config.expressions).toEqual(calcExpressions);
    await ds.getDistinctValues('px'); // real column → no per-row calc compute
    expect(connection.table.views.at(-1)!.config.expressions).toBeUndefined();
    ds.destroy();
  });

  // ─── P4b-2: wide-book delta gate ──────────────────────────────────

  /** Load `n` consecutive 100-row blocks (LRU order = load order). */
  const loadBlocks = async (
    ds: ReturnType<typeof makeDatasource>,
    api: GridApi,
    n: number,
  ): Promise<void> => {
    for (let i = 0; i < n; i += 1) {
      ds.getRows(loadParams(api, { startRow: i * 100, endRow: (i + 1) * 100 }));
      await flush(); // sequential loads → deterministic LRU order
    }
  };

  it('wide books sweep only the MRU visible blocks on ticks', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(600);
    connection.emit(liveState(600));
    // seedRows are 3 columns wide → threshold 3 marks the book WIDE
    const ds = makeDatasource(connection, { wideColumnThreshold: 3, sweepThrottleWideMs: 0 });
    const api = fakeApi();
    await loadBlocks(ds, api, 6);

    connection.table.rows = connection.table.rows.map((row) => ({
      ...row,
      px: (row.px as number) + 1_000_000, // every block has changes
    }));
    connection.table.fireAll();
    await flush();

    // only the WIDE_SWEEP_MAX_BLOCKS most-recent blocks were patched
    expect(api.calls.transactions).toHaveLength(WIDE_SWEEP_MAX_BLOCKS);
    const patched = new Set(
      api.calls.transactions.flatMap((t) =>
        (t.update ?? []).map((r) => Math.floor(Number(String(r.positionId).slice(3)) / 100)),
      ),
    );
    expect([...patched].sort()).toEqual([2, 3, 4, 5]); // MRU 4 of blocks 0..5
    ds.destroy();
  });

  it('narrow books keep the full sweep (every cached block patched)', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(600);
    connection.emit(liveState(600));
    const ds = makeDatasource(connection, { wideColumnThreshold: 100 });
    const api = fakeApi();
    await loadBlocks(ds, api, 6);

    connection.table.rows = connection.table.rows.map((row) => ({
      ...row,
      px: (row.px as number) + 1_000_000,
    }));
    connection.table.fireAll();
    await flush();

    expect(api.calls.transactions).toHaveLength(6);
    ds.destroy();
  });
});

describe('diffRowsByKey', () => {
  it('returns fresh rows whose key existed and whose cells changed', () => {
    const previous = [
      { positionId: 'a', px: 1 },
      { positionId: 'b', px: 2 },
    ];
    const next = [
      { positionId: 'a', px: 9 },
      { positionId: 'b', px: 2 },
      { positionId: 'c', px: 3 }, // new key — not an update
    ];
    expect(diffRowsByKey(previous, next, 'positionId')).toEqual([{ positionId: 'a', px: 9 }]);
  });
});
