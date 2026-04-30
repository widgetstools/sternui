/**
 * Hub — single-process state machine that fans incoming requests to
 * provider factories and outgoing events to subscriber ports.
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

import { composeRowId, type ProviderConfig } from '@marketsui/shared-types';
import type {
  AttachRequest,
  DetachRequest,
  Event,
  ProviderStats,
  ProviderStatus,
  Request,
  StopRequest,
} from '../protocol.js';
import { startProvider } from '../providers/registry.js';
import type { ProviderEmit, ProviderEmitEvent, ProviderHandle } from '../providers/Provider.js';

/**
 * Gate for hot-path diagnostic logs. Flip to `true` locally when debugging
 * provider lifecycle or fan-out — at high message rates (e.g., 1000 msg/s)
 * the per-broadcast `console.log` measurably hurts CPU even with DevTools
 * closed, because the browser still formats the template strings.
 */
const DEBUG = false;

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

export interface HubOpts {
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

export class Hub {
  private readonly providers = new Map<string, ProviderSlot>();
  private readonly dataListeners = new Map<string, Map<string, DataListener>>();
  private readonly statsListeners = new Map<string, Map<string, StatsListener>>();

  private readonly statsIntervalMs: number;
  private readonly setTimer: (cb: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private statsTimer: unknown = null;

  constructor(opts: HubOpts = {}) {
    this.statsIntervalMs = opts.statsIntervalMs ?? 1000;
    this.setTimer = opts.setTimer ?? ((cb, ms) => setInterval(cb, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
  }

  // ─── Public surface ────────────────────────────────────────────

  handleRequest(port: PortLike, req: Request): void {
    switch (req.kind) {
      case 'attach':  this.handleAttach(port, req); return;
      case 'detach':  this.handleDetach(req); return;
      case 'stop':    this.handleStop(req); return;
    }
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
    this.maybeStopStatsSampler();
  }

  /** Stop every provider + cancel sampler. For shutdown only. */
  async dispose(): Promise<void> {
    for (const [, slot] of this.providers) await slot.handle.stop();
    this.providers.clear();
    this.dataListeners.clear();
    this.statsListeners.clear();
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
    const cacheRows = [...slot.cache.values()];
    // eslint-disable-next-line no-console
    if (DEBUG) console.log(`[v2/hub] → subId=${subId}: replay delta(replace=true) rows=${cacheRows.length}, status=${slot.status} (totalListeners=${set.size})`);
    port.postMessage({
      subId,
      kind: 'delta',
      rows: cacheRows,
      replace: true,
    } satisfies Event);
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
