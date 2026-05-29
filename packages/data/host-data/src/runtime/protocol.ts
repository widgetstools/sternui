/**
 * Wire protocol — v2 (clean rewrite).
 *
 * Three message kinds in each direction. There is no separate
 * `configure` step: `attach` is configure-or-attach. The Hub creates
 * the provider on first attach for a given providerId; subsequent
 * attaches with the same id reuse the running instance and ignore
 * the cfg payload. The Hub immediately replies with a
 * `delta { replace: true, rows: [...currentCache] }` followed by a
 * `status` event — that single guaranteed first-emit eliminates the
 * late-joiner race that v1 needed cache replay to patch over.
 */

import type { DataProviderConfig, ProviderConfig, ProviderType } from '@starui/types';

// ─── AppData row shape (mirrors AppDataConfig from probes/appdata) ─

/**
 * Wire-shape for an AppData row crossing the port. Identical to
 * `AppDataConfig` from `runtime/providers/appdata/store.ts` but
 * inlined here so the protocol module has no internal-package
 * coupling other than `@starui/types`.
 */
export interface AppDataRow {
  configId: string;
  name: string;
  description?: string;
  isPublic: boolean;
  values: Record<string, unknown>;
  /** Owner user id — `'system'` for public rows. */
  userId: string;
}

// ─── Provider stats ─────────────────────────────────────────────────

export interface ProviderStats {
  /** Live row count = cache.size. */
  rowCount: number;
  /** Cumulative bytes received from upstream (raw frame bodies). */
  byteCount: number;
  /** Cumulative messages parsed. */
  msgCount: number;
  /** Sliding-window upstream throughput (last 5s). */
  msgPerSec: number;
  /** Milliseconds from start/restart until first `ready` status. Null while snapshot in flight. */
  snapshotFetchMs: number | null;
  /** Cumulative fan-out delta posts to data subscribers after snapshot ready. */
  publishCount: number;
  /** Sliding-window publish throughput to subscribers (last 5s avg). */
  publishPerSec: number;
  /** Rolling 60s average publish rate to subscribers (msg/min). */
  publishPerMin: number;
  /** Number of attached data-mode listeners. */
  subscriberCount: number;
  /** Epoch ms — when start() was first called. */
  startedAt: number;
  /** Epoch ms — last successful upstream message. */
  lastMessageAt: number | null;
  /** Cumulative parse / network errors. */
  errorCount: number;
  /** Most recent error message, if any. */
  lastError?: string;
}

// ─── Status enum ────────────────────────────────────────────────────

export type ProviderStatus = 'loading' | 'ready' | 'error';

// ─── Client → Worker requests ──────────────────────────────────────

export interface AttachRequest {
  kind: 'attach';
  /** Per-subscription identifier. Client picks; Hub uses for fan-out + detach. */
  subId: string;
  providerId: string;
  /**
   * `'data'` (default) — listener receives `delta` + `status` events.
   * `'stats'` — listener receives a `stats` event at 1 Hz.
   */
  mode: 'data' | 'stats';
  /**
   * Required on FIRST attach when `providerId` is not in the hub catalog.
   * Optional when the worker has preloaded the provider row via
   * `ConfigCatalogCache`. Ignored on subsequent attaches (the running
   * provider keeps its existing cfg).
   * Templates (`{{appdata.key}}`) are resolved on the client side
   * before the request is sent.
   */
  cfg?: ProviderConfig;
  /**
   * Optional restart payload. When provided AND the provider is
   * already running, the Hub calls `provider.restart(extra)` so
   * upstream re-fetches with this overlay (used by the historical-
   * mode date picker via `{ asOfDate }` and the toolbar refresh
   * button via `{ __refresh: ts }`).
   */
  extra?: Record<string, unknown>;
}

export interface DetachRequest {
  kind: 'detach';
  subId: string;
}

export interface StopRequest {
  kind: 'stop';
  providerId: string;
}

/** Query whether the worker catalog preload has completed. */
export interface HubReadyRequest {
  kind: 'hub-ready';
  reqId: string;
}

/** Fetch one data-provider row from the worker catalog. */
export interface GetConfigRequest {
  kind: 'get-config';
  reqId: string;
  providerId: string;
}

/** List data-provider rows from the worker catalog. */
export interface ListConfigsRequest {
  kind: 'list-configs';
  reqId: string;
  subtype?: ProviderType;
  includeAppData?: boolean;
}

