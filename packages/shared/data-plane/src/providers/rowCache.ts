/**
 * rowCache.ts — row-oriented upsert cache for streaming data providers.
 *
 * Distinct from `cache.ts` (generic LRU/TTL per-key): this cache models
 * a PROVIDER-scoped snapshot of rows, where each row's identity comes
 * from a configured `keyColumn`. Used by STOMP / WebSocket / SocketIO
 * providers that deliver ordered streams of row upserts.
 *
 * Shape
 * -----
 *   RowCache ─┬─> cache: Map<keyValue, row>   (immutable copies on upsert)
 *             └─> keyColumn: string            (the row field used as PK)
 *
 * Why a second cache?
 *
 * The generic keyed cache (`ProviderCache`) models a Key → Value store
 * where each key is a separate resource (great for AppData, REST
 * per-endpoint, per-ticker price subscriptions). A STOMP position
 * blotter is fundamentally different: it's ONE logical resource (the
 * whole positions table) whose contents are a multiset of rows keyed
 * by an application-domain ID (`positionId`, `tradeId`, etc.).
 * Modeling every row as a separate cache entry with its own TTL
 * misses the whole point — rows in a row-stream are a SET, not
 * independent resources.
 *
 * This matches the production model used by stern-1's StompEngine
 * (`/Users/develop/Documents/projects/stern-1/client/src/workers/engine/CacheManager.ts`)
 * — the proven architecture the data-plane is consolidating.
 *
 * Invariants
 * ----------
 *   • Every row must contain `row[keyColumn]` defined (non-null).
 *     Rows without it are dropped with a warning — missing keys
 *     would silently double-up on re-upsert.
 *   • Upsert copies the row (`{ ...row }`) so downstream AG-Grid
 *     transaction diffs see a new reference. Grid cell renderers
 *     bail on identity comparison; without this they'd paint
 *     stale values for in-place updates.
 *   • Order is iteration order of the underlying Map (insertion /
 *     last-upsert). Consumers that need sort order handle it
 *     client-side; row-stream providers don't guarantee ordering.
 *   • No TTL and no LRU cap — row-stream caches mirror the upstream
 *     state exactly. If the stream grows unbounded, that's a
 *     producer-side issue, not a cache concern.
 */

export interface RowCacheOpts {
  /**
   * Name of the field in each row whose value is the stable primary
   * key. MUST match the `keyColumn` the provider's config declares —
   * this is also what the grid's `getRowId` uses so cache and grid
   * stay in lockstep.
   */
  keyColumn: string;
}

export interface UpsertResult {
  /** Rows that actually landed in the cache. */
  accepted: number;
  /** Rows dropped because `row[keyColumn]` was null/undefined. */
  skipped: number;
}

export class RowCache<TRow extends Record<string, unknown> = Record<string, unknown>> {
  private readonly rows = new Map<string, TRow>();
  readonly keyColumn: string;

  constructor(opts: RowCacheOpts) {
    this.keyColumn = opts.keyColumn;
  }

  /**
   * Upsert a batch of rows. Returns counts so the router can surface
   * key-column-mismatch diagnostics to late-joining subscribers.
   */
  upsert(incoming: readonly TRow[]): UpsertResult {
    let accepted = 0;
    let skipped = 0;
    for (const row of incoming) {
      const k = this.extractKey(row);
      if (k === null) {
        skipped++;
        continue;
      }
      this.rows.set(k, { ...row });
      accepted++;
    }
    return { accepted, skipped };
  }

  /** Remove rows matching the given rows' keys. Unknown keys are ignored. */
  remove(outgoing: readonly TRow[]): number {
    let removed = 0;
    for (const row of outgoing) {
      const k = this.extractKey(row);
      if (k === null) continue;
      if (this.rows.delete(k)) removed++;
    }
    return removed;
  }

  /** Full snapshot as an array — callers get a fresh array on every call. */
  getAll(): TRow[] {
    return Array.from(this.rows.values());
  }

  get(key: string): TRow | undefined {
    return this.rows.get(key);
  }

  has(key: string): boolean {
    return this.rows.has(key);
  }

  clear(): void {
    this.rows.clear();
  }

  get size(): number {
    return this.rows.size;
  }

  /** `null` = missing key; drop the row. */
  private extractKey(row: TRow): string | null {
    const value = (row as Record<string, unknown>)[this.keyColumn];
    if (value === undefined || value === null) return null;
    return String(value);
  }
}
