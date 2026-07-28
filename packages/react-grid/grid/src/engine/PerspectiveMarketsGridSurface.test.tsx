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
    await waitFor(() => expect(last().context?.perspectiveEngine).toBeTruthy());
  });
});
