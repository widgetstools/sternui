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

import { composeRowId, type ProviderConfig } from '@starui/types';
import type {
  AttachRequest,
  DetachRequest,
  Event,
  ProviderStats,
  ProviderStatus,
  Request,
  RowPatch,
  StopRequest,
  WireEncoding,
  AppDataRequest,
  AppDataAttachRequest,
  AppDataDetachRequest,
  AppDataSetRequest,
  AppDataUpsertRequest,
  AppDataRemoveRequest,
  AppDataEvent,
  AppDataRow,
  CatalogEvent,
  ConfigInvalidateRequest,
  ConfigSnapshotEvent,
  ConfigBrowserCountsRequest,
  ConfigBrowserListRequest,
  ConfigBrowserGetRequest,
  ConfigBrowserSaveRequest,
  ConfigBrowserDeleteRequest,
  ConfigBrowserExportRequest,
  ConfigBrowserMetaRequest,
  DeleteProviderConfigRequest,
  GetConfigRequest,
  HubReadyRequest,
  ListConfigsRequest,
  RefreshProviderRequest,
  SaveProviderConfigRequest,
  HubIntrospectRequest,
  HubIntrospectSnapshot,
  HubProviderIntrospectRow,
} from '../protocol.js';
import { startProvider } from '../providers/registry.js';
import { tryEncodeColumnar } from '../wire/columnarCodec.js';
import { diffTopLevel } from '../wire/rowDiff.js';
import type { ProviderEmit, ProviderEmitEvent, ProviderHandle } from '../providers/Provider.js';
import { WorkerAppDataStore } from './WorkerAppDataStore.js';
import type { ConfigManager } from '@starui/host-config';
import { AppDataConfigStore, type AppDataConfig } from '../providers/appdata/store.js';
import { ConfigCatalogCache } from '../../hub/ConfigCatalogCache.js';
import {
  configBrowserCounts,
  configBrowserDelete,
  configBrowserExportBundle,
  configBrowserExportDeployTables,
  configBrowserGet,
  configBrowserList,
  configBrowserSave,
} from '../../hub/configBrowserHubOps.js';
import { isCatalogConfigRow } from '../../hub/isCatalogConfigRow.js';
import type { StompProviderConfig } from '@starui/types';
import {
  traceStompProviderCfg,
  traceWorkerAppDataSnapshot,
} from '../template/templateTrace.js';

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

/**
 * Post-ready live delta batches at or above this row count broadcast
 * as pre-encoded `delta-bin` instead of plain object deltas. A plain
 * delta costs one object-graph structured clone PER LISTENER per
 * frame; a high-rate sweep feed (e.g. stomp-view-server's full-set
 * coverage stream) ships thousands of distinct-key rows per frame
 * that conflation cannot shrink, and with several windows on one
 * provider the per-listener clones saturated the worker thread —
 * stalling late-joiner snapshot replays behind the backlog. Encoding
 * once and byte-copying per port makes fan-out cost ~flat in listener
 * count. Small conflated ticks stay as plain deltas (the encode
 * round-trip doesn't repay itself below this size).
 */
const LIVE_BIN_MIN_ROWS = 64;

/** Reset every diagnostics counter when a provider (re)starts. */
function resetProviderStats(slot: ProviderSlot, now = Date.now()): void {
  slot.byteCount = 0;
  slot.msgCount = 0;
  slot.msgsByBucket.fill(0);
  slot.bucketIdx = 0;
  slot.startedAt = now;
  slot.lastMessageAt = null;
  slot.errorCount = 0;
  slot.lastError = undefined;
  slot.snapshotFetchStartedAt = now;
  slot.snapshotFetchMs = null;
  slot.snapshotReady = false;
  slot.publishCount = 0;
  slot.pubsByBucket.fill(0);
  slot.pubsByMinBucket.fill(0);
  slot.minBucketIdx = 0;
  slot.publishWindowSeconds = 0;
  slot.keyDropCount = 0;
  slot.keyDropWarned = false;
}

/**
 * Minimal port surface the hub posts to.
 *
 * CONTRACT: `postMessage` must consume (serialize/copy) the message
 * synchronously before returning — real `MessagePort`s structured-clone
 * during the call, per spec. AppData fan-out still reuses one event
 * object (mutating `subId` between posts). Data-provider fan-out posts
 * a shallow copy per listener because OpenFin multi-window can defer
 * clone — reusing one envelope there mis-delivers or drops ticks.
 */
export interface PortLike {
  postMessage(message: unknown): void;
}

/** Shared encoder for pre-serialized snapshot replay chunks. */
const SNAPSHOT_ENCODER = new TextEncoder();

/**
 * One pre-encoded broadcast/replay chunk plus the codec it used.
 * `enc` is per-chunk (not per-slot) because the columnar encoder can
 * decline a frame (non-object rows) and fall back to JSON, so chunks
 * of mixed encodings may coexist within one replay snapshot.
 */
interface EncodedChunk {
  buf: Uint8Array;
  enc: WireEncoding;
}

/**
 * Encode one rows chunk for the wire. Columnar when the provider opts
 * in AND the frame qualifies (plain-object rows); UTF-8 JSON otherwise.
 */
function encodeChunk(rows: readonly unknown[], wantColumnar: boolean): EncodedChunk {
  if (wantColumnar) {
    const col = tryEncodeColumnar(rows);
    if (col) return { buf: col, enc: 'col' };
  }
  return { buf: SNAPSHOT_ENCODER.encode(JSON.stringify(rows)), enc: 'json' };
}

/** Sliding-window length for upstream + publish /s averages. */
const SEC_WINDOW = 5;
/** Sliding-window length for publish /min rolling total. */
const MIN_WINDOW = 60;

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
  /** Epoch ms — start of the current snapshot fetch (reset on restart). */
  snapshotFetchStartedAt: number;
  /** Duration of the last completed snapshot fetch, or null while in flight. */
  snapshotFetchMs: number | null;
  /** True once the provider has emitted `ready` for the current cycle. */
  snapshotReady: boolean;
  /** Fan-out delta posts to data subscribers after snapshot ready. */
  publishCount: number;
  pubsByBucket: number[];
  pubsByMinBucket: number[];
  minBucketIdx: number;
  /** Seconds elapsed since snapshot ready (capped at MIN_WINDOW). */
  publishWindowSeconds: number;
  /**
   * Count of rows dropped this cycle because `composeRowId(row, keyColumn)`
   * returned null — i.e. the configured `keyColumn` doesn't resolve a value
   * on the incoming rows (usually a name/case mismatch like `POSITIONID` vs
   * `positionId`). Dropped rows never reach the cache or any subscriber, so
   * the grid silently empties; this counter + the one-time warning surface
   * the misconfig instead. Reset on every (re)start via {@link resetProviderStats}.
   */
  keyDropCount: number;
  /** One-shot guard so the key-mismatch warning logs once per cycle, not per batch. */
  keyDropWarned: boolean;
  /**
   * Last `extra` overlay passed to `handle.restart` for this slot (e.g.
   * historical `asOfDate`). Used to late-join concurrent windows that
   * attach with the same overlay instead of reconnecting upstream again.
   */
  activeRestartExtra?: Record<string, unknown> | null;
  /**
   * Lazily-built, pre-encoded snapshot replay chunks (JSON or columnar
   * per `wireFormat`, ≤ LATE_JOIN_CHUNK_SIZE rows each). Built on the
   * first late-join attach after a cache change and shared by every
   * subsequent replay until the next cache mutation nulls it — so N
   * windows attaching in a burst trigger ONE serialization instead of
   * N object-graph clones. Updates never build this eagerly; they only
   * invalidate (O(1)).
   */
  replaySnapshot: EncodedChunk[] | null;
  /**
   * `cfg.thinDeltas` — post-ready live frames broadcast as field-level
   * `delta-patch` events (changed top-level fields only) instead of
   * full rows. Requires `keyColumn`; precomputed at slot creation.
   */
  thinDeltas: boolean;
  /**
   * `cfg.wireFormat === 'columnar'` — binary frames use the typed-array
   * columnar codec instead of UTF-8 JSON. Precomputed at slot creation.
   */
  columnar: boolean;
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

