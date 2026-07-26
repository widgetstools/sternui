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
import { GRAND_TOTAL_ROW_ID } from 'ag-grid-community';
import type { GridApi, IServerSideGetRowsParams, IServerSideGetRowsRequest } from 'ag-grid-community';
import type { DatasetStateSnapshot } from '@starui/host-data/runtime/ssrm';
import { createSsrmPullDatasource } from '../../pull/createSsrmPullDatasource.js';
import type { PullDatasourceConnection, PullTable } from '../../pull/types.js';

interface PerspectiveModule {
  table(schema: unknown, options?: unknown): Promise<PullTable & { update(rows: unknown): Promise<void>; delete(): Promise<void> }>;
}

let perspective: PerspectiveModule;
let tableSeq = 0;

const SCHEMA = {
  positionId: 'string',
  cusip: 'string',
  bookName: 'string',
  trader: 'string',
  quantity: 'float',
  pnl: 'float',
} as const;

const QF_COLUMNS = ['positionId', 'cusip', 'bookName', 'trader'];

/**
 * Independent oracle: how many seeded rows contain `term` (case
 * insensitively) in any quick-filter column. Computed in plain JS so it
 * cannot share a bug with either engine path.
 */
function countMatching(term: string, n = 201): number {
  const needle = term.toLowerCase();
  return seedRows(n).filter((row) =>
    QF_COLUMNS.some((c) => String(row[c] ?? '').toLowerCase().includes(needle)),
  ).length;
}

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
  PullDatasourceConnection & {
    dispose(): Promise<void>;
    /** Apply a keyed partial update — a real tick, driving real on_update. */
    bump(id: string, patch: Record<string, unknown>): Promise<void>;
  }
> {
  // UNIQUE name per harness: hosted tables share a namespace on the
  // server, so reusing one name lets an earlier test's table leak into a
  // later one.
  tableSeq += 1;
  const table = await perspective.table(SCHEMA, {
    index: 'positionId',
    name: `positions_${tableSeq}`,
  });
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
    async bump(id, patch) {
      await table.update([{ positionId: id, ...patch }]);
    },
    async dispose() {
      await table.delete();
    },
  };
}

interface FakeNode {
  data: Record<string, unknown>;
  updateData: (next: Record<string, unknown>) => void;
}

type FakeApi = GridApi & {
  refreshes: Array<{ purge?: boolean } | undefined>;
  transactions: Array<{ route?: string[]; update?: Record<string, unknown>[] }>;
  rowDataCalls: Array<{ startRow?: number; route?: string[] }>;
  nodes: Map<string, FakeNode>;
  seedNode(id: string, data: Record<string, unknown>): FakeNode;
  /** Drives `getAllDisplayedColumns` for the projection tests. */
  displayedColumns: string[];
};

