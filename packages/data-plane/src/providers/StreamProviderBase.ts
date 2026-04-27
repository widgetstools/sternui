/**
 * StreamProviderBase — abstract base for row-stream providers.
 *
 * Contract
 * --------
 * A row-stream provider owns ONE upstream connection and delivers
 * rows in two phases:
 *
 *   1. Snapshot phase — provider emits `onSnapshotBatch(rows)` many
 *      times as the upstream load arrives. Batches land in the
 *      internal `RowCache` (upsert keyed by `keyColumn`) and fan out
 *      to all live subscribers.
 *   2. Snapshot-complete — provider detects the end-of-snapshot
 *      signal (STOMP body contains the configured `snapshotEndToken`;
 *      WebSocket / SocketIO use their own markers) and calls
 *      `markSnapshotComplete()`. From this point, every emit is a
 *      realtime update — `onRowUpdate(rows)` fans out single-row
 *      (or small batch) updates to subscribers.
 *
 * Late-joiner semantics
 * ---------------------
 * Subscribers who connect DURING the snapshot phase are marked via
 * `registerSubscriber()` so the router knows they're already
 * receiving the live stream — they must NOT be sent the cached
 * snapshot on `get-cached-rows` (it would duplicate the data they
 * already received).
 *
 * Subscribers who connect AFTER `snapshot-complete` are NOT marked
 * as live-snapshot receivers; `get-cached-rows` reads the cache and
 * returns it as one `snapshot-batch` + `snapshot-complete` so their
 * grid bootstrap looks identical to an early joiner's.
 *
 * This is a direct port of the semantics used by stern-1's
 * `StompEngine` — the proven production pattern for this problem.
 *
 * Subclass responsibilities
 * -------------------------
 *   • Call `super(id, { keyColumn })` in the constructor.
 *   • Implement `start()` / `stop()` — open and tear down the
 *     upstream transport.
 *   • When snapshot rows arrive, call `ingestSnapshotBatch(rows)`.
 *     The base class caches them and fans out to listeners.
 *   • When the snapshot ends, call `markSnapshotComplete()` exactly
 *     once. Calling again is a no-op.
 *   • When realtime updates arrive, call `ingestUpdate(rows)`. The
 *     base class caches them (same upsert) and fans out.
 *   • On error, call `reportError(error)` so the router can surface
 *     a typed `err` message to subscribers.
 *
 * The concrete router in `worker/router.ts` (Week 2) wires this class
 * into the wire protocol — it subscribes to `snapshot-batch` /
 * `snapshot-complete` / `row-update` / `error` events and broadcasts
 * them over MessagePorts.
 */

import type { ProviderType } from '@marketsui/shared-types';
import { RowCache, type RowCacheOpts } from '../worker/rowCache';

export interface StreamProviderListener<TRow = Record<string, unknown>> {
  onSnapshotBatch?(rows: readonly TRow[]): void;
  /** Fired exactly once per snapshot cycle. */
  onSnapshotComplete?(): void;
  onRowUpdate?(rows: readonly TRow[]): void;
  onError?(error: Error): void;
  /** Lifecycle hook — transport connected / reconnected. */
  onConnected?(): void;
  onDisconnected?(reason?: string): void;
}

export interface StreamStatistics {
  isConnected: boolean;
  mode: 'idle' | 'connecting' | 'snapshot' | 'realtime' | 'error';
  snapshotBatches: number;
  snapshotRowsReceived: number;
  updateRowsReceived: number;
  bytesReceived: number;
  connectionCount: number;
  disconnectionCount: number;
  cacheSize: number;
  lastError?: string;
}

export type Unsubscribe = () => void;

export abstract class StreamProviderBase<
  TConfig = unknown,
  TRow extends Record<string, unknown> = Record<string, unknown>,
