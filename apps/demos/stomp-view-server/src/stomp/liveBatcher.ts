/**
 * createLiveBatcher — stateful round-robin sweeper over the delivered
 * record set, driving the live-update loops.
 *
 * Goal: every row updates at least once per second. Each tick emits the
 * next N rows in sweep order (wrapping), where N is the larger of the
 * configured `updatesPerTick` and the coverage floor — the share of the
 * row set owed for the time elapsed since the last tick. The floor is
 * computed from real elapsed time, so setInterval clamping (Node's
 * ~1 ms minimum) and event-loop delays can't starve coverage.
 *
 * Sweep order alternates parity: all even-indexed rows first, then all
 * odd-indexed rows, repeating. A contiguous 0..N sweep reads as a slow
 * scan crawling down the blotter; parity waves make every other visible
 * row tick in each wave, so the whole grid looks alive at any scroll
 * position.
 *
 * Cost control (what makes the guarantee survivable): the first
 * `updatesPerTick` rows of each batch get the full-fidelity `mutate`
 * (deep clone, dozens of nested fields); the remaining coverage rows
 * get the cheap in-place `touch`. And the floor is capped at
 * `maxSweepRowsPerSec` — serializing an ~8.5 KB row costs ~80 µs, so an
 * uncapped 20 000-row/s sweep needs more CPU than one Node thread has;
 * past the cap the sweep degrades to full coverage every
 * rowCount / maxSweepRowsPerSec seconds instead of melting the event
 * loop (which delivers nothing at all).
 */
export interface LiveBatcherOptions<T> {
  records: readonly T[];
  /** Full-fidelity mutation (deep clone) for the `updatesPerTick` head rows. */
  mutate: (base: T) => T;
  /** Cheap in-place tick for sweep-coverage rows. */
  touch: (row: T) => T;
  updatesPerTick: number;
  /** Upper bound on sweep-driven rows/sec (the coverage floor's cap). */
  maxSweepRowsPerSec: number;
  now?: () => number;
}

export function createLiveBatcher<T>(
  options: LiveBatcherOptions<T>,
): () => T[] {
  const {
    records,
    mutate,
    touch,
    updatesPerTick,
    maxSweepRowsPerSec,
    now = Date.now,
  } = options;
  let cursor = 0;
  let lastTick = now();
  // Visit order: even indices, then odd indices (parity waves). Built
  // lazily so callers may create the batcher before the delivered set
  // is final; rebuilt if the record count ever changes.
  let order: number[] = [];
  const ensureOrder = (): void => {
    if (order.length === records.length) return;
    order = [];
    for (let i = 0; i < records.length; i += 2) order.push(i);
    for (let i = 1; i < records.length; i += 2) order.push(i);
    cursor = 0;
  };
  return () => {
    if (records.length === 0) return [];
    ensureOrder();
    const t = now();
    const elapsedMs = Math.min(1000, Math.max(1, t - lastTick));
    lastTick = t;
    const sweepTarget = Math.min(
      records.length,
      Math.max(1, maxSweepRowsPerSec),
    );
    const coverageFloor = Math.ceil((sweepTarget * elapsedMs) / 1000);
    const n = Math.min(
      records.length,
      Math.max(updatesPerTick, coverageFloor),
    );
    const fullCount = Math.min(updatesPerTick, n);
    const batch: T[] = [];
    for (let i = 0; i < n; i++) {
      const row = records[order[(cursor + i) % order.length]!]!;
      batch.push(i < fullCount ? mutate(row) : touch(row));
    }
    cursor = (cursor + n) % order.length;
    return batch;
  };
}
