import { describe, it, expect, vi } from 'vitest';
import { StreamProviderBase, type StreamProviderListener } from './StreamProviderBase';
import type { ProviderType } from '@marketsui/shared-types';

type Row = Record<string, unknown>;

/**
 * Test subclass — lets tests drive the ingest pipeline directly
 * without spinning up a real transport. Production subclasses
 * (StompStreamProvider, etc.) will be tested separately with a mock
 * STOMP client.
 */
class TestStream extends StreamProviderBase<{ keyColumn: string }, Row> {
  readonly type: ProviderType = 'stomp';

  // Expose the protected ingest helpers so tests can drive them.
  async configure(_c: { keyColumn: string }): Promise<void> {}
  async start(): Promise<void> {
    this.reportConnected();
  }
  async stop(): Promise<void> {
    this.reportDisconnected();
  }

  public push(rows: Row[], byteSize = 0): void {
    this.ingestSnapshotBatch(rows, byteSize);
  }
  public complete(): void {
    this.markSnapshotComplete();
  }
  public update(rows: Row[], byteSize = 0): void {
    this.ingestUpdate(rows, byteSize);
  }
  public error(e: Error): void {
    this.reportError(e);
  }
  public reset(): void {
    this.resetSnapshotState();
    this.cache.clear();
  }
}

function collect(): [StreamProviderListener, Record<string, number>] {
  const counts = { snap: 0, complete: 0, update: 0, err: 0 };
  const l: StreamProviderListener = {
    onSnapshotBatch: () => { counts.snap++; },
    onSnapshotComplete: () => { counts.complete++; },
    onRowUpdate: () => { counts.update++; },
    onError: () => { counts.err++; },
  };
  return [l, counts];
}

describe('StreamProviderBase — snapshot → complete → realtime phases', () => {
  it('caches snapshot batches and fans them out', () => {
    const p = new TestStream('test', { keyColumn: 'id' });
    const [l, counts] = collect();
    p.addListener(l);

    p.push([{ id: 1, v: 'a' }, { id: 2, v: 'b' }]);
    p.push([{ id: 3, v: 'c' }]);

    expect(p.getStatistics().mode).toBe('snapshot');
    expect(p.getStatistics().snapshotBatches).toBe(2);
    expect(p.getStatistics().snapshotRowsReceived).toBe(3);
    expect(p.getCache()).toHaveLength(3);
    expect(counts.snap).toBe(2);
    expect(counts.complete).toBe(0);
  });

  it('markSnapshotComplete flips mode + fires onSnapshotComplete exactly once', () => {
    const p = new TestStream('test', { keyColumn: 'id' });
    const [l, counts] = collect();
    p.addListener(l);

    p.push([{ id: 1 }]);
    p.complete();
    p.complete(); // second call is a no-op
    p.complete();

    expect(counts.complete).toBe(1);
    expect(p.isSnapshotComplete()).toBe(true);
    expect(p.getStatistics().mode).toBe('realtime');
  });

  it('after completion, ingestSnapshotBatch routes to the update path', () => {
    const p = new TestStream('test', { keyColumn: 'id' });
    const [l, counts] = collect();
    p.addListener(l);

    p.complete();
    // Caller erroneously sends another snapshot batch — should become an update.
    p.push([{ id: 1, v: 'a' }]);

    expect(counts.snap).toBe(0);
    expect(counts.update).toBe(1);
    expect(p.getStatistics().updateRowsReceived).toBe(1);
  });

  it('ingestUpdate upserts the cache (realtime update replaces snapshot row)', () => {
    const p = new TestStream('test', { keyColumn: 'id' });
    p.push([{ id: 1, v: 'original' }, { id: 2, v: 'keep' }]);
    p.complete();
    p.update([{ id: 1, v: 'replaced' }]);

    expect(p.getCache()).toEqual(
      expect.arrayContaining([
        { id: 1, v: 'replaced' },
        { id: 2, v: 'keep' },
      ]),
    );
    expect(p.getCache()).toHaveLength(2);
  });
});

