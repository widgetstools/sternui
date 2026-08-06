import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { GridProvider } from '../customizer/hooks/GridProvider.js';
import {
  SsrmEngineMarketsGridSurface,
  type SsrmEngineMarketsGridSurfaceHandle,
} from './SsrmEngineMarketsGridSurface.js';

/** Capture the props AG Grid is mounted with, without mounting AG Grid. */
const mounted: Record<string, unknown>[] = [];
vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: Record<string, unknown>) => {
    mounted.push(props);
    return null;
  },
}));

/** The window's handle on the worker-held book, faked. */
function fakeClient(overrides: Record<string, unknown> = {}) {
  return {
    size: 20_000,
    getRows: vi.fn(async () => ({ rowData: [{ positionId: 'p0' }], rowCount: 20_000 })),
    grandTotal: vi.fn(async () => ({ pnl: 42 })),
    countFiltered: vi.fn(async () => 20_000),
    distinctValues: vi.fn(async () => ['Rates', 'Credit']),
    setQuickFilter: vi.fn(async () => true),
    setCalcColumns: vi.fn(async () => true),
    calcDiagnostics: vi.fn(async () => []),
    setViewport: vi.fn(async () => {}),
    applyUpdate: vi.fn(async () => ({ changed: [], removed: [] })),
    subscribe: vi.fn(() => () => {}),
    ...overrides,
  };
}

const renderSurface = (overrides: Record<string, unknown> = {}) => {
  mounted.length = 0;
  const ref = createRef<SsrmEngineMarketsGridSurfaceHandle>();
  const client = (overrides.client as ReturnType<typeof fakeClient>) ?? fakeClient();
  const result = render(
    <SsrmEngineMarketsGridSurface
      ref={ref}
      client={client as never}
      keyColumn="positionId"
      columnDefs={[{ field: 'positionId' }, { field: 'desk' }]}
      {...overrides}
    />,
  );
  return { ref, result, client, last: () => mounted[mounted.length - 1] };
};

/** Drive the surface to grid-ready and hand back the listeners it registered. */
async function readyWith(overrides: Record<string, unknown> = {}, api: Record<string, unknown> = {}) {
  const listeners: Record<string, (e: unknown) => void> = {};
  let quickFilterText = '';
  const gridApi = {
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners[type] = fn;
    },
    removeEventListener: () => {},
    isDestroyed: () => false,
    getGridOption: (k: string) => (k === 'quickFilterText' ? quickFilterText : undefined),
    getRowNode: () => undefined,
    applyServerSideTransaction: () => {},
    refreshServerSide: () => {},
    setRowCount: () => {},
    getFirstDisplayedRowIndex: () => -1,
    getLastDisplayedRowIndex: () => -1,
    ...api,
  };
  const rendered = renderSurface(overrides);
  await waitFor(() => expect(rendered.last().serverSideDatasource).toBeDefined());
  (rendered.last().onGridReady as (e: unknown) => void)({ api: gridApi });
  return {
    ...rendered,
    listeners,
    api: gridApi,
    setText: (t: string) => {
      quickFilterText = t;
    },
    fireModelUpdated: () => listeners.modelUpdated?.({ api: gridApi }),
  };
}

