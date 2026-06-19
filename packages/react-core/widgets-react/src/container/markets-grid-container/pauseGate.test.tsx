/**
 * useProviderDataWiring — the consumer-side pause gate. While `paused` is true,
 * live ticks are NOT applied to the grid; on resume the grid catches up via one
 * `provider.refresh()` (the same path the `document.hidden` visibility gate uses).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { IDataProvider } from '@starui/host-data';
import type { ProviderStatus } from '@starui/host-data/runtime';
import { useProviderDataWiring } from './useProviderDataWiring.js';

type Rows = readonly Record<string, unknown>[];

function makeProvider() {
  const tickCbs = new Set<(rows: Rows) => void>();
  const snapshotCbs = new Set<(rows: Rows) => void>();
  const provider = {
    id: 'p1',
    capabilities: { providerType: 'mock', streaming: true, realtime: true,
      supportsRefresh: true, supportsRestart: true },
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    getData: () => [],
    getConfig: () => ({ providerType: 'mock', keyColumn: 'id' }),
    getColumnDefs: () => [{ field: 'id' }],
    onRowsReceived: vi.fn(() => () => undefined),
    onSnapshotData: vi.fn((cb: (rows: Rows) => void) => { snapshotCbs.add(cb); return () => snapshotCbs.delete(cb); }),
    onTick: vi.fn((cb: (rows: Rows) => void) => { tickCbs.add(cb); return () => tickCbs.delete(cb); }),
    onError: vi.fn(() => () => undefined),
    onStatus: vi.fn(() => () => undefined),
  } as unknown as IDataProvider;
  return {
    provider,
    emitSnapshot: (rows: Rows) => snapshotCbs.forEach((cb) => cb(rows)),
    emitTick: (rows: Rows) => tickCbs.forEach((cb) => cb(rows)),
  };
}

function makeGridApi() {
  const nodes = new Set<string>();
  return {
    getRowNode: (id: string) => (nodes.has(id) ? { id } : undefined),
    applyTransactionAsync: vi.fn(),
    flushAsyncTransactions: vi.fn(),
    getDisplayedRowCount: () => nodes.size,
    setGridOption: vi.fn((opt: string, rows: Rows) => {
      if (opt === 'rowData') for (const r of rows) nodes.add(String(r.id));
    }),
  } as any;
}

function baseParams(provider: IDataProvider, liveApi: any, paused: boolean) {
  return {
    liveApi,
    provider,
    activeId: 'p1',
    subscriptionKey: 'p1::id',
    rowIdField: 'id',
    rowIdFieldKey: 'id',
    mode: 'live' as const,
    asOfDate: null,
    toolbarDate: '',
    dataHubClient: {
      isProviderRunning: vi.fn().mockResolvedValue(true),
      waitForProviderRunning: vi.fn().mockResolvedValue(true),
    } as any,
    restartProvider: vi.fn().mockResolvedValue(undefined),
    containerEventBus: { emit: vi.fn(), on: vi.fn(() => () => {}) } as any,
    setLoadRowCount: vi.fn(),
    setProviderDisconnected: vi.fn(),
    setDisconnectDetail: vi.fn(),
    setResolvedSubKey: vi.fn(),
    setIsRefetching: vi.fn(),
    paused,
  };
}

const microtask = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('useProviderDataWiring — pause gate', () => {
  it('drops live ticks while paused and catches up via refresh() on resume', async () => {
    const { provider, emitSnapshot, emitTick } = makeProvider();
    const liveApi = makeGridApi();
    // Stable params (mirrors the real container, where these deps are memoized):
    // only `paused` changes between renders, so the subscribe effect does not
    // re-run and the dedicated paused-effect drives the gate.
    const stable = baseParams(provider, liveApi, false);

    const { rerender } = renderHook(
      ({ paused }) => useProviderDataWiring({ ...stable, paused } as any),
      { initialProps: { paused: false } },
    );

    // Snapshot settles → rowData reset indexes 'r1'.
    act(() => emitSnapshot([{ id: 'r1', x: 1 }]));
    await microtask();
    expect(liveApi.setGridOption).toHaveBeenCalledWith('rowData', expect.anything());

    // Live tick while running → applied to the grid.
    act(() => emitTick([{ id: 'r1', x: 2 }]));
    expect(liveApi.applyTransactionAsync).toHaveBeenCalledTimes(1);

    // Pause → ticks are dropped, grid untouched, no catch-up yet.
    rerender({ paused: true });
    act(() => emitTick([{ id: 'r1', x: 3 }]));
    act(() => emitTick([{ id: 'r1', x: 4 }]));
    expect(liveApi.applyTransactionAsync).toHaveBeenCalledTimes(1);
    expect(provider.refresh).not.toHaveBeenCalled();

    // Resume → one refresh() catch-up; subsequent ticks apply again.
    rerender({ paused: false });
    expect(provider.refresh).toHaveBeenCalledTimes(1);
    act(() => emitTick([{ id: 'r1', x: 5 }]));
    expect(liveApi.applyTransactionAsync).toHaveBeenCalledTimes(2);
  });
});
