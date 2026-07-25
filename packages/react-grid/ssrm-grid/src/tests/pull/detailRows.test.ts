import { describe, expect, it, vi } from 'vitest';
import { createSsrmDetailFetcher, createSsrmRowMasterGetter } from '../../pull/detailRows.js';
import { GROUP_ID_FIELD, encodeGroupRowId } from '../../pull/groupRows.js';
import { FakeConnection } from './fakePerspective.js';

const flush = async (times = 4): Promise<void> => {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

function seededConnection(): FakeConnection {
  const connection = new FakeConnection();
  connection.table.rows = [
    { positionId: 'POS1', book: 'A', pnl: 10 },
    { positionId: 'POS2', book: 'B', pnl: 20 },
  ];
  return connection;
}

describe('createSsrmDetailFetcher', () => {
  it('default: keyed single-row read of the hosted table (fresh values, transient view)', async () => {
    const connection = seededConnection();
    const fetcher = createSsrmDetailFetcher({ connection, keyColumn: 'positionId' });
    const successCallback = vi.fn();
    // master row's block copy is STALE — the detail must read the table
    fetcher({ data: { positionId: 'POS2', book: 'B', pnl: -999 }, successCallback });
    await flush();
    expect(successCallback).toHaveBeenCalledWith([{ positionId: 'POS2', book: 'B', pnl: 20 }]);
    const view = connection.table.views.at(-1)!;
    expect(view.config.filter).toEqual([['positionId', '==', 'POS2']]);
    expect(view.deleted).toBe(true);
  });

  it('detailQuery hook overrides the data source (richer detail shapes)', async () => {
    const connection = seededConnection();
    const detailQuery = vi.fn(async (masterRow: Record<string, unknown>) => [
      { leg: 1, of: masterRow.positionId },
      { leg: 2, of: masterRow.positionId },
    ]);
    const fetcher = createSsrmDetailFetcher({ connection, keyColumn: 'positionId', detailQuery });
    const successCallback = vi.fn();
    fetcher({ data: { positionId: 'POS1' }, successCallback });
    await flush();
    expect(successCallback).toHaveBeenCalledWith([
      { leg: 1, of: 'POS1' },
      { leg: 2, of: 'POS1' },
    ]);
    expect(detailQuery.mock.calls[0]![1]).toMatchObject({
      keyColumn: 'positionId',
      key: 'POS1',
      table: connection.table,
    });
  });

  it('keyless rows (group rows) warn and deliver an empty detail set', async () => {
    const warn = vi.fn();
    const fetcher = createSsrmDetailFetcher({
      connection: seededConnection(),
      keyColumn: 'positionId',
      warn,
    });
    const successCallback = vi.fn();
    fetcher({ data: { book: 'A' }, successCallback });
    await flush();
    expect(successCallback).toHaveBeenCalledWith([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a failed read warns and delivers empty — the panel never hangs', async () => {
    const connection = seededConnection();
    const warn = vi.fn();
    const fetcher = createSsrmDetailFetcher({
      connection,
      keyColumn: 'positionId',
      detailQuery: async () => {
        throw new Error('boom');
      },
      warn,
    });
    const successCallback = vi.fn();
    fetcher({ data: { positionId: 'POS1' }, successCallback });
    await flush();
    expect(successCallback).toHaveBeenCalledWith([]);
    expect(warn.mock.calls[0]![0]).toContain('boom');
  });
});

describe('createSsrmRowMasterGetter', () => {
  const isRowMaster = createSsrmRowMasterGetter('positionId');

  it('leaf rows with a key are masters', () => {
    expect(isRowMaster({ positionId: 'POS1', pnl: 3 })).toBe(true);
  });

  it('group rows and keyless/malformed rows are not', () => {
    expect(isRowMaster({ [GROUP_ID_FIELD]: encodeGroupRowId(['A']), book: 'A' })).toBe(false);
    expect(isRowMaster({ pnl: 3 })).toBe(false);
    expect(isRowMaster(undefined)).toBe(false);
    expect(isRowMaster(null)).toBe(false);
  });
});
