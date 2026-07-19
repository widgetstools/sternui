import { describe, expect, it, vi } from 'vitest';
import { createSsrmTableProvider } from './ssrmTableProvider.js';
import type { ProviderEmit, ProviderHandle } from './Provider.js';
import type { ProviderTableBridge } from '../perspective/ProviderTableBridge.js';

function fakeBridge() {
  const snapshots: Record<string, unknown>[][] = [];
  const pushes: Record<string, unknown>[][] = [];
  let disposed = false;
  const bridge = {
    snapshot: vi.fn(async (rows: readonly Record<string, unknown>[]) => {
      snapshots.push([...rows]);
    }),
    push: vi.fn((rows: readonly Record<string, unknown>[]) => {
      pushes.push([...rows]);
    }),
    dispose: vi.fn(() => { disposed = true; }),
  };
  return {
    bridge: bridge as unknown as ProviderTableBridge,
    snapshots,
    pushes,
    get disposed() { return disposed; },
    raw: bridge,
  };
}

function harness() {
  const b = fakeBridge();
  let emit!: ProviderEmit;
  const handle: ProviderHandle & { stops: number; restarts: unknown[] } = {
    stops: 0,
    restarts: [],
    stop() { handle.stops += 1; },
    restart(extra) { handle.restarts.push(extra); },
  };
  const statuses: Array<[string, string | undefined]> = [];
  const metrics: Array<Record<string, number>> = [];
  const provider = createSsrmTableProvider({
    bridge: b.bridge,
    start: (e) => { emit = e; return handle; },
    onStatus: (s, err) => statuses.push([s, err]),
    onMetrics: (m) => metrics.push(m as Record<string, number>),
  });
  return { ...b, provider, handle, statuses, metrics, emit: (e: never) => emit(e) };
}

describe('createSsrmTableProvider', () => {
  it('commits a replace frame as a table snapshot', async () => {
    const h = harness();
    h.emit({ rows: [{ id: 'A' }], replace: true } as never);
    await Promise.resolve();
    expect(h.snapshots[0]).toEqual([{ id: 'A' }]);
    expect(h.pushes).toHaveLength(0);
    expect(h.provider.hasSnapshot).toBe(true);
  });

  it('routes live frames to the conflating push path', () => {
    const h = harness();
    h.emit({ rows: [{ id: 'A', px: 1 }] } as never);
    h.emit({ rows: [{ id: 'A', px: 2 }] } as never);
    expect(h.pushes).toEqual([[{ id: 'A', px: 1 }], [{ id: 'A', px: 2 }]]);
    expect(h.snapshots).toHaveLength(0);   // conflation is the bridge's job
  });

  it('clears the snapshot flag when the provider goes back to loading', async () => {
    const h = harness();
    h.emit({ rows: [{ id: 'A' }], replace: true } as never);
    await Promise.resolve();
    expect(h.provider.hasSnapshot).toBe(true);

    h.emit({ status: 'loading' } as never);      // restart in flight
    expect(h.provider.hasSnapshot).toBe(false);
    expect(h.provider.status).toBe('loading');
  });

  it('surfaces status and error to the caller', () => {
    const h = harness();
    h.emit({ status: 'error', error: 'socket closed' } as never);
    expect(h.statuses).toContainEqual(['error', 'socket closed']);
    expect(h.provider.status).toBe('error');
  });

  it('forwards byte and row counters for diagnostics', () => {
    const h = harness();
    h.emit({ byteSize: 2048 } as never);
    h.emit({ rowsReceived: 120 } as never);
    expect(h.metrics).toEqual([{ byteSize: 2048 }, { rowsReceived: 120 }]);
  });

  it('ignores push-path timing samples rather than mis-reporting them', () => {
    const h = harness();
    h.emit({ timing: { sinceClickMs: 5 } } as never);
    expect(h.metrics).toHaveLength(0);
    expect(h.statuses).toHaveLength(0);
  });

  it('stop() disposes the bridge and stops the transport, and is idempotent', () => {
    const h = harness();
    h.provider.stop();
    h.provider.stop();
    expect(h.raw.dispose).toHaveBeenCalledTimes(1);
    expect(h.handle.stops).toBe(1);
  });

  it('drops emissions arriving after stop', async () => {
    const h = harness();
    h.provider.stop();
    h.emit({ rows: [{ id: 'late' }], replace: true } as never);
    h.emit({ rows: [{ id: 'late2' }] } as never);
    await Promise.resolve();
    expect(h.snapshots).toHaveLength(0);
    expect(h.pushes).toHaveLength(0);
  });

  it('restart() forwards the overlay and expects a fresh snapshot', async () => {
    const h = harness();
    h.emit({ rows: [{ id: 'A' }], replace: true } as never);
    await Promise.resolve();

    h.provider.restart({ asOfDate: '2026-04-01' });
    expect(h.handle.restarts).toEqual([{ asOfDate: '2026-04-01' }]);
    expect(h.provider.hasSnapshot).toBe(false);
  });

  it('reports a snapshot write failure without throwing at the transport', async () => {
    const b = fakeBridge();
    b.raw.snapshot.mockRejectedValueOnce(new Error('table gone'));
    const errors: unknown[] = [];
    let emit!: ProviderEmit;
    createSsrmTableProvider({
      bridge: b.bridge,
      start: (e) => { emit = e; return { stop() {}, restart() {} }; },
      onError: (err) => errors.push(err),
    });
    emit({ rows: [{ id: 'A' }], replace: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toHaveLength(1);
  });
});
