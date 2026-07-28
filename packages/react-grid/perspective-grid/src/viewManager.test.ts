import { describe, expect, it, vi } from 'vitest';
import { createViewManager, type PerspectiveTableLike, type UpdatableView } from './viewManager.js';
import type { PerspectiveViewConfig } from './viewConfig.js';

interface FakeView extends UpdatableView {
  config: PerspectiveViewConfig;
  deleted: boolean;
  fire(): void;
  reads: { start_row: number; end_row: number }[];
}

/**
 * A Table whose Views report their config and record the exact windows read,
 * so the group-level offset and the `__ROW_PATH__` remap can be asserted
 * rather than inferred.
 */
function makeTable(totalRows = 1000) {
  const views: FakeView[] = [];

  const table: PerspectiveTableLike = {
    view: vi.fn(async (config: PerspectiveViewConfig) => {
      const grouped = (config.group_by?.length ?? 0) > 0;
      // Per-View, not shared: a retired View's callback can still fire while
      // its delete drains, and that is exactly what one of these tests asserts.
      let updateCb: (() => void) | null = null;
      const view: FakeView = {
        config,
        deleted: false,
        reads: [],
        fire: () => updateCb?.(),
        async to_columns(window) {
          const start = window?.start_row ?? 0;
          const end = window?.end_row ?? 0;
          view.reads.push({ start_row: start, end_row: end });
          const n = Math.max(0, Math.min(end, totalRows) - start);
          if (!grouped) {
            return {
              positionId: Array.from({ length: n }, (_, i) => `p${start + i}`),
              pnl: Array.from({ length: n }, (_, i) => (start + i) * 10),
            };
          }
          return {
            // Row 0 of a grouped view is the level total: an empty path.
            __ROW_PATH__: Array.from({ length: n }, (_, i) =>
              start + i === 0 ? [] : [`g${start + i}`],
            ),
            pnl: Array.from({ length: n }, (_, i) => (start + i) * 10),
          };
        },
        async num_rows() {
          return totalRows;
        },
        async delete() {
          view.deleted = true;
        },
        async on_update(cb: () => void) {
          updateCb = cb;
          return 1;
        },
      };
      views.push(view);
      return view;
    }),
  };

  return { table, views };
}

const GROUPS = [{ id: 'sector' }, { id: 'book' }];

describe('createViewManager — View identity', () => {
  it('reuses the live View for an identical request', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });

    await views.getView({ startRow: 0, endRow: 100 });
    await views.getView({ startRow: 100, endRow: 200 });

    expect(table.view).toHaveBeenCalledTimes(1);
    expect(views.liveViews).toBe(1);
  });

  it('builds one View per group level and keeps them all alive', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });
    const base = { startRow: 0, endRow: 100, rowGroupCols: GROUPS };

    await views.getView({ ...base, groupKeys: [] });
    await views.getView({ ...base, groupKeys: ['Energy'] });
    await views.getView({ ...base, groupKeys: ['Technology'] });

    // A grouped grid pulls levels concurrently; collapsing them onto one View
    // would rebuild it per block.
    expect(table.view).toHaveBeenCalledTimes(3);
    expect(views.liveViews).toBe(3);
  });

  it('builds only ONE View when two blocks race for the same level', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });

    await Promise.all([
      views.getView({ startRow: 0, endRow: 100 }),
      views.getView({ startRow: 100, endRow: 200 }),
    ]);

    expect(table.view).toHaveBeenCalledTimes(1);
  });
});

describe('createViewManager — group level reads', () => {
  it('skips the level total row and remaps __ROW_PATH__ onto the group column', async () => {
    const { table, views: built } = makeTable();
    const views = createViewManager({ table });

    const view = await views.getView({
      startRow: 0,
      endRow: 3,
      rowGroupCols: GROUPS,
      groupKeys: [],
    });
    const columns = await view!.to_columns({ start_row: 0, end_row: 3 });

    // Read is offset by one: AG asked for children, row 0 is the total.
    expect(built[0].reads).toEqual([{ start_row: 1, end_row: 4 }]);
    expect(columns.sector).toEqual(['g1', 'g2', 'g3']);
    expect(columns.__ROW_PATH__).toBeUndefined();
  });

  it('does not offset at the leaf level, where rows are real rows', async () => {
    const { table, views: built } = makeTable();
    const views = createViewManager({ table });

    const view = await views.getView({
      startRow: 0,
      endRow: 3,
      rowGroupCols: GROUPS,
      groupKeys: ['Energy', 'FI-GOVT'],
    });
    const columns = await view!.to_columns({ start_row: 0, end_row: 3 });

    expect(built[0].reads).toEqual([{ start_row: 0, end_row: 3 }]);
    expect(columns.positionId).toEqual(['p0', 'p1', 'p2']);
  });

  it('excludes the total row from the row count of a grouped level only', async () => {
    const { table } = makeTable(500);
    const grouped = createViewManager({ table });
    await grouped.getView({ startRow: 0, endRow: 100, rowGroupCols: GROUPS, groupKeys: [] });
    expect(grouped.rowsAtRoot).toBe(499);

    const flat = createViewManager({ table: makeTable(500).table });
    await flat.getView({ startRow: 0, endRow: 100 });
    expect(flat.rowsAtRoot).toBe(500);
  });
});

