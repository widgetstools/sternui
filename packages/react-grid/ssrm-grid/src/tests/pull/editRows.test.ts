import { describe, expect, it, vi } from 'vitest';
import type { DatasetStateSnapshot } from '@starui/host-data/runtime/ssrm';
import {
  createSsrmCellEditHandler,
  fetchLoadedRowsOrRefuse,
  updateLoadedRowsOrRefuse,
  type LoadedRowReader,
  type SsrmEditConnection,
} from '../../pull/editRows.js';

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function fakeEditConnection(overrides: Partial<SsrmEditConnection> = {}) {
  const updateRows = vi.fn(async () => ({ phase: 'live', rowCount: 1, generation: 3 }) as DatasetStateSnapshot);
  return {
    connection: {
      state: { phase: 'live', rowCount: 1, generation: 3 } as DatasetStateSnapshot,
      updateRows,
      ...overrides,
    } as SsrmEditConnection,
    updateRows,
  };
}

function readerWith(rows: Record<string, Record<string, unknown>>): LoadedRowReader {
  return {
    getRowNode: (id: string) => (id in rows ? { data: rows[id] } : undefined),
  };
}

describe('createSsrmCellEditHandler (single-cell write-back)', () => {
  it('posts one keyed partial row stamped with the current generation', async () => {
    const { connection, updateRows } = fakeEditConnection();
    const handler = createSsrmCellEditHandler({ connection, keyColumn: 'positionId' });
    handler({
      data: { positionId: 'POS7', pnl: 1 },
      colDef: { field: 'pnl' },
      newValue: '42.5',
    });
    await flush();
    expect(updateRows).toHaveBeenCalledExactlyOnceWith(
      [{ positionId: 'POS7', pnl: '42.5' }],
      3,
    );
  });

  it('refuses edits to the key column (row identity) — warn + no-op', () => {
    const { connection, updateRows } = fakeEditConnection();
    const warn = vi.fn();
    const handler = createSsrmCellEditHandler({ connection, keyColumn: 'positionId', warn });
    handler({ data: { positionId: 'POS7' }, colDef: { field: 'positionId' }, newValue: 'X' });
    expect(updateRows).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/key column 'positionId'/);
  });

  it('drops edits on rows without the key (group rows) — warn + no-op', () => {
    const { connection, updateRows } = fakeEditConnection();
    const warn = vi.fn();
    const handler = createSsrmCellEditHandler({ connection, keyColumn: 'positionId', warn });
    handler({ data: { book: 'A' }, colDef: { field: 'pnl' }, newValue: 5 });
    expect(updateRows).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a worker refusal (stale generation) surfaces as a warn, never a throw', async () => {
    const updateRows = vi.fn(async () => {
      throw new Error('[ssrm] update-rows refused: stale generation 2 (current 3)');
    });
    const { connection } = fakeEditConnection({ updateRows });
    const warn = vi.fn();
    const handler = createSsrmCellEditHandler({ connection, keyColumn: 'positionId', warn });
    handler({ data: { positionId: 'POS1' }, colDef: { field: 'pnl' }, newValue: 1 });
    await flush();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/stale generation/);
  });

  it('a null newValue clears the cell (null is a legal write)', async () => {
    const { connection, updateRows } = fakeEditConnection();
    const handler = createSsrmCellEditHandler({ connection, keyColumn: 'positionId' });
    handler({ data: { positionId: 'POS1' }, colDef: { field: 'trader' }, newValue: undefined });
    await flush();
    expect(updateRows).toHaveBeenCalledExactlyOnceWith([{ positionId: 'POS1', trader: null }], 3);
  });
});

describe('fetchLoadedRowsOrRefuse (the fetch-or-refuse guard)', () => {
  it('returns the loaded row data for every key', () => {
    const reader = readerWith({
      A: { positionId: 'A', pnl: 1 },
      B: { positionId: 'B', pnl: 2 },
    });
    const warn = vi.fn();
    const loaded = fetchLoadedRowsOrRefuse(reader, ['A', 'B'], warn);
    expect(loaded).not.toBeNull();
    expect([...loaded!.keys()]).toEqual(['A', 'B']);
    expect(loaded!.get('B')).toEqual({ positionId: 'B', pnl: 2 });
    expect(warn).not.toHaveBeenCalled();
  });

  it('refuses the WHOLE batch when any target row is not loaded — single warn', () => {
    const reader = readerWith({ A: { positionId: 'A' } });
    const warn = vi.fn();
    const loaded = fetchLoadedRowsOrRefuse(reader, ['A', 'GHOST1', 'GHOST2'], warn);
    expect(loaded).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1); // one warn, never per-row spam
    expect(warn.mock.calls[0]![0]).toMatch(/2 of 3 target row\(s\) not loaded/);
    expect(warn.mock.calls[0]![0]).toMatch(/GHOST1/);
  });
});

describe('updateLoadedRowsOrRefuse (bulk shape)', () => {
  it('merges per-key edits into keyed partial rows and posts once', async () => {
    const { connection, updateRows } = fakeEditConnection();
    const reader = readerWith({
      A: { positionId: 'A' },
      B: { positionId: 'B' },
    });
    const sent = await updateLoadedRowsOrRefuse({
      connection,
      reader,
      keyColumn: 'positionId',
      edits: [
        { key: 'A', field: 'pnl', value: 1 },
        { key: 'A', field: 'trader', value: 'T9' },
        { key: 'B', field: 'pnl', value: 2 },
      ],
    });
    expect(sent).toBe(true);
    expect(updateRows).toHaveBeenCalledExactlyOnceWith(
      [
        { positionId: 'A', pnl: 1, trader: 'T9' },
        { positionId: 'B', pnl: 2 },
      ],
      3,
    );
  });

  it('refuses (warn + no-op) when a target row is not loaded — never edits a subset', async () => {
    const { connection, updateRows } = fakeEditConnection();
    const reader = readerWith({ A: { positionId: 'A' } });
    const warn = vi.fn();
    const sent = await updateLoadedRowsOrRefuse({
      connection,
      reader,
      keyColumn: 'positionId',
      edits: [
        { key: 'A', field: 'pnl', value: 1 },
        { key: 'MISSING', field: 'pnl', value: 2 },
      ],
      warn,
    });
    expect(sent).toBe(false);
    expect(updateRows).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('refuses key-column edits in bulk shapes too', async () => {
    const { connection, updateRows } = fakeEditConnection();
    const warn = vi.fn();
    const sent = await updateLoadedRowsOrRefuse({
      connection,
      reader: readerWith({ A: { positionId: 'A' } }),
      keyColumn: 'positionId',
      edits: [{ key: 'A', field: 'positionId', value: 'A2' }],
      warn,
    });
    expect(sent).toBe(false);
    expect(updateRows).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('an empty edit list is a no-op', async () => {
    const { connection, updateRows } = fakeEditConnection();
    const sent = await updateLoadedRowsOrRefuse({
      connection,
      reader: readerWith({}),
      keyColumn: 'positionId',
      edits: [],
    });
    expect(sent).toBe(false);
    expect(updateRows).not.toHaveBeenCalled();
  });
});
