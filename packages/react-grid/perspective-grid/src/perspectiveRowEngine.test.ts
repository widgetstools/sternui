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

  it('does not re-read blocks that are still being read', async () => {
    // MEASURED on the 50k x 400 stress book: one 100-row block costs
    // 900-1,670 ms, because a read carries every column of the View. The
    // refresh invalidates every loaded block, so at the 250 ms throttle the
    // same ranges were re-requested five and six times over and the queue never
    // drained — a scroll then waited behind a second of work it did not ask for.
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => { release = r; });
    const { table, tick } = makeTable();
    const view = table.view as unknown as ReturnType<typeof vi.fn>;
    const original = view.getMockImplementation()!;
    view.mockImplementation(async (config: PerspectiveViewConfig) => {
      const built = await original(config);
      const rows = built.to_columns.bind(built);
      built.to_columns = async (w: never) => { await gate; return rows(w); };
      return built;
    });

    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    const grid = makeApi();
    engine.setApi(grid.api);
    const success = vi.fn();
    engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success,
      fail: () => {},
    } as never);
    await settle();

    tick();
    await new Promise((r) => setTimeout(r, 40));
    expect(grid.refreshes).toHaveLength(0);

    release!();
    await vi.waitFor(() => expect(success).toHaveBeenCalled());
    await vi.waitFor(() => expect(grid.refreshes.length).toBeGreaterThan(0));
    await engine.close();
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

  it('gives no total to a root block a newer one has superseded', async () => {
    // MEASURED on the 50k x 400 stress book: a filter-pill click left the
    // OUTGOING filter's block in flight, and its grand total built a whole
    // extra View (1,310 ms) for a row the grid was about to replace — in the
    // engine the block the user was waiting for had to queue behind.
    const { table } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const first = vi.fn();
    const second = vi.fn();

    engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: first,
      fail: () => {},
    } as never);
    // A newer ROOT request — a different filter — arrives before the first
    // block has settled.
    engine.datasource.getRows({
      request: { startRow: 0, endRow: 100, filterModel: { assetClass: { filterType: 'set', values: ['Rates'] } } },
      success: second,
      fail: () => {},
    } as never);

    await vi.waitFor(() => {
      expect(first).toHaveBeenCalled();
      expect(second).toHaveBeenCalled();
    });

    // Both blocks still settle exactly once (rule 1); only the current one
    // carries a total.
    expect(first.mock.calls[0][0].grandTotalData).toBeUndefined();
    expect(second.mock.calls[0][0].grandTotalData?.[GRAND_TOTAL_FLAG]).toBe(true);
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