describe('createViewManager — the generation fence', () => {
  // THE regression this guards: the datasource captures the generation before
  // `getView` and re-checks it after. Bumping on a request-driven swap fences
  // off the very request that asked for the View, and the grid renders blank
  // on first load and after every sort and filter change.
  it('does not move the generation when a request builds or swaps a View', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });

    expect(views.getGeneration()).toBe(0);
    await views.getView({ startRow: 0, endRow: 100 });
    expect(views.getGeneration()).toBe(0);

    await views.getView({ startRow: 0, endRow: 100, sortModel: [{ colId: 'pnl', sort: 'desc' }] });
    expect(views.getGeneration()).toBe(0);
  });

  it('moves it only on an explicit invalidate', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });
    await views.getView({ startRow: 0, endRow: 100 });

    views.invalidate();
    expect(views.getGeneration()).toBe(1);
  });
});

describe('createViewManager — retirement', () => {
  it('retires every View when the sort/filter/grouping shape changes', async () => {
    const { table, views: built } = makeTable();
    const views = createViewManager({ table });
    const base = { startRow: 0, endRow: 100, rowGroupCols: GROUPS };

    await views.getView({ ...base, groupKeys: [] });
    await views.getView({ ...base, groupKeys: ['Energy'] });
    expect(views.liveViews).toBe(2);

    // A new sort makes both levels garbage; keeping them would charge the
    // engine on every tick for a shape nothing will ask for again.
    await views.getView({ ...base, groupKeys: [], sortModel: [{ colId: 'pnl', sort: 'desc' }] });
    expect(views.liveViews).toBe(1);
    await Promise.resolve();
    expect(built[0].deleted).toBe(true);
    expect(built[1].deleted).toBe(true);
  });

  it('evicts the least recently used beyond maxViews', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table, maxViews: 2 });
    const base = { startRow: 0, endRow: 100, rowGroupCols: GROUPS };

    await views.getView({ ...base, groupKeys: [] });
    await views.getView({ ...base, groupKeys: ['A'] });
    await views.getView({ ...base, groupKeys: ['B'] });

    expect(views.liveViews).toBe(2);
  });

  it('re-opens a View retired under an in-flight block instead of settling short', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });

    const stale = await views.getView({ startRow: 0, endRow: 3 });
    // A sort lands, retiring the View the block is about to read from.
    await views.getView({ startRow: 0, endRow: 3, sortModel: [{ colId: 'pnl', sort: 'desc' }] });

    const columns = await stale!.to_columns({ start_row: 0, end_row: 3 });

    // An empty window at a non-zero start row is indistinguishable from the
    // end of the book and would cap the store forever, so it must be rows.
    expect(columns.positionId).toEqual(['p0', 'p1', 'p2']);
  });

  it('closes every live View on close()', async () => {
    const { table, views: built } = makeTable();
    const views = createViewManager({ table });
    await views.getView({ startRow: 0, endRow: 100, rowGroupCols: GROUPS, groupKeys: [] });
    await views.getView({ startRow: 0, endRow: 100, rowGroupCols: GROUPS, groupKeys: ['Energy'] });

    await views.close();

    expect(built.every((v) => v.deleted)).toBe(true);
    expect(views.liveViews).toBe(0);
    expect(await views.getView({ startRow: 0, endRow: 100 })).toBeNull();
  });
});

describe('createViewManager — grand total', () => {
  it('reads row 0, which is the total over the whole filtered book', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });

    const total = await views.readGrandTotal({
      startRow: 0,
      endRow: 100,
      rowGroupCols: GROUPS,
      groupKeys: [],
    });

    expect(total).toEqual({ pnl: 0 });
    expect(total).not.toHaveProperty('__ROW_PATH__');
  });

  it('reuses the root level View when grouping is on — the total is free', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });
    const request = { startRow: 0, endRow: 100, rowGroupCols: GROUPS, groupKeys: [] };

    await views.getView(request);
    await views.readGrandTotal(request);

    expect(table.view).toHaveBeenCalledTimes(1);
    expect(views.liveViews).toBe(1);
  });

  it('adds a constant-expression group when flat, because plain rows have no total', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });

    await views.readGrandTotal({ startRow: 0, endRow: 100 });

    const config = (table.view as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(config.group_by).toEqual(['__all__']);
    expect(config.expressions).toEqual({ __all__: "'ALL'" });
  });
});

describe('createViewManager — update subscription', () => {
  it('reports a Table update on a live View', async () => {
    const { table, views: built } = makeTable();
    const onUpdate = vi.fn();
    const views = createViewManager({ table, onUpdate });
    await views.getView({ startRow: 0, endRow: 100 });

    built[0].fire();

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('ignores a tick from a View that has been retired', async () => {
    const { table, views: built } = makeTable();
    const onUpdate = vi.fn();
    const views = createViewManager({ table, onUpdate });
    await views.getView({ startRow: 0, endRow: 100 });
    await views.getView({ startRow: 0, endRow: 100, sortModel: [{ colId: 'pnl', sort: 'desc' }] });

    // The first View's callback can still fire while its delete drains.
    built[0].fire();

    expect(onUpdate).not.toHaveBeenCalled();
  });
});
