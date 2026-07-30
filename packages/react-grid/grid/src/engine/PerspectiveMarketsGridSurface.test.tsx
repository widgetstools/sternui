import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import {
  PerspectiveMarketsGridSurface,
  type PerspectiveMarketsGridSurfaceHandle,
} from './PerspectiveMarketsGridSurface.js';

/** Capture the props AG Grid is mounted with, without mounting AG Grid. */
const mounted: Record<string, unknown>[] = [];
vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: Record<string, unknown>) => {
    mounted.push(props);
    return null;
  },
}));

const table = {
  view: vi.fn(async () => ({
    to_columns: async () => ({}),
    num_rows: async () => 0,
    delete: async () => {},
  })),
};

const renderSurface = (overrides: Record<string, unknown> = {}) => {
  mounted.length = 0;
  const ref = createRef<PerspectiveMarketsGridSurfaceHandle>();
  const result = render(
    <PerspectiveMarketsGridSurface
      ref={ref}
      table={table as never}
      keyColumn="positionId"
      columnDefs={[{ field: 'positionId' }, { field: 'pnl' }]}
      {...overrides}
    />,
  );
  return { ref, result, last: () => mounted[mounted.length - 1] };
};

describe('PerspectiveMarketsGridSurface', () => {
  it('mounts the server-side row model with a datasource, never rowData', async () => {
    const { last } = renderSurface();
    await waitFor(() => expect(last().serverSideDatasource).toBeDefined());

    // A window on the pull path must never hold the book.
    expect(last().rowModelType).toBe('serverSide');
    expect(last().rowData).toBeUndefined();
  });

  it('uses the 100-row block size the read measurements were taken at', () => {
    const { last } = renderSurface();
    expect(last().cacheBlockSize).toBe(100);
  });

  describe('getRowId', () => {
    const rowId = (
      getRowId: (params: Record<string, unknown>) => string,
      params: Record<string, unknown>,
    ) => getRowId({ parentKeys: [], api: { getRowGroupColumns: () => [] }, ...params });

    it('returns AG own id for the grand total, or a transaction cannot find it', () => {
      const { last } = renderSurface();
      const getRowId = last().getRowId as (p: Record<string, unknown>) => string;
      expect(rowId(getRowId, { level: 0, data: { __grandTotal: true } })).toBe(
        'rowGroupFooter_ROOT_NODE_ID',
      );
    });

    it('builds a group id from the PATH — a leaf key collides across groups', () => {
      // Duplicate ids turn a successful block into a failed one (warn 205)
      // rather than warning visibly.
      const { last } = renderSurface();
      const getRowId = last().getRowId as (p: Record<string, unknown>) => string;
      const api = {
        getRowGroupColumns: () => [{ getColDef: () => ({ field: 'desk' }) }],
      };
      expect(
        rowId(getRowId, { level: 0, parentKeys: [], data: { desk: 'Rates' }, api }),
      ).toBe('Rates');
      expect(
        rowId(getRowId, { level: 1, parentKeys: ['Rates'], data: { positionId: 'p1' }, api }),
      ).toBe('Rates/p1');
    });

    it('falls back to the key column at the leaf level', () => {
      const { last } = renderSurface();
      const getRowId = last().getRowId as (p: Record<string, unknown>) => string;
      expect(rowId(getRowId, { level: 0, data: { positionId: 'p9' } })).toBe('p9');
    });
  });

  it('normalizes the legacy boolean grandTotalRow — AG 36 takes a position', () => {
    expect(renderSurface({ grandTotalRow: true }).last().grandTotalRow).toBe('pinnedBottom');
    expect(renderSurface({ grandTotalRow: false }).last().grandTotalRow).toBeUndefined();
    expect(renderSurface({ grandTotalRow: 'bottom' }).last().grandTotalRow).toBe('bottom');
  });

  it('closes the engine on unmount — live Views are charged on every tick', async () => {
    const view = { to_columns: async () => ({}), num_rows: async () => 0, delete: vi.fn(async () => {}) };
    const owned = { view: vi.fn(async () => view) };
    const { result } = renderSurface({ table: owned });

    // Force a View to exist so there is something to clean up.
    const datasource = mounted[mounted.length - 1].serverSideDatasource as {
      getRows(p: unknown): void;
    };
    datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    });
    await waitFor(() => expect(owned.view).toHaveBeenCalled());

    result.unmount();
    await waitFor(() => expect(view.delete).toHaveBeenCalled());
  });

  it('exposes refresh and live control through the ref', async () => {
    const { ref } = renderSurface();
    await waitFor(() => expect(ref.current).not.toBeNull());
    expect(() => ref.current!.refresh()).not.toThrow();
    expect(() => ref.current!.setLive(false)).not.toThrow();
  });
});