describe('createPerspectiveRowEngine — rows the status bar means', () => {
  it('takes the leaf count from the root level when the grid is flat', async () => {
    const { table } = makeTable(20_000);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    // No second View for a number already in hand: the root level IS the rows.
    expect(engine.status.leafRows).toBe(20_000);
    await engine.close();
  });

  it('measures the leaf count separately while grouped, where rowsAtRoot is GROUPS', async () => {
    // MEASURED on the stress tab before this: an unfiltered 50,000-row book
    // grouped into nine asset classes reported "Rows : 9 of 50,000", because
    // `rowsAtRoot` is what AG sizes its store from — the top-level groups.
    const { table } = makeTable(9);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100, rowGroupCols: [{ id: 'desk' }], groupKeys: [] },
      success: () => {},
      fail: () => {},
    } as never);
    await vi.waitFor(() => expect(engine.status.leafRows).not.toBeNull());

    // The fake answers 9 for every View, so the assertion that matters is that
    // a SEPARATE measurement happened at all: the grouped root reports 8 rows
    // (9 minus its own total row) while the leaf count is the View's own 9.
    expect(engine.status.filteredRows).toBe(8);
    expect(engine.status.leafRows).toBe(9);
    await engine.close();
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

  it('waits for a block in flight before asking the engine anything else', async () => {
    // MEASURED on the 50k x 400 stress book: the block a filter-pill click was
    // waiting on built its own View in 745 ms and did not settle for 3,045 ms,
    // because a set-filter value list and a stale grand total were building in
    // the same engine — Perspective serializes every request over one
    // ProxySession. Rows the user is looking at come first; a badge can trail.
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => { release = r; });
    const { table } = makeCountableTable();
    const view = table.view as unknown as ReturnType<typeof vi.fn>;

    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const success = vi.fn();
    // Hold the block open by stalling the read it is waiting on.
    const original = view.getMockImplementation()!;
    view.mockImplementation(async (config: PerspectiveViewConfig) => {
      const built = await original(config);
      const rows = built.to_columns.bind(built);
      built.to_columns = async (w: never) => { await gate; return rows(w); };
      return built;
    });

    engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success,
      fail: () => {},
    } as never);
    await new Promise((r) => setTimeout(r, 0));

    const viewsBeforeCount = view.mock.calls.length;
    let counted = false;
    const count = engine.countMatching(SET_ENERGY).then((v) => { counted = true; return v; });
    await new Promise((r) => setTimeout(r, 20));

    // The block has not settled, so the count has asked the engine for nothing.
    expect(success).not.toHaveBeenCalled();
    expect(counted).toBe(false);
    expect(view.mock.calls.length).toBe(viewsBeforeCount);

    release!();
    await vi.waitFor(() => expect(success).toHaveBeenCalled());
    expect(await count).toBe(37);
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

