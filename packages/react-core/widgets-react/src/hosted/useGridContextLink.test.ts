/**
 * useGridContextLink — publish-side debounce: a burst of `selectionChanged`
 * events (e.g. a drag-select) coalesces into ONE broadcast so linked peers run
 * a single filter pass, not one per intermediate selection.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { GridApi } from 'ag-grid-community';
import { useGridContextLink } from './useGridContextLink';
import type { UseFdc3ChannelResult } from './useFdc3Channel';

function makeGridApi() {
  const listeners = new Map<string, Set<(e?: unknown) => void>>();
  let selected: unknown[] = [];
  const api = {
    addEventListener: (type: string, cb: (e?: unknown) => void) => {
      (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(cb);
    },
    removeEventListener: (type: string, cb: (e?: unknown) => void) => {
      listeners.get(type)?.delete(cb);
    },
    getSelectedNodes: () => selected,
  } as unknown as GridApi;
  return {
    api,
    setSelection: (nodes: unknown[]) => { selected = nodes; },
    fireSelectionChanged: () => listeners.get('selectionChanged')?.forEach((cb) => cb()),
  };
}

function makeFdc3(): UseFdc3ChannelResult & { broadcast: ReturnType<typeof vi.fn> } {
  return {
    current: 'red',
    broadcast: vi.fn().mockResolvedValue(undefined),
    addContextListener: vi.fn(() => () => undefined),
  } as unknown as UseFdc3ChannelResult & { broadcast: ReturnType<typeof vi.fn> };
}

describe('useGridContextLink — publish debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces a burst of selectionChanged events into one broadcast', () => {
    const grid = makeGridApi();
    const fdc3 = makeFdc3();
    grid.setSelection([{ id: 'r1', data: { id: 'r1' } }]);

    renderHook(() =>
      useGridContextLink({
        gridApi: grid.api,
        fdc3,
        instanceId: 'inst-a',
        config: { enabled: true, mode: 'rowId', publishDebounceMs: 50 },
      }),
    );

    // A drag-select fires many events in quick succession.
    grid.fireSelectionChanged();
    grid.setSelection([{ id: 'r1', data: { id: 'r1' } }, { id: 'r2', data: { id: 'r2' } }]);
    grid.fireSelectionChanged();
    grid.fireSelectionChanged();
    expect(fdc3.broadcast).not.toHaveBeenCalled(); // nothing on the leading edge

    vi.advanceTimersByTime(50);
    expect(fdc3.broadcast).toHaveBeenCalledTimes(1);
    // The single broadcast carries the SETTLED selection (read at flush time).
    expect((fdc3.broadcast.mock.calls[0][0] as any).rowIds).toEqual(['r1', 'r2']);
  });

  it('publishes synchronously when debounce is 0', () => {
    const grid = makeGridApi();
    const fdc3 = makeFdc3();
    grid.setSelection([{ id: 'r1', data: { id: 'r1' } }]);

    renderHook(() =>
      useGridContextLink({
        gridApi: grid.api,
        fdc3,
        instanceId: 'inst-a',
        config: { enabled: true, mode: 'rowId', publishDebounceMs: 0 },
      }),
    );

    grid.fireSelectionChanged();
    expect(fdc3.broadcast).toHaveBeenCalledTimes(1);
  });
});
