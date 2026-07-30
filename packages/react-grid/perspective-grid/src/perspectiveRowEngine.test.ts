import { describe, expect, it, vi } from 'vitest';
import {
  createPerspectiveRowEngine,
  GRAND_TOTAL_FLAG,
  GRAND_TOTAL_ROW_ID,
  type GridApiLike,
  type GridNodeLike,
} from './perspectiveRowEngine.js';
import type { PerspectiveTableLike, UpdatableView } from './viewManager.js';
import type { PerspectiveViewConfig } from './viewConfig.js';

function makeTable(totalRows = 1000) {
  let fire: (() => void) | null = null;
  const table: PerspectiveTableLike = {
    view: vi.fn(async (config: PerspectiveViewConfig) => {
      const grouped = (config.group_by?.length ?? 0) > 0;
      const view: UpdatableView = {
        async to_columns(window) {
          const start = window?.start_row ?? 0;
          const n = Math.max(0, Math.min(window?.end_row ?? 0, totalRows) - start);
          const base: Record<string, unknown[]> = {
            pnl: Array.from({ length: n }, (_, i) => (start + i) * 10),
            positionId: Array.from({ length: n }, (_, i) => `p${start + i}`),
          };
          if (grouped) {
            base.__ROW_PATH__ = Array.from({ length: n }, (_, i) =>
              start + i === 0 ? [] : [`g${start + i}`],
            );
          }
          return base;
        },
        async num_rows() {
          return totalRows;
        },
        async delete() {},
        async on_update(cb: () => void) {
          fire = cb;
          return 1;
        },
      };
      return view;
    }),
  };
  return { table, tick: () => fire?.() };
}

function makeApi(nodes: GridNodeLike[] = [], hasTotalRow = true) {
  const refreshes: { route?: string[]; purge?: boolean }[] = [];
  const transactions: unknown[][] = [];
  const rowCounts: number[] = [];
  const api: GridApiLike = {
    refreshServerSide: (params) => refreshes.push(params),
    forEachNode: (cb) => nodes.forEach(cb),
    getRowNode: (id) => (hasTotalRow && id === GRAND_TOTAL_ROW_ID ? {} : undefined),
    applyServerSideTransaction: (tx) => transactions.push(tx.update ?? []),
    setRowCount: (rows) => rowCounts.push(rows),
  };
  return { api, refreshes, transactions, rowCounts };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('createPerspectiveRowEngine — row count', () => {
  it('publishes the root row count once the grid is connected', async () => {
    const { table } = makeTable(20_000);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();
    engine.setApi(grid.api);

    expect(grid.rowCounts).toContain(20_000);
  });

  it('does NOT publish a row count while grouping — AG error #28 is silent', async () => {
    const { table } = makeTable(20_000);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();
    engine.setApi(grid.api);

    engine.datasource.getRows({
      request: { startRow: 0, endRow: 100, rowGroupCols: [{ id: 'desk' }], groupKeys: [] },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    expect(grid.rowCounts).toEqual([]);
  });
});

describe('createPerspectiveRowEngine — refreshing on a Table update', () => {
  it('refreshes the root and EVERY expanded level, not just the root', async () => {
    // MEASURED: `refreshServerSide` does not cascade into child stores, so a
    // root-only refresh leaves the rows under an expanded group frozen while
    // the totals above them tick.
    const parent: GridNodeLike = { group: true, expanded: true, level: 0, key: 'Rates', parent: null };
    const child: GridNodeLike = { group: true, expanded: true, level: 1, key: 'EMEA', parent };
    const collapsed: GridNodeLike = { group: true, expanded: false, level: 0, key: 'Credit', parent: null };

    const { table, tick } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    const grid = makeApi([parent, child, collapsed]);
    engine.setApi(grid.api);

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    tick();
    await new Promise((r) => setTimeout(r, 20));

    expect(grid.refreshes).toEqual([
      { purge: false },
      { route: ['Rates'], purge: false },
      { route: ['Rates', 'EMEA'], purge: false },
    ]);
  });

  it('coalesces a burst of updates into one refresh', async () => {
    const { table, tick } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 20 });
    const grid = makeApi();
    engine.setApi(grid.api);
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    for (let i = 0; i < 10; i++) tick();
    await new Promise((r) => setTimeout(r, 40));

    expect(grid.refreshes.filter((r) => r.route === undefined)).toHaveLength(1);
  });

  it('stops refreshing when live is off, and catches up when it returns', async () => {
    const { table, tick } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 5 });
    const grid = makeApi();
    engine.setApi(grid.api);
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    engine.setLive(false);
    tick();
    await new Promise((r) => setTimeout(r, 20));
    expect(grid.refreshes).toHaveLength(0);

    engine.setLive(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(grid.refreshes.length).toBeGreaterThan(0);
  });

  it('does not refresh before a grid is connected', async () => {
    const { table, tick } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    tick();
    await new Promise((r) => setTimeout(r, 20));
    // Nothing to assert against but the absence of a crash: setApi was never
    // called, and a null api must not be dereferenced from the timer.
    expect(engine.rowsAtRoot).toBe(1000);
  });
});

