import type { PositionRecord } from "../data/fiRecords.js";
import type { SparsePositionDelta } from "../data/sparseTick.js";
import { sparseErraticTickPosition } from "../data/sparseTick.js";

export interface SparseLiveBatcherOptions {
  records: readonly PositionRecord[];
  /** Target rows per tick before jitter (STOMP `updates-per-tick` / env default). */
  rowsPerTick: number;
  /** Optional RNG for tests. */
  random?: () => number;
}

/**
 * Sparse live batcher — random row subsets per tick, no coverage floor.
 * Each selected row emits a partial delta (headline fields only).
 */
export function createSparseLiveBatcher(
  options: SparseLiveBatcherOptions,
): () => SparsePositionDelta[] {
  const { records, rowsPerTick, random = Math.random } = options;

  return () => {
    if (records.length === 0 || rowsPerTick <= 0) return [];

    const jitter = 0.65 + random() * 0.7;
    const batchSize = Math.min(
      records.length,
      Math.max(1, Math.floor(rowsPerTick * jitter)),
    );

    const indices = new Set<number>();
    const maxAttempts = batchSize * 4;
    let attempts = 0;
    while (indices.size < batchSize && attempts < maxAttempts) {
      indices.add(Math.floor(random() * records.length));
      attempts++;
    }

    const batch: SparsePositionDelta[] = [];
    for (const index of indices) {
      const delta = sparseErraticTickPosition(records[index]!, random);
      if (delta) batch.push(delta);
    }
    return batch;
  };
}