describe('SsrmEngineMarketsGridSurface', () => {
  it('mounts the server-side row model with a datasource, never rowData', async () => {
    const { last } = renderSurface();
    await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
    // A window on the pull path must never hold the book.
    expect(last().rowModelType).toBe('serverSide');
    expect(last().rowData).toBeUndefined();
  });

  it('uses the 100-row block size every measurement was taken at', async () => {
    const { last } = renderSurface();
    await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
    expect(last().cacheBlockSize).toBe(100);
  });

  it('renders a skeleton stub, and reaches the renderer that makes it one', async () => {
    // Both halves. AG's server row model paints a FULL-WIDTH loading row and
    // consults the colDef `loadingCellRenderer` ONLY when the suppress flag is
    // set — setting the renderer alone ships it inert, which is what happened
    // the first time on the Perspective surface.
    const { last } = renderSurface();
    await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
    expect(last().suppressServerSideFullWidthLoadingRow).toBe(true);
    expect((last().defaultColDef as Record<string, unknown>).loadingCellRenderer).toBeDefined();
  });

  it('matches the pivot separator the engine generates field names with', async () => {
    // A mismatch does not error: AG splits each `pivotResultFields` entry on
    // this to rebuild its secondary columns, so the wrong separator carves the
    // name in the wrong place and produces columns named after fragments.
    const { last } = renderSurface();
    await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
    expect(last().serverSidePivotResultFieldSeparator).toBe('_');
  });

  describe('getRowId', () => {
    const rowId = (
      getRowId: (params: Record<string, unknown>) => string,
      params: Record<string, unknown>,
    ) => getRowId({ parentKeys: [], api: { getRowGroupColumns: () => [] }, ...params });

    it("returns AG's own id for the grand total, or the transaction cannot find it", async () => {
      const { last } = renderSurface();
      await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
      const getRowId = last().getRowId as (p: Record<string, unknown>) => string;
      expect(rowId(getRowId, { level: 0, data: { __grandTotal: true } })).toBe(
        'rowGroupFooter_ROOT_NODE_ID',
      );
    });

    it('builds a group id from the PATH — a leaf key collides across groups', async () => {
      // Duplicate ids turn a successful block into a FAILED one (AG warn 205)
      // rather than warning visibly.
      const { last } = renderSurface();
      await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
      const getRowId = last().getRowId as (p: Record<string, unknown>) => string;
      const api = {
        getRowGroupColumns: () => [
          { getColDef: () => ({ field: 'region' }), getColId: () => 'region' },
          { getColDef: () => ({ field: 'desk' }), getColId: () => 'desk' },
        ],
      };
      expect(rowId(getRowId, { level: 0, data: { region: 'EMEA' }, api })).toBe('EMEA');
      // The case that matters, and the one a single-level fixture cannot show:
      // `Rates` exists under EMEA and under Americas, so a leaf-key id is the
      // SAME id in two blocks.
      expect(
        rowId(getRowId, { level: 1, parentKeys: ['EMEA'], data: { desk: 'Rates' }, api }),
      ).toBe('EMEA/Rates');
      expect(
        rowId(getRowId, { level: 1, parentKeys: ['Americas'], data: { desk: 'Rates' }, api }),
      ).toBe('Americas/Rates');
      expect(
        rowId(getRowId, {
          level: 2,
          parentKeys: ['EMEA', 'Rates'],
          data: { positionId: 'p1' },
          api,
        }),
      ).toBe('EMEA/Rates/p1');
    });

    it('keys a TREE parent off the marker, since tree mode has no group columns', async () => {
      // The `level < groupCols.length` test is false at every depth in tree
      // mode, so every parent would otherwise be keyed off the leaf column it
      // does not have.
      const { last } = renderSurface();
      await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
      const getRowId = last().getRowId as (p: Record<string, unknown>) => string;
      expect(
        rowId(getRowId, {
          level: 0,
          parentKeys: ['EMEA'],
          data: { __ssrmTreeGroup: true, __ssrmTreeKey: 'Rates' },
        }),
      ).toBe('EMEA/Rates');
    });

    it('falls back to the key column at the leaf level', async () => {
      const { last } = renderSurface();
      await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
      const getRowId = last().getRowId as (p: Record<string, unknown>) => string;
      expect(rowId(getRowId, { level: 0, data: { positionId: 'p9' } })).toBe('p9');
    });
  });

  it('normalizes the legacy boolean grandTotalRow — AG 36 takes a position', async () => {
    const a = renderSurface({ grandTotalRow: true });
    await waitFor(() => expect(a.last().serverSideDatasource).toBeDefined());
    expect(a.last().grandTotalRow).toBe('pinnedBottom');
    const b = renderSurface({ grandTotalRow: false });
    await waitFor(() => expect(b.last().serverSideDatasource).toBeDefined());
    expect(b.last().grandTotalRow).toBeUndefined();
  });
});