describe('distinctValues', () => {
  function makeGroupableTable(distinct = 3) {
    let fire: (() => void) | null = null;
    const grouped: PerspectiveViewConfig[] = [];
    const table: PerspectiveTableLike = {
      async size() {
        return 1000;
      },
      view: vi.fn(async (config: PerspectiveViewConfig) => {
        const isGrouped = (config.group_by?.length ?? 0) > 0;
        if (isGrouped) grouped.push(config);
        const rows = isGrouped ? distinct + 1 : 1000;
        const view: UpdatableView = {
          async to_columns(window) {
            const start = window?.start_row ?? 0;
            const n = Math.max(0, Math.min(window?.end_row ?? 0, rows) - start);
            return {
              __ROW_PATH__: Array.from({ length: n }, (_, i) =>
                start + i === 0 ? [] : [`v${start + i}`],
              ),
              positionId: Array.from({ length: n }, (_, i) => `p${start + i}`),
            };
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
    return { table, grouped, tick: () => fire?.() };
  }

  it('lists a column distinct values', async () => {
    const { table } = makeGroupableTable(3);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    expect(await engine.distinctValues('region')).toEqual(['v1', 'v2', 'v3']);
    await engine.close();
  });

  it('caches — a filter menu reopening must not rebuild a full-book View', async () => {
    const { table, grouped } = makeGroupableTable(3);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    await engine.distinctValues('region');
    await engine.distinctValues('region');
    await engine.distinctValues('region');

    expect(grouped.filter((c) => c.group_by?.[0] === 'region')).toHaveLength(1);
    await engine.close();
  });

  it('holds its floor even after the Table moves', async () => {
    // A column set of distinct values only changes when a row appears,
    // disappears or changes category — never on a price tick.
    vi.useFakeTimers();
    try {
      const { table, grouped, tick } = makeGroupableTable(3);
      const engine = createPerspectiveRowEngine({
        table,
        keyColumn: 'positionId',
        valuesMinIntervalMs: 30_000,
      });
      await engine.datasource.getRows({
        request: { startRow: 0, endRow: 100 },
        success: () => {},
        fail: () => {},
      } as never);

      // The grand-total View is grouped too (by a constant expression column),
      // so count only the ones built for this column.
      const regionViews = () => grouped.filter((c) => c.group_by?.[0] === 'region').length;

      await engine.distinctValues('region');
      tick();
      vi.advanceTimersByTime(5_000);
      await engine.distinctValues('region');
      expect(regionViews()).toBe(1);

      vi.advanceTimersByTime(30_000);
      await engine.distinctValues('region');
      expect(regionViews()).toBe(2);

      await engine.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('caches per column, not globally', async () => {
    const { table, grouped } = makeGroupableTable(3);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    await engine.distinctValues('region');
    await engine.distinctValues('desk');

    expect(grouped.map((c) => c.group_by?.[0])).toEqual(['region', 'desk']);
    await engine.close();
  });

  it('reports null past the ceiling and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { table } = makeGroupableTable(20_000);
      const engine = createPerspectiveRowEngine({
        table,
        keyColumn: 'positionId',
        maxSetFilterValues: 500,
      });

      expect(await engine.distinctValues('positionId')).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('positionId');
      await engine.close();
    } finally {
      warn.mockRestore();
    }
  });

  it('reports null rather than throwing when the read fails', async () => {
    const table: PerspectiveTableLike = {
      view: vi.fn(async () => {
        throw new Error('engine busy');
      }),
    };
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    expect(await engine.distinctValues('region')).toBeNull();
    await engine.close();
  });

  it('reports null once closed, and for a blank column id', async () => {
    const { table } = makeGroupableTable(3);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    expect(await engine.distinctValues('')).toBeNull();
    await engine.close();
    expect(await engine.distinctValues('region')).toBeNull();
  });
});

describe('setQuickFilter', () => {
  /** Records the View configs built, and reports a mixed-type schema. */
  function makeSearchableTable() {
    const configs: PerspectiveViewConfig[] = [];
    const table: PerspectiveTableLike = {
      async size() {
        return 1000;
      },
      async schema() {
        return { positionId: 'string', desk: 'string', quantity: 'float', asOf: 'datetime' };
      },
      view: vi.fn(async (config: PerspectiveViewConfig) => {
        configs.push(config);
        const view: UpdatableView = {
          async to_columns() {
            return { positionId: [] };
          },
          async num_rows() {
            return 1000;
          },
          async delete() {},
          async on_update() {
            return 1;
          },
        };
        return view;
      }),
    };
    return { table, configs };
  }

  const block = (engine: { datasource: { getRows(p: unknown): unknown } }) =>
    engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);

  it('compiles the text into an expression column and a clause', async () => {
    const { table, configs } = makeSearchableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();
    engine.setApi(grid.api);

    await engine.setQuickFilter('mike');
    await block(engine);
    await settle();

    const withQuick = configs.find((c) => c.expressions?.__quick__);
    expect(withQuick).toBeDefined();
    expect(withQuick!.filter).toContainEqual(['__quick__', '==', true]);
    await engine.close();
  });

  it('searches TEXT columns only by default', async () => {
    // MEASURED: one match() per column per token, recharged on every Table
    // update while the View lives — 26 columns x 2 tokens was unusable.
    const { table, configs } = makeSearchableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    engine.setApi(makeApi().api);

    await engine.setQuickFilter('mike');
    await block(engine);
    await settle();

    const expr = configs.find((c) => c.expressions?.__quick__)!.expressions!.__quick__;
    expect(expr).toContain('"positionId"');
    expect(expr).toContain('"desk"');
    expect(expr).not.toContain('"quantity"');
    expect(expr).not.toContain('"asOf"');
    await engine.close();
  });

  it('includes every column when asked to', async () => {
    const { table, configs } = makeSearchableTable();
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      quickFilterAllColumns: true,
    });
    engine.setApi(makeApi().api);

    await engine.setQuickFilter('mike');
    await block(engine);
    await settle();

    const expr = configs.find((c) => c.expressions?.__quick__)!.expressions!.__quick__;
    expect(expr).toContain('"quantity"');
    expect(expr).toContain('"asOf"');
    await engine.close();
  });

  it('purges — AG does not know this filter exists, so it would not', async () => {
    const { table } = makeSearchableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();
    engine.setApi(grid.api);
    grid.refreshes.length = 0;

    await engine.setQuickFilter('mike');

    expect(grid.refreshes).toContainEqual({ purge: true });
    await engine.close();
  });

  it('does nothing when the text has not actually changed', async () => {
    const { table } = makeSearchableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();
    engine.setApi(grid.api);

    await engine.setQuickFilter('mike');
    grid.refreshes.length = 0;
    await engine.setQuickFilter('mike');
    await engine.setQuickFilter('  mike  ');

    // Load-bearing: the purge fires modelUpdated, which is what re-invokes the
    // bridge. Without this guard the pair would loop.
    expect(grid.refreshes).toHaveLength(0);
    await engine.close();
  });

  it('clearing the text removes the expression entirely', async () => {
    const { table, configs } = makeSearchableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    engine.setApi(makeApi().api);

    await engine.setQuickFilter('mike');
    await block(engine);
    await settle();
    configs.length = 0;
    await engine.setQuickFilter('');
    await block(engine);
    await settle();

    expect(configs.every((c) => c.expressions?.__quick__ === undefined)).toBe(true);
    await engine.close();
  });

  it('is a no-op once closed', async () => {
    const { table } = makeSearchableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    await engine.close();
    await expect(engine.setQuickFilter('mike')).resolves.toBeUndefined();
  });
});

describe('setCalcExpressions', () => {
  function makeExprTable(validator?: (e: Record<string, string>) => unknown) {
    const configs: PerspectiveViewConfig[] = [];
    const table: PerspectiveTableLike = {
      async size() {
        return 1000;
      },
      async schema() {
        return { positionId: 'string', price: 'float' };
      },
      ...(validator ? { validate_expressions: async (e: Record<string, string>) => validator(e) as never } : {}),
      view: vi.fn(async (config: PerspectiveViewConfig) => {
        configs.push(config);
        const view: UpdatableView = {
          async to_columns() {
            return { positionId: [] };
          },
          async num_rows() {
            return 1000;
          },
          async delete() {},
          async on_update() {
            return 1;
          },
        };
        return view;
      }),
    };
    return { table, configs };
  }

  const block = (engine: { datasource: { getRows(p: unknown): unknown } }) =>
    engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);

  it('publishes calc columns into the View config', async () => {
    const { table, configs } = makeExprTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    engine.setApi(makeApi().api);

    await engine.setCalcExpressions({ grossPnl: '"price" * "quantity"' });
    await block(engine);
    await settle();

    expect(configs.some((c) => c.expressions?.grossPnl === '"price" * "quantity"')).toBe(true);
    await engine.close();
  });

  it('drops an expression that does not compile, and reports it', async () => {
    // MEASURED: one bad expression makes table.view() throw and takes the WHOLE
    // View down, so a typo in one calculated column would blank the grid.
    const errors: unknown[] = [];
    const { table, configs } = makeExprTable(() => ({
      expression_schema: { good: 'float' },
      errors: { bad: { error_message: 'Input column "nope" does not exist.' } },
    }));
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      onError: (e) => errors.push(e),
    });
    engine.setApi(makeApi().api);

    await engine.setCalcExpressions({ good: '"price" * 2', bad: '"nope" * 2' });
    await block(engine);
    await settle();

    // Every View carries the good one and none carries the bad one. (Checked
    // per-key rather than by deep-equal: the grand-total View adds its own
    // `__all__` constant expression alongside these.)
    const withExprs = configs.filter((c) => c.expressions);
    expect(withExprs.length).toBeGreaterThan(0);
    expect(withExprs.every((c) => c.expressions!.good === '"price" * 2')).toBe(true);
    expect(withExprs.some((c) => 'bad' in c.expressions!)).toBe(false);
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain('bad');
    await engine.close();
  });

  it('keeps every expression when the validator itself fails', async () => {
    // A broken check must not cost the user all of their calculated columns.
    const errors: unknown[] = [];
    const { table, configs } = makeExprTable(() => {
      throw new Error('validator exploded');
    });
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      onError: (e) => errors.push(e),
    });
    engine.setApi(makeApi().api);

    await engine.setCalcExpressions({ a: '"price" * 2' });
    await block(engine);
    await settle();

    expect(configs.some((c) => c.expressions?.a)).toBe(true);
    expect(errors).toHaveLength(1);
    await engine.close();
  });

  it('works on a Table with no validator at all', async () => {
    const { table, configs } = makeExprTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    engine.setApi(makeApi().api);

    await engine.setCalcExpressions({ a: '"price" * 2' });
    await block(engine);
    await settle();

    expect(configs.some((c) => c.expressions?.a)).toBe(true);
    await engine.close();
  });

  it('purges, since AG cannot know a calc column changed', async () => {
    const { table } = makeExprTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();
    engine.setApi(grid.api);
    grid.refreshes.length = 0;

    await engine.setCalcExpressions({ a: '"price" * 2' });

    expect(grid.refreshes).toContainEqual({ purge: true });
    await engine.close();
  });

  it('does nothing when the map has not changed', async () => {
    const { table } = makeExprTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();
    engine.setApi(grid.api);

    await engine.setCalcExpressions({ a: '"price" * 2' });
    grid.refreshes.length = 0;
    await engine.setCalcExpressions({ a: '"price" * 2' });

    expect(grid.refreshes).toHaveLength(0);
    await engine.close();
  });

  it('carries calc columns into a saved-filter count', async () => {
    // A saved filter may well be ON a calculated column; a View that omits the
    // expressions cannot resolve the clause at all.
    const { table, configs } = makeExprTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    engine.setApi(makeApi().api);

    await engine.setCalcExpressions({ grossPnl: '"price" * 2' });
    await engine.countMatching({
      grossPnl: { filterType: 'number', type: 'greaterThan', filter: 10 },
    });

    expect(configs.some((c) => c.expressions?.grossPnl && c.filter)).toBe(true);
    await engine.close();
  });
});

