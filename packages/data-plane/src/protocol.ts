/**
 * protocol.ts — wire protocol for `@marketsui/data-plane`.
 *
 * Every message between a client and the SharedWorker travels as one
 * of the discriminated unions defined here. The shapes are designed
 * for structured clone compatibility AND JSON-safety (in case the
 * transport drops to JSON, e.g. when crossing an OpenFin IAB
 * process boundary where structured clone is bypassed).
 *
 * Correlation is always by id, never by topic naming:
 *   • `reqId` — round-trip request/response match (client-generated).
 *   • `subId` — long-lived subscription match; survives across many
 *     `update` messages until the client sends `unsubscribe`.
 *
 * ProviderConfig is sourced from `@marketsui/shared-types` — the same
 * type the existing `DataProviderEditor` UI persists through
 * `dataProviderConfigService`. We reuse it rather than define a
 * parallel shape so the editor and the runtime cannot drift.
 */
import type { ProviderConfig, ProviderType } from '@marketsui/shared-types';

// ─── Error envelope ────────────────────────────────────────────────────

export type ErrorCode =
  | 'PROVIDER_UNKNOWN'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_CONFIGURE_FAILED'
  | 'FETCH_FAILED'
  | 'SUBSCRIBE_FAILED'
  | 'TRANSPORT_CLOSED'
  | 'VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface DataPlaneError {
  code: ErrorCode;
  message: string;
  /** Clients may retry when true — transient / network failures. */
  retryable: boolean;
}

// ─── Request shapes (client → worker) ──────────────────────────────────

export interface ConfigureRequest {
  op: 'configure';
  reqId: string;
  providerId: string;
  config: ProviderConfig;
}

export interface GetRequest {
  op: 'get';
  reqId: string;
  providerId: string;
  key: string;
}

export interface PutRequest {
  op: 'put';
  reqId: string;
  providerId: string;
  key: string;
  value: unknown;
}

export interface SubscribeRequest {
  op: 'subscribe';
  reqId: string;
  /** Client-generated subId; worker echoes back in `sub-established`. */
  subId: string;
  providerId: string;
  key: string;
}

export interface UnsubscribeRequest {
  op: 'unsubscribe';
  subId: string;
}

export interface InvalidateRequest {
  op: 'invalidate';
  reqId: string;
  providerId: string;
  /** Omit to invalidate every key under the provider. */
  key?: string;
}

export interface TeardownRequest {
  op: 'teardown';
  reqId: string;
  providerId: string;
}

/**
 * `restart` — re-apply the provider's last-known config and re-fetch
 * the snapshot. Stream subscribers stay attached and receive the new
 * snapshot via the standard `snapshot-batch` + `snapshot-complete`
 * sequence. Keyed-resource subscribers receive an `update` for each
 * key whose value has changed.
 *
 * `extra` is a free-form bag forwarded to the provider's `restart()`
 * — used by the MarketsGrid historical-mode date picker
 * (`{ asOfDate: '2026-04-01' }`) and any other consumer that
 * needs to parameterise the restart.
 */
export interface RestartRequest {
  op: 'restart';
  reqId: string;
  providerId: string;
  extra?: Record<string, unknown>;
}

/**
 * `resolve` — substitute `{{providerId.key}}` tokens in a template
 * string, looking up each token's value via the matching AppData
 * provider. Targets the `appdata` provider type only; non-AppData
 * provider ids in a token are left as-is with a warning.
 *
 * Returns the substituted string in `OkResponse.value`.
 */
export interface ResolveRequest {
  op: 'resolve';
  reqId: string;
  template: string;
}

export interface PingRequest {
  op: 'ping';
  reqId: string;
}

// ─── Row-stream opcodes ────────────────────────────────────────────────
//
// These opcodes target providers that deliver an ordered ROW STREAM for
// the whole provider (STOMP, WebSocket, SocketIO blotters). Unlike the
// keyed subscribe above, `subscribe-stream` attaches to the provider's
// entire dataset: the client receives `snapshot-batch` messages during
// the snapshot phase, a terminating `snapshot-complete`, and then a
// continuous stream of `row-update` messages.
//
// `get-cached-rows` is for late joiners — clients who subscribed after
// the upstream snapshot already completed. The worker replies with
// exactly one `snapshot-batch` containing the full cached row set plus
// a `snapshot-complete` so the grid initialization path is identical
// whether the subscriber is early or late.

export interface SubscribeStreamRequest {
  op: 'subscribe-stream';
  reqId: string;
  /** Client-generated subId echoed back in `sub-established`. */
  subId: string;
  providerId: string;
}

export interface GetCachedRowsRequest {
  op: 'get-cached-rows';
  reqId: string;
  providerId: string;
}

