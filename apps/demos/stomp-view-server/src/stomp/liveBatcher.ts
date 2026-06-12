/**
 * createLiveBatcher — stateful round-robin sweeper over the delivered
 * record set, driving the live-update loops.
 *
 * Guarantees every row is updated at least once per second: each tick
 * mutates the next N rows in cursor order (wrapping), where N is the
 * larger of the configured `updatesPerTick` and the coverage floor —
 * the share of the row set owed for the time elapsed since the last
 * tick. The floor is computed from real elapsed time, so setInterval
 * clamping (Node's ~1 ms minimum) and event-loop delays can't starve
 * coverage; a tick delayed ≥1 s emits the entire set.
 */
export function createLiveBatcher<T>(
  records: readonly T[],
  mutate: (base: T) => T,
  updatesPerTick: number,
  now: () => number = Date.now,
): () => T[] {
  let cursor = 0;
  let lastTick = now();
  return () => {
    if (records.length === 0) return [];
    const t = now();
    const elapsedMs = Math.min(1000, Math.max(1, t - lastTick));
    lastTick = t;
    const coverageFloor = Math.ceil((records.length * elapsedMs) / 1000);
    const n = Math.min(
      records.length,
      Math.max(updatesPerTick, coverageFloor),
    );
    const batch: T[] = [];
    for (let i = 0; i < n; i++) {
      batch.push(mutate(records[(cursor + i) % records.length]!));
    }
    cursor = (cursor + n) % records.length;
    return batch;
  };
}