> {
  abstract readonly type: ProviderType;
  readonly id: string;

  protected readonly cache: RowCache<TRow>;
  protected readonly stats: StreamStatistics = {
    isConnected: false,
    mode: 'idle',
    snapshotBatches: 0,
    snapshotRowsReceived: 0,
    updateRowsReceived: 0,
    bytesReceived: 0,
    connectionCount: 0,
    disconnectionCount: 0,
    cacheSize: 0,
  };

  private readonly listeners = new Set<StreamProviderListener<TRow>>();
  private snapshotComplete = false;
  private readonly liveSnapshotPorts = new Set<string>();

  constructor(id: string, cacheOpts: RowCacheOpts) {
    this.id = id;
    this.cache = new RowCache<TRow>(cacheOpts);
    this.stats.mode = 'idle';
  }

  // ─── Subclass hooks ──────────────────────────────────────────────────

  abstract configure(config: TConfig): Promise<void>;

  /** Open the upstream transport. Should resolve on connected. */
  abstract start(): Promise<void>;

  /** Tear down the upstream transport. MUST be idempotent. */
  abstract stop(): Promise<void>;

  /**
   * Last-applied config — captured by subclasses in `configure()` so
   * `restart()` can re-apply without the caller re-passing it.
   * Subclasses that override `configure` should set `this.lastConfig`.
   */
  protected lastConfig: TConfig | undefined;

  /**
   * Restart this stream: stop the current transport, clear the snapshot
   * cache + reset late-joiner tracking, then `start()` again. Existing
   * subscribers (any port that called `addListener`) stay attached and
   * receive the fresh snapshot the same way a brand-new subscriber
   * would — `onSnapshotBatch` for each batch + `onSnapshotComplete`
   * once the stream end-token arrives.
   *
   * `extra` is a free-form bag forwarded by the worker; subclasses
   * (e.g. `RestDataProvider`) use it to receive parameters like
   * `{ asOfDate }` driven from the MarketsGrid historical-mode
   * date picker. The default implementation ignores `extra` —
   * override `restart()` if you need to thread it into `configure()`
   * or `start()`.
   */
  async restart(_extra?: Record<string, unknown>): Promise<void> {
    await this.stop();
    this.cache.clear();
    this.resetSnapshotState();
    if (this.lastConfig !== undefined) {
      await this.configure(this.lastConfig);
    }
    await this.start();
  }

  // ─── Listener plumbing ───────────────────────────────────────────────

  /**
   * Attach a transient listener (the router creates one per active
   * port). Listeners are NOT the late-joiner registry — that's tracked
   * separately via `registerSubscriber(portId)`.
   */
  addListener(l: StreamProviderListener<TRow>): Unsubscribe {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  // ─── Late-joiner tracking ────────────────────────────────────────────

  /**
   * Record that a port connected BEFORE snapshot-complete fires.
   * During snapshot, every live port is marked here so a subsequent
   * `get-cached-rows` request from that port can be skipped without
   * double-delivery.
   *
   * Call from the router on `subscribe-stream`. If snapshot is
   * already complete when this fires, we skip — the port is a late
   * joiner and must explicitly fetch cached rows.
   */
  registerSubscriber(portId: string): void {
    if (!this.snapshotComplete) this.liveSnapshotPorts.add(portId);
  }

  unregisterSubscriber(portId: string): void {
    this.liveSnapshotPorts.delete(portId);
  }

  /**
   * Should the router reply to a `get-cached-rows` request from this
   * port with the cached snapshot? False when the port was present
   * during the live snapshot (they already got the data).
   */
  shouldReceiveCached(portId: string): boolean {
    if (!this.snapshotComplete) return false; // snapshot still streaming
    return !this.liveSnapshotPorts.has(portId);
  }

  // ─── Subclass ingestion helpers ──────────────────────────────────────

  /** Called by subclass on every snapshot-phase message. */
  protected ingestSnapshotBatch(rows: readonly TRow[], byteSize = 0): void {
    if (this.snapshotComplete) {
      // Stream has already transitioned — redirect to update path.
      this.ingestUpdate(rows, byteSize);
      return;
    }
    const { accepted } = this.cache.upsert(rows);
    this.stats.mode = 'snapshot';
    this.stats.snapshotBatches++;
    this.stats.snapshotRowsReceived += accepted;
    this.stats.bytesReceived += byteSize;
    this.stats.cacheSize = this.cache.size;
    this.dispatch((l) => l.onSnapshotBatch?.(rows));
  }

  /** Called by subclass exactly once per snapshot cycle. */
  protected markSnapshotComplete(): void {
    if (this.snapshotComplete) return;
    this.snapshotComplete = true;
    this.stats.mode = 'realtime';
    this.dispatch((l) => l.onSnapshotComplete?.());
  }

  /** Called by subclass on every realtime message. */
  protected ingestUpdate(rows: readonly TRow[], byteSize = 0): void {
    const { accepted } = this.cache.upsert(rows);
    this.stats.updateRowsReceived += accepted;
    this.stats.bytesReceived += byteSize;
    this.stats.cacheSize = this.cache.size;
    this.dispatch((l) => l.onRowUpdate?.(rows));
  }

  protected reportError(err: Error): void {
    this.stats.lastError = err.message;
    this.stats.mode = 'error';
    this.dispatch((l) => l.onError?.(err));
  }

  protected reportConnected(): void {
    this.stats.isConnected = true;
    this.stats.connectionCount++;
    this.dispatch((l) => l.onConnected?.());
  }

  protected reportDisconnected(reason?: string): void {
    this.stats.isConnected = false;
    this.stats.disconnectionCount++;
    this.dispatch((l) => l.onDisconnected?.(reason));
  }

  // ─── Introspection ───────────────────────────────────────────────────

  isSnapshotComplete(): boolean {
    return this.snapshotComplete;
  }

  getCache(): readonly TRow[] {
    return this.cache.getAll();
  }

  getStatistics(): StreamStatistics {
    return { ...this.stats };
  }

  // ─── Internals ───────────────────────────────────────────────────────

  private dispatch(fn: (l: StreamProviderListener<TRow>) => void): void {
    // Snapshot the set before iterating so a listener removing itself
    // mid-dispatch doesn't break the iterator.
    for (const l of [...this.listeners]) {
      try {
        fn(l);
      } catch (err) {
        // A misbehaving listener must not kill the provider.
        // eslint-disable-next-line no-console
        console.error(`[StreamProviderBase:${this.id}] listener threw`, err);
      }
    }
  }

  /** Reset internal state on reconnect (cache cleared by caller if needed). */
  protected resetSnapshotState(): void {
    this.snapshotComplete = false;
    this.liveSnapshotPorts.clear();
    this.stats.mode = 'idle';
    this.stats.snapshotBatches = 0;
    this.stats.snapshotRowsReceived = 0;
    this.stats.cacheSize = this.cache.size;
  }
}
