import { describe, expect, it, vi } from 'vitest';
import type { GridApi, IServerSideGetRowsParams, IServerSideGetRowsRequest } from 'ag-grid-community';
import type { DatasetStateSnapshot } from '@starui/host-data/runtime/ssrm';
import { createSsrmPullDatasource, diffRowsByKey } from '../../pull/createSsrmPullDatasource.js';
import type {
  PullDatasourceConnection,
  PullTable,
  PullView,
  PullViewConfig,
} from '../../pull/types.js';

// ─── fakes ───────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

class FakeView implements PullView {
  readonly config: PullViewConfig;
  readonly table: FakeTable;
  readonly updateCallbacks = new Map<number, () => void>();
  deleted = false;
  private nextCallbackId = 1;

  constructor(table: FakeTable, config: PullViewConfig) {
    this.table = table;
    this.config = config;
  }

  async num_rows(): Promise<number> {
    return this.table.rows.length;
  }

  async to_json(window?: { start_row?: number; end_row?: number }): Promise<Row[]> {
    const start = window?.start_row ?? 0;
    const end = window?.end_row ?? this.table.rows.length;
    return this.table.rows.slice(start, end).map((row) => ({ ...row }));
  }

  async on_update(callback: () => void): Promise<number> {
    const id = this.nextCallbackId++;
    this.updateCallbacks.set(id, callback);
    return id;
  }

  async remove_update(id: number): Promise<void> {
    this.updateCallbacks.delete(id);
  }

  async delete(): Promise<void> {
    this.deleted = true;
    this.updateCallbacks.clear();
  }

  fireUpdate(): void {
    for (const callback of this.updateCallbacks.values()) callback();
  }
}

class FakeTable implements PullTable {
  rows: Row[] = [];
  readonly views: FakeView[] = [];

  async view(config?: PullViewConfig): Promise<PullView> {
    const view = new FakeView(this, config ?? {});
    this.views.push(view);
    return view;
  }

  async size(): Promise<number> {
    return this.rows.length;
  }
}

class FakeConnection implements PullDatasourceConnection {
  state: DatasetStateSnapshot | null = null;
  readonly table = new FakeTable();
  private readonly listeners = new Set<(s: DatasetStateSnapshot) => void>();
  openTableCalls = 0;
  private tableGate: Promise<void> = Promise.resolve();
  private releaseGate: (() => void) | null = null;

  onState(listener: (s: DatasetStateSnapshot) => void): () => void {
    this.listeners.add(listener);
    if (this.state) listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async openTable(): Promise<PullTable> {
    this.openTableCalls += 1;
    await this.tableGate;
    return this.table;
  }

  emit(state: DatasetStateSnapshot): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener(state);
  }

  /** Make openTable hang until releaseTable() — for fencing tests. */
  holdTable(): void {
    this.tableGate = new Promise((resolve) => {
      this.releaseGate = resolve;
    });
  }

  releaseTable(): void {
    this.releaseGate?.();
    this.releaseGate = null;
  }
}

function fakeApi(): GridApi & {
  calls: {
    setRowCount: Array<[number, boolean | undefined]>;
    transactions: Array<{ update?: Row[] }>;
    rowData: Array<{ startRow?: number; successParams: { rowData: Row[]; rowCount?: number } }>;
    refreshes: Array<{ purge?: boolean } | undefined>;
  };
} {
  const calls = {
    setRowCount: [] as Array<[number, boolean | undefined]>,
    transactions: [] as Array<{ update?: Row[] }>,
    rowData: [] as Array<{ startRow?: number; successParams: { rowData: Row[]; rowCount?: number } }>,
    refreshes: [] as Array<{ purge?: boolean } | undefined>,
  };
  return {
    calls,
    setRowCount: (count: number, known?: boolean) => calls.setRowCount.push([count, known]),
    applyServerSideTransactionAsync: (txn: { update?: Row[] }) => calls.transactions.push(txn),
    applyServerSideRowData: (p: never) => calls.rowData.push(p),
    refreshServerSide: (p?: { purge?: boolean }) => calls.refreshes.push(p),
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
): IServerSideGetRowsParams & { success: ReturnType<typeof vi.fn>; fail: ReturnType<typeof vi.fn> } {
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

const flush = async (times = 4): Promise<void> => {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const seedRows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ positionId: `POS${i}`, px: i * 10, pnl: i }));

function liveState(rowCount: number, generation = 1): DatasetStateSnapshot {
  return { phase: 'live', rowCount, generation };
}

function makeDatasource(connection: FakeConnection, overrides = {}) {
  return createSsrmPullDatasource({
    connection,
    keyColumn: 'positionId',
    tickRefreshMs: 0,
    seedCountRefreshMs: 0,
    warn: () => undefined,
    ...overrides,
  });
}

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

  it('fails group-level requests with a typed P4 TODO', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(10);
    connection.emit(liveState(10));
    const warnings: string[] = [];
    const ds = makeDatasource(connection, { warn: (m: string) => warnings.push(m) });
    const params = loadParams(fakeApi(), {
      rowGroupCols: [{ id: 'desk', displayName: 'Desk', field: 'desk' }],
    });
    ds.getRows(params);
    await flush();
    expect(params.fail).toHaveBeenCalledTimes(1);
    expect(warnings.some((w) => w.includes('P4'))).toBe(true);
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
