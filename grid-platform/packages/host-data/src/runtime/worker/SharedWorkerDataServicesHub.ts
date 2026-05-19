/**
 * SharedWorkerDataServicesHub — single-process state machine that fans
 * incoming requests to provider factories and outgoing events to
 * subscriber ports. Lives inside the SharedWorker.
 *
 * Responsibilities, in order of importance:
 *
 *   1. Provider lifecycle.
 *      - Lazy-create on first `attach`. Subsequent attaches with the
 *        same providerId reuse the running provider and ignore the
 *        cfg payload.
 *      - **Never auto-tear-down** when the last subscriber detaches.
 *        Providers run until explicit `stop` or worker death.
 *      - `attach.extra` triggers `provider.restart(extra)` on a
 *        running provider (the historical-mode date picker + refresh
 *        button paths).
 *
 *   2. Cache.
 *      - Per-provider `Map<rowKey, row>` keyed by `cfg.keyColumn`.
 *      - The cache IS the snapshot. Late joiners get
 *        `delta { replace: true, rows: [...cache] }` immediately on
 *        attach — no separate replay protocol, no race window.
 *
 *   3. Listener fan-out.
 *      - Per-provider per-mode (`data` vs `stats`). Each new
 *        listener gets a guaranteed first emit:
 *        - data:  `delta { replace: true, rows }` + current `status`
 *        - stats: a `stats` event from the next sampler tick (or
 *          immediately if the sampler has cached values).
 *
 *   4. Stats sampler.
 *      - Single `setInterval` loop. Computes msgPerSec via a 5s
 *        sliding window of msg counts, snapshots into a
 *        `ProviderStats` per provider, sends to stats listeners.
 *      - Self-disabling when no stats listeners exist anywhere.
 */

import { composeRowId, type ProviderConfig } from '@stargrid/types';
import type {
  AttachRequest,
  DetachRequest,
  Event,
  ProviderStats,
  ProviderStatus,
  Request,
  StopRequest,
  AppDataRequest,
  AppDataAttachRequest,
  AppDataDetachRequest,
  AppDataSetRequest,
  AppDataUpsertRequest,
  AppDataRemoveRequest,
  AppDataEvent,
  AppDataRow,
} from '../protocol.js';
import { startProvider } from '../providers/registry.js';
import type { ProviderEmit, ProviderEmitEvent, ProviderHandle } from '../providers/Provider.js';
import { WorkerAppDataStore } from './WorkerAppDataStore.js';
import type { ConfigManager } from '@stargrid/host-config';
import { AppDataConfigStore, type AppDataConfig } from '../providers/appdata/store.js';

/**
 * Gate for hot-path diagnostic logs. Flip to `true` locally when debugging
 * provider lifecycle or fan-out — at high message rates (e.g., 1000 msg/s)
 * the per-broadcast `console.log` measurably hurts CPU even with DevTools
 * closed, because the browser still formats the template strings.
 */
const DEBUG = false;

/**
 * Maximum rows shipped in a single late-join replay `postMessage`.
 * Same rationale as `SNAPSHOT_CHUNK_SIZE` in `providers/stomp.ts` —
 * keeps each main-thread message handler under Chromium's 50ms
 * long-task threshold. Late-joiners (popouts, hot reloads) hit this
 * path; without chunking they receive the entire cache in one frame.
 */
const LATE_JOIN_CHUNK_SIZE = 500;

export interface PortLike {
  postMessage(message: unknown): void;
}

interface ProviderSlot {
  handle: ProviderHandle;
  cfg: ProviderConfig;
  cache: Map<string, unknown>;
  status: ProviderStatus;
  lastError?: string;
  // Stats counters
  byteCount: number;
  msgCount: number;
  msgsByBucket: number[]; // 5 1-second buckets, rotating
  bucketIdx: number;
  startedAt: number;
  lastMessageAt: number | null;
  errorCount: number;
}

interface DataListener {
  subId: string;
  port: PortLike;
}

interface StatsListener {
  subId: string;
  port: PortLike;
}

interface AppDataListenerEntry {
  subId: string;
  port: PortLike;
}

export interface SharedWorkerDataServicesHubOpts {
  /**
   * ConfigManager backing AppData persistence. The hub becomes the
   * sole IndexedDB writer for AppData rows — main-thread mirrors no
   * longer touch ConfigManager. Optional only for back-compat with
   * tests that don't exercise the AppData path; production callers
   * (the SharedWorker entry script) MUST pass one.
   */
  configManager?: ConfigManager;

