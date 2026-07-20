import type { SsrmGetRowsResult } from "./types";

/** Cached worker getRows payload (main-thread; enables sync params.success). */
export type CachedGetRows = Pick<
  SsrmGetRowsResult,
  | "rowData"
  | "rowCount"
  | "pivotResultFields"
  | "totals"
  | "aggregates"
  | "filteredRowCount"
  | "totalRowCount"
>;

/** Fields that uniquely identify a Perspective SSRM block slice. */
export type BlockCacheKeyParts = {
  dataset: string;
  startRow: number;
  endRow: number;
  rowGroupCols: { id: string; field: string }[];
  valueCols: { id: string; field: string; aggFunc: string }[];
  pivotCols: { id: string; field: string }[];
  pivotMode: boolean;
  groupKeys: string[];
  filterModel: Record<string, unknown>;
  sortModel: { colId: string; sort: string }[];
  quickFilterText?: string;
  quickFilterFields?: string[];
  treeData?: boolean;
  absSort?: boolean;
  rowKeepExpression?: string;
  /** Bumped on purge / data replace — stale async results must miss. */
  refreshGeneration: number;
};

/** Stable fingerprint for Map lookup (key order fixed by this object). */
export function fingerprintBlockRequest(parts: BlockCacheKeyParts): string {
  return JSON.stringify(parts);
}

/**
 * Bound on retained blocks — enough for many visited viewports per query
 * shape; oldest-inserted evicted beyond it (a fling revisit misses and
 * refetches, which is the pre-cache behavior, not an error).
 */
const MAX_CACHED_BLOCKS = 256;

/**
 * Main-thread cache of SSRM blocks from the Perspective worker.
 * Cache hits allow `params.success` synchronously (no Loading flash).
 *
 * Live-feed staleness model (anti-jank): a tick does NOT drop entries —
 * `markAllStale()` flags them. Stale blocks stay servable for synchronous
 * scroll delivery (at worst one refresh interval behind — the same
 * staleness the painted grid shows) while the caller revalidates in the
 * background. Only hard purges (dataset replace / reconfigure) `clear()`.
 */
export class SsrmBlockCache {
  private readonly blocks = new Map<string, CachedGetRows>();
  private readonly staleKeys = new Set<string>();
  private readonly inflight = new Map<string, Promise<CachedGetRows>>();
  /** Bumped on clear() so late in-flight loads do not repopulate. */
  private epoch = 0;

  get(key: string): CachedGetRows | undefined {
    return this.blocks.get(key);
  }

  /** True when the entry exists but predates the last `markAllStale()`. */
  isStale(key: string): boolean {
    return this.staleKeys.has(key);
  }

  set(key: string, value: CachedGetRows): void {
    // Re-insert to refresh insertion order (Map iteration = eviction order).
    this.blocks.delete(key);
    this.blocks.set(key, value);
    this.staleKeys.delete(key);
    if (this.blocks.size > MAX_CACHED_BLOCKS) {
      const oldest = this.blocks.keys().next().value as string | undefined;
      if (oldest !== undefined) {
        this.blocks.delete(oldest);
        this.staleKeys.delete(oldest);
      }
    }
  }

  /**
   * Flag every entry stale — servable for sync scroll, due a revalidate.
   * The live-feed alternative to `clear()`: dropping entries per tick kept
   * the cache permanently cold and every fling frame waited a round trip.
   */
  markAllStale(): void {
    for (const key of this.blocks.keys()) this.staleKeys.add(key);
  }

  /**
   * Drop all blocks. Call on purge soft-refresh and when refreshGeneration
   * bumps so sync hits cannot serve a pre-change query shape.
   * Late in-flight loads from a prior epoch do not repopulate.
   */
  clear(): void {
    this.epoch += 1;
    this.blocks.clear();
    this.staleKeys.clear();
    this.inflight.clear();
  }

  get size(): number {
    return this.blocks.size;
  }

  /**
   * Merge leaf updates into any cached block rows that share `idField`.
   * Keeps sync scroll hits consistent with surgical grid transactions.
   */
  patchRows(
    idField: string,
    updates: Record<string, unknown>[],
  ): number {
    if (updates.length === 0) return 0;
    const byId = new Map<unknown, Record<string, unknown>>();
    for (const row of updates) {
      const id = row[idField];
      if (id !== undefined && id !== null) byId.set(id, row);
    }
    if (byId.size === 0) return 0;

    let patched = 0;
    for (const block of this.blocks.values()) {
      for (let i = 0; i < block.rowData.length; i++) {
        const row = block.rowData[i]!;
        const next = byId.get(row[idField]);
        if (!next) continue;
        block.rowData[i] = { ...row, ...next };
        patched += 1;
      }
    }
    return patched;
  }

  /** First cached row matching `idField === id`, if any. */
  findRow(
    idField: string,
    id: string,
  ): Record<string, unknown> | undefined {
    for (const block of this.blocks.values()) {
      for (const row of block.rowData) {
        if (String(row[idField]) === id) return row;
      }
    }
    return undefined;
  }

  /**
   * Return cached value, join an in-flight load, or run `loader` once.
   */
  getOrLoad(
    key: string,
    loader: () => Promise<CachedGetRows>,
  ): Promise<CachedGetRows> {
    const hit = this.blocks.get(key);
    if (hit) return Promise.resolve(hit);

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const epochAtStart = this.epoch;
    const p = loader()
      .then((value) => {
        if (this.epoch === epochAtStart) {
          this.blocks.set(key, value);
        }
        this.inflight.delete(key);
        return value;
      })
      .catch((err) => {
        this.inflight.delete(key);
        throw err;
      });
    this.inflight.set(key, p);
    return p;
  }
}