export type DataPlaneRequest =
  | ConfigureRequest
  | GetRequest
  | PutRequest
  | SubscribeRequest
  | UnsubscribeRequest
  | InvalidateRequest
  | TeardownRequest
  | PingRequest
  | SubscribeStreamRequest
  | GetCachedRowsRequest
  | RestartRequest
  | ResolveRequest;

// ─── Response shapes (worker → client) ─────────────────────────────────

export interface OkResponse {
  op: 'ok';
  reqId: string;
  /** Defined for `get` + `put`; undefined for void ops (`configure`,
   *  `invalidate`, `teardown`). */
  value?: unknown;
  /** True if the response was served from an unexpired cache entry. */
  cached: boolean;
  /** Epoch ms of the `data` value's last successful write. 0 for void ops. */
  fetchedAt: number;
}

export interface UpdateResponse {
  op: 'update';
  subId: string;
  providerId: string;
  key: string;
  value: unknown;
  /**
   * Monotonic per `(providerId, key)`. Worker bumps on every broadcast.
   * Clients compare against their last-seen `seq` — if it resets to 0 /
   * goes backwards they know the worker restarted and must `subscribe`
   * again.
   */
  seq: number;
}

export interface SubEstablishedResponse {
  op: 'sub-established';
  reqId: string;
  subId: string;
}

export interface ErrResponse {
  op: 'err';
  reqId: string;
  error: DataPlaneError;
}

export interface PongResponse {
  op: 'pong';
  reqId: string;
}

// ─── Row-stream response shapes ────────────────────────────────────────

/**
 * `snapshot-batch` — one portion of the upstream snapshot. Providers
 * that deliver a huge snapshot in many STOMP frames will emit many of
 * these, each with a monotonic `batch` number starting at 0. Clients
 * aggregate into the grid via `setRowData` once `snapshot-complete`
 * arrives (or apply incrementally, depending on their strategy).
 *
 * `reqId` is optional — present only for the targeted replay sent in
 * response to `get-cached-rows` from a late joiner, so the client can
 * correlate. Broadcast snapshots during live streaming leave it
 * undefined (every subscriber gets the same batch).
 */
export interface SnapshotBatchResponse {
  op: 'snapshot-batch';
  reqId?: string;
  providerId: string;
  subId?: string;
  rows: readonly unknown[];
  batch: number;
  /** Set true on the batch that preceded the snapshot-complete frame. */
  isFinal: boolean;
  /**
   * Transport-level diagnostics for the key-column contract. Set on
   * the last batch only, or on the single batch returned to a late
   * joiner. Surfaces the common case where the config's keyColumn is
   * misnamed — the cache would be empty despite rows flowing.
   */
  diagnostics?: {
    keyColumn: string;
    cacheSize: number;
    rowsReceived: number;
    skipped: number;
  };
}

export interface SnapshotCompleteResponse {
  op: 'snapshot-complete';
  reqId?: string;
  providerId: string;
  subId?: string;
  /** Total rows observed in the cache when the snapshot ended. */
  rowCount: number;
}

/**
 * Single-row (or small-batch) update emitted during the realtime phase
 * — i.e. after `snapshot-complete` fired for this provider.
 */
export interface RowUpdateResponse {
  op: 'row-update';
  providerId: string;
  subId: string;
  rows: readonly unknown[];
  /** Monotonic per `providerId`. Client can spot worker restarts if this resets. */
  seq: number;
}

export type DataPlaneResponse =
  | OkResponse
  | UpdateResponse
  | SubEstablishedResponse
  | ErrResponse
  | PongResponse
  | SnapshotBatchResponse
  | SnapshotCompleteResponse
  | RowUpdateResponse;

// ─── Type guards ───────────────────────────────────────────────────────

export function isRequest(value: unknown): value is DataPlaneRequest {
  if (!value || typeof value !== 'object') return false;
  const op = (value as { op?: unknown }).op;
  return (
    op === 'configure' ||
    op === 'get' ||
    op === 'put' ||
    op === 'subscribe' ||
    op === 'unsubscribe' ||
    op === 'invalidate' ||
    op === 'teardown' ||
    op === 'ping' ||
    op === 'subscribe-stream' ||
    op === 'get-cached-rows'
  );
}

export function isResponse(value: unknown): value is DataPlaneResponse {
  if (!value || typeof value !== 'object') return false;
  const op = (value as { op?: unknown }).op;
  return (
    op === 'ok' ||
    op === 'update' ||
    op === 'sub-established' ||
    op === 'err' ||
    op === 'pong' ||
    op === 'snapshot-batch' ||
    op === 'snapshot-complete' ||
    op === 'row-update'
  );
}

// ─── Re-exports for ergonomics ─────────────────────────────────────────

export type { ProviderConfig, ProviderType };