describe('countMatchingExpression / aggregateScalar', () => {
  /** A Table whose Views answer a rule count, an aggregate, or a block, and
   *  which records every config it was asked to build. */
  function makeRuleTable() {
    let fire: (() => void) | null = null;
    const built: PerspectiveViewConfig[] = [];
    const table: PerspectiveTableLike = {
      async size() {
        return 1000;
      },
      view: vi.fn(async (config: PerspectiveViewConfig) => {
        built.push(config);
        const isRuleCount = Boolean(
          config.filter?.some((clause) => clause[0] === '__ruleMatch__'),
        );
        const view: UpdatableView = {
          async to_columns() {
            return { __ROW_PATH__: [[]], price: [100] };
          },
          async num_rows() {
            return isRuleCount ? 12 : 1000;
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
    const ruleCounts = () =>
      built.filter((c) => c.filter?.some((clause) => clause[0] === '__ruleMatch__'));
    return { table, built, ruleCounts, tick: () => fire?.() };
  }

  it('counts a style rule against the whole book', async () => {
    const { table } = makeRuleTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    expect(await engine.countMatchingExpression('"pnl" < 0')).toBe(12);
    await engine.close();
  });

  /**
   * The header painter re-evaluates on the platform's row signal and on every
   * filter change — several times a second under a live feed — and each answer
   * is a View over the whole book in the engine the read path queues behind.
   */
  it('reuses a resolved rule count while nothing has moved', async () => {
    const { table, ruleCounts } = makeRuleTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    await engine.countMatchingExpression('"pnl" < 0');
    await engine.countMatchingExpression('"pnl" < 0');
    await engine.countMatchingExpression('"pnl" < 0');

    expect(ruleCounts()).toHaveLength(1);
    await engine.close();
  });

  it('keeps separate answers for separate rules', async () => {
    const { table, ruleCounts } = makeRuleTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    await engine.countMatchingExpression('"pnl" < 0');
    await engine.countMatchingExpression('"price" > 100');

    expect(ruleCounts()).toHaveLength(2);
    await engine.close();
  });

  /**
   * The count is scoped to the grid's filter, so the same rule under a
   * different filter is a different question and must not be served the
   * previous answer.
   */
  it('re-asks when the grid filter changes under the same rule', async () => {
    const { table, ruleCounts } = makeRuleTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await engine.countMatchingExpression('"pnl" < 0');
    expect(ruleCounts()).toHaveLength(1);

    await engine.datasource.getRows({
      request: {
        startRow: 0,
        endRow: 100,
        filterModel: { sector: { filterType: 'set', values: ['Energy'] } },
      },
      success: () => {},
      fail: () => {},
    } as never);
    await engine.countMatchingExpression('"pnl" < 0');
    expect(ruleCounts()).toHaveLength(2);

    await engine.close();
  });

  it('recomputes once the Table has moved and the floor has passed', async () => {
    vi.useFakeTimers();
    try {
      const { table, ruleCounts, tick } = makeRuleTable();
      const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
      await engine.datasource.getRows({
        request: { startRow: 0, endRow: 100 },
        success: () => {},
        fail: () => {},
      } as never);

      await engine.countMatchingExpression('"pnl" < 0');
      expect(ruleCounts()).toHaveLength(1);

      // Time alone proves nothing — the count is still true.
      vi.advanceTimersByTime(5_000);
      await engine.countMatchingExpression('"pnl" < 0');
      expect(ruleCounts()).toHaveLength(1);

      tick();
      vi.advanceTimersByTime(1_500);
      await engine.countMatchingExpression('"pnl" < 0');
      expect(ruleCounts()).toHaveLength(2);

      await engine.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('measures a column aggregate for a cross-row rule', async () => {
    const { table } = makeRuleTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    expect(await engine.aggregateScalar('price', 'avg')).toBe(100);
    await engine.close();
  });

  it('answers null for an empty expression, an empty column and once closed', async () => {
    const { table } = makeRuleTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    expect(await engine.countMatchingExpression('')).toBeNull();
    expect(await engine.aggregateScalar('', 'avg')).toBeNull();

    await engine.close();
    expect(await engine.countMatchingExpression('"pnl" < 0')).toBeNull();
    expect(await engine.aggregateScalar('price', 'avg')).toBeNull();
  });

  /** A rejection must reach the caller as null, never as a thrown error or a
   *  zero — a header badge cannot be allowed to break the grid. */
  it('answers null rather than throwing when the View cannot be built', async () => {
    const table: PerspectiveTableLike = {
      async size() {
        return 1000;
      },
      view: vi.fn(async () => {
        throw new Error('Value Error - Input column "nope" does not exist.');
      }),
    };
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    expect(await engine.countMatchingExpression('"nope" < 0')).toBeNull();
    expect(await engine.aggregateScalar('nope', 'avg')).toBeNull();
    await engine.close();
  });
});

describe('master/detail and tree mode', () => {
  function makeDetailTable(total = 3) {
    const built: PerspectiveViewConfig[] = [];
    const table: PerspectiveTableLike = {
      async size() {
        return 1000;
      },
      view: vi.fn(async (config: PerspectiveViewConfig) => {
        built.push(config);
        const view: UpdatableView = {
          async to_columns(window) {
            const start = window?.start_row ?? 0;
            const n = Math.max(0, Math.min(window?.end_row ?? 0, total) - start);
            return { leg: Array.from({ length: n }, (_, i) => `L${start + i}`) };
          },
          async num_rows() {
            return total;
          },
          async delete() {},
          async on_update() {
            return 1;
          },
        };
        return view;
      }),
    };
    return { table, built };
  }

  it('reads a master row\'s children from the book', async () => {
    const { table, built } = makeDetailTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    const rows = await engine.readMatchingRows({ tradeId: 'T1' });
    expect(rows).toHaveLength(3);
    expect(built.at(-1)!.filter).toEqual([['tradeId', '==', 'T1']]);
    await engine.close();
  });

  it('applies the configured detail ceiling by default', async () => {
    const { table } = makeDetailTable(1000);
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      maxDetailRows: 7,
    });

    expect(await engine.readMatchingRows({ tradeId: 'T1' })).toHaveLength(7);
    // An explicit limit still wins.
    expect(await engine.readMatchingRows({ tradeId: 'T1' }, 2)).toHaveLength(2);
    await engine.close();
  });

  it('answers null once closed rather than throwing', async () => {
    const { table } = makeDetailTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    await engine.close();
    expect(await engine.readMatchingRows({ tradeId: 'T1' })).toBeNull();
  });

  /**
   * `setRowCount` raises AG error #28 whenever a row-group column exists, and
   * the error is SILENT without ValidationModule. A tree level is a group
   * level by another name, so tree mode must count as grouped from the very
   * first block — including the one AG requests before `onGridReady`.
   */
  it('never publishes a row count in tree mode', async () => {
    const { table } = makeTable(20_000);
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      treeFields: ['sector', 'book'],
    });
    const grid = makeApi();
    engine.setApi(grid.api);

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    expect(grid.rowCounts).toEqual([]);
  });

  /** The flat control: without tree fields the same request DOES publish it,
   *  so the assertion above is about tree mode and not about the fixture. */
  it('still publishes a row count when flat', async () => {
    const { table } = makeTable(20_000);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();
    engine.setApi(grid.api);

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    expect(grid.rowCounts).toContain(20_000);
  });
});

describe('createPerspectiveRowEngine — column window', () => {
  function makeSchemaTable(fields: Record<string, string>, totalRows = 1000) {
    const made = makeTable(totalRows);
    return { ...made, table: { ...made.table, schema: async () => fields } };
  }

  const BOOK = { positionId: 'string', desk: 'string', pnl: 'float' };

  it('pins the key column, whatever the window says', async () => {
    // `getRowId` reads it. Without it every row in a block keys the same and AG
    // DISCARDS the block (warn 205) rather than rendering it wrong.
    const { table } = makeSchemaTable(BOOK);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    engine.setApi(makeApi().api);

    engine.setColumnWindow({ columns: ['pnl'] });
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    const config = (table.view as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(config.columns).toEqual(['pnl', 'positionId']);
  });

  it('pins the tree fields too', async () => {
    const { table } = makeSchemaTable({ ...BOOK, region: 'string' });
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      treeFields: ['region'],
    });
    engine.setApi(makeApi().api);

    engine.setColumnWindow({ columns: ['pnl'] });
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100, groupKeys: [] },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    // The BLOCK View, found by its group_by rather than by position: a grouped
    // grid also measures its leaf row count, and that transient View is
    // deliberately un-narrowed, so it is the last call made.
    const configs = (table.view as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    const block = configs.find((c) => c.group_by?.[0] === 'region');
    expect(block?.columns).toContain('region');
  });

  it('re-reads the loaded blocks WITHOUT purging', async () => {
    // A purge is what AG's own documentation points at, and it would throw away
    // the scroll position and every expanded group on each horizontal scroll.
    // A non-purging refresh invalidates and re-requests the loaded blocks, so a
    // widened window fills the new columns in place.
    const { table } = makeSchemaTable(BOOK);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();
    engine.setApi(grid.api);

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();
    grid.refreshes.length = 0;

    engine.setColumnWindow({ columns: ['pnl'] });

    expect(grid.refreshes.length).toBeGreaterThan(0);
    expect(grid.refreshes.every((r) => r.purge !== true)).toBe(true);
  });

  it('does nothing at all when the window has not changed', async () => {
    const { table } = makeSchemaTable(BOOK);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();
    engine.setApi(grid.api);

    engine.setColumnWindow({ columns: ['pnl'] });
    grid.refreshes.length = 0;
    engine.setColumnWindow({ columns: ['pnl'] });

    expect(grid.refreshes).toEqual([]);
  });
});
