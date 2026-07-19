/**
 * ProviderTableBridge — provider row stream → Perspective table.
 *
 * The properties that matter under a 20k row/s sweep: conflate by key, never
 * reorder writes, and never resurrect rows a snapshot has already dropped.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ProviderTableBridge,
  type BridgeTable,
} from './ProviderTableBridge.js';

function fakeTable() {
  const updates: Record<string, unknown>[][] = [];
  const replaces: Record<string, unknown>[][] = [];
  const removes: (string | number)[][] = [];
  let gate: (() => void) | null = null;
  const table: BridgeTable = {
    update: vi.fn(async (rows) => { updates.push(rows); }),
    replace: vi.fn(async (rows) => {
      replaces.push(rows);
      if (gate) await new Promise<void>((r) => { gate = r; });
    }),
    remove: vi.fn(async (keys) => { removes.push(keys); }),
  };
  return { table, updates, replaces, removes, block: () => { gate = () => {}; } };
}

/** Manual clock so flush timing is deterministic. */
function manualTimer() {
  const queued: Array<() => void> = [];
  return {
    setTimer: (cb: () => void) => { queued.push(cb); return queued.length; },
    clearTimer: () => undefined,
    tick: () => { const all = [...queued]; queued.length = 0; all.forEach((f) => f()); },
    get pending() { return queued.length; },
  };
}

const bridge = (t: ReturnType<typeof fakeTable>, clock: ReturnType<typeof manualTimer>) =>
  new ProviderTableBridge({
    table: t.table,
    keyColumn: 'positionId',
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });

describe('ProviderTableBridge', () => {
  it('conflates repeated keys within a flush window', async () => {
    const t = fakeTable(); const clock = manualTimer();
    const b = bridge(t, clock);

    b.push([{ positionId: 'A', px: 1 }]);
    b.push([{ positionId: 'A', px: 2 }]);
    b.push([{ positionId: 'B', px: 9 }]);
    expect(b.pendingCount).toBe(2);          // 3 frames → 2 rows

    clock.tick();
    await b.flush();
    expect(t.updates[0]).toEqual([
      { positionId: 'A', px: 2 },            // last write wins
      { positionId: 'B', px: 9 },
    ]);
  });

  it('merges partial frames instead of overwriting earlier fields', async () => {
    const t = fakeTable(); const clock = manualTimer();
    const b = bridge(t, clock);
    // Sparse/thin deltas carry only changed fields.
    b.push([{ positionId: 'A', px: 1 }]);
    b.push([{ positionId: 'A', qty: 5 }]);
    await b.flush();
    expect(t.updates[0]).toEqual([{ positionId: 'A', px: 1, qty: 5 }]);
  });

  it('batches one update per window regardless of frame count', async () => {
    const t = fakeTable(); const clock = manualTimer();
    const b = bridge(t, clock);
    for (let i = 0; i < 500; i++) b.push([{ positionId: `P${i % 50}`, px: i }]);
    await b.flush();
    expect(t.updates).toHaveLength(1);       // 500 frames → 1 write
    expect(t.updates[0]).toHaveLength(50);   // 50 distinct keys
  });

  it('schedules only one timer for a burst', () => {
    const t = fakeTable(); const clock = manualTimer();
    const b = bridge(t, clock);
    b.push([{ positionId: 'A' }]);
    b.push([{ positionId: 'B' }]);
    b.push([{ positionId: 'C' }]);
    expect(clock.pending).toBe(1);
  });

  it('drops coalesced rows on snapshot — a replaced book must not resurrect them', async () => {
    const t = fakeTable(); const clock = manualTimer();
    const b = bridge(t, clock);
    b.push([{ positionId: 'STALE', px: 1 }]);
    expect(b.pendingCount).toBe(1);

    await b.snapshot([{ positionId: 'FRESH', px: 2 }]);
    expect(b.pendingCount).toBe(0);
    clock.tick();
    await b.flush();

    expect(t.replaces[0]).toEqual([{ positionId: 'FRESH', px: 2 }]);
    expect(t.updates).toHaveLength(0);       // STALE never written
  });

  it('serialises writes so a later frame cannot overtake an earlier one', async () => {
    const t = fakeTable(); const clock = manualTimer();
    const b = bridge(t, clock);
    const order: string[] = [];
    (t.table.replace as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push('replace');
    });
    (t.table.update as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push('update');
    });

    const snap = b.snapshot([{ positionId: 'A' }]);
    b.push([{ positionId: 'B' }]);
    const flushed = b.flush();
    await Promise.all([snap, flushed]);
    expect(order).toEqual(['replace', 'update']);   // never reordered
  });

  it('removes by key and cancels a pending update for the same key', async () => {
    const t = fakeTable(); const clock = manualTimer();
    const b = bridge(t, clock);
    b.push([{ positionId: 'A', px: 1 }]);
    b.remove(['A']);
    await b.flush();
    expect(t.updates).toHaveLength(0);
    expect(t.removes[0]).toEqual(['A']);
  });

  it('re-adding after a remove wins within the same window', async () => {
    const t = fakeTable(); const clock = manualTimer();
    const b = bridge(t, clock);
    b.remove(['A']);
    b.push([{ positionId: 'A', px: 7 }]);
    await b.flush();
    expect(t.updates[0]).toEqual([{ positionId: 'A', px: 7 }]);
    expect(t.removes).toHaveLength(0);
  });

  it('skips rows with a missing or empty key', async () => {
    const t = fakeTable(); const clock = manualTimer();
    const b = bridge(t, clock);
    b.push([{ px: 1 }, { positionId: '', px: 2 }, { positionId: 'OK', px: 3 }]);
    await b.flush();
    expect(t.updates[0]).toEqual([{ positionId: 'OK', px: 3 }]);
  });

  it('keeps running after a write rejects', async () => {
    const t = fakeTable(); const clock = manualTimer();
    const errors: unknown[] = [];
    const b = new ProviderTableBridge({
      table: t.table,
      keyColumn: 'positionId',
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      onError: (e) => errors.push(e),
    });
    (t.table.update as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('wasm gone'));

    b.push([{ positionId: 'A' }]);
    await b.flush();
    expect(errors).toHaveLength(1);

    (t.table.update as ReturnType<typeof vi.fn>).mockImplementation(async () => undefined);
    b.push([{ positionId: 'B' }]);
    await expect(b.flush()).resolves.toBeUndefined();
  });

  it('stops writing after dispose', async () => {
    const t = fakeTable(); const clock = manualTimer();
    const b = bridge(t, clock);
    b.dispose();
    b.push([{ positionId: 'A' }]);
    await b.flush();
    expect(t.updates).toHaveLength(0);
    expect(b.pendingCount).toBe(0);
  });
});
