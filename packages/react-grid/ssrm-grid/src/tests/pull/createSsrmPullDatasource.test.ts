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
import { NARROW_SWEEP_MAX_BLOCKS, WIDE_SWEEP_MAX_BLOCKS } from '../../pull/sweepGate.js';
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

  // rowCount rides EVERY success (AG 36: an ungated assignment followed
  // by the past-the-end node cleanup, so the store self-corrects in both
  // directions and sheds orphans). Growth between loads uses the ONE-ARG
  // setRowCount — the only count channel that leaves `isLastRowKnown`
  // untouched, so it can neither arm the sort deadlock nor append the
  // phantom discovery row the two-arg `false` variant adds.
  it('sends rowCount on every success, including mid-seed', async () => {
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
    expect(arg.rowCount).toBe(37);
    // never the trap form
    expect(api.calls.setRowCount.some(([, known]) => known === true)).toBe(false);
    ds.destroy();
  });

  it('grows the AG row count from seeding events via the one-arg form', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(10);
    connection.emit({ phase: 'seeding', rowCount: 10, generation: 1 });
    const ds = makeDatasource(connection);
    const api = fakeApi();
    ds.getRows(loadParams(api));
    await flush();
    connection.emit({ phase: 'seeding', rowCount: 5000, generation: 1 });
    await flush();
    expect(api.calls.setRowCount).toContainEqual([5000, undefined]);
    ds.destroy();
  });

  it('never SHRINKS through setRowCount (it strands orphan row nodes)', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(500);
    connection.emit(liveState(500, 1));
    const ds = makeDatasource(connection);
    const api = fakeApi();
    ds.getRows(loadParams(api));
    await flush();
    // The book collapses. The count must come down through
    // success({rowCount}) — which runs AG's past-the-end cleanup — and
    // never through setRowCount, which performs no cleanup in either
    // variant and leaves orphans driving negative display indices.
    connection.table.rows = seedRows(4);
    connection.emit(liveState(4, 1));
    ds.getRows(loadParams(api, { startRow: 0, endRow: 100 }));
    await flush();
    expect(api.calls.setRowCount.filter(([n]) => n < 500)).toEqual([]);
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

  // ─── the getRows termination contract ─────────────────────────────
  //
  // AG Grid 36 increments a GRID-GLOBAL `outboundRequests` counter before
  // calling getRows and decrements it ONLY from success/fail. With
  // `maxConcurrentDatasourceRequests` defaulting to 2, two unanswered
  // calls zero the grid's load bandwidth permanently — for every store,
  // and a purge does not recover it. Sorting and filtering then silently
  // stop working. Every path out of getRows MUST answer exactly once.
  //
  // (These tests replace one that asserted the opposite — it required
  // "no success, no fail" on a stale generation, which is the bug.)

  /** Total answers delivered — the invariant is always exactly 1. */
  const answerCount = (p: { success: { mock: { calls: unknown[] } }; fail: { mock: { calls: unknown[] } } }): number =>
    p.success.mock.calls.length + p.fail.mock.calls.length;

  it('answers exactly once when the generation goes stale mid-flight', async () => {
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
    expect(answerCount(params)).toBe(1);
    ds.destroy();
  });

  it('answers exactly once when destroyed while parked waiting for state', async () => {
    const connection = new FakeConnection();
    // Never leaves `connecting`: the load parks in stateWhere. Before the
    // fix this waiter was never settled and the slot was lost forever.
    connection.emit({ phase: 'connecting', rowCount: 0, generation: 1 });
    const ds = makeDatasource(connection);
    const params = loadParams(fakeApi());
    ds.getRows(params);
    await flush();
    expect(answerCount(params)).toBe(0); // still legitimately waiting
    ds.destroy();
    await flush();
    expect(answerCount(params)).toBe(1);
  });

  it('answers exactly once when the query shape changes mid-read', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(100);
    connection.emit(liveState(100, 1));
    connection.holdTable();
    const ds = makeDatasource(connection, { quickFilterDebounceMs: 0 });
    const params = loadParams(fakeApi());
    ds.getRows(params);
    await flush();
    ds.setQuickFilter('POS1'); // bumps the plan epoch under the in-flight read
    connection.releaseTable();
    await flush();
    expect(answerCount(params)).toBe(1);
    ds.destroy();
  });

  it('answers every one of a burst of loads across repeated shape churn', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(500);
    connection.emit(liveState(500, 1));
    const ds = makeDatasource(connection, { quickFilterDebounceMs: 0 });
    const loads = [0, 100, 200, 300].map((startRow) =>
      loadParams(fakeApi(), { startRow, endRow: startRow + 100 }),
    );
    for (const params of loads) ds.getRows(params);
    // Churn the shape while they are all in flight.
    ds.setQuickFilter('POS');
    ds.setQuickFilter('POS1');
    ds.setQuickFilter(null);
    await flush(8);
    for (const params of loads) expect(answerCount(params)).toBe(1);
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
    // Steady tick, count unchanged → no resize at all. The sweep only
    // ever GROWS the count, and never through the trap form.
    expect(api.calls.setRowCount).toEqual([]);
    ds.destroy();
  });

  it('grows the flat root count from a tick that adds keys', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(50);
    connection.emit(liveState(50));
    const ds = makeDatasource(connection);
    const api = fakeApi();
    ds.getRows(loadParams(api, { startRow: 0, endRow: 50 }));
    await flush();

    connection.table.rows = seedRows(70); // live inserts
    connection.emit(liveState(70));
    connection.table.views[0]!.fireUpdate();
    await flush();

    expect(api.calls.setRowCount).toContainEqual([70, undefined]); // one-arg
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

  it('folds the quick filter into the plan and PURGES the root store', async () => {
    const connection = new FakeConnection();
    connection.table.rows = bookRows(9);
    connection.emit(liveState(9));
    const ds = makeDatasource(connection, { quickFilterColumns: ['book', 'positionId'] });
    const api = fakeApi();
    ds.getRows(loadParams(api));
    await flush();

    ds.setQuickFilter('bookA');
    // A quick-filter change is a MEMBERSHIP change: every cached block
    // index is meaningless, so the root store is purged — the same thing
    // AG's own column-filter path does. One request, not one per block.
    expect(api.calls.refreshes).toEqual([{ route: [], purge: true }]);
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
      expect(api.calls.refreshes).toEqual([{ route: [], purge: true }]); // exactly one

      // Re-setting the SAME settled value must not refresh again.
      ds.setQuickFilter('BOOK003');
      vi.advanceTimersByTime(300);
      expect(api.calls.refreshes).toEqual([{ route: [], purge: true }]);

      // destroy() cancels a pending apply.
      ds.setQuickFilter('other');
      ds.destroy();
      vi.advanceTimersByTime(300);
      expect(api.calls.refreshes).toEqual([{ route: [], purge: true }]);
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

  it('narrow books sweep only the NARROW_SWEEP_MAX_BLOCKS MRU blocks (never every cached block)', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(900);
    connection.emit(liveState(900));
    const ds = makeDatasource(connection, { wideColumnThreshold: 100 });
    const api = fakeApi();
    await loadBlocks(ds, api, 8); // 8 cached blocks > the narrow budget

    connection.table.rows = connection.table.rows.map((row) => ({
      ...row,
      px: (row.px as number) + 1_000_000, // every block has changes
    }));
    connection.table.fireAll();
    await flush();

    expect(api.calls.transactions).toHaveLength(NARROW_SWEEP_MAX_BLOCKS);
    const patched = new Set(
      api.calls.transactions.flatMap((t) =>
        (t.update ?? []).map((r) => Math.floor(Number(String(r.positionId).slice(3)) / 100)),
      ),
    );
    expect([...patched].sort()).toEqual([2, 3, 4, 5, 6, 7]); // MRU 6 of blocks 0..7
    ds.destroy();
  });

  // ─── perf hardening: epoch fence, sweep deferral, prefetch ────────

  it('plan-epoch fence: a quick-filter change mid-read drops the stale block and re-serves the new shape', async () => {
    const connection = new FakeConnection();
    connection.table.rows = bookRows(9);
    connection.emit(liveState(9));
    connection.holdTable(); // the first read hangs at openTable
    const ds = makeDatasource(connection, { quickFilterColumns: ['book'] });
    const api = fakeApi();
    const params = loadParams(api);
    ds.getRows(params);
    await flush();
    expect(params.success).not.toHaveBeenCalled(); // still held

    ds.setQuickFilter('bookA'); // shape changes UNDER the in-flight read
    connection.releaseTable();
    await flush();

    // answered exactly once, with the CURRENT (quick-filtered) shape —
    // the stale unfiltered read was dropped, never painted, never cached
    expect(params.success).toHaveBeenCalledTimes(1);
    expect(params.fail).not.toHaveBeenCalled();
    const servedView = connection.table.views.at(-1)!;
    expect(servedView.config.filter).toEqual([[QUICK_FILTER_EXPR, '==', true]]);
    expect(ds.getStats().droppedStale).toBeGreaterThanOrEqual(1);
    expect(api.calls.rowData).toEqual([]); // no stale block replacement
    ds.destroy();
  });

  it('plan-epoch fence: serve-then-refresh from a superseded shape never paints', async () => {
    const connection = new FakeConnection();
    connection.table.rows = bookRows(9);
    connection.emit(liveState(9));
    const ds = makeDatasource(connection, { quickFilterColumns: ['book'] });
    const api = fakeApi();
    ds.getRows(loadParams(api)); // block cached under the unfiltered shape
    await flush();

    // Cache-hit load starts the background refresh, THEN the shape flips
    // before the refresh lands (the refresh's awaits are still queued):
    // its applyServerSideRowData must be dropped.
    const second = loadParams(api);
    ds.getRows(second);
    expect(second.success).toHaveBeenCalledTimes(1); // cache hit, synchronous
    ds.setQuickFilter('bookA'); // bump the epoch under the in-flight refresh
    await flush();

    expect(api.calls.rowData).toEqual([]); // stale refresh dropped
    expect(ds.getStats().droppedStale).toBeGreaterThanOrEqual(1);
    ds.destroy();
  });

  it('defers the tick sweep while scrolling and coalesces to ONE sweep on settle', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(50);
    connection.emit(liveState(50));
    const ds = makeDatasource(connection, { scrollSettleMs: 40 });
    const api = fakeApi();
    ds.getRows(loadParams(api, { startRow: 0, endRow: 50 }));
    await flush();

    connection.table.rows = connection.table.rows.map((row) =>
      row.positionId === 'POS3' ? { ...row, px: 999 } : row,
    );
    ds.onScroll(); // user is scrolling
    connection.table.views[0]!.fireUpdate();
    connection.table.views[0]!.fireUpdate(); // several ticks mid-scroll
    await flush();
    expect(api.calls.transactions).toEqual([]); // no sweep reads mid-scroll
    expect(ds.getStats().sweepDeferrals).toBeGreaterThanOrEqual(1);
    expect(ds.getStats().sweepBlockReads).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 80)); // settle window passes
    await flush();
    expect(ds.getStats().sweepRuns).toBe(1); // ONE coalesced sweep — ticks not starved
    expect(api.calls.transactions).toHaveLength(1);
    expect(api.calls.transactions[0]!.update).toEqual([{ positionId: 'POS3', px: 999, pnl: 3 }]);
    ds.destroy();
  });

  it('skips the sweep cycle while a cold getRows miss is in flight', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(300);
    connection.emit(liveState(300));
    const ds = makeDatasource(connection);
    const api = fakeApi();
    ds.getRows(loadParams(api)); // block 0 cached
    await flush();
    const statsBefore = ds.getStats();

    connection.holdTable();
    // A DIFFERENT shape forces a fresh view → openTable → held = a
    // pending user miss.
    ds.getRows(loadParams(api, { sortModel: [{ colId: 'px', sort: 'desc' }] }));
    await flush();
    connection.table.fireAll(); // tick lands while the miss is pending
    await flush();
    expect(ds.getStats().sweepBlockReads).toBe(statsBefore.sweepBlockReads); // sweep yielded
    expect(ds.getStats().sweepDeferrals).toBeGreaterThanOrEqual(1);

    connection.releaseTable();
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 80)); // settle retry (min 50ms)
    await flush();
    expect(ds.getStats().sweepBlockReads).toBeGreaterThan(statsBefore.sweepBlockReads);
    ds.destroy();
  });

  it('prefetches the neighbor block after a cold flat miss — the next scroll block is a cache hit', async () => {
    const connection = new FakeConnection();
    connection.table.rows = seedRows(300);
    connection.emit(liveState(300));
    const ds = makeDatasource(connection);
    const api = fakeApi();
    ds.getRows(loadParams(api)); // cold miss 0..100 → prefetch 100..200
    await flush();
    expect(ds.getStats().missReads).toBe(1);
    expect(ds.getStats().prefetchReads).toBe(1); // startRow-100 is out of range

    const next = loadParams(api, { startRow: 100, endRow: 200 });
    ds.getRows(next);
    // prefetched → served synchronously from cache, NOT a cold miss
    expect(next.success).toHaveBeenCalledTimes(1);
    expect(ds.getStats().missReads).toBe(1);
    const served = next.success.mock.calls[0]![0] as { rowData: Row[] };
    expect(served.rowData[0]).toEqual({ positionId: 'POS100', px: 1000, pnl: 100 });
    ds.destroy();
  });

  it('pre-warms the new-shape view on quick-filter apply, before any load arrives', async () => {
    const connection = new FakeConnection();
    connection.table.rows = bookRows(9);
    connection.emit(liveState(9));
    const ds = makeDatasource(connection, { quickFilterColumns: ['book'] });
    const api = fakeApi();
    ds.getRows(loadParams(api));
    await flush();
    expect(connection.table.views).toHaveLength(1);

    ds.setQuickFilter('bookA'); // apply only — NO getRows issued yet
    await flush();
    // the quick-filtered view already exists (built during AG's refresh
    // cycle), so the first post-change block read skips view construction
    const warmed = connection.table.views.at(-1)!;
    expect(warmed.config.filter).toEqual([[QUICK_FILTER_EXPR, '==', true]]);

    ds.getRows(loadParams(api)); // the real load REUSES the warmed view
    await flush();
    expect(connection.table.views).toHaveLength(2);
    ds.destroy();
  });

  it('never prefetches for group-level plans', async () => {
    const connection = new FakeConnection();
    connection.table.rows = bookRows(9);
    connection.emit(liveState(9));
    const ds = makeDatasource(connection);
    ds.getRows(loadParams(fakeApi(), GROUP_REQUEST));
    await flush();
    expect(ds.getStats().prefetchReads).toBe(0);
    ds.destroy();
  });

  it('narrows via success({rowCount}) alone — no setRowCount, no redrawRows', async () => {
    // Previously a shrink went through setRowCount(n, true) plus a
    // redrawRows() band-aid: setRowCount does no past-the-end node
    // cleanup, so orphan nodes survived and painted over a correct
    // model, and the `true` flag armed the sort deadlock. The shrink now
    // rides success({rowCount}), which cleans up on AG's own path.
    const connection = new FakeConnection();
    connection.table.rows = seedRows(100);
    connection.emit(liveState(100));
    const ds = makeDatasource(connection);
    const api = fakeApi();
    const redrawRows = vi.fn();
    (api as unknown as { redrawRows: () => void }).redrawRows = redrawRows;
    ds.getRows(loadParams(api)); // total 100
    await flush();
    connection.table.fireAll(); // steady tick — total unchanged
    await flush();

    // filter narrows the set → the count shrinks
    const narrowed = loadParams(api, {
      filterModel: { pnl: { filterType: 'number', type: 'greaterThan', filter: 90 } },
    });
    ds.getRows(narrowed);
    await flush();

    const arg = narrowed.success.mock.calls[0]![0] as { rowCount?: number };
    expect(arg.rowCount).toBe(9); // pnl 91..99
    expect(redrawRows).not.toHaveBeenCalled();
    expect(api.calls.setRowCount.filter(([n]) => n < 100)).toEqual([]);
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