describe('SsrmEngineMarketsGridSurface — status bar', () => {
  it('defaults to the shared server panel, since AG stock panels count client rows', async () => {
    const { last } = renderSurface();
    await waitFor(() => expect(last().statusBar).toBeDefined());
    expect(last().statusBar).toEqual({
      statusPanels: [{ statusPanel: 'serverStatusPanel', align: 'left' }],
    });
    expect((last().components as Record<string, unknown>).serverStatusPanel).toBeDefined();
  });

  it("keeps the host's status bar, with the row-count panels rewritten", async () => {
    // AG's own row-count panels render NOTHING under a server row model, and
    // `forEachNode` visits only the ~100 loaded rows. Rewriting the stock NAMES
    // rather than asking hosts to use ours is what lets a `statusBar` written
    // for the CSRM grid mean the same thing here.
    const own = {
      statusPanels: [
        { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
        { statusPanel: 'agAggregationComponent', align: 'right' },
      ],
    };
    const { last } = renderSurface({ statusBar: own });
    await waitFor(() =>
      expect(last().statusBar).toEqual({
        statusPanels: [
          { statusPanel: 'serverTotalAndFilteredRowCount', align: 'left' },
          // Left alone on purpose: it aggregates the selected cell RANGE,
          // which this window does hold.
          { statusPanel: 'agAggregationComponent', align: 'right' },
        ],
      }),
    );
  });

  it('passes the engine through context, which is how a panel reaches it', async () => {
    const { last } = renderSurface();
    await waitFor(() =>
      expect(
        (last().context as { serverEngineHolder: { get(): unknown } }).serverEngineHolder.get(),
      ).toBeTruthy(),
    );
  });

  it('keeps ONE context object across engine rebuilds — AG reads it once', async () => {
    const { last, result } = renderSurface();
    await waitFor(() =>
      expect(
        (last().context as { serverEngineHolder: { get(): unknown } }).serverEngineHolder.get(),
      ).toBeTruthy(),
    );
    const first = last().context;
    const holder = (first as { serverEngineHolder: { get(): unknown } }).serverEngineHolder;
    const engineBefore = holder.get();

    // A provider restart hands over a different book.
    result.rerender(
      <SsrmEngineMarketsGridSurface
        client={fakeClient() as never}
        keyColumn="positionId"
        columnDefs={[{ field: 'positionId' }]}
      />,
    );
    await waitFor(() => expect(holder.get()).not.toBe(engineBefore));
    expect(last().context).toBe(first);
  });
});

describe('SsrmEngineMarketsGridSurface — parity with the CSRM surface', () => {
  it('enables cell selection — the formatting toolbar resolves columns from ranges', async () => {
    const { last } = renderSurface();
    await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
    expect(last().cellSelection).toBe(true);
  });

  it('registers the traffic-light agg funcs and keeps column order', async () => {
    const { last } = renderSurface();
    await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
    expect(last().aggFuncs).toBeDefined();
    expect(last().maintainColumnOrder).toBe(true);
  });

  it('passes the context menu builder, the pre-destroy hook and the grid ref', async () => {
    const getContextMenuItems = vi.fn();
    const onGridPreDestroyed = vi.fn();
    const gridRef = { current: null };
    const { last } = renderSurface({ getContextMenuItems, onGridPreDestroyed, gridRef });
    await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
    expect(last().getContextMenuItems).toBe(getContextMenuItems);
    expect(last().onGridPreDestroyed).toBe(onGridPreDestroyed);
    expect(last().ref).toBe(gridRef);
  });

  /**
   * TWO independent mechanisms hold this, and mutation testing is how that was
   * established rather than assumed: removing the strip leaves the explicit JSX
   * attributes (which follow both spreads) still winning, and moving the
   * pipeline spread to the end leaves it with nothing to win WITH, because the
   * strip already took those keys out. Only removing both turns this red. Do
   * not "simplify" either one away on the grounds that a mutation survives it.
   */
  it('spreads pipeline grid options but refuses to let them replace the row supply', async () => {
    const { last } = renderSurface({
      gridOptions: {
        pagination: true,
        rowModelType: 'clientSide',
        serverSideDatasource: { getRows: () => {} },
        cacheBlockSize: 7,
        getRowId: () => 'nope',
        context: { serverEngineHolder: null },
      },
    });
    await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
    expect(last().pagination).toBe(true);
    // Overriding these does not customize the grid, it detaches it from the book.
    expect(last().rowModelType).toBe('serverSide');
    expect(last().cacheBlockSize).toBe(100);
    expect(last().getRowId).not.toBe('nope');
    expect(
      (last().context as { serverEngineHolder: unknown }).serverEngineHolder,
    ).not.toBeNull();
  });

  describe('saved-filter count contract', () => {
    it('exposes ssrmCountMatching + ssrmConfigured once an engine exists', async () => {
      const { last, client } = renderSurface();
      await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
      const context = last().context as {
        ssrmCountMatching(m: Record<string, unknown>): Promise<number | null>;
        ssrmConfigured: boolean;
      };
      expect(context.ssrmConfigured).toBe(true);
      await expect(
        context.ssrmCountMatching({ desk: { filterType: 'set', values: ['Rates'] } }),
      ).resolves.toBe(20_000);
      expect(client.countFiltered).toHaveBeenCalled();
    });

    it('offers no expression seam, rather than one that always answers null', async () => {
      // A style rule with cross-row context needs an expression language the
      // engine can compile; this one has none. Absent means "paint nothing",
      // where a null-returning stub reads as "no row matches".
      const { last } = renderSurface();
      await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
      const context = last().context as Record<string, unknown>;
      expect(context.ssrmCountMatchingExpression).toBeUndefined();
      expect(context.ssrmAggregateScalar).toBeUndefined();
    });
  });

  describe('set-filter values', () => {
    it('routes the values callback to the ENGINE, not to the rows this window holds', async () => {
      // The client holds one block, so AG has no values to build a checkbox
      // list from — and a bare `filter: true` resolves to `agSetColumnFilter`,
      // which throws `r.values is not iterable` when handed nothing.
      const { last, client } = renderSurface();
      await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
      const defs = last().columnDefs as Record<string, unknown>[];
      const desk = defs.find((d) => d.field === 'desk')!;
      const params = desk.filterParams as {
        values(p: { success(v: unknown[]): void }): void;
        suppressClearModelOnRefreshValues: boolean;
      };
      expect(params.suppressClearModelOnRefreshValues).toBe(true);
      await expect(
        new Promise((resolve) => params.values({ success: resolve })),
      ).resolves.toEqual(['Rates', 'Credit']);
      expect(client.distinctValues).toHaveBeenCalledWith('desk');
    });

    it('resolves EMPTY when the engine refuses — a partial list is worse', async () => {
      // Null means "no honest list": past the cardinality ceiling. A truncated
      // list renders as the whole domain and its Select All silently excludes
      // everything omitted.
      const client = fakeClient({ distinctValues: vi.fn(async () => null) });
      const { last } = renderSurface({ client });
      await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
      const defs = last().columnDefs as Record<string, unknown>[];
      const params = (defs[1].filterParams as { values(p: { success(v: unknown[]): void }): void });
      await expect(
        new Promise((resolve) => params.values({ success: resolve })),
      ).resolves.toEqual([]);
    });
  });

  describe('quick search bridge', () => {
    it('listens on modelUpdated — filterChanged does NOT fire for this option', async () => {
      // MEASURED under `serverSide`: setting `quickFilterText` fires
      // `modelUpdated` only. AG implements the option for the client-side row
      // model, so the box does nothing at all without this.
      const { listeners } = await readyWith();
      expect(typeof listeners.modelUpdated).toBe('function');
    });

    it('reaches the engine when the text changes, and not otherwise', async () => {
      const client = fakeClient();
      const { setText, fireModelUpdated } = await readyWith({ client });

      fireModelUpdated();
      expect(client.setQuickFilter).not.toHaveBeenCalled();

      setText('inflation');
      fireModelUpdated();
      await waitFor(() => expect(client.setQuickFilter).toHaveBeenCalledWith('inflation'));

      // The engine's purge fires `modelUpdated` again, which is why the
      // comparison is load-bearing rather than an optimisation.
      fireModelUpdated();
      fireModelUpdated();
      expect(client.setQuickFilter).toHaveBeenCalledTimes(1);
    });
  });

  describe('cell edits', () => {
    it('routes a committed edit into the BOOK, not just the row node', async () => {
      // AG writes the edit onto the block-cache row node only, and the next
      // re-read of that block paints the old value back over it.
      const client = fakeClient();
      const { listeners } = await readyWith({ client });
      listeners.cellValueChanged({
        colDef: { field: 'desk' },
        data: { positionId: 'p7', desk: 'Rates' },
        newValue: 'Credit',
      });
      await waitFor(() => expect(client.applyUpdate).toHaveBeenCalled());
      expect(client.applyUpdate.mock.calls[0][0]).toEqual([
        { positionId: 'p7', desk: 'Credit' },
      ]);
    });

    it('ignores the grand total and group rows — neither is a row of the book', async () => {
      const client = fakeClient();
      const { listeners } = await readyWith({ client });
      // Both rows carry the KEY column, because the engine gives them one —
      // the grand total is captioned on it and a group row is keyed by path.
      // Without it the guard under test would be reached and then do nothing
      // for an unrelated reason (`applyEdit` refuses a missing key), which is a
      // check that passes by accident.
      listeners.cellValueChanged({
        colDef: { field: 'pnl' },
        data: { __grandTotal: true, positionId: 'GRAND TOTAL', pnl: 1 },
        newValue: 1,
      });
      listeners.cellValueChanged({
        colDef: { field: 'pnl' },
        data: { positionId: 'EMEA', pnl: 2 },
        node: { group: true },
        newValue: 2,
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(client.applyUpdate).not.toHaveBeenCalled();
    });
  });

  describe('calculated columns', () => {
    it('publishes the ASTs to the worker', async () => {
      const client = fakeClient();
      const calcColumns = [{ colId: 'calc_x', ast: { type: 'literal', value: 1 } }];
      const { last } = renderSurface({ client, calcColumns });
      await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
      await waitFor(() => expect(client.setCalcColumns).toHaveBeenCalledWith(calcColumns));
    });

    it('does not republish on a re-render that changed nothing but the array identity', async () => {
      // A host building the list from customizer state produces a fresh array
      // every render, and republishing purges the grid.
      const client = fakeClient();
      const { last, result } = renderSurface({
        client,
        calcColumns: [{ colId: 'calc_x', ast: { type: 'literal', value: 1 } }],
      });
      await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
      await waitFor(() => expect(client.setCalcColumns).toHaveBeenCalledTimes(1));

      result.rerender(
        <SsrmEngineMarketsGridSurface
          client={client as never}
          keyColumn="positionId"
          columnDefs={[{ field: 'positionId' }, { field: 'desk' }]}
          calcColumns={[{ colId: 'calc_x', ast: { type: 'literal', value: 1 } }] as never}
        />,
      );
      await new Promise((r) => setTimeout(r, 10));
      expect(client.setCalcColumns).toHaveBeenCalledTimes(1);
    });

    it('reads the diagnostics back through the handle — a refusal is otherwise silent', async () => {
      // `console.warn` inside a SharedWorker reaches no console anywhere, so a
      // refused column is a column of blanks and no way to ask why.
      const client = fakeClient({
        calcDiagnostics: vi.fn(async () => [
          { colId: 'calc_bad', phase: 'compile', message: "unknown function 'LOG10'", count: 1 },
        ]),
      });
      const { ref, last } = renderSurface({ client });
      await waitFor(() => expect(last().serverSideDatasource).toBeDefined());
      await expect(ref.current!.calcDiagnostics()).resolves.toHaveLength(1);
    });
  });

  describe('engine data-transaction applier', () => {
    const stubPlatform = () => ({
      setEngineDataTransactionApplier: vi.fn(),
      api: { api: null },
      rows: null,
    });

    it('registers with the platform, and clears it on unmount', () => {
      // Smart edit, bulk update and history undo/redo never touch the cell
      // editor: they hand a transaction to `GridPlatform.applyDataTransaction`,
      // which the host routes to `applyTransactionAsync` — not a write path
      // under the server row model. Every one of them was a silent no-op on the
      // Perspective surface until the engine applier landed.
      const platform = stubPlatform();
      const { unmount } = render(
        <GridProvider platform={platform as never} engineKind="ssrm">
          <SsrmEngineMarketsGridSurface
            client={fakeClient() as never}
            keyColumn="positionId"
            columnDefs={[{ field: 'positionId' }]}
          />
        </GridProvider>,
      );
      expect(platform.setEngineDataTransactionApplier).toHaveBeenCalledTimes(1);
      expect(typeof platform.setEngineDataTransactionApplier.mock.calls[0][0]).toBe('function');
      unmount();
      // Left registered, it would outlive the grid it writes through.
      expect(platform.setEngineDataTransactionApplier).toHaveBeenLastCalledWith(null);
    });

    it('maps a transaction onto edits and writes them to the book', async () => {
      const client = fakeClient();
      let applier: ((tx: Record<string, unknown>) => void) | null = null;
      const platform = {
        setEngineDataTransactionApplier: vi.fn((fn) => {
          applier = fn;
        }),
        api: { api: null },
        rows: null,
      };
      render(
        <GridProvider platform={platform as never} engineKind="ssrm">
          <SsrmEngineMarketsGridSurface
            client={client as never}
            keyColumn="positionId"
            columnDefs={[{ field: 'positionId' }]}
          />
        </GridProvider>,
      );
      await waitFor(() => expect(applier).not.toBeNull());
      applier!({ update: [{ positionId: 'p3', quantity: 900 }] });
      await waitFor(() => expect(client.applyUpdate).toHaveBeenCalled());
      expect(client.applyUpdate.mock.calls[0][0]).toEqual([
        { positionId: 'p3', quantity: 900 },
      ]);
    });

    it('mounts without a provider — characterisation tests render it bare', () => {
      expect(() => renderSurface()).not.toThrow();
    });
  });
});
