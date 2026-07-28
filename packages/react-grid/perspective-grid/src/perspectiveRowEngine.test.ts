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