describe('createPerspectiveRowEngine — grand total', () => {
  it('attaches the total to a root block, flagged and labelled', async () => {
    const { table } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const success = vi.fn();

    engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success,
      fail: () => {},
    } as never);
    await vi.waitFor(() => expect(success).toHaveBeenCalled());

    const total = success.mock.calls[0][0].grandTotalData;
    expect(total[GRAND_TOTAL_FLAG]).toBe(true);
    expect(total.positionId).toBe('GRAND TOTAL');
  });

  it('updates the total by TRANSACTION, since grandTotalData does not update it', async () => {
    // MEASURED: five distinct fresh totals supplied over five non-purge
    // refreshes left the row showing the first one.
    const { table, tick } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    const grid = makeApi();
    engine.setApi(grid.api);
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    tick();
    await new Promise((r) => setTimeout(r, 30));

    expect(grid.transactions).toHaveLength(1);
    expect((grid.transactions[0][0] as Record<string, unknown>)[GRAND_TOTAL_FLAG]).toBe(true);
  });

  it('skips the transaction when the grid has no total row', async () => {
    const { table, tick } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    const grid = makeApi([], false);
    engine.setApi(grid.api);
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    tick();
    await new Promise((r) => setTimeout(r, 30));

    expect(grid.transactions).toHaveLength(0);
  });
});

describe('createPerspectiveRowEngine — lifecycle', () => {
  it('stops refreshing after close', async () => {
    const { table, tick } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    const grid = makeApi();
    engine.setApi(grid.api);
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    await engine.close();
    tick();
    await new Promise((r) => setTimeout(r, 20));

    expect(grid.refreshes).toHaveLength(0);
  });

  it('settles a block after close rather than leaking the request', async () => {
    // A leaked getRows deadlocks the WHOLE grid — AG only decrements its
    // bandwidth counter inside success/fail.
    const { table } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    await engine.close();

    const success = vi.fn();
    const fail = vi.fn();
    engine.datasource.getRows({ request: { startRow: 0, endRow: 100 }, success, fail } as never);
    await vi.waitFor(() => expect(success.mock.calls.length + fail.mock.calls.length).toBe(1));
  });
});

describe('createPerspectiveRowEngine — status', () => {
  const tableWithSize = (bookRows: number, viewRows: number) => {
    const { table, tick } = makeTable(viewRows);
    return {
      table: { ...table, size: vi.fn(async () => bookRows) } as typeof table,
      tick,
    };
  };

  it('reports the book total from the TABLE, not from the rows this window holds', async () => {
    // A stock AG status panel counts loaded rows and would say "100".
    const { table } = tableWithSize(20_000, 20_000);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    const seen: unknown[] = [];
    engine.subscribe((s) => seen.push(s));
    await settle();

    expect(engine.status.bookRows).toBe(20_000);
  });

  it('separates the filtered count from the book, and flags that a filter is on', async () => {
    const { table } = tableWithSize(20_000, 3_333);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    engine.subscribe(() => {});

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100, filterModel: { desk: { filterType: 'text', type: 'equals', filter: 'Rates' } } },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    expect(engine.status).toMatchObject({ bookRows: 20_000, filteredRows: 3_333, filtered: true });
  });

  it('does not claim "filtered" before the book has been measured', async () => {
    // Rendering "0 of N" from an unmeasured book is worse than rendering
    // nothing — it reads as a real, alarming number.
    const { table } = makeTable(500); // no size()
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    engine.subscribe(() => {});
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    expect(engine.status.bookRows).toBeNull();
    expect(engine.status.filtered).toBe(false);
  });

  it('notifies subscribers when a new View changes the filtered count', async () => {
    const { table } = tableWithSize(20_000, 20_000);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const seen: number[] = [];
    engine.subscribe((s) => {
      if (typeof s.filteredRows === 'number') seen.push(s.filteredRows);
    });

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    expect(seen.length).toBeGreaterThan(0);
  });

  it('tracks live state and failed blocks', async () => {
    const { table } = tableWithSize(10, 10);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    engine.subscribe(() => {});

    expect(engine.status.live).toBe(true);
    engine.setLive(false);
    expect(engine.status.live).toBe(false);
    expect(engine.status.failedBlocks).toBe(0);
  });

  it('unsubscribes cleanly and stops notifying after close', async () => {
    const { table } = tableWithSize(10, 10);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    let calls = 0;
    const off = engine.subscribe(() => {
      calls += 1;
    });
    const afterSubscribe = calls;
    off();
    engine.setLive(false);
    expect(calls).toBe(afterSubscribe);

    await engine.close();
  });

  it('survives a Table whose size() rejects — a status figure must not break the grid', async () => {
    const { table } = makeTable(100);
    const failing = { ...table, size: vi.fn(async () => { throw new Error('worker busy'); }) };
    const engine = createPerspectiveRowEngine({ table: failing as never, keyColumn: 'positionId' });
    engine.subscribe(() => {});
    await settle();

    expect(engine.status.bookRows).toBeNull();
  });
});

