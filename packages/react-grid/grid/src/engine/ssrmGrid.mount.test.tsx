/**
 * SsrmGrid mount contract (worklog T4) — the real component + real custom
 * engine over a stubbed AgGridReact: AG wiring, getRowId encodings, context
 * publication, imperative handle, and cell-edit write-back.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const captured: { props: Record<string, any> | null } = { props: null };

vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: Record<string, unknown>) => {
    captured.props = props;
    return <div data-testid="ag-grid-stub" />;
  },
}));

// Keep every real enterprise export; neuter only the registry — nothing is
// installed in jsdom.
vi.mock('ag-grid-enterprise', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ModuleRegistry: { registerModules: () => {} },
}));

import { SsrmGrid, type SsrmGridHandle } from '@wellsfargo-starui/ssrm-grid';

// Non-integer px so the inferred schema is 'float' (integer would truncate
// the write-back coercion below).
const ROWS = [
  { id: 'a', book: 'FX', px: 10.25 },
  { id: 'b', book: 'EQ', px: 20.5 },
];

function makeFakeApi() {
  let context: Record<string, unknown> = {};
  return {
    setGridOption: vi.fn((key: string, value: unknown) => {
      if (key === 'context') context = value as Record<string, unknown>;
    }),
    getGridOption: vi.fn((key: string) =>
      key === 'context' ? context : undefined,
    ),
    refreshServerSide: vi.fn(),
    getServerSideGroupLevelState: () => [],
    getRowGroupColumns: () => [],
    getRowNode: () => undefined,
    getFilterModel: () => ({}),
    getColumnState: () => [],
    getValueColumns: () => [],
    getPivotColumns: () => [],
    isPivotMode: () => false,
    get context() {
      return context;
    },
  };
}

function mount(extra: Record<string, unknown> = {}) {
  const ref = React.createRef<SsrmGridHandle>();
  const view = render(
    <SsrmGrid
      ref={ref}
      columnDefs={[{ field: 'id' }, { field: 'book' }, { field: 'px' }] as never}
      rowData={ROWS}
      getRowId="id"
      {...extra}
    />,
  );
  return { ref, view };
}

describe('SsrmGrid mount contract', () => {
  it('wires the server row model with a datasource and getRowId', () => {
    mount();
    const p = captured.props!;
    expect(p.rowModelType).toBe('serverSide');
    expect(p.serverSideDatasource).toBeTruthy();
    expect(typeof p.getRowId).toBe('function');
    expect(p.cacheBlockSize).toBe(100);
    cleanup();
  });

  it('encodes group / tree / grand-total / leaf row ids', () => {
    mount({ treeFields: undefined });
    const getRowId = captured.props!.getRowId as (p: unknown) => string;
    expect(getRowId({ data: { id: 'a' } })).toBe('a');
    expect(
      getRowId({
        data: { childCount: 3, __ssrmGroupKey: 'FX' },
        parentKeys: ['EMEA'],
      }),
    ).toBe('g:EMEA|FX');
    expect(getRowId({ data: { id: '' }, parentKeys: [] })).toMatch(/^missing:/);
    cleanup();

    mount({ treeFields: ['desk', 'book'] });
    const treeRowId = captured.props!.getRowId as (p: unknown) => string;
    expect(
      treeRowId({ data: { __treeKey: 'NY', group: true }, parentKeys: [] }),
    ).toBe('t:NY');
    expect(
      treeRowId({ data: { __treeKey: 'x1', group: false }, parentKeys: ['NY'] }),
    ).toBe('tl:x1');
    cleanup();
  });

  it('lets pipeline gridOptions override defaults but never structural wiring', () => {
    mount({
      gridOptions: {
        rowSelection: { mode: 'singleRow' },
        rowModelType: 'clientSide', // structural — must be stripped
        undoRedoCellEditing: false,
      },
    });
    const p = captured.props!;
    expect(p.rowSelection).toEqual({ mode: 'singleRow' });
    expect(p.undoRedoCellEditing).toBe(false);
    expect(p.rowModelType).toBe('serverSide');
    cleanup();
  });

  it('publishes the SSRM context on ready and configures the engine', async () => {
    mount();
    const api = makeFakeApi();
    (captured.props!.onGridReady as (e: unknown) => void)({ api });

    const ctx = () => api.context as Record<string, unknown>;
    expect(typeof ctx().ssrmCountMatching).toBe('function');
    expect(typeof ctx().ssrmDistinctValues).toBe('function');
    expect(typeof ctx().ssrmLeafAt).toBe('function');

    await waitFor(() => expect(ctx().ssrmConfigured).toBe(true));
    expect(api.refreshServerSide).toHaveBeenCalledWith({ purge: true });
    expect(ctx().totalRowCount).toBe(2);
    cleanup();
  });

  it('StrictMode double-mount keeps the dirty router alive (pull-path live updates)', async () => {
    // Regression (star-demo field report): the mount-once effect's cleanup
    // disposed the ref-held router; the strict remount rewired the engine's
    // dirty handler to that CORPSE, so every on_update dirty was silently
    // dropped — no refresh, no live updates, frozen status bar.
    const handlers: Array<((msg: unknown) => void) | null> = [];
    const engine = {
      kind: 'perspective',
      configure: vi.fn(async () => undefined),
      setRowData: vi.fn(async () => ROWS.length),
      getRows: vi.fn(async () => ({ rowData: ROWS, rowCount: ROWS.length })),
      getFilterValues: vi.fn(async () => []),
      updateRows: vi.fn(async () => undefined),
      removeRows: vi.fn(async () => undefined),
      applyTransaction: vi.fn(async () => undefined),
      getAggregates: vi.fn(async () => ({ totals: {}, aggregates: {}, rowCount: 0 })),
      queryAll: vi.fn(async () => ({ rowData: [] })),
      getSeriesData: vi.fn(),
      getDetailRows: vi.fn(),
      setDirtyHandler: vi.fn((h: ((msg: unknown) => void) | null) => {
        handlers.push(h);
      }),
      dispose: vi.fn(),
    };

    render(
      <React.StrictMode>
        <SsrmGrid
          columnDefs={[{ field: 'id' }, { field: 'book' }, { field: 'px' }] as never}
          engine={engine as never}
          getRowId="id"
        />
      </React.StrictMode>,
    );
    const api = makeFakeApi();
    (captured.props!.onGridReady as (e: unknown) => void)({ api });
    await waitFor(() =>
      expect((api.context as Record<string, unknown>).ssrmConfigured).toBe(true),
    );

    // Injected engines are never disposed by the grid — strict cleanup included.
    expect(engine.dispose).not.toHaveBeenCalled();

    // The handler wired by the FINAL mount must route to a LIVE router:
    // a bare dirty must reach the grid as a soft refresh.
    api.refreshServerSide.mockClear();
    const live = [...handlers].reverse().find((h) => h != null)!;
    expect(live).toBeTruthy();
    live({ type: 'dirty', at: Date.now() });
    await waitFor(() =>
      expect(api.refreshServerSide).toHaveBeenCalledWith({ purge: false }),
    );
    cleanup();
  });

  it('handle routes transactions/queries through the engine; exportAll exists', async () => {
    const { ref } = mount();
    const api = makeFakeApi();
    (captured.props!.onGridReady as (e: unknown) => void)({ api });
    await waitFor(() =>
      expect((api.context as { ssrmConfigured?: boolean }).ssrmConfigured).toBe(true),
    );

    expect(await ref.current!.countMatching({})).toBe(2);
    ref.current!.applyTransaction({ add: [{ id: 'c', book: 'FX', px: 30 }] });
    expect(await ref.current!.countMatching({})).toBe(3);

    const all = await ref.current!.queryAll({});
    expect(all.rowCount).toBe(3);
    expect(typeof ref.current!.exportAll).toBe('function');
    cleanup();
  });

  it('cell edits write back into the engine with schema coercion', async () => {
    const { ref } = mount();
    const api = makeFakeApi();
    (captured.props!.onGridReady as (e: unknown) => void)({ api });
    await waitFor(() =>
      expect((api.context as { ssrmConfigured?: boolean }).ssrmConfigured).toBe(true),
    );

    (captured.props!.onCellValueChanged as (e: unknown) => void)({
      colDef: { field: 'px' },
      data: { id: 'a' },
      newValue: '42.5', // string in — schema says float
    });

    const { rowData } = await ref.current!.queryAll({});
    expect(rowData.find((r) => r.id === 'a')?.px).toBe(42.5);
    cleanup();
  });
});