describe('PerspectiveMarketsGridSurface — status bar', () => {
  it('defaults to the Perspective panel, since AG stock panels count client rows', async () => {
    const { last } = renderSurface();
    await waitFor(() => expect(last().statusBar).toBeDefined());
    expect(last().statusBar).toEqual({
      statusPanels: [{ statusPanel: 'perspectiveStatusPanel', align: 'left' }],
    });
    expect(last().components.perspectiveStatusPanel).toBeDefined();
  });

  it('never overrides a status bar the host asked for', async () => {
    const own = { statusPanels: [{ statusPanel: 'agSelectedRowCountComponent' }] };
    const { last } = renderSurface({ statusBar: own });
    await waitFor(() => expect(last().statusBar).toBe(own));
  });

  it('passes the engine through context, which is how the panel reaches it', async () => {
    const { last } = renderSurface();
    await waitFor(() =>
      expect(last().context?.perspectiveEngineHolder?.get()).toBeTruthy(),
    );
  });

  // AG reads `context` when it CREATES the grid and hands that value to every
  // status panel. A new object per engine never reaches them, so the identity
  // has to outlive the engine it points at.
  it('keeps ONE context object across engine rebuilds', async () => {
    const { last, result } = renderSurface();
    await waitFor(() => expect(last().context?.perspectiveEngineHolder?.get()).toBeTruthy());
    const first = last().context;
    const engineBefore = last().context.perspectiveEngineHolder.get();

    // A provider restart hands over a different Table.
    result.rerender(
      <PerspectiveMarketsGridSurface
        table={{ ...table } as never}
        keyColumn="positionId"
        columnDefs={[{ field: 'positionId' }]}
      />,
    );
    await waitFor(() =>
      expect(last().context.perspectiveEngineHolder.get()).not.toBe(engineBefore),
    );
    expect(last().context).toBe(first);
  });
});

/**
 * The pull path is a row supply, not a different grid. Anything a user sets in
 * the customizer — grouping, pagination, row selection — has to reach this
 * surface the way it reaches the CSRM one, or the "SSRM performance with CSRM
 * features" claim is only half true.
 */
describe('PerspectiveMarketsGridSurface — module pipeline options', () => {
  it('spreads pipeline grid options onto the grid', async () => {
    const { last } = renderSurface({
      gridOptions: { pagination: true, paginationPageSize: 500, rowSelection: 'multiple' },
    });
    await waitFor(() => expect(last().serverSideDatasource).toBeDefined());

    expect(last().pagination).toBe(true);
    expect(last().paginationPageSize).toBe(500);
    expect(last().rowSelection).toBe('multiple');
  });

  it('refuses to let the pipeline replace the row supply', async () => {
    const { last } = renderSurface({
      gridOptions: {
        rowModelType: 'clientSide',
        serverSideDatasource: { getRows: () => {} },
        cacheBlockSize: 7,
        getRowId: () => 'nope',
        context: { perspectiveEngine: null },
      },
    });
    await waitFor(() => expect(last().serverSideDatasource).toBeDefined());

    // Overriding these does not customize the grid, it detaches it from the Table.
    expect(last().rowModelType).toBe('serverSide');
    expect(last().cacheBlockSize).toBe(100);
    expect(last().getRowId).not.toBe('nope');
    expect((last().context as { perspectiveEngine: unknown }).perspectiveEngine).not.toBeNull();
  });

  it('lets a host prop beat the pipeline, and the pipeline fill in what the host omits', async () => {
    const { last } = renderSurface({
      gridOptions: { rowHeight: 20, headerHeight: 30 },
      rowHeight: 44,
    });
    await waitFor(() => expect(last().serverSideDatasource).toBeDefined());

    expect(last().rowHeight).toBe(44);
    // An omitted host prop must not send `undefined` and blank the pipeline value.
    expect(last().headerHeight).toBe(30);
  });
});

/**
 * The pull path must be the same grid, not a lookalike. These are the props
 * `MarketsGridSurface` sets unconditionally — each one has a toolbar or a
 * persistence path behind it, and every one of them was missing.
 */