/** Fan-out scratch shape — `subId` is rewritten per listener. */
type AppDataDeltaEventMutable = Extract<AppDataEvent, { kind: 'appdata-delta' }> & {
  subId: string;
};

export interface SharedWorkerDataServicesHubOpts {
  /**
   * ConfigManager backing AppData persistence. The hub becomes the
   * sole IndexedDB writer for AppData rows — main-thread mirrors no
   * longer touch ConfigManager. Optional only for back-compat with
   * tests that don't exercise the AppData path; production callers
   * (the SharedWorker entry script) MUST pass one.
   */
  configManager?: ConfigManager;

  /**
   * Preloaded data-provider catalog. When omitted but `configManager`
   * is set, the hub constructs one automatically.
   */
  configCatalog?: ConfigCatalogCache;

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

/**
 * Click-to-hub latency annotation for restart-attach trace logs.
 * `extra.__refresh` carries Date.now() at the user's Restart click,
 * so the delta is the port + main-thread latency before the hub
 * even started the restart.
 */
function restartClickLatency(extra: Record<string, unknown>): string {
  const clickAt = typeof extra.__refresh === 'number' ? extra.__refresh : null;
  return clickAt === null ? '' : `sinceClick=+${Date.now() - clickAt}ms`;
}

/** Stable compare for restart overlay payloads (e.g. `{ asOfDate }`). */
function restartExtrasEqual(
  active: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): boolean {
  if (!active) return false;
  return JSON.stringify(active) === JSON.stringify(incoming);
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
  private readonly configCatalog: ConfigCatalogCache | null;
  private readonly configManager: ConfigManager | null;
  private readonly connectedPorts = new Set<PortLike>();

  private readonly statsIntervalMs: number;
  private readonly setTimer: (cb: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private statsTimer: unknown = null;

  constructor(opts: SharedWorkerDataServicesHubOpts = {}) {
    this.statsIntervalMs = opts.statsIntervalMs ?? 1000;
    this.setTimer = opts.setTimer ?? ((cb, ms) => setInterval(cb, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
    this.appDataStore = opts.configManager ? new AppDataConfigStore(opts.configManager) : null;
    this.configManager = opts.configManager ?? null;
    if (opts.configCatalog) {
      this.configCatalog = opts.configCatalog;
    } else if (opts.configManager) {
      this.configCatalog = new ConfigCatalogCache(opts.configManager);
    } else {
      this.configCatalog = null;
    }

    // Wire the AppData store to fan deltas to every attached listener.
    // Set up here once; re-attaching listeners doesn't re-subscribe.
    // One reusable event object per delta — postMessage serializes
    // synchronously (PortLike contract), so mutating subId between
    // posts is safe and avoids a per-listener allocation.
    this.appData.subscribe((op, row) => {
      const event: AppDataDeltaEventMutable = {
        kind: 'appdata-delta',
        subId: '',
        op,
        row,
      };
      for (const [, entry] of this.appDataListeners) {
        event.subId = entry.subId;
        try { entry.port.postMessage(event); }
        catch { /* port dead; cleanup happens via onPortClosed */ }
      }
    });
  }

  // ─── Public surface ────────────────────────────────────────────

  handleRequest(port: PortLike, req: Request): void {
    this.trackPort(port);
    switch (req.kind) {
      case 'attach':  this.handleAttach(port, req); return;
      case 'detach':  this.handleDetach(req); return;
      case 'stop':    this.handleStop(req); return;
      case 'hub-ready': this.handleHubReady(port, req); return;
      case 'get-config': this.handleGetConfig(port, req); return;
      case 'list-configs': this.handleListConfigs(port, req); return;
      case 'config-invalidate': void this.handleConfigInvalidate(port, req); return;
      case 'save-provider-config': void this.handleSaveProviderConfig(port, req); return;
      case 'delete-provider-config': void this.handleDeleteProviderConfig(port, req); return;
      case 'config-browser-counts': void this.handleConfigBrowserCounts(port, req); return;
      case 'config-browser-list': void this.handleConfigBrowserList(port, req); return;
      case 'config-browser-get': void this.handleConfigBrowserGet(port, req); return;
      case 'config-browser-save': void this.handleConfigBrowserSave(port, req); return;
      case 'config-browser-delete': void this.handleConfigBrowserDelete(port, req); return;
      case 'config-browser-export': void this.handleConfigBrowserExport(port, req); return;
      case 'config-browser-meta': this.handleConfigBrowserMeta(port, req); return;
      case 'refresh-provider': this.handleRefreshProvider(req); return;
      case 'hub-introspect': this.handleHubIntrospect(port, req); return;
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
    this.trackPort(port);
    switch (req.kind) {
      case 'appdata-attach':  void this.handleAppDataAttach(port, req); return;
      case 'appdata-detach':  this.handleAppDataDetach(req); return;
      case 'appdata-set':     void this.handleAppDataSet(port, req); return;
      case 'appdata-upsert':  void this.handleAppDataUpsert(port, req); return;
      case 'appdata-remove':  void this.handleAppDataRemove(port, req); return;
    }
  }

  /**
   * Preload data-provider catalog rows from ConfigManager into the
   * in-memory cache. Production installs call this after
   * `configManager.init()` and before port attach traffic.
   *
   * Idempotent. No-op when no ConfigCatalogCache was constructed.
   */
  async hydrateCatalog(): Promise<void> {
    if (!this.configCatalog) return;
    if (this.configCatalog.isReady()) return;
    try {
      await this.configCatalog.loadAll();
      this.broadcastCatalogEvent({ kind: 'catalog-ready', full: true });
    } catch (err) {
      // Hydration failure is non-fatal — attach with inline cfg still
      // works; cfg-free attach will miss until a retry succeeds.
      // eslint-disable-next-line no-console
      console.error('[hub] Config catalog hydrate failed', err);
    }
  }

  /** Worker-side catalog cache, or null when no ConfigManager was supplied. */
  getConfigCatalog(): ConfigCatalogCache | null {
    return this.configCatalog;
  }

  /** Live hub diagnostics for operator / dev tooling. */
  buildIntrospectSnapshot(): HubIntrospectSnapshot {
    const runningIds = new Set(this.providers.keys());
    const providers: HubProviderIntrospectRow[] = [];
    const nameById = new Map<string, string>();
    if (this.configCatalog) {
      for (const row of this.configCatalog.list({ includeAppData: false })) {
        if (row.providerId && row.name) {
          nameById.set(row.providerId, row.name);
        }
      }
    }

    for (const [providerId, slot] of this.providers) {
      const stats = this.snapshotStats(providerId, slot);
      providers.push({
        providerId,
        name: nameById.get(providerId),
        providerType: slot.cfg.providerType,
        running: true,
        status: slot.status,
        subscriberCount: stats.subscriberCount,
        statsListenerCount: this.statsListeners.get(providerId)?.size ?? 0,
        rowCount: stats.rowCount,
        msgPerSec: stats.msgPerSec,
        publishPerSec: stats.publishPerSec,
        publishCount: stats.publishCount,
        lastMessageAt: stats.lastMessageAt,
        startedAt: stats.startedAt,
        errorCount: stats.errorCount,
        lastError: slot.lastError,
        keyDropCount: slot.keyDropCount,
        cfg: slot.cfg,
      });
    }

    if (this.configCatalog) {
      for (const row of this.configCatalog.list({ includeAppData: false })) {
        if (!row.providerId || runningIds.has(row.providerId)) continue;
        if (row.providerType === 'appdata') continue;
        providers.push({
          providerId: row.providerId,
          name: row.name,
          providerType: row.providerType,
          running: false,
          cfg: this.configCatalog.getProviderConfig(row.providerId) ?? row.config ?? undefined,
        });
      }
    }

    providers.sort((a, b) => a.providerId.localeCompare(b.providerId));

    const appDataRows = this.appData.snapshot();
    return {
      connectedPorts: this.connectedPorts.size,
      catalogReady: this.configCatalog?.isReady() ?? false,
      catalogProviderCount: this.configCatalog?.list({ includeAppData: true }).length ?? 0,
      runningProviderCount: this.providers.size,
      providers,
      appData: {
        listenerCount: this.appDataListeners.size,
        rows: appDataRows.map((r) => ({
          configId: r.configId,
          name: r.name,
          keyCount: Object.keys(r.values).length,
          values: r.values,
        })),
      },
    };
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

  /**
   * Re-read every AppData row from IndexedDB and reconcile the in-memory
   * worker store. Called after editor saves (catalog invalidate) and on
   * mirror re-attach when the SharedWorker survives a page reload.
   */
  async resyncAppDataFromStore(userId = 'worker'): Promise<void> {
    if (!this.appDataStore) return;
    let configs: AppDataConfig[];
    try {
      configs = await this.appDataStore.list(userId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[hub] AppData resync failed', err);
      return;
    }
    const rows = configs.map(toAppDataRow);
    const nextIds = new Set(rows.map((row) => row.configId));
    for (const existing of this.appData.snapshot()) {
      if (!nextIds.has(existing.configId)) {
        this.appData.remove(existing.configId);
      }
    }
    for (const row of rows) {
      this.appData.upsert(row);
    }
  }

  /** Drop every subscription owned by this port. Called on disconnect. */
  onPortClosed(port: PortLike): void {
    this.connectedPorts.delete(port);
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
    this.connectedPorts.clear();
    this.maybeStopStatsSampler();
  }

  // ─── Request handlers ──────────────────────────────────────────

  private trackPort(port: PortLike): void {
    this.connectedPorts.add(port);
  }

  private broadcastCatalogEvent(event: CatalogEvent): void {
    for (const port of this.connectedPorts) {
      try { port.postMessage(event); }
      catch { this.connectedPorts.delete(port); }
    }
  }

  private replyConfigSnapshot(port: PortLike, snapshot: ConfigSnapshotEvent): void {
    port.postMessage(snapshot);
  }

  private handleHubReady(port: PortLike, req: HubReadyRequest): void {
    this.replyConfigSnapshot(port, {
      kind: 'config-snapshot',
      reqId: req.reqId,
      ok: true,
      ready: this.configCatalog?.isReady() ?? false,
    });
  }

  private handleHubIntrospect(port: PortLike, req: HubIntrospectRequest): void {
    this.replyConfigSnapshot(port, {
      kind: 'config-snapshot',
      reqId: req.reqId,
      ok: true,
      introspect: this.buildIntrospectSnapshot(),
    });
  }

  private handleGetConfig(port: PortLike, req: GetConfigRequest): void {
    if (!this.configCatalog) {
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: false,
        error: 'Config catalog not available in this hub instance',
      });
      return;
    }
    this.replyConfigSnapshot(port, {
      kind: 'config-snapshot',
      reqId: req.reqId,
      ok: true,
      config: this.configCatalog.get(req.providerId),
    });
  }

  private handleListConfigs(port: PortLike, req: ListConfigsRequest): void {
    if (!this.configCatalog) {
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: false,
        error: 'Config catalog not available in this hub instance',
      });
      return;
    }
    this.replyConfigSnapshot(port, {
      kind: 'config-snapshot',
      reqId: req.reqId,
      ok: true,
      configs: this.configCatalog.list({
        subtype: req.subtype,
        includeAppData: req.includeAppData,
      }),
    });
  }

  private async handleConfigInvalidate(port: PortLike, req: ConfigInvalidateRequest): Promise<void> {
    if (!this.configCatalog) {
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: false,
        error: 'Config catalog not available in this hub instance',
      });
      return;
    }
    try {
      if (req.provider) {
        this.configCatalog.upsert(req.provider);
      } else {
        await this.configCatalog.invalidate(req.providerId);
      }
      // Only resync AppData when an external writer may have touched
      // appdata rows (config-browser / legacy main-thread Dexie).
      if (!req.provider && req.providerId) {
        const row = this.configCatalog.get(req.providerId);
        if (row?.providerType === 'appdata') {
          await this.resyncAppDataFromStore();
        }
      } else if (!req.provider && !req.providerId) {
        await this.resyncAppDataFromStore();
      }
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: true,
      });
      this.broadcastCatalogEvent(
        req.providerId
          ? { kind: 'catalog-ready', providerId: req.providerId }
          : { kind: 'catalog-ready', full: true },
      );
    } catch (err) {
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleSaveProviderConfig(
    port: PortLike,
    req: SaveProviderConfigRequest,
  ): Promise<void> {
    if (!this.configCatalog) {
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: false,
        error: 'Config catalog not available in this hub instance',
      });
      return;
    }
    try {
      const saved = await this.configCatalog.saveProvider(req.provider, req.callerUserId);
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: true,
        saved,
        config: saved,
      });
      this.broadcastCatalogEvent({
        kind: 'catalog-ready',
        providerId: saved.providerId,
      });
    } catch (err) {
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleDeleteProviderConfig(
    port: PortLike,
    req: DeleteProviderConfigRequest,
  ): Promise<void> {
    if (!this.configCatalog) {
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: false,
        error: 'Config catalog not available in this hub instance',
      });
      return;
    }
    try {
      await this.configCatalog.removeProvider(req.providerId);
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: true,
      });
      this.broadcastCatalogEvent({
        kind: 'catalog-ready',
        providerId: req.providerId,
      });
    } catch (err) {
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private configBrowserUnavailable(port: PortLike, reqId: string): void {
    this.replyConfigSnapshot(port, {
      kind: 'config-snapshot',
      reqId,
      ok: false,
      error: 'ConfigManager not available in this hub instance',
    });
  }

  private async handleConfigBrowserCounts(
    port: PortLike,
    req: ConfigBrowserCountsRequest,
  ): Promise<void> {
    if (!this.configManager) {
      this.configBrowserUnavailable(port, req.reqId);
      return;
    }
    try {
      const counts = await configBrowserCounts(this.configManager, req.appId ?? '');
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: true,
        counts,
      });
    } catch (err) {
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleConfigBrowserList(
    port: PortLike,
    req: ConfigBrowserListRequest,
  ): Promise<void> {
    if (!this.configManager) {
      this.configBrowserUnavailable(port, req.reqId);
      return;
    }
    try {
      const tableRows = await configBrowserList(this.configManager, req.table, req.appId ?? '');
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: true,
        tableRows,
      });
    } catch (err) {
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleConfigBrowserGet(
    port: PortLike,
    req: ConfigBrowserGetRequest,
  ): Promise<void> {
    if (!this.configManager) {
      this.configBrowserUnavailable(port, req.reqId);
      return;
    }
    try {
      const tableRow = await configBrowserGet(this.configManager, req.table, req.primaryKey);
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: true,
        tableRow,
      });
    } catch (err) {
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleConfigBrowserSave(
    port: PortLike,
    req: ConfigBrowserSaveRequest,
  ): Promise<void> {
    if (!this.configManager) {
      this.configBrowserUnavailable(port, req.reqId);
      return;
    }
    try {
      await configBrowserSave(this.configManager, this.configCatalog, req.table, req.row);
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: true,
      });
      if (req.table === 'appConfig' && isCatalogConfigRow(req.row as never)) {
        const configId = String((req.row as { configId?: string }).configId ?? '');
        if (configId) {
          this.broadcastCatalogEvent({ kind: 'catalog-ready', providerId: configId });
        }
      }
    } catch (err) {
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleConfigBrowserDelete(
    port: PortLike,
    req: ConfigBrowserDeleteRequest,
  ): Promise<void> {
    if (!this.configManager) {
      this.configBrowserUnavailable(port, req.reqId);
      return;
    }
    try {
      await configBrowserDelete(
        this.configManager,
        this.configCatalog,
        req.table,
        req.primaryKey,
      );
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: true,
      });
      if (req.table === 'appConfig') {
        this.broadcastCatalogEvent({
          kind: 'catalog-ready',
          providerId: String(req.primaryKey),
        });
      }
    } catch (err) {
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleConfigBrowserExport(
    port: PortLike,
    req: ConfigBrowserExportRequest,
  ): Promise<void> {
    if (!this.configManager) {
      this.configBrowserUnavailable(port, req.reqId);
      return;
    }
    try {
      const bundle = req.deploy
        ? await configBrowserExportDeployTables(this.configManager)
        : await configBrowserExportBundle(this.configManager, req.appId ?? '');
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: true,
        exportBundle: bundle,
      });
    } catch (err) {
      this.replyConfigSnapshot(port, {
        kind: 'config-snapshot',
        reqId: req.reqId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private handleConfigBrowserMeta(port: PortLike, req: ConfigBrowserMetaRequest): void {
    if (!this.configManager) {
      this.configBrowserUnavailable(port, req.reqId);
      return;
    }
    this.replyConfigSnapshot(port, {
      kind: 'config-snapshot',
      reqId: req.reqId,
      ok: true,
      restUrl: this.configManager.getRestUrl?.(),
    });
  }

  private handleAttach(port: PortLike, req: AttachRequest): void {
    let slot = this.providers.get(req.providerId);
    let isRestartAttach = false;

    if (!slot) {
      let cfg = req.cfg ?? this.configCatalog?.getProviderConfig(req.providerId) ?? undefined;
      if (!cfg) {
        // eslint-disable-next-line no-console
        if (DEBUG) console.log(`[v2/hub] attach REJECTED subId=${req.subId} provider=${req.providerId}: not running and no cfg`);
        port.postMessage({
          subId: req.subId,
          kind: 'status',
          status: 'error',
          error: `Provider '${req.providerId}' not in catalog and no cfg supplied to start it.`,
        });
        return;
      }
      this.traceStompAttachCfg('hub.attach CREATE (catalog cfg → worker)', req.providerId, cfg, req.extra);
      // eslint-disable-next-line no-console
      if (DEBUG) console.log(`[v2/hub] attach CREATE subId=${req.subId} provider=${req.providerId}`);
      try {
        slot = this.createProvider(req.providerId, cfg);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        port.postMessage({
          subId: req.subId,
          kind: 'status',
          status: 'error',
          error: message,
        } satisfies Event);
        return;
      }
      // createProvider registered the slot (pre-start, so synchronous
      // emissions broadcast).
      this.ensureStatsSampler();
      // First attach can carry `extra` (historical asOfDate). Without this,
      // `ProviderClientAdapter.restart()` on a fresh provider would create
      // the slot but drop the overlay — STOMP would publish unresolved
      // `{{positions.asOfDate}}` template paths.
      if (req.extra) {
        // eslint-disable-next-line no-console
        console.log(`[v2/hub][trace] attach CREATE+RESTART provider=${req.providerId} extra=${JSON.stringify(req.extra)} ${restartClickLatency(req.extra)}`);
        void slot.handle.restart(req.extra);
        slot.activeRestartExtra = req.extra;
      }
    } else if (req.extra) {
      // Existing provider + restart payload. When the caller supplies a
      // cfg (the provider editor's Restart button always sends the current
      // draft), the connection / column / behaviour settings may have been
      // edited since the slot was created — the running provider captured
      // the OLD cfg, so a plain restart() would reconnect with stale
      // values. Rebuild the slot from the new cfg first. Normal grid
      // subscribers omit cfg and just get a plain restart(extra) (e.g. the
      // historical `asOfDate` overlay), which keeps the existing config.
      if (req.cfg) {
        this.traceStompAttachCfg('hub.attach RESTART+RECONFIG (running provider)', req.providerId, req.cfg, req.extra);
        // eslint-disable-next-line no-console
        console.log(`[v2/hub][trace] attach RESTART+RECONFIG provider=${req.providerId} extra=${JSON.stringify(req.extra)} ${restartClickLatency(req.extra)}`);
        slot = this.recreateProvider(req.providerId, req.cfg);
        void slot.handle.restart(req.extra);
        slot.activeRestartExtra = req.extra;
        isRestartAttach = true;
      } else if (!restartExtrasEqual(slot.activeRestartExtra, req.extra)) {
        this.traceStompAttachCfg('hub.attach RESTART (running provider)', req.providerId, slot.cfg, req.extra);
        // eslint-disable-next-line no-console
        console.log(`[v2/hub][trace] attach RESTART provider=${req.providerId} extra=${JSON.stringify(req.extra)} ${restartClickLatency(req.extra)}`);
        void slot.handle.restart(req.extra);
        slot.activeRestartExtra = req.extra;
        isRestartAttach = true;
      } else {
        // eslint-disable-next-line no-console
        if (DEBUG) console.log(`[v2/hub] attach LATE-JOINER (same extra) subId=${req.subId} provider=${req.providerId} cacheSize=${slot.cache.size} status=${slot.status}`);
      }
    } else {
      // eslint-disable-next-line no-console
      if (DEBUG) console.log(`[v2/hub] attach LATE-JOINER subId=${req.subId} provider=${req.providerId} cacheSize=${slot.cache.size} status=${slot.status}`);
    }

    if (req.mode === 'data') {
      this.attachDataListener(req.providerId, req.subId, port, slot, {
        skipCacheReplay: isRestartAttach,
      });
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
    void this.stopProvider(req.providerId);
  }

  /** Replay hub cache to one subscriber — no upstream `restart`. */
  private handleRefreshProvider(req: RefreshProviderRequest): void {
    const slot = this.providers.get(req.providerId);
    if (!slot) return;
    const listener = this.dataListeners.get(req.providerId)?.get(req.subId);
    if (!listener) return;
    this.replayCacheToPort(req.subId, listener.port, slot);
  }

  private async stopProvider(providerId: string): Promise<void> {
    const slot = this.providers.get(providerId);
    if (!slot) return;

    // Drop from the registry first so late STOMP frames cannot fan-out
    // while deactivate() is still in flight.
    this.providers.delete(providerId);

    const dataListeners = this.dataListeners.get(providerId);
    if (dataListeners) {
      for (const l of dataListeners.values()) {
        try {
          l.port.postMessage({ subId: l.subId, kind: 'status', status: 'error', error: 'Provider stopped.' } satisfies Event);
        } catch { /* port dead — other windows must not be blocked */ }
      }
      this.dataListeners.delete(providerId);
    }
    // Keep stats listeners registered across a stop. The diagnostics pane
    // is a passive monitor subscribed via `useProviderStats`; that effect
    // doesn't re-run while mounted, so deleting the listeners here would
    // strand the client — it would never re-subscribe, and a subsequent
    // Restart would re-create the provider into a UI that's gone blind.
    // Instead push one final zeroed snapshot so the pane reflects the
    // stopped state; the sampler skips this provider (no slot) until a
    // Restart re-creates it, at which point the same subscription resumes.
    this.emitStoppedStats(providerId);
    this.maybeStopStatsSampler();

    await slot.handle.stop();
  }

  /** Push a single zeroed stats snapshot to a provider's stats listeners. */
  private emitStoppedStats(providerId: string): void {
    const listeners = this.statsListeners.get(providerId);
    if (!listeners) return;
    const stats = zeroedStats();
    for (const l of listeners.values()) {
      l.port.postMessage({ subId: l.subId, kind: 'stats', stats } satisfies Event);
    }
  }

  // ─── AppData handlers (Step 2) ─────────────────────────────────

  private async handleAppDataAttach(port: PortLike, req: AppDataAttachRequest): Promise<void> {
    // Worker memory is authoritative after boot hydrate — no Dexie
    // re-read on attach. Editor/catalog saves reach the hub via
    // config-invalidate or save-provider-config.
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

  private traceStompAttachCfg(
    phase: string,
    providerId: string,
    cfg: ProviderConfig | undefined,
    extra?: Record<string, unknown>,
  ): void {
    if (!cfg || cfg.providerType !== 'stomp') return;
    traceWorkerAppDataSnapshot(
      `${phase} · worker AppData`,
      this.appData.snapshot().map((r) => ({ name: r.name, values: r.values })),
    );
    traceStompProviderCfg(phase, cfg as StompProviderConfig, {
      providerId,
      extra,
      lookup: (name, key) => this.appData.get(name, key),
    });
  }

  private createProvider(providerId: string, cfg: ProviderConfig): ProviderSlot {
    const cache = new Map<string, unknown>();
    const now = Date.now();
    const flags = cfg as {
      keyColumn?: string | readonly string[];
      thinDeltas?: boolean;
      wireFormat?: string;
    };
    const slot: ProviderSlot = {
      handle: undefined as unknown as ProviderHandle, // set immediately below
      cfg,
      cache,
      status: 'loading',
      byteCount: 0,
      msgCount: 0,
      msgsByBucket: Array.from({ length: SEC_WINDOW }, () => 0),
      bucketIdx: 0,
      startedAt: now,
      lastMessageAt: null,
      errorCount: 0,
      snapshotFetchStartedAt: now,
      snapshotFetchMs: null,
      snapshotReady: false,
      publishCount: 0,
      pubsByBucket: Array.from({ length: SEC_WINDOW }, () => 0),
      pubsByMinBucket: Array.from({ length: MIN_WINDOW }, () => 0),
      minBucketIdx: 0,
      publishWindowSeconds: 0,
      keyDropCount: 0,
      keyDropWarned: false,
      activeRestartExtra: null,
      replaySnapshot: null,
      // Thin deltas need a key to patch against — without keyColumn
      // every row would drop from the cache anyway, so gate on both.
      thinDeltas: flags.thinDeltas === true && flags.keyColumn !== undefined,
      columnar: flags.wireFormat === 'columnar',
    };

    const emit: ProviderEmit = (event: ProviderEmitEvent) => {
      this.applyEmit(providerId, slot, event);
    };

    // Register BEFORE starting the provider: transports emit
    // `status: loading` synchronously inside the factory call, and
    // `applyEmit` drops events from unregistered slots. Registered
    // after-the-fact, that first loading vanished — peer windows never
    // learned a restart had begun (the old `restart()` path masked
    // this by re-emitting loading post-registration; the adopt-in-
    // flight restart path doesn't).
    this.providers.set(providerId, slot);
    try {
      slot.handle = startProvider(cfg, emit, {
        appDataLookup: (name, key) => this.appData.get(name, key),
      });
    } catch (err) {
      this.providers.delete(providerId);
      throw err;
    }
    return slot;
  }

  /**
   * Tear down a running provider's upstream connection and rebuild the
   * slot from a (possibly changed) cfg, keeping the provider id and all
   * existing data / stats listeners intact. Used when the editor's
   * Restart button reconnects after the connection / column / behaviour
   * settings were edited: the running slot was created with the old cfg,
   * so a plain `restart()` would reconnect with stale values.
   */
  private recreateProvider(providerId: string, cfg: ProviderConfig): ProviderSlot {
    const old = this.providers.get(providerId);
    // Drop the old slot from the registry first. `applyEmit` keys on the
    // currently-registered slot, so any in-flight frames from the old
    // connection are ignored the moment it stops being that slot.
    this.providers.delete(providerId);
    if (old) void old.handle.stop();
    // createProvider registers the fresh slot before starting it, so its
    // synchronous `loading` emission reaches every existing listener.
    const fresh = this.createProvider(providerId, cfg);
    this.ensureStatsSampler();
    return fresh;
  }

  private applyEmit(providerId: string, slot: ProviderSlot, event: ProviderEmitEvent): void {
    // Only the currently-registered slot may emit. A superseded slot
    // (after recreateProvider) or a stopped one (removed from the map)
    // is silently ignored, so stale frames never leak into the new cache.
    if (this.providers.get(providerId) !== slot) return;
    if ('rows' in event) {
      const keyColumn = (slot.cfg as { keyColumn?: string | readonly string[] }).keyColumn;
      if (event.replace) slot.cache.clear();
      // Any cache mutation invalidates the pre-encoded replay snapshot.
      // Invalidation is O(1); the next late-join attach rebuilds lazily.
      // Snapshot-phase chunks below may re-seed it from the broadcast
      // encoding — capture the prior chunks so a clean append (new keys
      // only) can extend them instead of forcing a full rebuild.
      const prevReplay = slot.replaySnapshot;
      slot.replaySnapshot = null;
      const cacheSizeBefore = slot.cache.size;

      // Thin field-level deltas (`cfg.thinDeltas`): post-ready live
      // frames ship only the top-level fields that actually changed
      // per row. Replace frames and the pre-ready snapshot phase stay
      // full-row (they're full state by definition). Handles its own
      // cache upsert, key-drop accounting and broadcast.
      if (slot.thinDeltas && slot.snapshotReady && !event.replace) {
        this.applyThinDelta(providerId, slot, event.rows, keyColumn);
        return;
      }

      // Upsert into the cache and detect (a) rows whose key doesn't
      // resolve (dropped) and (b) intra-batch duplicate keys. In the
      // common case — every row keyed, no duplicates, which upstream
      // conflation (`bufferedDispatch`) already guarantees for live
      // ticks — we broadcast `event.rows` AS-IS, with no dedup Map and
      // no copied array. The slow paths below only run when the batch
      // actually contains drops or duplicates.
      let dropped = 0;
      let droppedSample: unknown;
      let dupKeys = false;
      if (event.replace) {
        // Cache was just cleared, so every distinct key grows it by
        // exactly one — a size shortfall vs (rows − dropped) means the
        // batch carried intra-batch duplicates. No Set needed.
        for (const row of event.rows) {
          const k = keyOf(row, keyColumn);
          if (k === null) {
            if (dropped === 0) droppedSample = row;
            dropped += 1;
            continue;
          }
          slot.cache.set(k, row);
        }
        dupKeys = slot.cache.size !== event.rows.length - dropped;
      } else if (event.rows.length === 1) {
        const row = event.rows[0];
        const k = keyOf(row, keyColumn);
        if (k === null) {
          droppedSample = row;
          dropped = 1;
        } else {
          slot.cache.set(k, row);
        }
      } else {
        // Incremental batch: a key already present in the cache is a
        // legit update (size doesn't grow), so the size trick can't
        // spot intra-batch duplicates — track keys seen in THIS batch.
        const seen = new Set<string>();
        for (const row of event.rows) {
          const k = keyOf(row, keyColumn);
          if (k === null) {
            if (dropped === 0) droppedSample = row;
            dropped += 1;
            continue;
          }
          if (seen.has(k)) dupKeys = true;
          else seen.add(k);
          slot.cache.set(k, row);
        }
      }
      if (dropped > 0) this.reportKeyDrops(providerId, slot, keyColumn, dropped, droppedSample);
      slot.msgCount += 1;
      slot.msgsByBucket[slot.bucketIdx] += 1;
      slot.lastMessageAt = Date.now();

      // Broadcast contract: rows are ALWAYS unique by `keyColumn`.
      //
      // - Clean batch (no drops, no intra-batch duplicates — the
      //   overwhelmingly common case): broadcast `event.rows` by
      //   reference. postMessage doesn't mutate it and nothing
      //   retains it, so sharing is safe and allocation-free.
      //
      // - `replace: true` with drops/dups → broadcast the full cache.
      //   Provider snapshot buffers (notably STOMP's snapshot-phase
      //   accumulator) can carry the same row twice; AG-Grid emits
      //   warning #2 ("Duplicate node id") on `setRowData` if two rows
      //   share a `getRowId(...)`. `cache.values()` collapses
      //   duplicates by keyColumn (last-write-wins).
      //
      // - `replace: false` with drops/dups → rebuild a deduped batch
      //   (last-write-wins, insertion-ordered) so the consumer's
      //   `applyTransactionAsync` never sees duplicate ids either.
      //
      // Rows lacking the keyColumn are dropped from the broadcast
      // entirely; the cache also skips them, and they couldn't be
      // routed by the consumer's `getRowId` either.
      let broadcastRows: readonly unknown[];
      if (!dupKeys && dropped === 0) {
        broadcastRows = event.rows;
      } else if (event.replace) {
        broadcastRows = [...slot.cache.values()];
      } else {
        const batch = new Map<string, unknown>();
        for (const row of event.rows) {
          const k = keyOf(row, keyColumn);
          if (k !== null) batch.set(k, row);
        }
        broadcastRows = [...batch.values()];
      }

      // Snapshot-phase chunks (pre-ready: initial load AND restarts —
      // `resetProviderStats` clears `snapshotReady` on every `loading`)
      // broadcast as pre-encoded `delta-bin`: one serialization, then a
      // flat byte copy per port, instead of N object-graph structured
      // clones. With many windows on one provider, the restart snapshot
      // fan-out was the worker's biggest remaining allocation burst.
      // Post-ready live ticks ALSO go binary once they reach
      // LIVE_BIN_MIN_ROWS (see its doc): big sweep frames × many
      // windows otherwise saturate the worker with per-listener
      // clones. Small conflated ticks stay as plain object deltas.
      const binary =
        !slot.snapshotReady || broadcastRows.length >= LIVE_BIN_MIN_ROWS;
      if (binary && broadcastRows.length > 0) {
        // Encode in ≤ LATE_JOIN_CHUNK_SIZE slices so each port message
        // decodes under the receiver's long-task budget (STOMP already
        // flushes 500-row chunks and hits the single-slice path; REST /
        // mock one-shot replaces get sliced here).
        const bufs: EncodedChunk[] = [];
        for (let i = 0; i < broadcastRows.length; i += LATE_JOIN_CHUNK_SIZE) {
          bufs.push(encodeChunk(
            broadcastRows.slice(i, i + LATE_JOIN_CHUNK_SIZE),
            slot.columnar,
          ));
        }
        if (event.replace) {
          // A replace broadcast always equals the cache contents
          // (clean rows by reference, or the deduped cache itself), so
          // the encoded slices double as the replay snapshot for free.
          slot.replaySnapshot = bufs;
        } else if (
          prevReplay
          && !dupKeys
          && dropped === 0
          && slot.cache.size === cacheSizeBefore + event.rows.length
        ) {
          // Clean append (every key new): the chunk extends the cache
          // in insertion order, so it extends the replay encoding too.
          prevReplay.push(...bufs);
          slot.replaySnapshot = prevReplay;
        }
        for (let i = 0; i < bufs.length; i++) {
          this.broadcastData(providerId, slot, {
            kind: 'delta-bin',
            buf: bufs[i].buf,
            enc: bufs[i].enc,
            replace: event.replace && i === 0,
            subId: '', // rewritten per listener in broadcastData
          });
        }
        return;
      }

      this.broadcastData(providerId, slot, {
        kind: 'delta',
        rows: broadcastRows,
        replace: event.replace,
        subId: '', // rewritten per listener in broadcastData
      });
      return;
    }

    if ('status' in event) {
      if (event.status === 'loading') {
        resetProviderStats(slot);
        this.flushStatsToListeners(providerId);
      } else if (event.status === 'ready' && !slot.snapshotReady) {
        slot.snapshotFetchMs = Date.now() - slot.snapshotFetchStartedAt;
        slot.snapshotReady = true;
        slot.publishWindowSeconds = 0;
      }
      slot.status = event.status;
      if (event.status === 'error') {
        slot.errorCount += 1;
        slot.lastError = event.error;
      }
      this.broadcastData(providerId, slot, {
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
      return;
    }

    if ('rowsReceived' in event) {
      if (!slot.snapshotReady) {
        this.broadcastData(providerId, slot, {
          kind: 'rows-received',
          count: event.rowsReceived,
          subId: '',
        });
      }
    }
  }

  /**
   * Thin field-level delta path (`cfg.thinDeltas`, post-ready live
   * frames only). For each row: upsert the full row into the cache
   * (replay/late-join still need full state), diff it against the
   * previous cached version, and broadcast only the changed top-level
   * fields as a `RowPatch`. New keys (inserts) and non-diffable rows
   * ship full under `f`. Rows that didn't observably change are
   * skipped entirely — a free extra layer of conflation.
   *
   * Large patch batches are encoded to UTF-8 JSON ONCE and byte-copied
   * per port (same rationale as `delta-bin`); small batches go as
   * plain object events.
   */
  private applyThinDelta(
    providerId: string,
    slot: ProviderSlot,
    rows: readonly unknown[],
    keyColumn: string | readonly string[] | undefined,
  ): void {
    let dropped = 0;
    let droppedSample: unknown;
    const patches: RowPatch[] = [];
    for (const row of rows) {
      const k = keyOf(row, keyColumn);
      if (k === null) {
        if (dropped === 0) droppedSample = row;
        dropped += 1;
        continue;
      }
      const prev = slot.cache.get(k);
      slot.cache.set(k, row);
      if (prev === undefined) {
        patches.push({ k, f: row });
        continue;
      }
      const diff = diffTopLevel(prev, row);
      if (diff === 'identical') continue;
      if (diff === 'opaque') {
        patches.push({ k, f: row });
        continue;
      }
      patches.push({ k, ...diff });
    }
    if (dropped > 0) this.reportKeyDrops(providerId, slot, keyColumn, dropped, droppedSample);
    slot.msgCount += 1;
    slot.msgsByBucket[slot.bucketIdx] += 1;
    slot.lastMessageAt = Date.now();
    if (patches.length === 0) return;

    if (patches.length >= LIVE_BIN_MIN_ROWS) {
      this.broadcastData(providerId, slot, {
        kind: 'delta-patch',
        buf: SNAPSHOT_ENCODER.encode(JSON.stringify(patches)),
        subId: '', // rewritten per listener in broadcastData
      });
    } else {
      this.broadcastData(providerId, slot, {
        kind: 'delta-patch',
        patches,
        subId: '', // rewritten per listener in broadcastData
      });
    }
  }

  /**
   * Record + surface rows dropped because the configured `keyColumn`
   * doesn't resolve a value on the incoming rows. This is the single
   * most confusing failure mode in the pipeline: the provider fetches
   * the full snapshot, the worker logs "flushSnapshot: N rows", but the
   * grid stays empty because every row's `composeRowId(...)` returns null
   * (e.g. `keyColumn: "POSITIONID"` against rows keyed `positionId`).
   *
   * We warn ONCE per (re)start cycle — never per batch — with the
   * configured key and the actual top-level field names on a sample row,
   * so the mismatch (usually name/case) is obvious in the SharedWorker
   * console. `keyDropCount` accumulates for the hub introspector.
   */
  private reportKeyDrops(
    providerId: string,
    slot: ProviderSlot,
    keyColumn: string | readonly string[] | undefined,
    dropped: number,
    sample: unknown,
  ): void {
    slot.keyDropCount += dropped;
    if (slot.keyDropWarned) return;
    slot.keyDropWarned = true;
    const sampleFields =
      sample && typeof sample === 'object' && !Array.isArray(sample)
        ? Object.keys(sample as Record<string, unknown>)
        : [];
    // eslint-disable-next-line no-console
    console.warn(
      `[hub] provider '${providerId}' dropped ${dropped} row(s): keyColumn ` +
        `${JSON.stringify(keyColumn ?? null)} did not resolve a value on the incoming rows. ` +
        `These rows never reach the cache or the grid (it will appear empty). ` +
        `Fix the provider's Key Column to match an actual field — sample row fields: ` +
        `[${sampleFields.join(', ')}].`,
    );
  }

  // ─── Listener attach + fan-out ─────────────────────────────────

  private attachDataListener(
    providerId: string,
    subId: string,
    port: PortLike,
    slot: ProviderSlot,
    opts?: { skipCacheReplay?: boolean },
  ): void {
    const set = this.dataListeners.get(providerId) ?? new Map<string, DataListener>();
    set.set(subId, { subId, port });
    this.dataListeners.set(providerId, set);

    // Thin-delta subscriptions need the provider's keyColumn so the
    // client can mirror full rows under the same composed key the hub
    // patches against. Posted BEFORE any replay frame.
    if (slot.thinDeltas) {
      port.postMessage({
        subId,
        kind: 'sub-init',
        keyColumn: (slot.cfg as { keyColumn?: string | readonly string[] }).keyColumn,
      } satisfies Event);
    }

    if (opts?.skipCacheReplay) {
      // Restart attach must not replay the hub cache — stale rows +
      // `ready` would settle the client's snapshot promise before the
      // upstream restart completes, leaving reload overlays stuck.
      port.postMessage({ subId, kind: 'status', status: 'loading' } satisfies Event);
      return;
    }

    this.replayCacheToPort(subId, port, slot);
  }

  /**
   * Chunked cache replay to a single port (late-join attach or
   * refresh-provider).
   *
   * Ships pre-encoded `delta-bin` chunks (see {@link DeltaBinEvent}):
   * the cache is serialized to UTF-8 JSON once per cache generation and
   * the SAME byte buffers are posted to every replaying port. Cloning a
   * Uint8Array across the port is a flat memcpy — no per-row object
   * graph walk per subscriber, which is what made simultaneous
   * multi-window attaches GC-storm the worker.
   */
  private replayCacheToPort(subId: string, port: PortLike, slot: ProviderSlot): void {
    // eslint-disable-next-line no-console
    if (DEBUG) console.log(
      `[v2/hub] → subId=${subId}: replay rows=${slot.cache.size} in ${
        Math.max(1, Math.ceil(slot.cache.size / LATE_JOIN_CHUNK_SIZE))
      } chunk(s), status=${slot.status}`,
    );
    if (slot.cache.size === 0) {
      port.postMessage({ subId, kind: 'delta', rows: [], replace: true } satisfies Event);
      this.recordPublish(slot, 1);
    } else {
      const chunks = this.ensureReplaySnapshot(slot);
      for (let i = 0; i < chunks.length; i++) {
        port.postMessage({
          subId,
          kind: 'delta-bin',
          buf: chunks[i].buf,
          enc: chunks[i].enc,
          replace: i === 0,
        } satisfies Event);
        this.recordPublish(slot, 1);
      }
    }
    port.postMessage({
      subId,
      kind: 'status',
      status: slot.status,
      error: slot.lastError,
    } satisfies Event);
  }

  /**
   * Build (or reuse) the pre-encoded replay chunks for a slot's current
   * cache generation. Synchronous with respect to cache mutation — the
   * worker is single-threaded, so a built snapshot is always consistent
   * with the delta stream that follows it on the same port.
   */
  private ensureReplaySnapshot(slot: ProviderSlot): readonly EncodedChunk[] {
    if (slot.replaySnapshot) return slot.replaySnapshot;
    const chunks: EncodedChunk[] = [];
    const scratch: unknown[] = [];
    for (const row of slot.cache.values()) {
      scratch.push(row);
      if (scratch.length === LATE_JOIN_CHUNK_SIZE) {
        chunks.push(encodeChunk(scratch, slot.columnar));
        scratch.length = 0;
      }
    }
    if (scratch.length > 0) chunks.push(encodeChunk(scratch, slot.columnar));
    slot.replaySnapshot = chunks;
    return chunks;
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

  /**
   * Post one data event to a single listener. Returns false when the port
   * is dead (caller should prune). Uses a shallow copy with the
   * listener's `subId` so each `postMessage` owns its envelope — reusing
   * one object across the fan-out loop is unsafe when structured-clone
   * is deferred (observed under OpenFin multi-window).
   */
  private postDataEvent(l: DataListener, event: Event): boolean {
    try {
      l.port.postMessage({ ...event, subId: l.subId });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Drop data listeners whose port threw on `postMessage` (closed window
   * without `detach`, dev HMR, etc.). Without pruning, one zombie port
   * blocks delivery to listeners that appear later in the loop.
   */
  private pruneDeadDataListeners(providerId: string, deadSubIds: readonly string[]): void {
    if (deadSubIds.length === 0) return;
    const listeners = this.dataListeners.get(providerId);
    if (!listeners) return;
    for (const subId of deadSubIds) listeners.delete(subId);
    if (listeners.size === 0) this.dataListeners.delete(providerId);
  }

  private pruneDeadStatsListeners(providerId: string, deadSubIds: readonly string[]): void {
    if (deadSubIds.length === 0) return;
    const listeners = this.statsListeners.get(providerId);
    if (!listeners) return;
    for (const subId of deadSubIds) listeners.delete(subId);
    if (listeners.size === 0) {
      this.statsListeners.delete(providerId);
      this.maybeStopStatsSampler();
    }
  }

  private broadcastData(providerId: string, slot: ProviderSlot, eventTemplate: Event): void {
    const listeners = this.dataListeners.get(providerId);
    if (!listeners) return;
    const countPublish =
      slot.snapshotReady
      && (
        eventTemplate.kind === 'delta'
        || eventTemplate.kind === 'delta-bin'
        || eventTemplate.kind === 'delta-patch'
      );
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
    const dead: string[] = [];
    for (const l of listeners.values()) {
      if (!this.postDataEvent(l, eventTemplate)) {
        dead.push(l.subId);
        continue;
      }
      if (countPublish) this.recordPublish(slot, 1);
    }
    this.pruneDeadDataListeners(providerId, dead);
  }

  /** Count one fan-out delta post to a data subscriber (post-snapshot only). */
  private recordPublish(slot: ProviderSlot, count: number): void {
    if (!slot.snapshotReady) return;
    slot.publishCount += count;
    slot.pubsByBucket[slot.bucketIdx] += count;
    slot.pubsByMinBucket[slot.minBucketIdx] += count;
  }

  // ─── Stats sampler ─────────────────────────────────────────────

  private ensureStatsSampler(): void {
    if (this.statsTimer !== null) return;
    this.statsTimer = this.setTimer(() => this.tickStats(), this.statsIntervalMs);
  }

  private maybeStopStatsSampler(): void {
    // Keep rotating sliding-window buckets while any provider is running,
    // even with no stats listeners — otherwise publish/min buckets stall
    // and accumulate unbounded counts in a single slot.
    if (this.providers.size === 0 && this.statsTimer !== null) {
      this.clearTimer(this.statsTimer);
      this.statsTimer = null;
    }
  }

  private flushStatsToListeners(providerId: string): void {
    const listeners = this.statsListeners.get(providerId);
    const slot = this.providers.get(providerId);
    if (!listeners || !slot) return;
    const stats = this.snapshotStats(providerId, slot);
    const dead: string[] = [];
    for (const l of listeners.values()) {
      try {
        l.port.postMessage({ subId: l.subId, kind: 'stats', stats } satisfies Event);
      } catch {
        dead.push(l.subId);
      }
    }
    this.pruneDeadStatsListeners(providerId, dead);
  }

  private tickStats(): void {
    // Rotate sliding-window buckets first: the slot we're about to
    // overwrite holds the oldest second of activity.
    for (const slot of this.providers.values()) {
      slot.bucketIdx = (slot.bucketIdx + 1) % slot.msgsByBucket.length;
      slot.msgsByBucket[slot.bucketIdx] = 0;
      slot.pubsByBucket[slot.bucketIdx] = 0;
      slot.minBucketIdx = (slot.minBucketIdx + 1) % slot.pubsByMinBucket.length;
      slot.pubsByMinBucket[slot.minBucketIdx] = 0;
      if (slot.snapshotReady) {
        slot.publishWindowSeconds = Math.min(MIN_WINDOW, slot.publishWindowSeconds + 1);
      }
    }

    for (const [providerId, listeners] of this.statsListeners) {
      const slot = this.providers.get(providerId);
      if (!slot) continue;
      const stats = this.snapshotStats(providerId, slot);
      const dead: string[] = [];
      for (const l of listeners.values()) {
        try {
          l.port.postMessage({ subId: l.subId, kind: 'stats', stats } satisfies Event);
        } catch {
          dead.push(l.subId);
        }
      }
      this.pruneDeadStatsListeners(providerId, dead);
    }
  }

  /**
   * Serialized cache footprint in bytes. Exact when the memoized
   * replay snapshot exists (sum of its pre-encoded chunk lengths);
   * otherwise estimated from ONE sampled row × rowCount — live ticks
   * invalidate the memo constantly and the 1 Hz stats sampler must
   * not force a full cache re-encode.
   */
  private cacheFootprintBytes(slot: ProviderSlot): number {
    if (slot.replaySnapshot) {
      let total = 0;
      for (const chunk of slot.replaySnapshot) total += chunk.buf.byteLength;
      return total;
    }
    if (slot.cache.size === 0) return 0;
    const sample = slot.cache.values().next().value;
    try {
      return JSON.stringify(sample).length * slot.cache.size;
    } catch {
      return 0;
    }
  }

  private snapshotStats(providerId: string, slot: ProviderSlot): ProviderStats {
    const subscriberCount = this.dataListeners.get(providerId)?.size ?? 0;
    const sumBuckets = slot.msgsByBucket.reduce((a, b) => a + b, 0);
    const msgPerSec = sumBuckets / slot.msgsByBucket.length;
    const pubSumBuckets = slot.pubsByBucket.reduce((a, b) => a + b, 0);
    const publishPerSec = pubSumBuckets / slot.pubsByBucket.length;
    const rollingMinTotal = slot.pubsByMinBucket.reduce((a, b) => a + b, 0);
    const minWindow = Math.max(1, Math.min(slot.publishWindowSeconds, MIN_WINDOW));
    const publishPerMin = (rollingMinTotal / minWindow) * 60;
    return {
      rowCount: slot.cache.size,
      byteCount: slot.byteCount,
      cacheBytes: this.cacheFootprintBytes(slot),
      msgCount: slot.msgCount,
      msgPerSec,
      snapshotFetchMs: slot.snapshotFetchMs,
      publishCount: slot.publishCount,
      publishPerSec,
      publishPerMin,
      subscriberCount,
      startedAt: slot.startedAt,
      lastMessageAt: slot.lastMessageAt,
      errorCount: slot.errorCount,
      lastError: slot.lastError,
    };
  }
}

/** All-zero stats snapshot — emitted when a provider is stopped. */
function zeroedStats(): ProviderStats {
  return {
    rowCount: 0,
    byteCount: 0,
    cacheBytes: 0,
    msgCount: 0,
    msgPerSec: 0,
    snapshotFetchMs: null,
    publishCount: 0,
    publishPerSec: 0,
    publishPerMin: 0,
    subscriberCount: 0,
    startedAt: 0,
    lastMessageAt: null,
    errorCount: 0,
  };
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
