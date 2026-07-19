/**
 * ProviderTableBridge — feeds a provider's row stream into a Perspective
 * table hosted in the worker (ADR-ssrm-worker-hosted-engine.md).
 *
 * This is the write half of the pull architecture. Instead of fanning rows out
 * to every window, the provider writes them **once** into a table that all
 * windows query. Snapshot → `replace`, live frames → keyed `update`, and the
 * table's `index` does insert-vs-update, exactly as the hub cache's
 * `keyColumn` does today.
 *
 * Coalescing lives here rather than downstream: a sweep feed can deliver tens
 * of thousands of rows/sec (measured 20k/s on `star-demo`), and issuing one
 * `update()` per frame would cross the WASM boundary far more often than any
 * viewport needs. Frames are merged by key and flushed on a timer, so cost
 * tracks the flush rate, not the tick rate.
 *
 * Deliberately typed against a minimal structural interface: `host-data` sits
 * in the data bucket and must not import from `react-grid` (see
 * docs/ARCHITECTURE.md import rules), and the concrete table is supplied by
 * the worker host.
 */

/** Minimal Perspective table surface this bridge writes to. */
export interface BridgeTable {
  update(rows: Record<string, unknown>[]): Promise<void>;
  replace(rows: Record<string, unknown>[]): Promise<void>;
  remove(keys: (string | number)[]): Promise<void>;
}

export interface ProviderTableBridgeOpts {
  table: BridgeTable;
  /** Key column — must match the table's `index`. */
  keyColumn: string;
  /**
   * Merge window for live frames. Defaults to 100ms, matching the provider
   * `throttleMs` default so the bridge does not add a second cadence.
   */
  flushMs?: number;
  /** Injected for tests. */
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Notified after each flush with the number of rows written. */
  onFlush?: (rowCount: number) => void;
  /** Notified when a write rejects; the bridge keeps running. */
  onError?: (err: unknown) => void;
}

export class ProviderTableBridge {
  private readonly table: BridgeTable;
  private readonly keyColumn: string;
  private readonly flushMs: number;
  private readonly setTimer: (cb: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly onFlush?: (rowCount: number) => void;
  private readonly onError?: (err: unknown) => void;

  /** Pending live rows, conflated by key — last write wins, as the cache does. */
  private pending = new Map<string, Record<string, unknown>>();
  private pendingRemovals = new Set<string>();
  private timer: unknown = null;
  private inFlight: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(opts: ProviderTableBridgeOpts) {
    this.table = opts.table;
    this.keyColumn = opts.keyColumn;
    this.flushMs = opts.flushMs ?? 100;
    this.setTimer = opts.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as never));
    this.onFlush = opts.onFlush;
    this.onError = opts.onError;
  }

  /** Rows currently merged and awaiting flush — diagnostics / tests. */
  get pendingCount(): number {
    return this.pending.size + this.pendingRemovals.size;
  }

  /**
   * Full snapshot — replaces the table contents.
   *
   * Any coalesced live rows are dropped: they describe a book that no longer
   * exists. Applying them after a replace would resurrect stale rows.
   */
  async snapshot(rows: readonly Record<string, unknown>[]): Promise<void> {
    if (this.disposed) return;
    this.pending.clear();
    this.pendingRemovals.clear();
    this.cancelTimer();
    await this.run(() => this.table.replace([...rows]));
  }

  /** Live frame — merged by key and flushed on the next window. */
  push(rows: readonly Record<string, unknown>[]): void {
    if (this.disposed || rows.length === 0) return;
    for (const row of rows) {
      const key = this.keyOf(row);
      if (key === null) continue;
      this.pendingRemovals.delete(key);
      // Merge rather than replace: sparse/thin frames carry only changed
      // fields, so a later partial must not erase an earlier one's fields.
      const prev = this.pending.get(key);
      this.pending.set(key, prev ? { ...prev, ...row } : row);
    }
    this.scheduleFlush();
  }

  /** Remove rows by key on the next flush. */
  remove(keys: readonly string[]): void {
    if (this.disposed || keys.length === 0) return;
    for (const key of keys) {
      this.pending.delete(key);
      this.pendingRemovals.add(key);
    }
    this.scheduleFlush();
  }

  /** Force a flush now (test hook / shutdown drain). */
  async flush(): Promise<void> {
    this.cancelTimer();
    const rows = [...this.pending.values()];
    const removals = [...this.pendingRemovals];
    this.pending.clear();
    this.pendingRemovals.clear();
    if (rows.length === 0 && removals.length === 0) return;
    await this.run(async () => {
      if (rows.length > 0) await this.table.update(rows);
      if (removals.length > 0) await this.table.remove(removals);
    });
    this.onFlush?.(rows.length + removals.length);
  }

  /** Stop flushing and drop anything pending. The table is not deleted — it is
   * shared with every attached window and outlives this provider slot. */
  dispose(): void {
    this.disposed = true;
    this.cancelTimer();
    this.pending.clear();
    this.pendingRemovals.clear();
  }

  private keyOf(row: Record<string, unknown>): string | null {
    const raw = row[this.keyColumn];
    if (raw === null || raw === undefined || raw === '') return null;
    return String(raw);
  }

  private scheduleFlush(): void {
    if (this.timer !== null || this.disposed) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.flush();
    }, this.flushMs);
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    this.clearTimer(this.timer);
    this.timer = null;
  }

  /**
   * Serialise writes. Perspective calls are async and out-of-order writes
   * would let an older frame land after a newer one for the same key.
   */
  private run(fn: () => Promise<void>): Promise<void> {
    this.inFlight = this.inFlight
      .then(fn)
      .catch((err: unknown) => {
        this.onError?.(err);
      });
    return this.inFlight;
  }
}
