import { describe, expect, it, vi } from 'vitest';
import { createSsrmRowPump, type SsrmRowPumpGrid } from './rowPump.js';

/**
 * A grid stub with the three methods the pump uses. The point of typing the
 * grid structurally is that this file needs no AG Grid at all.
 *
 * `schedule` is captured rather than run, so every test drives the flush
 * explicitly — a pump tested through `requestAnimationFrame` would be a pump
 * tested through a timer's mood.
 */
function stubGrid(ids: string[]) {
  const nodes = new Map(
    ids.map((id) => [id, { data: { id, bid: 0, ask: 0 } as Record<string, unknown> }]),
  );
  const applied: Array<{ update?: unknown[]; remove?: unknown[] }> = [];
  const grid: SsrmRowPumpGrid = {
    getRowNode: (id) => nodes.get(id) ?? null,
    applyServerSideTransaction: (tx) => {
      applied.push(tx);
      for (const row of (tx.update ?? []) as Array<Record<string, unknown>>) {
        const node = nodes.get(String(row.id));
        if (node) node.data = { ...row };
      }
      return null;
    },
  };
  return { grid, applied, nodes };
}

function manualSchedule() {
  let queued: (() => void) | null = null;
  return {
    schedule: (run: () => void) => {
      queued = run;
    },
    run() {
      const next = queued;
      queued = null;
      next?.();
      return next !== null;
    },
    get armed() {
      return queued !== null;
    },
  };
}

describe('the row pump', () => {
  /**
   * The reason conflation is a merge and not a replace: two frames naming
   * different columns of one row are two cells, and taking the later frame
   * whole would silently discard the earlier one.
   */
  it('merges sparse patches for the same row into one transaction', () => {
    const { grid, applied } = stubGrid(['A', 'B']);
    const clock = manualSchedule();
    const pump = createSsrmRowPump(grid, { keyField: 'id', schedule: clock.schedule });

    pump.push({ rows: [{ id: 'A', bid: 1 }] });
    pump.push({ rows: [{ id: 'A', ask: 2 }] });
    pump.push({ rows: [{ id: 'B', bid: 7 }] });
    expect(applied).toHaveLength(0);

    clock.run();

    expect(applied).toHaveLength(1);
    expect(applied[0].update).toEqual([
      { id: 'A', bid: 1, ask: 2 },
      { id: 'B', bid: 7, ask: 0 },
    ]);
    expect(pump.stats().received).toBe(3);
    expect(pump.stats().applied).toBe(2);
  });

  /** A patch for a row the grid does not hold is dropped, not fetched. */
  it('drops a patch for a row outside the block cache, and counts it', () => {
    const { grid, applied } = stubGrid(['A']);
    const clock = manualSchedule();
    const pump = createSsrmRowPump(grid, { keyField: 'id', schedule: clock.schedule });

    pump.push({ rows: [{ id: 'A', bid: 1 }, { id: 'Z', bid: 2 }] });
    clock.run();

    expect(applied[0].update).toEqual([{ id: 'A', bid: 1, ask: 0 }]);
    expect(pump.stats().dropped).toBe(1);
  });

  /**
   * The slice. A burst has to degrade into latency, not into a stall — and the
   * remainder must be picked up without another push to trigger it, or a feed
   * that goes quiet leaves the grid permanently behind.
   */
  it('stops at the budget and finishes on the next flush', () => {
    const { grid, applied } = stubGrid(['A', 'B', 'C', 'D']);
    const clock = manualSchedule();
    // A clock that advances a millisecond per reading: the first row is free,
    // the second exhausts a 1 ms budget.
    let tick = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (tick += 1));

    const pump = createSsrmRowPump(grid, {
      keyField: 'id',
      sliceBudgetMs: 1,
      schedule: clock.schedule,
    });
    pump.push({ rows: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }].map((r) => ({ ...r, bid: 1 })) });

    clock.run();
    expect((applied[0].update ?? []).length).toBe(1);
    expect(pump.stats().sliced).toBe(1);
    // Re-armed by the flush itself, with nothing else arriving.
    expect(clock.armed).toBe(true);

    clock.run();
    clock.run();
    clock.run();
    expect(pump.stats().applied).toBe(4);
    expect(pump.stats().pending).toBe(0);

    vi.restoreAllMocks();
  });

  /**
   * Removals are never deferred: a row that left the book must leave the screen
   * now, not after the backlog drains.
   */
  it('applies every removal in the first flush', () => {
    const { grid, applied } = stubGrid(['A', 'B']);
    const clock = manualSchedule();
    const pump = createSsrmRowPump(grid, {
      keyField: 'id',
      sliceBudgetMs: 0.0001,
      schedule: clock.schedule,
    });

    pump.push({ rows: [{ id: 'A', bid: 1 }, { id: 'B', bid: 2 }], removed: ['X', 'Y'] });
    clock.run();

    expect(applied[0].remove).toEqual(['X', 'Y']);
  });

  it('drops a pending update for a row that is then removed', () => {
    const { grid, applied } = stubGrid(['A']);
    const clock = manualSchedule();
    const pump = createSsrmRowPump(grid, { keyField: 'id', schedule: clock.schedule });

    pump.push({ rows: [{ id: 'A', bid: 5 }] });
    pump.push({ rows: [], removed: ['A'] });
    clock.run();

    expect(applied[0].update).toBeUndefined();
    expect(applied[0].remove).toEqual(['A']);
  });

  it('takes back a removal when the key is re-added in the same frame', () => {
    const { grid, applied } = stubGrid(['A']);
    const clock = manualSchedule();
    const pump = createSsrmRowPump(grid, { keyField: 'id', schedule: clock.schedule });

    pump.push({ rows: [], removed: ['A'] });
    pump.push({ rows: [{ id: 'A', bid: 5 }] });
    clock.run();

    expect(applied[0].remove).toBeUndefined();
    expect(applied[0].update).toEqual([{ id: 'A', bid: 5, ask: 0 }]);
  });

  it('does nothing once the grid is destroyed', () => {
    const { grid, applied } = stubGrid(['A']);
    const clock = manualSchedule();
    let destroyed = false;
    const pump = createSsrmRowPump(
      { ...grid, isDestroyed: () => destroyed },
      { keyField: 'id', schedule: clock.schedule },
    );

    pump.push({ rows: [{ id: 'A', bid: 1 }] });
    destroyed = true;
    clock.run();

    expect(applied).toHaveLength(0);
  });

  it('ignores a patch with no key rather than writing under "undefined"', () => {
    const { grid, applied } = stubGrid(['A']);
    const clock = manualSchedule();
    const pump = createSsrmRowPump(grid, { keyField: 'id', schedule: clock.schedule });

    pump.push({ rows: [{ bid: 1 }] });
    expect(clock.armed).toBe(false);
    clock.run();
    expect(applied).toHaveLength(0);
  });
});