/**
 * A blotter attaches the moment its window opens — which, on a cold worker,
 * is before the snapshot has landed. Everything below is about surviving that
 * ordering: the Table starts empty, fills to 20,000 rows, and the grid has to
 * notice.
 */
describe('createPerspectiveRowEngine — a Table that fills after the grid attached', () => {
  function makeGrowingTable() {
    let total = 0;
    let fire: (() => void) | null = null;
    const table: PerspectiveTableLike = {
      size: async () => total,
      view: vi.fn(async () => ({
        async to_columns(window: { start_row?: number; end_row?: number } | undefined) {
          const start = window?.start_row ?? 0;
          const n = Math.max(0, Math.min(window?.end_row ?? 0, total) - start);
          return {
            positionId: Array.from({ length: n }, (_, i) => `p${start + i}`),
            pnl: Array.from({ length: n }, (_, i) => start + i),
          };
        },
        async num_rows() {
          return total;
        },
        async delete() {},
        async on_update(cb: () => void) {
          fire = cb;
          return 1;
        },
      })) as never,
    } as PerspectiveTableLike;
    return {
      table,
      fill: (rows: number) => {
        total = rows;
        fire?.();
      },
    };
  }

  // MEASURED on the live feed: a root store that settled at zero rows has no
  // blocks to invalidate, so `refreshServerSide({purge:false})` reloads
  // nothing. The grid sat empty over a full 20,000-row book, reporting
  // "0 of 20,000" with no error anywhere.
  it('purges the root store when it settled empty, so the first rows appear', async () => {
    const { table, fill } = makeGrowingTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    const grid = makeApi([], false);
    engine.setApi(grid.api);

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();
    expect(grid.refreshes).toEqual([]);

    fill(20_000);
    await new Promise((r) => setTimeout(r, 20));

    expect(grid.refreshes[0]).toEqual({ purge: true });
  });

  // The other half of the rule: a purge drops every loaded block, which throws
  // the user's scroll position away. On a populated store that would happen on
  // every tick.
  it('does not purge once the store holds rows', async () => {
    const { table, fill } = makeGrowingTable();
    fill(20_000);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    const grid = makeApi([], false);
    engine.setApi(grid.api);

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    fill(20_001);
    await new Promise((r) => setTimeout(r, 20));

    expect(grid.refreshes[0]).toEqual({ purge: false });
  });
});

/**
 * The status bar is the only place a user can see how much of the book the
 * grid is actually looking at, so a figure that stops moving is a bug the same
 * way a frozen row is.
 */
describe('createPerspectiveRowEngine — status publishing', () => {
  it('publishes the filtered count for a re-measured CACHED View', async () => {
    // MEASURED: the `view` event fires only when a View is BUILT, so once the
    // book settled the bar sat at "0 of 20,000" over a grid that had filled.
    let total = 0;
    const table: PerspectiveTableLike = {
      size: async () => total,
      view: vi.fn(async () => ({
        async to_columns() { return { positionId: [] }; },
        async num_rows() { return total; },
        async delete() {},
        async on_update() { return 1; },
      })) as never,
    } as PerspectiveTableLike;

    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    const seen: Array<number | null> = [];
    engine.subscribe((s) => seen.push(s.filteredRows));

    const ask = () =>
      engine.datasource.getRows({
        request: { startRow: 0, endRow: 100 },
        success: () => {},
        fail: () => {},
      } as never);

    await ask();
    await settle();
    total = 20_000;
    await ask();
    await settle();

    // Two Views for the life of this test — the root one and the grand total —
    // and neither is rebuilt for the second request. The count still moved.
    expect(table.view).toHaveBeenCalledTimes(2);
    expect(seen).toContain(20_000);
  });
});

