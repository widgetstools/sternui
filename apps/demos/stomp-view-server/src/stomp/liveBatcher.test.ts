import { describe, expect, it } from 'vitest';
import { createLiveBatcher } from './liveBatcher.js';

/** Fake clock: each call to the batcher advances time by `stepMs`. */
function clock(start: number, stepMs: number): () => number {
  let t = start - stepMs; // first batcher-internal call lands on `start`
  return () => (t += stepMs);
}

const identity = (n: number): number => n;

describe('createLiveBatcher', () => {
  it('sweeps the whole set within one second regardless of updatesPerTick', () => {
    const records = Array.from({ length: 100 }, (_, i) => i);
    // 10 ticks/sec, updatesPerTick=1 → coverage floor must dominate.
    const next = createLiveBatcher(records, identity, 1, clock(0, 100));
    const seen = new Set<number>();
    for (let tick = 0; tick < 10; tick++) {
      for (const r of next()) seen.add(r);
    }
    expect(seen.size).toBe(100);
  });

  it('honours updatesPerTick when it exceeds the coverage floor', () => {
    const records = Array.from({ length: 100 }, (_, i) => i);
    // 100 ms ticks → floor is 10 rows, but updatesPerTick asks for 25.
    const next = createLiveBatcher(records, identity, 25, clock(0, 100));
    expect(next().length).toBe(25);
  });

  it('round-robins in order with wrap-around (no row starved)', () => {
    const records = [0, 1, 2, 3, 4];
    const next = createLiveBatcher(records, identity, 2, clock(0, 1));
    expect(next()).toEqual([0, 1]);
    expect(next()).toEqual([2, 3]);
    expect(next()).toEqual([4, 0]);
  });

  it('emits the entire set when a tick is delayed a second or more', () => {
    const records = Array.from({ length: 50 }, (_, i) => i);
    const next = createLiveBatcher(records, identity, 1, clock(0, 5000));
    expect(next().length).toBe(50);
  });

  it('never exceeds the record count per tick', () => {
    const records = [0, 1, 2];
    const next = createLiveBatcher(records, identity, 1000, clock(0, 100));
    expect(next().length).toBe(3);
  });

  it('returns empty for an empty record set', () => {
    const next = createLiveBatcher<number>([], identity, 5);
    expect(next()).toEqual([]);
  });

  it('applies the mutate function to each emitted row', () => {
    const next = createLiveBatcher([1, 2], (n) => n * 10, 2, clock(0, 1));
    expect(next()).toEqual([10, 20]);
  });
});