/** Reload one row or the full catalog after editor save/remove. */
export interface ConfigInvalidateRequest {
  kind: 'config-invalidate';
  reqId: string;
  providerId?: string;
}

/** Replay hub row cache to one subscriber without upstream I/O. */
export interface RefreshProviderRequest {
  kind: 'refresh-provider';
  subId: string;
  providerId: string;
}

/** Snapshot of SharedWorker hub runtime state (providers, AppData, ports). */
export interface HubProviderIntrospectRow {
  providerId: string;
  providerType: string;
  /** False when the row exists in catalog but has no runtime slot. */
  running: boolean;
  status?: ProviderStatus;
  subscriberCount?: number;
  statsListenerCount?: number;
  rowCount?: number;
  msgPerSec?: number;
  publishPerSec?: number;
  publishCount?: number;
  lastMessageAt?: number | null;
  startedAt?: number;
  errorCount?: number;
  lastError?: string;
}

export interface HubAppDataIntrospectRow {
  configId: string;
  name: string;
  keyCount: number;
}

export interface HubIntrospectSnapshot {
  connectedPorts: number;
  catalogReady: boolean;
  catalogProviderCount: number;
  runningProviderCount: number;
  providers: readonly HubProviderIntrospectRow[];
  appData: {
    listenerCount: number;
    rows: readonly HubAppDataIntrospectRow[];
  };
}

/** Query live hub diagnostics (providers, subscribers, cache sizes). */
export interface HubIntrospectRequest {
  kind: 'hub-introspect';
  reqId: string;
}

// ─── Client → Worker AppData requests ──────────────────────────────
//
// Separate union so existing provider request handling stays
// untouched. Hub routes by top-level `kind` prefix (`appdata-*`).

/**
 * Attach a port to AppData broadcasts. The hub returns a snapshot
 * event immediately, then delta events on every subsequent mutation
 * (from any window). subId scopes the broadcast back to a single
 * mirror so multiple mirrors per port (e.g. tests) stay separable.
 *
 * `seed` is the legacy back-compat field — the hub now hydrates
 * itself from IndexedDB at boot and ignores any seed sent by mirrors.
 * Kept on the wire as optional so older mirrors still type-check
 * against the protocol.
 */
export interface AppDataAttachRequest {
  kind: 'appdata-attach';
  subId: string;
  seed?: readonly AppDataRow[];
}

export interface AppDataDetachRequest {
  kind: 'appdata-detach';
  subId: string;
}

/**
 * Set a single key on a named AppData provider. Creates the row if
 * it doesn't exist. The hub broadcasts the resulting full row to
 * every attached subscriber after applying.
 *
 * Persistence (writing to ConfigManager) happens on the originating
 * window's main thread BEFORE the request is posted — see Step 2
 * plan §Persistence ("fan-out bus" shape). The hub fans out the
 * already-persisted row.
 */
export interface AppDataSetRequest {
  kind: 'appdata-set';
  reqId: string;
  row: AppDataRow;
}

/** Replace an entire AppData row. Same flow as set. */
export interface AppDataUpsertRequest {
  kind: 'appdata-upsert';
  reqId: string;
  row: AppDataRow;
}

/** Delete an AppData row by configId. */
export interface AppDataRemoveRequest {
  kind: 'appdata-remove';
  reqId: string;
  configId: string;
}

export type AppDataRequest =
  | AppDataAttachRequest
  | AppDataDetachRequest
  | AppDataSetRequest
  | AppDataUpsertRequest
  | AppDataRemoveRequest;

export type Request =
  | AttachRequest
  | DetachRequest
  | StopRequest
  | HubReadyRequest
  | GetConfigRequest
  | ListConfigsRequest
  | ConfigInvalidateRequest
  | RefreshProviderRequest
  | HubIntrospectRequest;

// ─── Worker → Client events ────────────────────────────────────────

export interface DeltaEvent {
  subId: string;
  kind: 'delta';
  /** Rows to upsert keyed by `cfg.keyColumn`. */
  rows: readonly unknown[];
  /**
   * When true, the consumer should replace its full row set with
   * `rows`. Fired on the initial attach (with the current cache) and
   * after a restart. Otherwise, `rows` is an incremental upsert.
   */
  replace?: boolean;
}