  /** Tick interval for the stats sampler (default 1000ms). */
  statsIntervalMs?: number;
  /** Inject the timer for tests. Default: setInterval. */
  setTimer?: (cb: () => void, ms: number) => unknown;
  /** Inject the timer cancel for tests. Default: clearInterval. */
  clearTimer?: (handle: unknown) => void;
}

/**
 * Extract the row-id key from a row using `cfg.keyColumn`. Rows
 * lacking the field (or with null/undefined values) are skipped —
 * surfacing them as cached entries with stringified `null` would
 * silently corrupt the cache.
 *
 * `keyColumn` may be a single string (one column) OR an array of
 * column names (composite key, joined with `-`). Delegates to
 * `composeRowId` so the cache key matches AG-Grid's `getRowId`
 * byte-for-byte.
 */
function keyOf(row: unknown, keyColumn: string | readonly string[] | undefined): string | null {
  return composeRowId(row, keyColumn);
}

export class SharedWorkerDataServicesHub {
  private readonly providers = new Map<string, ProviderSlot>();
  private readonly dataListeners = new Map<string, Map<string, DataListener>>();
  private readonly statsListeners = new Map<string, Map<string, StatsListener>>();

  // ─── AppData state (Steps 2 + worker-persistence) ──────────────
  // Single authoritative store per hub instance. Listeners are keyed
  // by subId for direct lookup on detach. The hub also owns the
  // IndexedDB writer (`appDataStore`); main-thread mirrors send pure
  // RPC requests for set/upsert/remove and never touch Dexie themselves.
  private readonly appData = new WorkerAppDataStore();
  private readonly appDataListeners = new Map<string, AppDataListenerEntry>();
  private readonly appDataStore: AppDataConfigStore | null;