describe('PerspectiveMarketsGridSurface — parity with the CSRM surface', () => {
  it('enables cell selection — the formatting toolbar resolves columns from cell ranges', async () => {
    const { last } = renderSurface();
    await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
    // `cellSelection` is in SURFACE_FIXED_GRID_OPTION_KEYS, so the pipeline's
    // copy is stripped and the surface owns it. Omitting it turned the
    // formatting toolbar's `api.getCellRanges()` into a permanent empty list.
    expect(last().cellSelection).toBe(true);
  });

  it('registers the traffic-light agg funcs', async () => {
    const { last } = renderSurface();
    await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
    expect(last().aggFuncs).toBeDefined();
  });

  it('keeps column order stable, like the CSRM surface', async () => {
    const { last } = renderSurface();
    await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
    expect(last().maintainColumnOrder).toBe(true);
  });

  it('passes the context menu builder and the pre-destroy hook through', async () => {
    const getContextMenuItems = vi.fn();
    const onGridPreDestroyed = vi.fn();
    const { last } = renderSurface({ getContextMenuItems, onGridPreDestroyed });
    await waitFor(() => expect(last().serverSideDatasource).toBeDefined());

    // Right-click Settings / Remove from Grid, and profile state capture —
    // a layout is lost without the latter.
    expect(last().getContextMenuItems).toBe(getContextMenuItems);
    expect(last().onGridPreDestroyed).toBe(onGridPreDestroyed);
  });

  it('forwards the host AgGridReact ref', async () => {
    const gridRef = { current: null };
    const { last } = renderSurface({ gridRef });
    await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
    expect(last().ref).toBe(gridRef);
  });
  describe('saved-filter count contract', () => {
    // `useFilterModel` puts a row count on every saved-filter pill by reading
    // these off the grid `context` whenever the client does not hold the book.
    // Only CustomSSRMGrid ever answered, so the counts were silently absent.
    it('exposes ssrmCountMatching + ssrmConfigured once an engine exists', async () => {
      const { last } = renderSurface();
      await waitFor(() => expect(last().serverSideDatasource).toBeDefined());

      const context = last().context as {
        ssrmCountMatching: (m: Record<string, unknown>) => Promise<number | null>;
        ssrmConfigured: boolean;
      };
      expect(typeof context.ssrmCountMatching).toBe('function');
      expect(context.ssrmConfigured).toBe(true);
    });

    it('keeps one context object across re-renders — AG reads it once', async () => {
      const { last, result, ref } = renderSurface();
      await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
      const before = last().context;

      result.rerender(
        <PerspectiveMarketsGridSurface
          ref={ref}
          table={table as never}
          keyColumn="positionId"
          columnDefs={[{ field: 'positionId' }, { field: 'pnl' }]}
          rowHeight={40}
        />,
      );

      expect(last().context).toBe(before);
    });

    it('counts through the holder, so an engine swap does not strand it', async () => {
      const { last } = renderSurface();
      await waitFor(() => expect(last().serverSideDatasource).toBeDefined());

      const context = last().context as {
        ssrmCountMatching: (m: Record<string, unknown>) => Promise<number | null>;
      };
      // The fake Table reports 0 rows for every View, filtered or not.
      await expect(
        context.ssrmCountMatching({ sector: { filterType: 'set', values: ['Energy'] } }),
      ).resolves.toBe(0);
    });
  });
  describe('cell edits', () => {
    /** Drive the surface to grid-ready and hand back the listener it registered. */
    const readyWithEditor = async () => {
      const updates: Record<string, unknown>[][] = [];
      const writable = {
        view: async () => ({
          to_columns: async () => ({}),
          num_rows: async () => 0,
          delete: async () => {},
          on_update: async () => 1,
        }),
        update: async (rows: Record<string, unknown>[]) => {
          updates.push(rows);
        },
      };
      const listeners: Record<string, (e: unknown) => void> = {};
      const api = {
        addEventListener: (type: string, fn: (e: unknown) => void) => {
          listeners[type] = fn;
        },
        removeEventListener: () => {},
        isDestroyed: () => false,
      };

      const { last } = renderSurface({ table: writable });
      await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
      (last().onGridReady as (e: unknown) => void)({ api });
      return { listeners, updates };
    };

    it('routes a committed edit into the Table, not just the row node', async () => {
      // Under the server row model AG writes the edit onto the block-cache row
      // node only, and the next refresh reads the old value back over it.
      const { listeners, updates } = await readyWithEditor();
      expect(listeners.cellValueChanged).toBeDefined();

      listeners.cellValueChanged({
        colDef: { field: 'trader' },
        data: { positionId: 'p7', trader: 'AR' },
        newValue: 'AR',
      });

      await waitFor(() => expect(updates).toHaveLength(1));
      expect(updates[0]).toEqual([{ positionId: 'p7', trader: 'AR' }]);
    });

    it('ignores the grand total and group rows — neither is a row of the book', async () => {
      const { listeners, updates } = await readyWithEditor();

      listeners.cellValueChanged({
        colDef: { field: 'pnl' },
        data: { __grandTotal: true, pnl: 1 },
        newValue: 1,
      });
      listeners.cellValueChanged({
        colDef: { field: 'pnl' },
        data: { pnl: 2 },
        node: { group: true },
        newValue: 2,
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(updates).toHaveLength(0);
    });
  });
  describe('set-filter values', () => {
    it('routes a column values callback to the engine through the holder', async () => {
      // Without this every column filter menu is empty: the client holds only
      // the loaded blocks, so AG has no values to build a checkbox list from.
      const { last } = renderSurface();
      await waitFor(() => expect(last().serverSideDatasource).toBeDefined());

      const defs = last().columnDefs as Record<string, unknown>[];
      const pnl = defs.find((d) => d.field === 'pnl')!;
      const params = pnl.filterParams as {
        values: (p: { success(v: unknown[]): void }) => void;
        suppressClearModelOnRefreshValues: boolean;
      };
      expect(typeof params.values).toBe('function');
      expect(params.suppressClearModelOnRefreshValues).toBe(true);

      // The fake Table reports one group row (the level total), so the engine
      // finds no distinct values — and an empty list must still settle.
      await expect(
        new Promise((resolve) => params.values({ success: resolve })),
      ).resolves.toEqual([]);
    });
  });
});