export interface StatusEvent {
  subId: string;
  kind: 'status';
  status: ProviderStatus;
  error?: string;
}

export interface StatsEvent {
  subId: string;
  kind: 'stats';
  stats: ProviderStats;
}

/** Progressive snapshot row count while upstream is buffering (pre-cache). */
export interface RowsReceivedEvent {
  subId: string;
  kind: 'rows-received';
  count: number;
}

export type Event = DeltaEvent | StatusEvent | StatsEvent | RowsReceivedEvent;

/** Worker → client catalog events (no subId — routed by reqId or broadcast). */
export interface CatalogReadyEvent {
  kind: 'catalog-ready';
}

export interface ConfigSnapshotEvent {
  kind: 'config-snapshot';
  reqId: string;
  ok: boolean;
  error?: string;
  /** Response to `hub-ready`. */
  ready?: boolean;
  /** Response to `get-config`. Null when id is missing from catalog. */
  config?: DataProviderConfig | null;
  /** Response to `list-configs`. */
  configs?: readonly DataProviderConfig[];
  /** Response to `hub-introspect`. */
  introspect?: HubIntrospectSnapshot;
}

export type CatalogEvent = CatalogReadyEvent | ConfigSnapshotEvent;

// ─── Worker → Client AppData events ────────────────────────────────

/**
 * Initial snapshot delivered to a freshly-attached mirror.
 *
 * The mirror is allowed to render BEFORE the snapshot arrives (sync
 * `get` returns undefined for unknown keys), but tests typically
 * `await mirror.ready()` for determinism.
 */
export interface AppDataSnapshotEvent {
  kind: 'appdata-snapshot';
  subId: string;
  rows: readonly AppDataRow[];
}

/**
 * Delta event — fired AFTER the hub applied a mutation to its
 * authoritative state, broadcast to every attached subscriber
 * including the originator. `op` is `'remove'` for deletions
 * (`row.configId` identifies the removed row); otherwise the row
 * is an upsert.
 */
export interface AppDataDeltaEvent {
  kind: 'appdata-delta';
  subId: string;
  op: 'upsert' | 'remove';
  row: AppDataRow;
}

/** Acknowledgement for set/upsert/remove. Mirrors the reqId. */
export interface AppDataAckEvent {
  kind: 'appdata-ack';
  reqId: string;
  ok: boolean;
  error?: string;
}

export type AppDataEvent =
  | AppDataSnapshotEvent
  | AppDataDeltaEvent
  | AppDataAckEvent;

// ─── Type guards ───────────────────────────────────────────────────

export function isRequest(value: unknown): value is Request {
  if (!value || typeof value !== 'object') return false;
  const k = (value as { kind?: string }).kind;
  return (
    k === 'attach' ||
    k === 'detach' ||
    k === 'stop' ||
    k === 'hub-ready' ||
    k === 'get-config' ||
    k === 'list-configs' ||
    k === 'config-invalidate' ||
    k === 'refresh-provider' ||
    k === 'hub-introspect'
  );
}

export function isEvent(value: unknown): value is Event {
  if (!value || typeof value !== 'object') return false;
  const v = value as { kind?: string; subId?: unknown };
  if (typeof v.subId !== 'string') return false;
  return v.kind === 'delta' || v.kind === 'status' || v.kind === 'stats' || v.kind === 'rows-received';
}

export function isCatalogEvent(value: unknown): value is CatalogEvent {
  if (!value || typeof value !== 'object') return false;
  const k = (value as { kind?: string }).kind;
  return k === 'catalog-ready' || k === 'config-snapshot';
}

export function isAppDataRequest(value: unknown): value is AppDataRequest {
  if (!value || typeof value !== 'object') return false;
  const k = (value as { kind?: string }).kind;
  return (
    k === 'appdata-attach' ||
    k === 'appdata-detach' ||
    k === 'appdata-set' ||
    k === 'appdata-upsert' ||
    k === 'appdata-remove'
  );
}

export function isAppDataEvent(value: unknown): value is AppDataEvent {
  if (!value || typeof value !== 'object') return false;
  const k = (value as { kind?: string }).kind;
  return (
    k === 'appdata-snapshot' ||
    k === 'appdata-delta' ||
    k === 'appdata-ack'
  );
}

// ─── Re-exports for ergonomics ─────────────────────────────────────

export type { DataProviderConfig, ProviderConfig, ProviderType };
