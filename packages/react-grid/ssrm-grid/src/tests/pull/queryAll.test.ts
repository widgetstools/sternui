/**
 * datasource.queryAll (P4b) — the ENTIRE filtered+sorted set in
 * bounded windowed chunks over a TRANSIENT view: the data plane for
 * full-set export and charting (AG's own SSRM export/charts see only
 * loaded blocks).
 */

import { describe, expect, it, vi } from 'vitest';
import type { GridApi, IServerSideGetRowsParams, IServerSideGetRowsRequest } from 'ag-grid-community';
import type { DatasetStateSnapshot } from '@starui/host-data/runtime/ssrm';
import { createSsrmPullDatasource } from '../../pull/createSsrmPullDatasource.js';
import { FakeConnection, type Row } from './fakePerspective.js';

const flush = async (times = 4): Promise<void> => {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const rows250 = (): Row[] =>
  Array.from({ length: 250 }, (_, i) => ({
    positionId: `POS${i}`,
    book: `BOOK${String.fromCharCode(65 + (i % 3))}`,
    pnl: i,
  }));

function liveState(rowCount: number, generation = 1): DatasetStateSnapshot {
  return { phase: 'live', rowCount, generation };
}

function makeDatasource(connection: FakeConnection) {
  return createSsrmPullDatasource({
    connection,
    keyColumn: 'positionId',
    tickRefreshMs: 0,
    warn: () => undefined,
  });
}

const stubApi = {
  setRowCount: () => undefined,
  applyServerSideTransactionAsync: () => undefined,
  applyServerSideRowData: () => undefined,
  refreshServerSide: () => undefined,
  getRowNode: () => undefined,
  refreshCells: () => undefined,
} as unknown as GridApi;

function loadParams(
  overrides: Partial<IServerSideGetRowsRequest> = {},
): IServerSideGetRowsParams {
  return {
    request: {
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
    },
    api: stubApi,
    success: vi.fn(),
    fail: vi.fn(),
    parentNode: {},
    needsGrandTotal: false,
    context: undefined,
  } as unknown as IServerSideGetRowsParams;
}

/** The active filter of every test: pnl > 99 → exactly 150 of 250 rows. */
const PNL_FILTER = {
  pnl: { filterType: 'number', type: 'greaterThan', filter: 99 },
};

describe('datasource.queryAll', () => {
  it('returns the WHOLE filtered+sorted set — not the loaded-block subset', async () => {
    const connection = new FakeConnection();
    connection.table.rows = rows250();
    connection.emit(liveState(250));
    const ds = makeDatasource(connection);
    // One 100-row block is loaded; the filtered set is 150 rows.
    ds.getRows(loadParams({ filterModel: PNL_FILTER, sortModel: [{ colId: 'pnl', sort: 'desc' }] }));
    await flush();

    const result = await ds.queryAll();
    expect(result.total).toBe(150);
    expect(result.rows).toHaveLength(150); // ≠ the 100 loaded rows
    expect(result.rows[0]!.pnl).toBe(249); // sort model honored
    expect(result.rows.at(-1)!.pnl).toBe(100); // filter honored
    expect(result.generation).toBe(1);
    ds.destroy();
  });

  it('reads in bounded chunks and streams them via onChunk (rows stays empty)', async () => {
    const connection = new FakeConnection();
    connection.table.rows = rows250();
    connection.emit(liveState(250));
    const ds = makeDatasource(connection);
    ds.getRows(loadParams());
    await flush();

    const chunks: Array<{ n: number; startRow: number; total: number }> = [];
    const result = await ds.queryAll({
      chunkSize: 100,
      onChunk: (rows, info) => chunks.push({ n: rows.length, startRow: info.startRow, total: info.total }),
    });
    expect(chunks).toEqual([
      { n: 100, startRow: 0, total: 250 },
      { n: 100, startRow: 100, total: 250 },
      { n: 50, startRow: 200, total: 250 },
    ]);
    expect(result.rows).toHaveLength(0); // bounded memory: streamed, not accumulated
    expect(result.total).toBe(250);
    ds.destroy();
  });

  it('strips grouping from the current shape: leaf rows, same filters', async () => {
    const connection = new FakeConnection();
    connection.table.rows = rows250();
    connection.emit(liveState(250));
    const ds = makeDatasource(connection);
    ds.getRows(
      loadParams({
        rowGroupCols: [{ id: 'book', displayName: 'Book', field: 'book' }],
        valueCols: [{ id: 'pnl', displayName: 'PnL', field: 'pnl', aggFunc: 'sum' }],
        filterModel: PNL_FILTER,
      }),
    );
    await flush();

    const result = await ds.queryAll();
    expect(result.total).toBe(150); // leaves, not the 3 group rows
    expect(result.rows[0]!.__ROW_PATH__).toBeUndefined();
    expect(result.rows[0]!.positionId).toBeDefined();
    ds.destroy();
  });

  it('uses a TRANSIENT view and deletes it when done', async () => {
    const connection = new FakeConnection();
    connection.table.rows = rows250();
    connection.emit(liveState(250));
    const ds = makeDatasource(connection);
    ds.getRows(loadParams());
    await flush();
    const viewsBefore = connection.table.views.length;

    await ds.queryAll();
    expect(connection.table.views.length).toBe(viewsBefore + 1);
    expect(connection.table.views.at(-1)!.deleted).toBe(true);
    ds.destroy();
  });

  it('a generation change mid-read aborts (rejects) — and the view is still deleted', async () => {
    const connection = new FakeConnection();
    connection.table.rows = rows250();
    connection.emit(liveState(250));
    const ds = makeDatasource(connection);
    ds.getRows(loadParams());
    await flush();

    const read = ds.queryAll({
      chunkSize: 100,
      onChunk: (_rows, info) => {
        if (info.startRow === 0) connection.emit(liveState(0, 2)); // restart lands mid-read
      },
    });
    await expect(read).rejects.toThrow(/generation changed mid-read/);
    expect(connection.table.views.at(-1)!.deleted).toBe(true);
    ds.destroy();
  });

  it('honors an explicit column projection', async () => {
    const connection = new FakeConnection();
    connection.table.rows = rows250();
    connection.emit(liveState(250));
    const ds = makeDatasource(connection);
    ds.getRows(loadParams());
    await flush();

    await ds.queryAll({ columns: ['pnl'] });
    const view = connection.table.views.at(-1)!;
    expect(view.config.columns).toEqual(['positionId', 'pnl']); // key column always rides
    ds.destroy();
  });

  it('empty dataset → an honest zero; error dataset → refusal', async () => {
    const connection = new FakeConnection();
    connection.emit({ phase: 'empty', rowCount: 0, generation: 1 });
    const ds = makeDatasource(connection);
    await expect(ds.queryAll()).resolves.toEqual({ rows: [], total: 0, generation: 1 });

    connection.emit({ phase: 'error', rowCount: 0, generation: 1, error: 'boom' });
    await expect(ds.queryAll()).rejects.toThrow(/dataset error/);
    ds.destroy();
  });
});