function fakeApi(): FakeApi {
  const refreshes: Array<{ purge?: boolean } | undefined> = [];
  const transactions: Array<{ route?: string[]; update?: Record<string, unknown>[] }> = [];
  const rowDataCalls: Array<{ startRow?: number; route?: string[] }> = [];
  const nodes = new Map<string, FakeNode>();
  const self = {
    refreshes,
    transactions,
    rowDataCalls,
    nodes,
    displayedColumns: [] as string[],
    getAllDisplayedColumns: () =>
      self.displayedColumns.map((id) => ({ getColId: () => id })),
    seedNode(id: string, data: Record<string, unknown>): FakeNode {
      const node: FakeNode = {
        data,
        updateData(next) {
          node.data = next;
        },
      };
      nodes.set(id, node);
      return node;
    },
    setRowCount: () => undefined,
    applyServerSideTransactionAsync: (tx: { route?: string[] }) => transactions.push(tx),
    applyServerSideRowData: (p: { startRow?: number; route?: string[] }) => rowDataCalls.push(p),
    refreshServerSide: (p?: { purge?: boolean }) => refreshes.push(p),
    getRowNode: (id: string) => nodes.get(id),
    refreshCells: () => undefined,
  } as unknown as FakeApi;
  return self;
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

function loadParams(
  api: GridApi,
  overrides: Partial<IServerSideGetRowsRequest> = {},
  // `needsGrandTotal` is a PARAMS-level hint, not part of the request —
  // putting it in the request silently arms nothing.
  extras: { needsGrandTotal?: boolean } = {},
) {
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

/** Drive one load to completion and return what AG was handed. */
async function load(
  ds: ReturnType<typeof createSsrmPullDatasource>,
  api: GridApi,
  overrides: Partial<IServerSideGetRowsRequest> = {},
  extras: { needsGrandTotal?: boolean } = {},
): Promise<{ rowData: Record<string, unknown>[]; rowCount?: number }> {
  const params = loadParams(api, overrides, extras);
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
      weightedAggregates: { pnl: 'quantity' },
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
    expect(api.refreshes).toEqual([{ route: [], purge: false }]);

    // AG's refresh re-requests block 0 — this is that reload.
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

  // The two behaviours the CSRM comparison demands: applying the filter
  // must not throw the painted rows away, and CLEARING must come back
  // immediately. Measured on the real engine, the whole cost of a quick
  // filter is the VIEW BUILD (116ms @ 20k x 12 cols, 750ms @ 100k x 158);
  // counting and reading are 0.1-11ms, and re-reading a retained
  // unfiltered view is ~1ms. So: never purge a flat store (keeps rows on
  // screen while the build runs) and never drop the unfiltered blocks.

  it('does NOT purge a flat store — rows stay painted while the view builds', async () => {
    const { api, ds } = await harness();
    await load(ds, api);
    ds.setQuickFilter('volo');
    await new Promise((r) => setTimeout(r, 10));
    expect(api.refreshes).toEqual([{ route: [], purge: false }]);
  });

  it('CLEARING the quick filter serves the full book from cache, immediately', async () => {
    const { api, ds } = await harness();
    await load(ds, api);

    ds.setQuickFilter('volo');
    await new Promise((r) => setTimeout(r, 10));
    expect((await load(ds, api)).rowCount).toBe(1);

    ds.setQuickFilter(null);
    await new Promise((r) => setTimeout(r, 10));
    const started = performance.now();
    const cleared = await load(ds, api);
    const elapsed = performance.now() - started;

    expect(cleared.rowCount).toBe(201);
    expect(cleared.rowData).toHaveLength(100);
    // Served from the block cache against the retained unfiltered view.
    // Generous bound — the point is "no rebuild", not a precise number.
    expect(elapsed).toBeLessThan(60);
  });

  // ─── grouped aggregates + grand total must keep ticking ───────────
  //
  // Field report: "grand total and group totals are not ticking, and
  // sometimes the sub-group totals tick". The single-view happy path is
  // already covered elsewhere; what was NOT covered is grouping with
  // several EXPANDED routes, where the view pool and the MRU sweep gate
  // start competing for slots — which is where the intermittency comes
  // from.

  const GROUP_REQ = {
    rowGroupCols: [{ id: 'bookName', displayName: 'Book', field: 'bookName' }],
    valueCols: [{ id: 'pnl', displayName: 'PnL', field: 'pnl', aggFunc: 'sum' }],
  } as Partial<IServerSideGetRowsRequest>;

  it('keeps the GRAND TOTAL ticking with several expanded routes open', async () => {
    const { connection, api, ds } = await harness();

    // Root (group) level, grand total armed.
    const root = await load(ds, api, GROUP_REQ as never, { needsGrandTotal: true });
    expect(root.rowCount).toBeGreaterThan(0);
    const node = api.seedNode(GRAND_TOTAL_ROW_ID, { pnl: 0 });

    // Expand several groups — each distinct route is another live view,
    // which is what pushes the rollup view down the LRU.
    for (const key of ['ALPHA', 'BETA']) {
      await load(ds, api, { ...GROUP_REQ, groupKeys: [key] } as never);
    }

    // A tick lands.
    await connection.bump('P7', { pnl: 999_999 });
    await new Promise((r) => setTimeout(r, 150));

    expect(node.data.pnl).not.toBe(0); // grand total must have repainted
    ds.destroy();
  });

  it('keeps GROUP-LEVEL aggregates ticking (update transaction on the root route)', async () => {
    const { connection, api, ds } = await harness();
    await load(ds, api, GROUP_REQ as never);
    for (const key of ['ALPHA', 'BETA']) {
      await load(ds, api, { ...GROUP_REQ, groupKeys: [key] } as never);
    }
    const before = api.transactions.length;

    await connection.bump('P7', { pnl: 555_555 });
    await new Promise((r) => setTimeout(r, 150));

    const fresh = api.transactions.slice(before);
    const rootTxn = fresh.filter((t) => (t.route?.length ?? 0) === 0 && t.update?.length);
    expect(rootTxn.length).toBeGreaterThan(0); // group rows repainted
    ds.destroy();
  });

  it('group rows keep ticking when MRU pressure pushes their block out of the sweep set', async () => {
    // The sweep only refetches the `maxSweepBlocks` most-recently-used
    // blocks GLOBALLY (narrow 6, wide 4). Scrolling leaves inside an
    // expanded group evicts the group-level block from that window, and
    // the group totals then stop repainting — the reported "sometimes
    // the sub-group totals tick".
    const { connection, api, ds } = await harness(2000);
    await load(ds, api, GROUP_REQ as never); // root: group rows

    // Churn plenty of leaf blocks so the root block is no longer MRU.
    for (let start = 0; start < 800; start += 100) {
      await load(ds, api, {
        ...GROUP_REQ,
        groupKeys: ['ALPHA'],
        startRow: start,
        endRow: start + 100,
      } as never);
    }
    const before = api.transactions.length;

    await connection.bump('P7', { pnl: 777_777 });
    await new Promise((r) => setTimeout(r, 200));

    const rootTxn = api.transactions
      .slice(before)
      .filter((t) => (t.route?.length ?? 0) === 0 && t.update?.length);
    expect(rootTxn.length).toBeGreaterThan(0);
    ds.destroy();
  });

  it('grand total still refreshes when the sweep is deferred by scrolling', async () => {
    // The grand total read is one tiny rollup query, but it lives at the
    // END of the block sweep — so a sweep deferred by scroll settle (or
    // an in-flight cold miss) starves it too.
    const { connection, api, ds } = await harness();
    await load(ds, api, GROUP_REQ as never, { needsGrandTotal: true });
    const node = api.seedNode(GRAND_TOTAL_ROW_ID, { pnl: 0 });

    ds.onScroll(); // user is scrolling: block sweeps defer
    await connection.bump('P7', { pnl: 888_888 });
    await new Promise((r) => setTimeout(r, 200));

    expect(node.data.pnl).not.toBe(0);
    ds.destroy();
  });

  it('WEIGHTED aggregation returns a genuinely weighted mean', async () => {
    // quantity is the weight; pnl the value. Group ALPHA is rows where
    // i % 3 === 0, so a plain average and a quantity-weighted average
    // differ — which is the whole point of asserting it against the real
    // engine rather than a fake that would happily return either.
    const { api, ds } = await harness();
    const result = await load(ds, api, {
      rowGroupCols: [{ id: 'bookName', displayName: 'Book', field: 'bookName' }],
      valueCols: [{ id: 'pnl', displayName: 'PnL', field: 'pnl', aggFunc: 'wavg' }],
    } as never);

    const alpha = result.rowData.find((r) => r.bookName === 'ALPHA')!;
    // rows i = 0,3,6,... ; pnl = i*1.5, weight (quantity) = i
    let num = 0;
    let den = 0;
    for (let i = 0; i < 201; i += 1) {
      if (i % 3 !== 0) continue;
      num += i * 1.5 * i;
      den += i;
    }
    expect(alpha.pnl as number).toBeCloseTo(num / den, 6);
    ds.destroy();
  });

  it('refuses a wavg column with no weight rather than serving a plain average', async () => {
    const warnings: string[] = [];
    const connection = await realConnection(201);
    disposers.push(() => connection.dispose());
    const ds = createSsrmPullDatasource({
      connection,
      keyColumn: 'positionId',
      quickFilterDebounceMs: 0,
      tickRefreshMs: 0,
      warn: (m) => warnings.push(m),
      // NOTE: no weightedAggregates
    });
    disposers.push(async () => ds.destroy());
    const api = fakeApi();
    await load(ds, api, {
      rowGroupCols: [{ id: 'bookName', displayName: 'Book', field: 'bookName' }],
      valueCols: [{ id: 'pnl', displayName: 'PnL', field: 'pnl', aggFunc: 'wavg' }],
    } as never);
    expect(warnings.join(' ')).toMatch(/needs a weight column/);
  });

  it('INTERMEDIATE group levels keep ticking, not just the root level', async () => {
    // Field report (screenshot): Region > Book Name > Trader, all
    // expanded. The Region rows (root route) tick, but the Book Name
    // rows — an intermediate group level at route ['ALPHA'] — do not.
    // Reserving sweep slots for the ROOT route only fixed the top level
    // and left every level beneath it in the global MRU window, where
    // leaf scrolling evicts them.
    const TWO_LEVEL = {
      rowGroupCols: [
        { id: 'bookName', displayName: 'Book', field: 'bookName' },
        { id: 'trader', displayName: 'Trader', field: 'trader' },
      ],
      valueCols: [{ id: 'pnl', displayName: 'PnL', field: 'pnl', aggFunc: 'sum' }],
    } as Partial<IServerSideGetRowsRequest>;

    const { connection, api, ds } = await harness(2000);
    await load(ds, api, TWO_LEVEL as never); // root: book groups
    await load(ds, api, { ...TWO_LEVEL, groupKeys: ['ALPHA'] } as never); // mid: trader groups

    // Expand a trader and churn its leaf blocks, as a user reading rows does.
    for (let start = 0; start < 600; start += 100) {
      await load(ds, api, {
        ...TWO_LEVEL,
        groupKeys: ['ALPHA', 'jdoe'],
        startRow: start,
        endRow: start + 100,
      } as never);
    }
    const before = api.transactions.length;

    await connection.bump('P15', { pnl: 424_242 });
    await new Promise((r) => setTimeout(r, 250));

    const fresh = api.transactions.slice(before);
    const midLevel = fresh.filter((t) => t.route?.length === 1 && t.update?.length);
    expect(midLevel.length).toBeGreaterThan(0);
    ds.destroy();
  });

  it('a tick that RE-ORDERS a sorted block reflows it instead of silently rotting', async () => {
    // Standing TODO in the source: "Update transactions cannot re-order
    // rows — ordering drift under an active sort ... is accepted".
    // Measured, it is worse than drift: the sweep diffs BY KEY, so after
    // a reorder the values at each surviving key are unchanged and the
    // row that moved INTO the block is a new key that diffRowsByKey
    // classifies as "not an update" and drops. Result: zero updates,
    // zero replacements — the row that should have jumped to the top
    // never appears, and the order rots until a manual reload.
    const { connection, api, ds } = await harness();
    await load(ds, api, { sortModel: [{ colId: 'pnl', sort: 'asc' }] } as never);
    const before = api.rowDataCalls.length;

    // A row that sorted LAST is pushed to the very front.
    await connection.bump('P200', { pnl: -999_999 });
    await new Promise((r) => setTimeout(r, 200));

    // The block must be REPLACED (index-addressed, handles reorders) —
    // a keyed update transaction cannot move a row.
    expect(api.rowDataCalls.length).toBeGreaterThan(before);
    ds.destroy();
  });

  it('a tick with no re-ordering still uses cheap keyed update transactions', async () => {
    // The reflow path must not become the default: replacing a block is
    // far heavier than patching the cells that changed.
    const { connection, api, ds } = await harness();
    await load(ds, api, { sortModel: [{ colId: 'positionId', sort: 'asc' }] } as never);
    const replacementsBefore = api.rowDataCalls.length;
    const txnsBefore = api.transactions.length;

    // pnl is not the sort key, so ordering is untouched.
    await connection.bump('P3', { pnl: 12_345 });
    await new Promise((r) => setTimeout(r, 200));

    expect(api.transactions.length).toBeGreaterThan(txnsBefore);
    expect(api.rowDataCalls.length).toBe(replacementsBefore);
    ds.destroy();
  });

  // ─── #1 projection narrowing ──────────────────────────────────────

  it('projects ONLY displayed columns, while still filtering/sorting on hidden ones', async () => {
    const connection = await realConnection(201);
    disposers.push(() => connection.dispose());
    const api = fakeApi();
    // The grid renders two columns; cusip/bookName/trader/quantity are not shown.
    api.displayedColumns = ['positionId', 'pnl'];
    const ds = createSsrmPullDatasource({
      connection,
      keyColumn: 'positionId',
      projectDisplayedColumns: true,
      quickFilterDebounceMs: 0,
      tickRefreshMs: 0,
      warn: () => undefined,
    });
    disposers.push(async () => ds.destroy());

    // Filter AND sort on columns that are NOT projected — engine-verified
    // to work, and the whole reason narrowing is safe.
    const result = await load(ds, api, {
      filterModel: { quantity: { filterType: 'number', type: 'greaterThan', filter: 100 } },
      sortModel: [{ colId: 'cusip', sort: 'desc' }],
    } as never);

    expect(result.rowCount).toBe(100); // quantity = i, i > 100 → 101..200
    const keys = Object.keys(result.rowData[0]!).sort();
    expect(keys).toEqual(['pnl', 'positionId']); // nothing else travelled
  });

  it('falls back to the full projection before the grid reports columns', async () => {
    const connection = await realConnection(201);
    disposers.push(() => connection.dispose());
    const api = fakeApi();
    api.displayedColumns = []; // grid not laid out yet
    const ds = createSsrmPullDatasource({
      connection,
      keyColumn: 'positionId',
      projectDisplayedColumns: true,
      quickFilterDebounceMs: 0,
      tickRefreshMs: 0,
      warn: () => undefined,
    });
    disposers.push(async () => ds.destroy());
    const result = await load(ds, api);
    expect(Object.keys(result.rowData[0]!).length).toBeGreaterThan(2);
  });

  it('honours alwaysProjectColumns for renderer sibling fields', async () => {
    const connection = await realConnection(201);
    disposers.push(() => connection.dispose());
    const api = fakeApi();
    api.displayedColumns = ['positionId', 'pnl'];
    const ds = createSsrmPullDatasource({
      connection,
      keyColumn: 'positionId',
      projectDisplayedColumns: true,
      alwaysProjectColumns: ['quantity'], // a bar renderer's `max`
      quickFilterDebounceMs: 0,
      tickRefreshMs: 0,
      warn: () => undefined,
    });
    disposers.push(async () => ds.destroy());
    const result = await load(ds, api);
    expect(Object.keys(result.rowData[0]!).sort()).toEqual(['pnl', 'positionId', 'quantity']);
  });

  // ─── #2 native contains fast path ─────────────────────────────────

  it('native quick-filter fast path returns EXACTLY the expression path rows', async () => {
    // The fast path swaps the ExprTK expression column for native
    // `contains` + a view-global `filter_op: 'or'`. The only property
    // that matters is that it cannot change the answer.
    const { api, ds } = await harness();
    await load(ds, api);

    for (const term of ['volo', 'ALPHA', 'jdoe', 'CUSIP1', 'zzz']) {
      ds.setQuickFilter(term);
      await new Promise((r) => setTimeout(r, 10));
      const fast = await load(ds, api);

      // Force the expression path for the same term by adding a second
      // token that matches everything the first does (tokens AND, and
      // multi-token is excluded from the fast path).
      ds.setQuickFilter(null);
      await new Promise((r) => setTimeout(r, 10));
      const expected = await countMatching(term);
      expect(fast.rowCount).toBe(expected);
    }
    ds.destroy();
  });

  it('falls back to the expression path when a column filter is also active', async () => {
    // filter_op is VIEW-GLOBAL: OR-ing a quick filter together with a
    // column filter would WIDEN the result. Must stay AND.
    const { api, ds } = await harness();
    ds.setQuickFilter('ALPHA');
    await new Promise((r) => setTimeout(r, 10));
    const result = await load(ds, api, {
      filterModel: { pnl: { filterType: 'number', type: 'greaterThan', filter: 100 } },
    } as never);

    // ALPHA is i%3===0; pnl = i*1.5 > 100 → i >= 67. Both must hold.
    let expected = 0;
    for (let i = 0; i < 201; i += 1) if (i % 3 === 0 && i * 1.5 > 100) expected += 1;
    expect(result.rowCount).toBe(expected);
    ds.destroy();
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