describe('countMatching', () => {
  /** Views whose row count depends on the filter, plus a hook to fire the
   *  Table's update callback. */
  function makeCountableTable() {
    let fire: (() => void) | null = null;
    const filtered: PerspectiveViewConfig[] = [];
    const table: PerspectiveTableLike = {
      async size() {
        return 1000;
      },
      view: vi.fn(async (config: PerspectiveViewConfig) => {
        if (config.filter?.length) filtered.push(config);
        const rows = config.filter?.length ? 37 : 1000;
        const view: UpdatableView = {
          async to_columns() {
            return { positionId: [] };
          },
          async num_rows() {
            return rows;
          },
          async delete() {},
          async on_update(cb: () => void) {
            fire = cb;
            return 1;
          },
        };
        return view;
      }),
    };
    return { table, filtered, tick: () => fire?.() };
  }

  const SET_ENERGY = { sector: { filterType: 'set', values: ['Energy'] } };

  it('counts the book under a saved filter', async () => {
    const { table } = makeCountableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    expect(await engine.countMatching(SET_ENERGY)).toBe(37);
    await engine.close();
  });

  it('reuses a resolved count while nothing has moved', async () => {
    // AG `modelUpdated` drives the recount and fires several times a second.
    // Answering each one costs a full-book View in the same engine the read
    // path queues behind.
    const { table, filtered } = makeCountableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    await engine.countMatching(SET_ENERGY);
    await engine.countMatching(SET_ENERGY);
    await engine.countMatching(SET_ENERGY);

    expect(filtered).toHaveLength(1);
    await engine.close();
  });

  it('recomputes once the Table has moved and the floor has passed', async () => {
    vi.useFakeTimers();
    try {
      const { table, filtered, tick } = makeCountableTable();
      const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
      // `on_update` belongs to a View, so the grid needs one before the Table
      // can report that it moved.
      await engine.datasource.getRows({
        request: { startRow: 0, endRow: 100 },
        success: () => {},
        fail: () => {},
      } as never);

      await engine.countMatching(SET_ENERGY);
      expect(filtered).toHaveLength(1);

      // Time alone proves nothing — the count is still true.
      vi.advanceTimersByTime(5_000);
      await engine.countMatching(SET_ENERGY);
      expect(filtered).toHaveLength(1);

      // The book moved: now the count is stale, and enough time has passed to
      // pay for another one.
      tick();
      vi.advanceTimersByTime(1_500);
      await engine.countMatching(SET_ENERGY);
      expect(filtered).toHaveLength(2);

      await engine.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds the floor even after the Table moves', async () => {
    vi.useFakeTimers();
    try {
      const { table, filtered, tick } = makeCountableTable();
      const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
      await engine.datasource.getRows({
        request: { startRow: 0, endRow: 100 },
        success: () => {},
        fail: () => {},
      } as never);

      await engine.countMatching(SET_ENERGY);
      tick();
      vi.advanceTimersByTime(100);
      await engine.countMatching(SET_ENERGY);

      // A badge trailing the book by under a second is indistinguishable from
      // a live one; a grid that stutters is not.
      expect(filtered).toHaveLength(1);
      await engine.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports null for a model Perspective cannot express exactly', async () => {
    const { table } = makeCountableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    expect(
      await engine.countMatching({
        sector: {
          operator: 'OR',
          conditions: [
            { filterType: 'text', type: 'equals', filter: 'Energy' },
            { filterType: 'text', type: 'equals', filter: 'Tech' },
          ],
        },
      }),
    ).toBeNull();
    await engine.close();
  });

  it('reports null rather than zero when the count throws', async () => {
    // Zero is a number a badge will happily render. It would read as "this
    // filter matches nothing", which is a different claim from "unknown".
    const table: PerspectiveTableLike = {
      view: vi.fn(async () => {
        throw new Error('engine busy');
      }),
    };
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    expect(await engine.countMatching(SET_ENERGY)).toBeNull();
    await engine.close();
  });

  it('reports null once closed', async () => {
    const { table } = makeCountableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    await engine.close();

    expect(await engine.countMatching(SET_ENERGY)).toBeNull();
  });
});

describe('applyEdit', () => {
  /** A Table that records writes and reports a typed schema. */
  function makeWritableTable(schema: Record<string, string> | null = null) {
    const writes: Record<string, unknown>[][] = [];
    const table: PerspectiveTableLike = {
      view: vi.fn(async () => ({
        async to_columns() {
          return { positionId: [] };
        },
        async num_rows() {
          return 0;
        },
        async delete() {},
        async on_update() {
          return 1;
        },
      })),
      update: vi.fn(async (rows: Record<string, unknown>[]) => {
        writes.push(rows);
      }),
      ...(schema ? { schema: async () => schema } : {}),
    };
    return { table, writes };
  }

  it('writes the edited cell plus the index column, and nothing else', async () => {
    // A sparse row upserts by index and leaves every omitted column alone —
    // which is what makes a single-cell write legal against a live book.
    const { table, writes } = makeWritableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    engine.applyEdit({ key: 'p7', field: 'trader', value: 'AR' });
    await engine.flushEdits();

    expect(writes).toEqual([[{ positionId: 'p7', trader: 'AR' }]]);
    await engine.close();
  });

  it('coalesces a bulk update into ONE write', async () => {
    // Smart edit and bulk update commit cell by cell; one proxied round trip
    // per cell would be hundreds of worker calls for one user action.
    const { table, writes } = makeWritableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    engine.applyEdit({ key: 'p1', field: 'trader', value: 'AR' });
    engine.applyEdit({ key: 'p1', field: 'book', value: 'FI-GOVT' });
    engine.applyEdit({ key: 'p2', field: 'trader', value: 'BK' });
    await engine.flushEdits();

    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual([
      { positionId: 'p1', trader: 'AR', book: 'FI-GOVT' },
      { positionId: 'p2', trader: 'BK' },
    ]);
    await engine.close();
  });

  it('coerces against the declared type before writing', async () => {
    const { table, writes } = makeWritableTable({ positionId: 'string', quantity: 'float' });
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    engine.applyEdit({ key: 'p1', field: 'quantity', value: '1250.5' });
    await engine.flushEdits();

    expect(writes[0]).toEqual([{ positionId: 'p1', quantity: 1250.5 }]);
    await engine.close();
  });

  it('refuses a row it cannot coerce rather than writing part of it', async () => {
    const errors: unknown[] = [];
    const { table, writes } = makeWritableTable({ positionId: 'string', quantity: 'float' });
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      onError: (e) => errors.push(e),
    });

    engine.applyEdit({ key: 'p1', field: 'quantity', value: 'not a number' });
    engine.applyEdit({ key: 'p2', field: 'quantity', value: 10 });
    await engine.flushEdits();

    // The good row still lands; the bad one is reported, not half-applied.
    expect(writes[0]).toEqual([{ positionId: 'p2', quantity: 10 }]);
    expect(errors).toHaveLength(1);
    await engine.close();
  });

  it('refuses to edit the index column — an upsert would duplicate the row', async () => {
    const errors: unknown[] = [];
    const { table, writes } = makeWritableTable();
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      onError: (e) => errors.push(e),
    });

    engine.applyEdit({ key: 'p1', field: 'positionId', value: 'p999' });
    await engine.flushEdits();

    expect(writes).toHaveLength(0);
    expect(errors).toHaveLength(1);
    await engine.close();
  });

  it('reports a read-only Table instead of dropping the edit silently', async () => {
    const errors: unknown[] = [];
    const { table } = makeTable();
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      onError: (e) => errors.push(e),
    });

    engine.applyEdit({ key: 'p1', field: 'trader', value: 'AR' });
    await engine.flushEdits();

    expect(errors).toHaveLength(1);
    await engine.close();
  });

  it('reports a rejected write without breaking the grid', async () => {
    const errors: unknown[] = [];
    const table: PerspectiveTableLike = {
      view: vi.fn(async () => ({
        async to_columns() {
          return {};
        },
        async num_rows() {
          return 0;
        },
        async delete() {},
      })),
      update: vi.fn(async () => {
        throw new Error('engine busy');
      }),
    };
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      onError: (e) => errors.push(e),
    });

    engine.applyEdit({ key: 'p1', field: 'trader', value: 'AR' });
    await engine.flushEdits();

    expect(errors).toHaveLength(1);
    await engine.close();
  });

  it('flushes a pending edit on close — a Table swap must not eat it', async () => {
    const { table, writes } = makeWritableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    engine.applyEdit({ key: 'p1', field: 'trader', value: 'AR' });
    await engine.close();

    expect(writes).toEqual([[{ positionId: 'p1', trader: 'AR' }]]);
  });

  it('ignores an edit with no index value', async () => {
    const { table, writes } = makeWritableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    engine.applyEdit({ key: undefined, field: 'trader', value: 'AR' });
    await engine.flushEdits();

    expect(writes).toHaveLength(0);
    await engine.close();
  });
});