describe('StreamProviderBase — late-joiner logic', () => {
  it('shouldReceiveCached is false while snapshot still streaming', () => {
    const p = new TestStream('test', { keyColumn: 'id' });
    p.registerSubscriber('port-early');
    // No complete yet.
    expect(p.shouldReceiveCached('port-early')).toBe(false);
    expect(p.shouldReceiveCached('port-other')).toBe(false);
  });

  it('after complete, early ports (registered during snapshot) return false', () => {
    const p = new TestStream('test', { keyColumn: 'id' });
    p.registerSubscriber('port-early');
    p.complete();
    expect(p.shouldReceiveCached('port-early')).toBe(false);
  });

  it('after complete, late ports (never registered during snapshot) return true', () => {
    const p = new TestStream('test', { keyColumn: 'id' });
    p.complete();
    p.registerSubscriber('port-late'); // registered AFTER complete — no-op for liveSnapshotPorts
    expect(p.shouldReceiveCached('port-late')).toBe(true);
  });

  it('unregisterSubscriber removes a port from the live-snapshot set', () => {
    const p = new TestStream('test', { keyColumn: 'id' });
    p.registerSubscriber('port-early');
    p.unregisterSubscriber('port-early');
    p.complete();
    // After unregister, "port-early" is not considered a live-snapshot
    // receiver anymore, so a rejoin → shouldReceiveCached is true.
    expect(p.shouldReceiveCached('port-early')).toBe(true);
  });
});

describe('StreamProviderBase — listener safety', () => {
  it('a listener throwing does not stop others from being called', () => {
    const p = new TestStream('test', { keyColumn: 'id' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = vi.fn(() => { throw new Error('bad listener'); });
    const good = vi.fn();
    p.addListener({ onSnapshotBatch: bad });
    p.addListener({ onSnapshotBatch: good });

    p.push([{ id: 1 }]);

    expect(bad).toHaveBeenCalledOnce();
    expect(good).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it('listener that removes itself mid-dispatch does not break iteration', () => {
    const p = new TestStream('test', { keyColumn: 'id' });
    const good = vi.fn();
    let off: (() => void) | null = null;
    const selfRemoving = vi.fn(() => { off?.(); });
    off = p.addListener({ onSnapshotBatch: selfRemoving });
    p.addListener({ onSnapshotBatch: good });

    p.push([{ id: 1 }]);

    expect(selfRemoving).toHaveBeenCalledOnce();
    expect(good).toHaveBeenCalledOnce();

    p.push([{ id: 2 }]);
    // selfRemoving is gone; good still fires.
    expect(selfRemoving).toHaveBeenCalledOnce();
    expect(good).toHaveBeenCalledTimes(2);
  });
});

describe('StreamProviderBase — error + lifecycle reporting', () => {
  it('reportError sets mode=error and fires onError', () => {
    const p = new TestStream('test', { keyColumn: 'id' });
    const [l, counts] = collect();
    p.addListener(l);
    p.error(new Error('broke'));
    expect(counts.err).toBe(1);
    expect(p.getStatistics().mode).toBe('error');
    expect(p.getStatistics().lastError).toBe('broke');
  });

  it('start/stop toggle isConnected + bump counters', async () => {
    const p = new TestStream('test', { keyColumn: 'id' });
    await p.start();
    expect(p.getStatistics().isConnected).toBe(true);
    expect(p.getStatistics().connectionCount).toBe(1);
    await p.stop();
    expect(p.getStatistics().isConnected).toBe(false);
    expect(p.getStatistics().disconnectionCount).toBe(1);
  });
});

describe('StreamProviderBase — resetSnapshotState for reconnects', () => {
  it('reset lets the provider begin a fresh snapshot cycle', () => {
    const p = new TestStream('test', { keyColumn: 'id' });
    p.push([{ id: 1 }]);
    p.complete();
    p.update([{ id: 1, v: 'updated' }]);
    expect(p.isSnapshotComplete()).toBe(true);

    p.reset();

    expect(p.isSnapshotComplete()).toBe(false);
    expect(p.getStatistics().mode).toBe('idle');
    expect(p.getStatistics().snapshotBatches).toBe(0);
    expect(p.getCache()).toEqual([]);

    // New snapshot cycle works as normal.
    p.push([{ id: 1, v: 'fresh' }]);
    expect(p.getCache()).toEqual([{ id: 1, v: 'fresh' }]);
  });
});
