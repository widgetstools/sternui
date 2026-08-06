import { describe, expect, it, vi } from 'vitest';
import {
  createSsrmEngineRowEngine,
  SSRM_GRAND_TOTAL_FLAG,
  SSRM_GRAND_TOTAL_ROW_ID,
  type SsrmEngineClientLike,
  type SsrmGridApiLike,
} from './rowEngine.js';
import { SsrmEngineClient } from './worker/SsrmEngineClient.js';
import type { SsrmGetRowsRequest, SsrmRow } from './types.js';

/**
 * The row engine a MarketsGrid surface mounts, against a fake client and a fake
 * grid.
 *
 * Every case here is one the Perspective path had to learn the hard way, and
 * the comments say which — a check whose reason is "it seemed right" is the one
 * that gets deleted the next time it is inconvenient.
 */

interface FakeClient extends SsrmEngineClientLike {
  push(delta: { rows: SsrmRow[]; removed: unknown[]; size: number }): void;
  calls: {
    getRows: SsrmGetRowsRequest[];
    grandTotal: SsrmGetRowsRequest[];
    countFiltered: SsrmGetRowsRequest[];
    applyUpdate: SsrmRow[][];
  };
}

function fakeClient(overrides: Partial<SsrmEngineClientLike> = {}): FakeClient {
  const listeners = new Set<(d: { rows: SsrmRow[]; removed: unknown[]; size: number }) => void>();
  const calls: FakeClient['calls'] = {
    getRows: [],
    grandTotal: [],
    countFiltered: [],
    applyUpdate: [],
  };
  const base: SsrmEngineClientLike = {
    size: 20_000,
    async getRows(request) {
      calls.getRows.push(request);
      return { rowData: [{ id: 'r0' }], rowCount: 1 };
    },
    async grandTotal(request) {
      calls.grandTotal.push(request);
      return { pnl: 42 };
    },
    async countFiltered(request) {
      calls.countFiltered.push(request);
      return 20_000;
    },
    async distinctValues() {
      return ['a', 'b'];
    },
    async setQuickFilter() {
      return true;
    },
    async setCalcColumns() {
      return true;
    },
    async calcDiagnostics() {
      return [];
    },
    async setViewport() {},
    async applyUpdate(rows) {
      calls.applyUpdate.push(rows);
      return { changed: rows.map((r) => r.id), removed: [] };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return Object.assign(base, overrides, {
    calls,
    push(delta: { rows: SsrmRow[]; removed: unknown[]; size: number }) {
      for (const listener of listeners) listener(delta);
    },
  }) as FakeClient;
}

function fakeApi(overrides: Partial<SsrmGridApiLike> = {}) {
  const transactions: { update?: unknown[]; remove?: unknown[] }[] = [];
  const refreshes: { route?: string[]; purge?: boolean }[] = [];
  const rowCounts: number[] = [];
  const nodes = new Map<string, { data?: unknown }>();
  const api: SsrmGridApiLike = {
    getRowNode: (id) => nodes.get(id) ?? null,
    applyServerSideTransaction: (tx) => {
      transactions.push(tx);
      return null;
    },
    refreshServerSide: (params) => {
      refreshes.push(params);
    },
    setRowCount: (rows) => {
      rowCounts.push(rows);
    },
    isDestroyed: () => false,
    // A grid WITH a totals row, because that is what the grand-total cases are
    // about. The engine asks the grid rather than being told, so a fake without
    // this answers "no total" — see the case that asserts a grid without one
    // pays nothing.
    getGridOption: (key: string) => (key === 'grandTotalRow' ? 'pinnedBottom' : undefined),
    ...overrides,
  };
  return { api, transactions, refreshes, rowCounts, nodes };
}

/** One block, awaited. */
function readBlock(
  engine: ReturnType<typeof createSsrmEngineRowEngine>,
  request: SsrmGetRowsRequest,
): Promise<{ rowData: SsrmRow[]; rowCount: number; grandTotalData?: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    engine.datasource.getRows({
      request,
      success: (result) => resolve(result),
      fail: () => reject(new Error('block failed')),
    });
  });
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('the grand total row', () => {
  /**
   * `grandTotalData` CREATES the row and does NOT update it. MEASURED on the
   * Perspective path: five fresh totals over five non-purging refreshes left
   * the row showing the first. Both paths are needed and they answer different
   * moments — this is the first one.
   */
  it('rides out on a ROOT block, captioned on the key column', async () => {
    const client = fakeClient();
    const engine = createSsrmEngineRowEngine({ client, keyColumn: 'positionId' });
    engine.setApi(fakeApi().api);
    const result = await readBlock(engine, { startRow: 0, endRow: 100 });

    expect(result.grandTotalData).toEqual({
      pnl: 42,
      // The key column is the one AG never hides; a grouped column disappears
      // and the auto-group column renders nothing for a total row.
      positionId: 'GRAND TOTAL',
      [SSRM_GRAND_TOTAL_FLAG]: true,
    });
    engine.close();
  });

  /**
   * MEASURED, and it is why this check exists rather than the total being
   * fetched unconditionally: on the lab's 20,000-row book with no totals row,
   * fetching it anyway took AG's end-to-end `getRows` from a 2.6-3.2 ms median
   * to a 69 ms p90 — a whole-book aggregate on every root block, awaited before
   * the rows settle, for a row that does not exist.
   */
  it('is not even FETCHED when the grid has no totals row', async () => {
    const client = fakeClient();
    const engine = createSsrmEngineRowEngine({ client, keyColumn: 'positionId' });
    engine.setApi(fakeApi({ getGridOption: () => undefined }).api);
    const result = await readBlock(engine, { startRow: 0, endRow: 100 });

    expect(result.grandTotalData).toBeUndefined();
    expect(client.calls.grandTotal).toHaveLength(0);
    engine.close();
  });

  it('is absent on a CHILD level — a group has no grand total', async () => {
    const client = fakeClient();
    const engine = createSsrmEngineRowEngine({ client, keyColumn: 'positionId' });
    engine.setApi(fakeApi().api);
    const result = await readBlock(engine, {
      startRow: 0,
      endRow: 100,
      rowGroupCols: [{ id: 'desk' }],
      groupKeys: ['Rates'],
    });
    expect(result.grandTotalData).toBeUndefined();
    expect(client.calls.grandTotal).toHaveLength(0);
    engine.close();
  });

  it('is kept live by a TRANSACTION, which is the other half of the rule', async () => {
    const client = fakeClient();
    const engine = createSsrmEngineRowEngine({
      client,
      keyColumn: 'positionId',
      countMinIntervalMs: 0,
    });
    const { api, transactions, nodes } = fakeApi();
    // The row exists — AG created it from the block above.
    nodes.set(SSRM_GRAND_TOTAL_ROW_ID, { data: {} });
    engine.setApi(api);
    await readBlock(engine, { startRow: 0, endRow: 100 });
    await tick();
    await tick();

    const update = transactions.find((tx) => Array.isArray(tx.update));
    expect(update?.update?.[0]).toMatchObject({ [SSRM_GRAND_TOTAL_FLAG]: true });
    engine.close();
  });

  it('costs nothing when the grid has no total row', async () => {
    const client = fakeClient();
    const engine = createSsrmEngineRowEngine({
      client,
      keyColumn: 'positionId',
      countMinIntervalMs: 0,
    });
    const { api, transactions } = fakeApi();
    engine.setApi(api);
    // No node under the grand total id, so the whole path stops at the lookup.
    engine.refreshNow();
    await tick();
    await tick();
    expect(transactions).toHaveLength(0);
    engine.close();
  });
});

describe('what the status bar is told', () => {
  /**
   * `countFiltered` is NOT a grouped level's `rowCount`.
   *
   * That is the number of top-level GROUPS, and reading it in a status bar is
   * what produced "Rows : 9 of 50,000" over an unfiltered book grouped into
   * nine asset classes.
   */
  it('reads leafRows from countFiltered, not from the grouped level count', async () => {
    const client = fakeClient({
      async getRows() {
        // Nine groups at the root of a 50,000-row book.
        return { rowData: [], rowCount: 9 };
      },
      async countFiltered() {
        return 50_000;
      },
    });
    const engine = createSsrmEngineRowEngine({
      client,
      keyColumn: 'positionId',
      countMinIntervalMs: 0,
    });
    const seen: (number | null)[] = [];
    engine.subscribe((status) => seen.push(status.leafRows));
    await readBlock(engine, {
      startRow: 0,
      endRow: 100,
      rowGroupCols: [{ id: 'assetClass' }],
      groupKeys: [],
    });
    await tick();
    await tick();

    expect(engine.status.leafRows).toBe(50_000);
    // And the grouped level count never became "rows".
    expect(engine.status.filteredRows).not.toBe(9);
    engine.close();
  });

  /**
   * The status bar's `leafRows` and the store's row count are the SAME number,
   * and asking twice is not free: the engine is synchronous behind a serialized
   * port, so the second whole-book materialise sits in front of the block the
   * user is scrolling towards. MEASURED as most of what the platform appeared to
   * cost the read path — a 2.8-3.0 ms end-to-end median against 6.6-12.2 ms.
   */
  it('asks the whole-book count ONCE per coalesced tick, not once per reader', async () => {
    const client = fakeClient();
    const engine = createSsrmEngineRowEngine({
      client,
      keyColumn: 'positionId',
      countMinIntervalMs: 0,
    });
    const { api } = fakeApi();
    engine.setApi(api);
    // Both readers live: a status listener AND a grid to size.
    engine.subscribe(() => {});
    client.calls.countFiltered.length = 0;

    await readBlock(engine, { startRow: 0, endRow: 100 });
    await tick();
    await tick();
    await tick();

    expect(client.calls.countFiltered).toHaveLength(1);
    engine.close();
  });

  it('counts a failed block, since AG never retries one on its own', async () => {
    const client = fakeClient({
      async getRows() {
        throw new Error('the worker is gone');
      },
    });
    const engine = createSsrmEngineRowEngine({
      client,
      keyColumn: 'positionId',
      onError: () => {},
    });
    await expect(readBlock(engine, { startRow: 0, endRow: 100 })).rejects.toThrow();
    expect(engine.status.failedBlocks).toBe(1);
    engine.close();
  });

  it('reports filtered when a filter or the quick search narrows the book', async () => {
    const client = fakeClient();
    const engine = createSsrmEngineRowEngine({ client, keyColumn: 'positionId' });
    expect(engine.status.filtered).toBe(false);

    await readBlock(engine, {
      startRow: 0,
      endRow: 100,
      filterModel: { desk: { filterType: 'set', values: ['Rates'] } },
    });
    expect(engine.status.filtered).toBe(true);
    engine.close();
  });
});

describe('setRowCount, which is illegal while grouping', () => {
  /**
   * AG error #28 fires whenever a row-group column exists, and it is SILENT
   * without `ValidationModule` — so nothing would report a store that stopped
   * responding.
   */
  it('is never called while grouping, however far the count has moved', async () => {
    const client = fakeClient({
      async countFiltered() {
        return 12_345;
      },
    });
    const engine = createSsrmEngineRowEngine({
      client,
      keyColumn: 'positionId',
      countMinIntervalMs: 0,
    });
    const { api, rowCounts } = fakeApi();
    engine.setApi(api);
    await readBlock(engine, {
      startRow: 0,
      endRow: 100,
      rowGroupCols: [{ id: 'desk' }],
      groupKeys: [],
    });
    await tick();
    await tick();
    expect(rowCounts).toEqual([]);
    engine.close();
  });

  it('IS called ungrouped, so an insert nobody can see still moves the book', async () => {
    let rows = 20_000;
    const client = fakeClient({
      async countFiltered() {
        return rows;
      },
    });
    const engine = createSsrmEngineRowEngine({
      client,
      keyColumn: 'positionId',
      countMinIntervalMs: 0,
    });
    const { api, rowCounts } = fakeApi();
    engine.setApi(api);
    await readBlock(engine, { startRow: 0, endRow: 100 });
    await tick();
    await tick();

    rows = 20_001;
    client.push({ rows: [], removed: [], size: 20_001 });
    await tick();
    await tick();
    await tick();

    expect(rowCounts).toContain(20_001);
    engine.close();
  });
});

describe('the quick search', () => {
  it('purges only when the ENGINE says the text changed', async () => {
    let changed = true;
    const client = fakeClient({
      async setQuickFilter() {
        return changed;
      },
    });
    const engine = createSsrmEngineRowEngine({ client, keyColumn: 'positionId' });
    const { api, refreshes } = fakeApi();
    engine.setApi(api);

    await engine.setQuickFilter('inflation');
    expect(refreshes.filter((r) => r.purge)).toHaveLength(1);

    // A purge fires `modelUpdated`, which is the event the surface bridges this
    // from — so purging when nothing moved is how this loops.
    changed = false;
    await engine.setQuickFilter('inflation');
    expect(refreshes.filter((r) => r.purge)).toHaveLength(1);
    engine.close();
  });

  it('counts as "filtered" in the status bar', async () => {
    const engine = createSsrmEngineRowEngine({ client: fakeClient(), keyColumn: 'positionId' });
    await engine.setQuickFilter('inflation');
    expect(engine.status.filtered).toBe(true);
    await engine.setQuickFilter('');
    expect(engine.status.filtered).toBe(false);
    engine.close();
  });
});

describe('an export reads the book, and refuses rather than truncating', () => {
  it('reads every row of the FILTERED, SORTED book, flat', async () => {
    const requests: SsrmGetRowsRequest[] = [];
    const client = fakeClient({
      async getRows(request) {
        requests.push(request);
        return { rowData: Array.from({ length: 6_669 }, (_, i) => ({ id: i })), rowCount: 6_669 };
      },
      async countFiltered() {
        return 6_669;
      },
    });
    const engine = createSsrmEngineRowEngine({ client, keyColumn: 'positionId' });
    await readBlock(engine, {
      startRow: 0,
      endRow: 100,
      filterModel: { region: { filterType: 'set', values: ['EMEA'] } },
      sortModel: [{ colId: 'pnl', sort: 'desc' }],
      // Grouping is dropped: an export is the rows in the order the user sees
      // them, not the group tree.
      rowGroupCols: [{ id: 'desk' }],
      groupKeys: [],
    });

    const rows = await engine.readAllRows();
    expect(rows).toHaveLength(6_669);
    const exportRequest = requests[requests.length - 1];
    expect(exportRequest.filterModel).toBeDefined();
    expect(exportRequest.sortModel).toBeDefined();
    expect(exportRequest.rowGroupCols).toBeUndefined();
    expect(exportRequest.endRow).toBe(6_669);
    engine.close();
  });

  it('answers null past the ceiling — a short file reads as a complete one', async () => {
    const client = fakeClient({
      async countFiltered() {
        return 200_001;
      },
    });
    const engine = createSsrmEngineRowEngine({
      client,
      keyColumn: 'positionId',
      maxExportRows: 200_000,
    });
    await expect(engine.readAllRows()).resolves.toBeNull();
    // And it did NOT go on to read a partial book.
    expect(client.calls.getRows).toHaveLength(0);
    engine.close();
  });
});

describe('cell edits reach the book', () => {
  it('coalesces several fields of one row into ONE write', async () => {
    const client = fakeClient();
    const engine = createSsrmEngineRowEngine({ client, keyColumn: 'positionId' });

    engine.applyEdit({ key: 'p7', field: 'trader', value: 'AR' });
    engine.applyEdit({ key: 'p7', field: 'quantity', value: 500 });
    engine.applyEdit({ key: 'p9', field: 'trader', value: 'BR' });
    await tick();

    expect(client.calls.applyUpdate).toHaveLength(1);
    expect(client.calls.applyUpdate[0]).toEqual([
      { positionId: 'p7', trader: 'AR', quantity: 500 },
      { positionId: 'p9', trader: 'BR' },
    ]);
    engine.close();
  });

  it('ignores an edit with no key — an upsert would invent an index value', async () => {
    const client = fakeClient();
    const engine = createSsrmEngineRowEngine({ client, keyColumn: 'positionId' });
    engine.applyEdit({ key: undefined, field: 'pnl', value: 1 });
    await tick();
    expect(client.calls.applyUpdate).toHaveLength(0);
    engine.close();
  });
});

describe('the rest of the platform contract', () => {
  it('counts a saved filter over the whole book, not the current level', async () => {
    const client = fakeClient({
      async countFiltered(request) {
        return request.filterModel ? 6_664 : 20_000;
      },
    });
    const engine = createSsrmEngineRowEngine({ client, keyColumn: 'positionId' });
    await readBlock(engine, {
      startRow: 0,
      endRow: 100,
      rowGroupCols: [{ id: 'desk' }],
      groupKeys: ['Rates'],
    });
    await expect(
      engine.countMatching({ region: { filterType: 'set', values: ['Americas'] } }),
    ).resolves.toBe(6_664);
    engine.close();
  });

  it('passes a set filter list through, and a refusal through as null', async () => {
    const listed = createSsrmEngineRowEngine({ client: fakeClient(), keyColumn: 'positionId' });
    await expect(listed.distinctValues('desk')).resolves.toEqual(['a', 'b']);
    listed.close();

    // Null means "no honest list" — past the cardinality ceiling. A caller must
    // leave the filter EMPTY, because a truncated list renders as the whole
    // domain and its Select All silently excludes the rest.
    const refused = createSsrmEngineRowEngine({
      client: fakeClient({ async distinctValues() { return null; } }),
      keyColumn: 'positionId',
    });
    await expect(refused.distinctValues('positionId')).resolves.toBeNull();
    refused.close();
  });

  it('purges when the calculated columns change, and not when they do not', async () => {
    let changed = true;
    const engine = createSsrmEngineRowEngine({
      client: fakeClient({ async setCalcColumns() { return changed; } }),
      keyColumn: 'positionId',
    });
    const { api, refreshes } = fakeApi();
    engine.setApi(api);

    // An index materialised under the previous expressions is a permutation of
    // the book by values that no longer exist — and AG's request carries no
    // calculated columns, so nothing else would ever invalidate it.
    await engine.setCalcColumns([{ colId: 'calc_x', ast: { type: 'literal', value: 1 } }]);
    expect(refreshes.filter((r) => r.purge)).toHaveLength(1);

    changed = false;
    await engine.setCalcColumns([{ colId: 'calc_x', ast: { type: 'literal', value: 1 } }]);
    expect(refreshes.filter((r) => r.purge)).toHaveLength(1);
    engine.close();
  });

  it('stops pushing once closed — a pump outliving its grid writes into nothing', async () => {
    const client = fakeClient();
    const engine = createSsrmEngineRowEngine({ client, keyColumn: 'positionId' });
    const { api, transactions, nodes } = fakeApi();
    nodes.set('r1', { data: { positionId: 'r1', pnl: 1 } });
    engine.setApi(api);
    engine.close();

    client.push({ rows: [{ positionId: 'r1', pnl: 2 }], removed: [], size: 20_000 });
    await tick();
    await tick();
    expect(transactions).toHaveLength(0);
  });
});

/**
 * The real client has to fit the structural contract above.
 *
 * A hand-written `*Like` interface that has drifted from the class it stands
 * for is a green test pinning a spelling the consumer does not have, which this
 * repo has now paid for three times. This is a compile-time assertion, so it
 * fails the typecheck rather than the run.
 */
describe('SsrmEngineClient satisfies SsrmEngineClientLike', () => {
  it('type-checks', () => {
    const accepts = (_client: SsrmEngineClientLike) => true;
    const asClient = null as unknown as SsrmEngineClient;
    expect(typeof accepts).toBe('function');
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    () => accepts(asClient);
  });
});

/** A grid that reports no displayed rows must not put a viewport on the wire. */
describe('viewport reporting', () => {
  it('says nothing before the grid has painted a row', () => {
    const setViewport = vi.fn(async () => {});
    const engine = createSsrmEngineRowEngine({
      client: fakeClient({ setViewport }),
      keyColumn: 'positionId',
    });
    const { api } = fakeApi({
      getFirstDisplayedRowIndex: () => -1,
      getLastDisplayedRowIndex: () => -1,
    });
    engine.setApi(api);
    engine.reportViewport();
    expect(setViewport).not.toHaveBeenCalled();
    engine.close();
  });

  it('reports the SHAPE plus a slack band, and only when it moves', () => {
    const setViewport = vi.fn(async () => {});
    const engine = createSsrmEngineRowEngine({
      client: fakeClient({ setViewport }),
      keyColumn: 'positionId',
      viewportSlackRows: 10,
    });
    const { api } = fakeApi({
      getFirstDisplayedRowIndex: () => 100,
      getLastDisplayedRowIndex: () => 130,
    });
    engine.setApi(api);
    engine.reportViewport();
    engine.reportViewport();

    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(setViewport.mock.calls[0][0]).toMatchObject({ startRow: 90, endRow: 141 });
    // Only the shape: a block's own range on the wire beside the live one is a
    // stale range the worker would narrow by.
    const sent = setViewport.mock.calls[0][0] as unknown as { request: SsrmGetRowsRequest };
    expect(sent.request.startRow).toBe(0);
    expect(sent.request.endRow).toBe(0);
    engine.close();
  });
});

/**
 * ══ THE GROUPED LIVE PATH ══
 *
 * MEASURED before this existed (`scripts/groupedTickProbe.mjs`, 50,000 rows,
 * two group levels, 25 s): the pump received 34,447 rows, applied 0 and dropped
 * 34,447; group and subgroup aggregates never moved.
 *
 * The decision these cases pin is that under grouping the push path is OFF and
 * the expanded routes are re-read instead. Not because the pump is broken —
 * because a leaf id under grouping is its PATH and a sparse patch cannot carry
 * one, and because a leaf transaction would not move the group row above it
 * even if it could.
 */
describe('grouping — the routes are refreshed, and nothing is pushed', () => {
  const GROUPED: SsrmGetRowsRequest = {
    rowGroupCols: [{ id: 'assetClass' }, { id: 'issuerSector' }],
    groupKeys: [],
    valueCols: [{ id: 'esgScore', aggFunc: 'sum' }],
  };

  /** A grid holding two expanded groups, one inside the other. */
  function groupedApi() {
    const alpha = { group: true, expanded: true, level: 0, key: 'Alpha', parent: null };
    const energy = { group: true, expanded: true, level: 1, key: 'Energy', parent: alpha };
    const closed = { group: true, expanded: false, level: 0, key: 'Beta', parent: null };
    const leaf = { group: false, expanded: false, level: 2, key: null, parent: energy };
    return fakeApi({
      forEachNode: (callback) => {
        for (const node of [alpha, energy, closed, leaf]) callback(node);
      },
    });
  }

  it('pushes NOTHING at the grid while grouped, and refreshes every expanded route', async () => {
    const client = fakeClient();
    const engine = createSsrmEngineRowEngine({
      client,
      keyColumn: 'positionId',
      groupRefreshMinIntervalMs: 1,
    });
    const grid = groupedApi();
    engine.setApi(grid.api);
    // The served request is what tells the engine it is grouped — read off the
    // block the datasource actually answered, never reconstructed from column
    // state, because the served shape is the one the worker's index is keyed on.
    await readBlock(engine, { ...GROUPED, startRow: 0, endRow: 100 });
    const transactionsAfterBlock = grid.transactions.length;
    const refreshesAfterBlock = grid.refreshes.length;

    client.push({ rows: [{ positionId: 'POS-1', esgScore: 5 }], removed: [], size: 20_000 });
    await new Promise((r) => setTimeout(r, 20));

    // Not one transaction carrying a book row — a leaf transaction cannot name
    // a grouped node and would not move the aggregate above it in any case.
    const pushed = grid.transactions
      .slice(transactionsAfterBlock)
      .filter((tx) =>
        tx.update?.some((row) => (row as Record<string, unknown>).positionId === 'POS-1'),
      );
    expect(pushed).toEqual([]);
    // The sharp form: the pump was never HANDED the frame. `applied === 0`
    // alone would pass on an engine that pushed and had every row dropped,
    // which is precisely the state the probe measured — 34,447 received,
    // 34,447 dropped, and it looked like nothing was happening either way.
    expect(engine.pumpStats()?.received ?? -1).toBe(0);
    expect(engine.pumpStats()?.applied ?? 0).toBe(0);

    // The root, then EVERY expanded route — `refreshServerSide` does not
    // cascade into child stores, so refreshing the root alone leaves the rows
    // under an expanded group frozen while their group row ticks.
    const routes = grid.refreshes.slice(refreshesAfterBlock);
    expect(routes.some((r) => r.route === undefined && r.purge === false)).toBe(true);
    expect(routes.map((r) => r.route).filter(Boolean)).toEqual([
      ['Alpha'],
      ['Alpha', 'Energy'],
    ]);
    // A COLLAPSED group is not refreshed: nothing under it is on screen, and
    // re-reading it would cost a block per tick for rows nobody can see.
    expect(routes.some((r) => r.route?.includes('Beta'))).toBe(false);

    const stats = engine.groupRefreshStats();
    expect(stats.writes).toBeGreaterThan(0);
    expect(stats.refreshes).toBeGreaterThan(0);
    expect(stats.routes).toBeGreaterThan(0);
    engine.close();
  });

  it('declares pushRows:false so the worker stops putting patches on the wire', async () => {
    const viewports: unknown[] = [];
    const client = fakeClient({
      async setViewport(viewport) {
        viewports.push(viewport);
      },
    });
    const engine = createSsrmEngineRowEngine({ client, keyColumn: 'positionId' });
    engine.setApi(
      fakeApi({
        getFirstDisplayedRowIndex: () => 0,
        getLastDisplayedRowIndex: () => 30,
      }).api,
    );

    await readBlock(engine, { startRow: 0, endRow: 100 });
    engine.reportViewport();
    expect((viewports.at(-1) as { pushRows?: boolean }).pushRows).toBeUndefined();

    await readBlock(engine, { ...GROUPED, startRow: 0, endRow: 100 });
    engine.reportViewport();
    expect((viewports.at(-1) as { pushRows?: boolean }).pushRows).toBe(false);
    engine.close();
  });

  it('STILL pushes the grand total while grouped — it names AG own row id', async () => {
    const client = fakeClient();
    const engine = createSsrmEngineRowEngine({
      client,
      keyColumn: 'positionId',
      countMinIntervalMs: 1,
      groupRefreshMinIntervalMs: 1,
    });
    const grid = groupedApi();
    grid.nodes.set(SSRM_GRAND_TOTAL_ROW_ID, { data: {} });
    engine.setApi(grid.api);
    await readBlock(engine, { ...GROUPED, startRow: 0, endRow: 100 });
    const before = grid.transactions.length;

    client.push({ rows: [{ positionId: 'POS-1', esgScore: 5 }], removed: [], size: 20_000 });
    await new Promise((r) => setTimeout(r, 40));

    const totals = grid.transactions
      .slice(before)
      .filter((tx) =>
        tx.update?.some((row) => (row as Record<string, unknown>)[SSRM_GRAND_TOTAL_FLAG] === true),
      );
    expect(totals.length).toBeGreaterThan(0);
    engine.close();
  });

  it('never calls setRowCount while grouping — AG error #28, and SILENT', async () => {
    const client = fakeClient();
    const engine = createSsrmEngineRowEngine({
      client,
      keyColumn: 'positionId',
      countMinIntervalMs: 1,
    });
    const grid = groupedApi();
    engine.setApi(grid.api);
    await readBlock(engine, { ...GROUPED, startRow: 0, endRow: 100 });
    client.push({ rows: [{ positionId: 'POS-1' }], removed: [], size: 19_999 });
    await new Promise((r) => setTimeout(r, 40));
    expect(grid.rowCounts).toEqual([]);
    engine.close();
  });

  it('resumes pushing the moment the grid is UNGROUPED again', async () => {
    const client = fakeClient();
    const engine = createSsrmEngineRowEngine({
      client,
      keyColumn: 'positionId',
      groupRefreshMinIntervalMs: 1,
    });
    const grid = groupedApi();
    grid.nodes.set('POS-1', { data: { positionId: 'POS-1', esgScore: 1 } });
    engine.setApi(grid.api);

    await readBlock(engine, { ...GROUPED, startRow: 0, endRow: 100 });
    client.push({ rows: [{ positionId: 'POS-1', esgScore: 5 }], removed: [], size: 20_000 });
    await new Promise((r) => setTimeout(r, 20));
    expect(engine.pumpStats()?.applied ?? 0).toBe(0);

    // The user drags the grouping off. The next block is flat, and the push
    // path is live again — a leaf id is the bare key once more.
    await readBlock(engine, { startRow: 0, endRow: 100 });
    client.push({ rows: [{ positionId: 'POS-1', esgScore: 9 }], removed: [], size: 20_000 });
    await new Promise((r) => setTimeout(r, 20));
    expect(engine.pumpStats()?.applied ?? 0).toBeGreaterThan(0);
    engine.close();
  });
});

/**
 * The whole-book style-rule seam, and the one thing about it that is easy to
 * get backwards: the COUNT follows the grid filter and the AGGREGATE does not.
 */
describe('whole-book style-rule answers', () => {
  const rule = { type: 'literal' as const, value: true };

  it('passes the grid FILTER to the count and NOTHING to the aggregate', async () => {
    const counts: { request: SsrmGetRowsRequest }[] = [];
    const aggregates: unknown[] = [];
    const client = fakeClient({
      async countMatchingExpression(_ast, request) {
        counts.push({ request: request ?? {} });
        return 7;
      },
      async aggregateScalar(field, aggregate) {
        aggregates.push({ field, aggregate });
        return 12.5;
      },
    });
    const engine = createSsrmEngineRowEngine({ client, keyColumn: 'positionId' });
    engine.setApi(fakeApi().api);
    const filterModel = { region: { filterType: 'set', values: ['EMEA'] } };
    await readBlock(engine, { startRow: 0, endRow: 100, filterModel });

    expect(await engine.countMatchingExpression(rule)).toBe(7);
    // The COUNT follows the filter, because its client-side original is
    // `forEachNodeAfterFilter` and a header must not light for rows the user
    // has filtered away.
    expect(counts[0].request.filterModel).toEqual(filterModel);

    expect(await engine.aggregateScalar('price', 'avg')).toBe(12.5);
    // The AGGREGATE does not — the threshold is a property of the BOOK. Excel's
    // convention, and the one the Perspective surface shipped.
    expect(aggregates).toEqual([{ field: 'price', aggregate: 'avg' }]);
    engine.close();
  });

  it('caches on the AST AND the filter, so a different filter is a different question', async () => {
    let asked = 0;
    const client = fakeClient({
      async countMatchingExpression() {
        asked += 1;
        return asked;
      },
    });
    const engine = createSsrmEngineRowEngine({
      client,
      keyColumn: 'positionId',
      countMinIntervalMs: 10_000,
    });
    engine.setApi(fakeApi().api);
    await readBlock(engine, { startRow: 0, endRow: 100 });

    await engine.countMatchingExpression(rule);
    await engine.countMatchingExpression(rule);
    expect(asked).toBe(1);

    // A filter change is a new question and must not be answered from the old
    // one — the painter would keep lighting a header for rows now hidden.
    await readBlock(engine, {
      startRow: 0,
      endRow: 100,
      filterModel: { region: { filterType: 'set', values: ['EMEA'] } },
    });
    await engine.countMatchingExpression(rule);
    expect(asked).toBe(2);
    engine.close();
  });
});
