/**
 * Internal data structures, listener shapes, options, and tuning
 * constants for {@link SharedWorkerDataServicesHub}. Extracted from the
 * hub module so the orchestration class reads as behaviour, not type
 * boilerplate. No runtime logic lives here.
 */

import type { ProviderConfig } from '@starui/types';
import type { ProviderStatus, WireEncoding, AppDataEvent, SubscriberMeta } from '../protocol.js';
import type { ProviderHandle } from '../providers/Provider.js';
import type { ConfigManager } from '@starui/host-config';
import type { ConfigCatalogCache } from '../../hub/ConfigCatalogCache.js';

/**
 * Maximum rows shipped in a single late-join replay `postMessage`.
 * Same rationale as `SNAPSHOT_CHUNK_SIZE` in `providers/stomp.ts` —
 * keeps each main-thread message handler under Chromium's 50ms
 * long-task threshold. Late-joiners (popouts, hot reloads) hit this
 * path; without chunking they receive the entire cache in one frame.
 */
export const LATE_JOIN_CHUNK_SIZE = 500;

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
export const LIVE_BIN_MIN_ROWS = 64;

/** Sliding-window length for upstream + publish /s averages. */
export const SEC_WINDOW = 5;
/** Sliding-window length for publish /min rolling total. */
export const MIN_WINDOW = 60;

/** Client heartbeat interval (main thread). */
export const SUBSCRIBER_PING_INTERVAL_MS = 15_000;
/** Hub evicts subscribers with no ping within this window (visible windows). */
export const SUBSCRIBER_PING_TIMEOUT_MS = 45_000;
/** Extended grace for hidden windows — main-thread heartbeats are throttled. */
export const SUBSCRIBER_PING_TIMEOUT_HIDDEN_MS = 180_000;
/** How often the hub scans for stale subscribers. */
export const SUBSCRIBER_SWEEP_INTERVAL_MS = 10_000;

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
  /** Set when a {@link FanOutWorkerPool} proxy owns the underlying port. */
  fanOutClientId?: string;
  /**
   * Optional teardown for raw `MessagePort` listeners (inline fan-out
   * path). Called from {@link SharedWorkerDataServicesHub.onPortClosed}.
   */
  dispose?: () => void;
}

/**
 * One pre-encoded broadcast/replay chunk plus the codec it used.
 * `enc` is per-chunk (not per-slot) because the columnar encoder can
 * decline a frame (non-object rows) and fall back to JSON, so chunks
 * of mixed encodings may coexist within one replay snapshot.
 */
export interface EncodedChunk {
  buf: Uint8Array;
  enc: WireEncoding;
}

export interface ProviderSlot {
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
  /**
   * Ms from the user's Restart click until the upstream request was
   * sent (provider-reported via `emit({ timing })`). Null until the
   * request goes out, or when there was no click to measure against.
   */
  restartRequestMs: number | null;
  /**
   * Ms from the upstream request being sent until the first message
   * arrived back (provider-reported). Null until the first message of
   * the current cycle lands.
   */
  firstMessageMs: number | null;
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
   * the misconfig instead. Reset on every (re)start via `resetProviderStats`.
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
   * Binary frames use the typed-array columnar codec instead of UTF-8 JSON.
   * Default true (`cfg.wireFormat !== 'json'`); columnar auto-falls-back to
   * JSON per chunk for incompatible rows. Precomputed at slot creation.
   */
  columnar: boolean;
}

export interface DataListener {
  subId: string;
  port: PortLike;
  attachedAt: number;
  lastPingAt: number;
  meta?: SubscriberMeta;
  /** Last reported visibility from client heartbeats. */
  hidden?: boolean;
}

export interface StatsListener {
  subId: string;
  port: PortLike;
  attachedAt: number;
  lastPingAt: number;
  meta?: SubscriberMeta;
  hidden?: boolean;
}

export interface AppDataListenerEntry {
  subId: string;
  port: PortLike;
}

/**
 * One loaded group level for an SSRM subscriber — the rows at a particular
 * `groupKeys` path (top-level groups, an expanded group's children, or the flat
 * leaf list when not grouping). Tracked per path so live updates can target the
 * right group via the AG-Grid transaction `route`.
 */
export interface SsrmLevel {
  /** The parent group path this level shows the children of ([] = top/flat). */
  groupKeys: string[];
  /** True when this level's rows are GROUP rows (aggregates) vs leaf rows. */
  grouped: boolean;
  /** Ordered result rows at this level. */
  result: readonly Record<string, unknown>[];
  /** Leaf key→position index for in-range live pushes (leaf levels only). */
  view: import('./RowOrderIndex.js').RowOrderIndex | null;
  loadedStart: number;
  loadedEnd: number;
  /** Group level needs re-aggregation on the next throttled flush. */
  aggDirty: boolean;
}

/**
 * Server-Side Row Model subscriber. Unlike {@link DataListener} it gets no
 * cache replay or delta fan-out; it pulls blocks via `ssrm-get-rows`. Each
 * loaded group level is tracked separately ({@link SsrmLevel}); live ticks push
 * leaf-cell updates immediately (per level, with a `route`) and the throttled
 * aggregator re-totals the grand total + re-aggregates loaded group levels.
 */
export interface SsrmListener {
  subId: string;
  port: PortLike;
  providerId: string;
  /** Signature of the base query (sort/filter/group COLUMNS, not groupKeys) —
   *  a change purges every loaded level. */
  baseKey: string;
  /** Base query shared by all levels (sort/filter/rowGroupCols/valueCols). */
  base: import('./serverSideQuery.js').QueryRequest | null;
  /** Loaded levels keyed by `groupKeys.join(SEP)`. */
  levels: Map<string, SsrmLevel>;
  /** Grand-total aggregation of the filtered set (value columns only). */
  grandTotal: Record<string, unknown> | null;
  /** Grand total needs recompute on the next throttled flush. */
  aggDirty: boolean;
}

/** Fan-out scratch shape — `subId` is rewritten per listener. */
export type AppDataDeltaEventMutable = Extract<AppDataEvent, { kind: 'appdata-delta' }> & {
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

  /**
   * Optional fan-out worker pool — parallelizes data/stats broadcast
   * postMessage loops across dedicated workers. Created by
   * `installSharedWorkerHub` in production; omit in unit tests.
   */
  fanOutPool?: import('./FanOutWorkerPool.js').FanOutWorkerPool | null;

  /**
   * Minimum data/stats listeners before routing broadcast through the
   * fan-out pool (default 1 — one worker per connected subscriber).
   */
  fanOutMinListeners?: number;
}
