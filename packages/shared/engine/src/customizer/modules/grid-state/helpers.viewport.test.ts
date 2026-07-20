/**
 * Viewport-anchor restore — the async/SSRM path (worklog T8): the saved
 * anchor row may exceed the grid's row count at apply time (SSRM count
 * query / pull-engine table fill land later), so the restore must retry on
 * modelUpdated/firstDataRendered instead of silently dropping the anchor.
 */
import { describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { applyGridState } from './helpers';
import { GRID_STATE_SCHEMA_VERSION, type SavedGridState } from './state';

type Handler = () => void;

function fakeApi(initialRowCount: number) {
  const listeners = new Map<string, Set<Handler>>();
  let rowCount = initialRowCount;
  const api = {
    setState: vi.fn(),
    getColumns: () => [],
    getColumn: () => null,
    getDisplayedRowCount: () => rowCount,
    ensureIndexVisible: vi.fn(),
    ensureColumnVisible: vi.fn(),
    getGridOption: () => undefined,
    setGridOption: vi.fn(),
    addEventListener: (name: string, h: Handler) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(h);
    },
    removeEventListener: (name: string, h: Handler) => {
      listeners.get(name)?.delete(h);
    },
  };
  const emit = (name: string) => {
    for (const h of [...(listeners.get(name) ?? [])]) h();
  };
  return {
    api: api as unknown as GridApi,
    emit,
    setRowCount: (n: number) => { rowCount = n; },
    listenerCount: (name: string) => listeners.get(name)?.size ?? 0,
  };
}

function savedWithAnchor(firstRowIndex: number): SavedGridState {
  return {
    schemaVersion: GRID_STATE_SCHEMA_VERSION,
    savedAt: '2026-01-01T00:00:00.000Z',
    gridState: {},
    viewportAnchor: { firstRowIndex, leftColId: null, horizontalPixel: 0 },
  };
}

const flushMicrotasks = () => new Promise<void>((r) => { setTimeout(r, 0); });

describe('applyGridState viewport restore', () => {
  it('restores immediately when the anchor row is already in range', async () => {
    const f = fakeApi(20_000);
    applyGridState(f.api, savedWithAnchor(5_000));
    await flushMicrotasks();
    expect(f.api.ensureIndexVisible).toHaveBeenCalledWith(5_000, 'top');
    expect(f.listenerCount('modelUpdated')).toBe(0);
  });

  it('retries on modelUpdated until the row count covers the anchor', async () => {
    const f = fakeApi(0);
    applyGridState(f.api, savedWithAnchor(5_000));
    await flushMicrotasks();
    expect(f.api.ensureIndexVisible).not.toHaveBeenCalled();

    f.setRowCount(100); // intermediate count — still short of the anchor
    f.emit('modelUpdated');
    expect(f.api.ensureIndexVisible).not.toHaveBeenCalled();

    f.setRowCount(20_000); // real total lands
    f.emit('modelUpdated');
    expect(f.api.ensureIndexVisible).toHaveBeenCalledWith(5_000, 'top');
    // One-shot: listeners detach after the successful restore.
    expect(f.listenerCount('modelUpdated')).toBe(0);
    expect(f.listenerCount('firstDataRendered')).toBe(0);
  });

  it('gives up after the deadline instead of listening forever', async () => {
    vi.useFakeTimers();
    try {
      const f = fakeApi(0);
      applyGridState(f.api, savedWithAnchor(5_000));
      await vi.runAllTimersAsync();
      expect(f.listenerCount('modelUpdated')).toBe(1);
      vi.setSystemTime(Date.now() + 20_000);
      f.emit('modelUpdated');
      expect(f.api.ensureIndexVisible).not.toHaveBeenCalled();
      expect(f.listenerCount('modelUpdated')).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('anchor 0 needs no scroll and attaches no listeners', async () => {
    const f = fakeApi(0);
    applyGridState(f.api, savedWithAnchor(0));
    await flushMicrotasks();
    expect(f.api.ensureIndexVisible).not.toHaveBeenCalled();
    expect(f.listenerCount('modelUpdated')).toBe(0);
  });
});
