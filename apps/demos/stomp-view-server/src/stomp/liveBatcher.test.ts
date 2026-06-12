import { describe, expect, it } from 'vitest';
import { createLiveBatcher } from './liveBatcher.js';

/** Fake clock: each call to the batcher advances time by `stepMs`. */
function clock(start: number, stepMs: number): () => number {
  let t = start - stepMs; // first batcher-internal call lands on `start`
  return () => (t += stepMs);
}

const identity = (n: number): number => n;

function batcher(
  records: number[],
  overrides: Partial<Parameters<typeof createLiveBatcher<number>>[0]> = {},
) {
  return createLiveBatcher<number>({
    records,
    mutate: identity,
    touch: identity,
    updatesPerTick: 1,
    maxSweepRowsPerSec: 1_000_000,
    ...overrides,
  });
}

describe('createLiveBatcher', () => {
  it('sweeps the whole set within one second regardless of updatesPerTick', () => {
    const records = Array.from({ length: 100 }, (_, i) => i);
    // 10 ticks/sec, updatesPerTick=1 → coverage floor must dominate.
    const next = batcher(records, { now: clock(0, 100) });
    const seen = new Set<number>();
    for (let tick = 0; tick < 10; tick++) {
      for (const r of next()) seen.add(r);
    }
    expect(seen.size).toBe(100);
  });

  it('honours updatesPerTick when it exceeds the coverage floor', () => {
    const records = Array.from({ length: 100 }, (_, i) => i);
    // 100 ms ticks → floor is 10 rows, but updatesPerTick asks for 25.
    const next = batcher(records, { updatesPerTick: 25, now: clock(0, 100) });
    expect(next().length).toBe(25);
  });

  it('round-robins in order with wrap-around (no row starved)', () => {
    const next = batcher([0, 1, 2, 3, 4], {
      updatesPerTick: 2,
      now: clock(0, 1),
    });
    expect(next()).toEqual([0, 1]);
    expect(next()).toEqual([2, 3]);
    expect(next()).toEqual([4, 0]);
  });

  it('emits the entire set when a tick is delayed a second or more', () => {
    const records = Array.from({ length: 50 }, (_, i) => i);
    const next = batcher(records, { now: clock(0, 5000) });
    expect(next().length).toBe(50);
  });

  it('caps sweep-driven coverage at maxSweepRowsPerSec', () => {
    const records = Array.from({ length: 20_000 }, (_, i) => i);
    // 1 s ticks: uncapped floor would be 20 000 rows; budget caps at 5 000.
    const next = batcher(records, {
      maxSweepRowsPerSec: 5000,
      now: clock(0, 1000),
    });
    expect(next().length).toBe(5000);
    // Cursor still advances — the full set is covered across 4 ticks.
    const seen = new Set<number>(next());
    next().forEach((r) => seen.add(r));
    next().forEach((r) => seen.add(r));
    expect(seen.size).toBe(15_000);
  });

  it('uses full mutate for the head rows and touch for coverage rows', () => {
    const records = Array.from({ length: 10 }, (_, i) => i);
    const mutated: number[] = [];
    const touched: number[] = [];
    const next = createLiveBatcher<number>({
      records,
      mutate: (n) => {
        mutated.push(n);
        return n;
      },
      touch: (n) => {
        touched.push(n);
        return n;
      },
      updatesPerTick: 2,
      maxSweepRowsPerSec: 1_000_000,
      now: clock(0, 1000), // floor = whole set per tick
    });
    expect(next().length).toBe(10);
    expect(mutated).toEqual([0, 1]);
    expect(touched).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('never exceeds the record count per tick', () => {
    const next = batcher([0, 1, 2], { updatesPerTick: 1000, now: clock(0, 100) });
    expect(next().length).toBe(3);
  });

  it('returns empty for an empty record set', () => {
    const next = batcher([]);
    expect(next()).toEqual([]);
  });

  it('applies the mutate function to emitted head rows', () => {
    const next = createLiveBatcher<number>({
      records: [1, 2],
      mutate: (n) => n * 10,
      touch: (n) => n * 100,
      updatesPerTick: 1,
      maxSweepRowsPerSec: 1_000_000,
      now: clock(0, 1000),
    });
    expect(next()).toEqual([10, 200]);
  });
});