  private readonly statsIntervalMs: number;
  private readonly setTimer: (cb: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private statsTimer: unknown = null;

  constructor(opts: SharedWorkerDataServicesHubOpts = {}) {
    this.statsIntervalMs = opts.statsIntervalMs ?? 1000;
    this.setTimer = opts.setTimer ?? ((cb, ms) => setInterval(cb, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
    this.appDataStore = opts.configManager ? new AppDataConfigStore(opts.configManager) : null;

    // Wire the AppData store to fan deltas to every attached listener.
    // Set up here once; re-attaching listeners doesn't re-subscribe.
    this.appData.subscribe((op, row) => {
      for (const [, entry] of this.appDataListeners) {
        const event: AppDataEvent = {
          kind: 'appdata-delta',
          subId: entry.subId,
          op,
          row,
        };
        try { entry.port.postMessage(event); }
        catch { /* port dead; cleanup happens via onPortClosed */ }
      }
    });
  }

  // ─── Public surface ────────────────────────────────────────────

  handleRequest(port: PortLike, req: Request): void {
    switch (req.kind) {
      case 'attach':  this.handleAttach(port, req); return;
      case 'detach':  this.handleDetach(req); return;
      case 'stop':    this.handleStop(req); return;
    }
  }

  /**
   * AppData request handler. Separate entry point so the existing
   * provider request flow stays identical. Routed by `isAppDataRequest`
   * upstream of the hub (typically in the worker entry).
   *
   * The set/upsert/remove paths are async because they persist to
   * IndexedDB before broadcasting. Caller fires-and-forgets — the
   * client receives an `appdata-ack` event when the operation
   * completes (success or failure).
   */
  handleAppDataRequest(port: PortLike, req: AppDataRequest): void {
    switch (req.kind) {
      case 'appdata-attach':  this.handleAppDataAttach(port, req); return;
      case 'appdata-detach':  this.handleAppDataDetach(req); return;
      case 'appdata-set':     void this.handleAppDataSet(port, req); return;
      case 'appdata-upsert':  void this.handleAppDataUpsert(port, req); return;
      case 'appdata-remove':  void this.handleAppDataRemove(port, req); return;
    }
  }

  /**
   * Read existing AppData rows from IndexedDB and seed the in-memory
   * store. Caller must await this BEFORE invoking
   * `handleAppDataRequest` for any port — otherwise late-joiners may
   * observe a partial snapshot before the worker finishes hydrating.
   *
   * Idempotent. No-op if no ConfigManager was supplied.
   *
   * `userId` is used only to satisfy `AppDataConfigStore.list`'s
   * legacy signature; AppData rows are global so the value doesn't
   * narrow the result. Pass any string ('worker' is a sensible
   * default).
   */
  async hydrateAppData(userId = 'worker'): Promise<void> {
    if (!this.appDataStore) return;
    if (this.appData.isHydrated()) return;
    let configs: AppDataConfig[];
    try {
      configs = await this.appDataStore.list(userId);
    } catch (err) {
      // Hydration failure is non-fatal — store stays un-hydrated and
      // first-attach mirrors send seeds (back-compat path). Log so
      // operators can see the issue in worker DevTools.
      // eslint-disable-next-line no-console
      console.error('[hub] AppData hydrate failed', err);
      return;
    }
    const rows: AppDataRow[] = configs.map(toAppDataRow);
    this.appData.hydrate(rows);
  }

  /** Drop every subscription owned by this port. Called on disconnect. */
  onPortClosed(port: PortLike): void {
    for (const [providerId, listeners] of this.dataListeners) {
      for (const [subId, l] of listeners) if (l.port === port) listeners.delete(subId);
      if (listeners.size === 0) this.dataListeners.delete(providerId);
    }
    for (const [providerId, listeners] of this.statsListeners) {
      for (const [subId, l] of listeners) if (l.port === port) listeners.delete(subId);
      if (listeners.size === 0) this.statsListeners.delete(providerId);
    }
    for (const [subId, entry] of this.appDataListeners) {
      if (entry.port === port) this.appDataListeners.delete(subId);
    }
    this.maybeStopStatsSampler();
  }

  /** Stop every provider + cancel sampler. For shutdown only. */
  async dispose(): Promise<void> {
    for (const [, slot] of this.providers) await slot.handle.stop();
    this.providers.clear();
    this.dataListeners.clear();
    this.statsListeners.clear();
    this.appDataListeners.clear();
    this.maybeStopStatsSampler();
  }

  // ─── Request handlers ──────────────────────────────────────────

  private handleAttach(port: PortLike, req: AttachRequest): void {
    let slot = this.providers.get(req.providerId);
    const wasRunning = Boolean(slot);

    if (!slot) {
      if (!req.cfg) {
        // Can't create without a config; surface as error to this sub.
        // eslint-disable-next-line no-console
        if (DEBUG) console.log(`[v2/hub] attach REJECTED subId=${req.subId} provider=${req.providerId}: not running and no cfg`);
        port.postMessage({
          subId: req.subId,
          kind: 'status',
          status: 'error',
          error: `Provider '${req.providerId}' not running and no cfg supplied to start it.`,
        });
        return;
      }
      // eslint-disable-next-line no-console
      if (DEBUG) console.log(`[v2/hub] attach CREATE subId=${req.subId} provider=${req.providerId}`);
      slot = this.createProvider(req.providerId, req.cfg);
      this.providers.set(req.providerId, slot);
    } else if (req.extra) {
      // Existing provider + restart payload: kick it.
      // eslint-disable-next-line no-console
      if (DEBUG) console.log(`[v2/hub] attach RESTART subId=${req.subId} provider=${req.providerId} extra=${JSON.stringify(req.extra)}`);
      void slot.handle.restart(req.extra);
    } else {
      // eslint-disable-next-line no-console
      if (DEBUG) console.log(`[v2/hub] attach LATE-JOINER subId=${req.subId} provider=${req.providerId} cacheSize=${slot.cache.size} status=${slot.status}`);
    }
    void wasRunning;

    if (req.mode === 'data') {
      this.attachDataListener(req.providerId, req.subId, port, slot);
    } else {
      this.attachStatsListener(req.providerId, req.subId, port);
    }
  }

  private handleDetach(req: DetachRequest): void {
    for (const [providerId, listeners] of this.dataListeners) {
      if (listeners.delete(req.subId)) {
        if (listeners.size === 0) this.dataListeners.delete(providerId);
        return;
      }
    }
    for (const [providerId, listeners] of this.statsListeners) {
      if (listeners.delete(req.subId)) {
        if (listeners.size === 0) this.statsListeners.delete(providerId);
        this.maybeStopStatsSampler();
        return;
      }
    }
  }

  private handleStop(req: StopRequest): void {
    const slot = this.providers.get(req.providerId);
    if (!slot) return;
    void slot.handle.stop();
    this.providers.delete(req.providerId);
    // Inform subscribers (data + stats) that the provider is gone.
    const dataListeners = this.dataListeners.get(req.providerId);
    if (dataListeners) {
      for (const l of dataListeners.values()) {
        l.port.postMessage({ subId: l.subId, kind: 'status', status: 'error', error: 'Provider stopped.' } satisfies Event);
      }
      this.dataListeners.delete(req.providerId);
    }
    this.statsListeners.delete(req.providerId);
    this.maybeStopStatsSampler();
  }

  // ─── AppData handlers (Step 2) ─────────────────────────────────

  private handleAppDataAttach(port: PortLike, req: AppDataAttachRequest): void {
    // First attacher seeds the store; subsequent attachers' seeds
    // are ignored (idempotent — see WorkerAppDataStore.hydrate).
    if (req.seed && !this.appData.isHydrated()) {
      this.appData.hydrate(req.seed);
    }
    this.appDataListeners.set(req.subId, { subId: req.subId, port });
    const event: AppDataEvent = {
      kind: 'appdata-snapshot',
      subId: req.subId,
      rows: this.appData.snapshot(),
    };
    try { port.postMessage(event); }
    catch { this.appDataListeners.delete(req.subId); }
  }

  private handleAppDataDetach(req: AppDataDetachRequest): void {
    this.appDataListeners.delete(req.subId);
  }

  private async handleAppDataSet(port: PortLike, req: AppDataSetRequest): Promise<void> {
    try {
      // Persist first, in-memory upsert second — if persistence fails,
      // the in-memory state isn't dirtied and the client gets a
      // surfaceable error. AppDataConfigStore.save assigns/preserves
      // configId; we re-read the persisted row so listeners see the
      // hub's final canonical shape (including any timestamp / ownerUserId
      // adjustments).
      const persisted = this.appDataStore
        ? await this.appDataStore.save(toAppDataConfig(req.row), req.row.userId)
        : null;
      const finalRow = persisted ? toAppDataRow(persisted) : req.row;
      this.appData.upsert(finalRow);
      this.ackAppData(port, req.reqId, true);
    } catch (err) {
      this.ackAppData(port, req.reqId, false, err);
    }
  }

  private async handleAppDataUpsert(port: PortLike, req: AppDataUpsertRequest): Promise<void> {
    // upsert is currently identical to set on the wire — both deliver
    // a full row. Kept as a separate kind so future API additions
    // (e.g. partial-merge upsert) don't have to overload `set`.
    try {
      const persisted = this.appDataStore
        ? await this.appDataStore.save(toAppDataConfig(req.row), req.row.userId)
        : null;
      const finalRow = persisted ? toAppDataRow(persisted) : req.row;
      this.appData.upsert(finalRow);
      this.ackAppData(port, req.reqId, true);
    } catch (err) {
      this.ackAppData(port, req.reqId, false, err);
    }
  }

  private async handleAppDataRemove(port: PortLike, req: AppDataRemoveRequest): Promise<void> {
    try {
      if (this.appDataStore) await this.appDataStore.remove(req.configId);
      this.appData.remove(req.configId);
      this.ackAppData(port, req.reqId, true);
    } catch (err) {
      this.ackAppData(port, req.reqId, false, err);
    }
  }

  private ackAppData(port: PortLike, reqId: string, ok: boolean, err?: unknown): void {
    const event: AppDataEvent = ok
      ? { kind: 'appdata-ack', reqId, ok: true }
      : { kind: 'appdata-ack', reqId, ok: false, error: err instanceof Error ? err.message : String(err) };
    try { port.postMessage(event); } catch { /* port dead */ }
  }

  // ─── Provider lifecycle ────────────────────────────────────────

  private createProvider(providerId: string, cfg: ProviderConfig): ProviderSlot {
    const cache = new Map<string, unknown>();
    const slot: ProviderSlot = {
      handle: undefined as unknown as ProviderHandle, // set immediately below
      cfg,
      cache,
      status: 'loading',
      byteCount: 0,
      msgCount: 0,
      msgsByBucket: [0, 0, 0, 0, 0],
      bucketIdx: 0,
      startedAt: Date.now(),
      lastMessageAt: null,
      errorCount: 0,
    };

    const emit: ProviderEmit = (event: ProviderEmitEvent) => {
      this.applyEmit(providerId, slot, event);
    };

    slot.handle = startProvider(cfg, emit);
    return slot;
  }

  private applyEmit(providerId: string, slot: ProviderSlot, event: ProviderEmitEvent): void {
    if ('rows' in event) {
      const keyColumn = (slot.cfg as { keyColumn?: string | readonly string[] }).keyColumn;
      if (event.replace) slot.cache.clear();
      // Build a per-batch dedup map IN PARALLEL with the cache update.
      // Both consume `event.rows` in order, so the last-write-wins
      // semantics line up: the cache and the broadcast batch see the
      // same final value per key.
      const batch = new Map<string, unknown>();
      for (const row of event.rows) {
        const k = keyOf(row, keyColumn);
        if (k === null) continue;
        slot.cache.set(k, row);
        batch.set(k, row);
      }
      slot.msgCount += 1;
      slot.msgsByBucket[slot.bucketIdx] += 1;
      slot.lastMessageAt = Date.now();

      // Broadcast contract: rows are ALWAYS unique by `keyColumn`.
      //
      // - `replace: true`  → broadcast the full cache. Provider
      //   snapshot buffers (notably the STOMP provider's
      //   snapshot-phase accumulator) can carry the same row twice
      //   when the upstream feed delivers an updated version of an
      //   already-buffered row before its end-token arrives. AG-Grid
      //   emits warning #2 ("Duplicate node id") on `setRowData` if
      //   any two rows resolve to the same `getRowId(...)`. Going
      //   through `cache.values()` collapses duplicates by
      //   `keyColumn` (last-write-wins).
      //
      // - `replace: false` → broadcast the per-batch dedup map. A
      //   single live message can carry multiple updates for the same
      //   row id (e.g. an upstream batched feed coalescing two ticks
      //   for the same position into one frame). Without dedup the
      //   consumer's `applyTransactionAsync({add: [...], update:
      //   [...]})` ends up with duplicate ids in one of those arrays
      //   — same warning #2.
      //
      // Rows lacking the keyColumn are dropped from the broadcast
      // entirely; the cache also skips them, and they couldn't be
      // routed by the consumer's `getRowId` either.
      const broadcastRows = event.replace ? [...slot.cache.values()] : [...batch.values()];
      this.broadcastData(providerId, {
        kind: 'delta',
        rows: broadcastRows,
        replace: event.replace,
        subId: '', // replaced per listener below
      });
      return;
    }

    if ('status' in event) {
      slot.status = event.status;
      if (event.status === 'error') {
        slot.errorCount += 1;
        slot.lastError = event.error;
      }
      this.broadcastData(providerId, {
        kind: 'status',
        status: event.status,
        error: event.error,
        subId: '',
      });
      return;
    }

    if ('byteSize' in event) {
      slot.byteCount += event.byteSize;
      // Byte-only events also count as messages received from upstream
      // (they're typically end-of-snapshot tokens or heartbeats).
      slot.msgCount += 1;
      slot.msgsByBucket[slot.bucketIdx] += 1;
      slot.lastMessageAt = Date.now();
    }
  }

  // ─── Listener attach + fan-out ─────────────────────────────────

  private attachDataListener(providerId: string, subId: string, port: PortLike, slot: ProviderSlot): void {
    const set = this.dataListeners.get(providerId) ?? new Map<string, DataListener>();
    set.set(subId, { subId, port });
    this.dataListeners.set(providerId, set);

    // Guaranteed first emit: full cache + current status.
    //
    // Chunk the cache replay so a single late-join postMessage doesn't
    // ship thousands of rows at once. The first chunk carries
    // `replace: true` (so the consumer treats it as the snapshot);
    // subsequent chunks ride as `replace: false` deltas which the
    // client buffers until onUpdate is wired and then flushes as
    // live updates. For empty caches we still send one replace=true
    // frame so the snapshot promise has something to settle on.
    const cacheRows = [...slot.cache.values()];
    // eslint-disable-next-line no-console
    if (DEBUG) console.log(
      `[v2/hub] → subId=${subId}: replay rows=${cacheRows.length} in ${
        Math.max(1, Math.ceil(cacheRows.length / LATE_JOIN_CHUNK_SIZE))
      } chunk(s), status=${slot.status} (totalListeners=${set.size})`,
    );
    if (cacheRows.length === 0) {
      port.postMessage({ subId, kind: 'delta', rows: [], replace: true } satisfies Event);
    } else {
      for (let offset = 0; offset < cacheRows.length; offset += LATE_JOIN_CHUNK_SIZE) {
        const chunk = cacheRows.slice(offset, offset + LATE_JOIN_CHUNK_SIZE);
        port.postMessage({
          subId,
          kind: 'delta',
          rows: chunk,
          replace: offset === 0,
        } satisfies Event);
      }
    }
    port.postMessage({
      subId,
      kind: 'status',
      status: slot.status,
      error: slot.lastError,
    } satisfies Event);
  }

  private attachStatsListener(providerId: string, subId: string, port: PortLike): void {
    const set = this.statsListeners.get(providerId) ?? new Map<string, StatsListener>();
    set.set(subId, { subId, port });
    this.statsListeners.set(providerId, set);

    // Send one stats snapshot immediately so the consumer doesn't
    // have to wait for the first sampler tick.
    const slot = this.providers.get(providerId);
    if (slot) {
      port.postMessage({
        subId,
        kind: 'stats',
        stats: this.snapshotStats(providerId, slot),
      } satisfies Event);
    }

    this.ensureStatsSampler();
  }

  private broadcastData(providerId: string, eventTemplate: Event): void {
    const listeners = this.dataListeners.get(providerId);
    if (!listeners) return;
    if (DEBUG) {
      // eslint-disable-next-line no-console
      if (eventTemplate.kind === 'delta') {
        const tpl = eventTemplate as Event & { kind: 'delta'; rows: readonly unknown[]; replace?: boolean };
        console.log(`[v2/hub] broadcast provider=${providerId} kind=delta replace=${Boolean(tpl.replace)} rows=${tpl.rows.length} → ${listeners.size} listener(s)`);
      } else if (eventTemplate.kind === 'status') {
        const tpl = eventTemplate as Event & { kind: 'status'; status: string; error?: string };
        console.log(`[v2/hub] broadcast provider=${providerId} kind=status status=${tpl.status}${tpl.error ? ' error=' + JSON.stringify(tpl.error) : ''} → ${listeners.size} listener(s)`);
      }
    }
    for (const l of listeners.values()) {
      l.port.postMessage({ ...eventTemplate, subId: l.subId } as Event);
    }
  }

  // ─── Stats sampler ─────────────────────────────────────────────

  private ensureStatsSampler(): void {
    if (this.statsTimer !== null) return;
    this.statsTimer = this.setTimer(() => this.tickStats(), this.statsIntervalMs);
  }

  private maybeStopStatsSampler(): void {
    if (this.statsListeners.size === 0 && this.statsTimer !== null) {
      this.clearTimer(this.statsTimer);
      this.statsTimer = null;
    }
  }

  private tickStats(): void {
    // Rotate sliding-window buckets first: the slot we're about to
    // overwrite holds the oldest second of activity.
    for (const slot of this.providers.values()) {
      slot.bucketIdx = (slot.bucketIdx + 1) % slot.msgsByBucket.length;
      slot.msgsByBucket[slot.bucketIdx] = 0;
    }

    for (const [providerId, listeners] of this.statsListeners) {
      const slot = this.providers.get(providerId);
      if (!slot) continue;
      const stats = this.snapshotStats(providerId, slot);
      for (const l of listeners.values()) {
        l.port.postMessage({ subId: l.subId, kind: 'stats', stats } satisfies Event);
      }
    }
  }

  private snapshotStats(providerId: string, slot: ProviderSlot): ProviderStats {
    const subscriberCount = this.dataListeners.get(providerId)?.size ?? 0;
    const sumBuckets = slot.msgsByBucket.reduce((a, b) => a + b, 0);
    const msgPerSec = sumBuckets / slot.msgsByBucket.length;
    return {
      rowCount: slot.cache.size,
      byteCount: slot.byteCount,
      msgCount: slot.msgCount,
      msgPerSec,
      subscriberCount,
      startedAt: slot.startedAt,
      lastMessageAt: slot.lastMessageAt,
      errorCount: slot.errorCount,
      lastError: slot.lastError,
    };
  }
}

// ─── AppData row ↔ config bridges ──────────────────────────────────
// Wire-shape `AppDataRow` and persistence-shape `AppDataConfig` carry
// the same data; the hub speaks both since it sits between the wire
// (rows in/out via postMessage) and IndexedDB (configs in/out via
// AppDataConfigStore).

function toAppDataConfig(r: AppDataRow): AppDataConfig {
  return {
    configId: r.configId,
    name: r.name,
    description: r.description,
    isPublic: r.isPublic,
    values: r.values,
    userId: r.userId,
  };
}

function toAppDataRow(c: AppDataConfig): AppDataRow {
  return {
    configId: c.configId,
    name: c.name,
    description: c.description,
    isPublic: c.isPublic,
    values: c.values,
    userId: c.userId,
  };
}
