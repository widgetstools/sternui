/**
 * SSRM STOMP provider V2 — shared types (pull plane).
 *
 * The SSRM provider is a SharedWorker that ingests a STOMP snapshot +
 * live-tick stream straight into a Perspective Table it hosts itself —
 * THE ONLY COPY of the book. Windows connect directly with their own
 * SharedWorker port and speak the Perspective client wire protocol
 * (see `worker/installSsrmWorker.ts`); dataset lifecycle is published
 * as `DatasetStateSnapshot` over a separate control port — nobody
 * infers state from side effects.
 *
 * See docs/SSRM_PROVIDER_V2_DESIGN.md.
 */

import type { ColumnDefinition } from '@starui/types';

// ─── Dataset lifecycle ─────────────────────────────────────────────

/**
 * Worker-owned dataset lifecycle:
 *
 *   connecting → seeding(rowCount) → live(rowCount, generation)
 *                                  | empty
 *   any        → error(detail)
 *   restart    → generation+1, connecting
 */
export type DatasetPhase = 'connecting' | 'seeding' | 'live' | 'empty' | 'error';

export interface DatasetStateSnapshot {
  phase: DatasetPhase;
  /**
   * Rows received during the current generation's seed (rises while
   * `seeding`; frozen at the seed total once `live`). Live-tick upserts
   * for new keys are reflected via `liveRows` refreshes, not counted
   * here row-by-row — the table is the source of truth for exact size.
   */
  rowCount: number;
  /**
   * THE generation token. Bumped once per (re)start; every transport
   * event and every table write is stamped with it and dropped on
   * mismatch. Consumers key their mounts on it.
   */
  generation: number;
  /** Present only when `phase === 'error'`. */
  error?: string;
  /**
   * Ingest backpressure, when the worker reports it. OPTIONAL and purely
   * observational — nothing in the pull plane branches on it. A steadily
   * rising `pendingRows` means the feed is outrunning the table writer;
   * `maxWriteMs` is the tail that stalls window reads, since a write
   * holds the worker thread for its whole duration.
   */
  ingest?: IngestTelemetry;
}

/** Worker-side ingest counters, broadcast with DatasetState. */
export interface IngestTelemetry {
  /** Rows awaiting the next table write. Sustained growth = falling behind. */
  pendingRows: number;
  /** Rows parked before the table exists. */
  bufferedRows: number;
  /** `table.update()` calls issued this generation. */
  writes: number;
  /** Rows written this generation. */
  rowsWritten: number;
  /** Duration of the most recent write. */
  lastWriteMs: number;
  /** Slowest single write — the tail that blocks reads. */
  maxWriteMs: number;
  /** Drains split because they exceeded the per-write row bound. */
  chunkedWrites: number;
}

// ─── Provider config (P1 transport scope) ──────────────────────────
//
// P3 grows this into the catalog-registered `StompSsrmProviderConfig`
// with its own editor; the transport core is defined here so the
// worker and tests share one shape.

export interface SsrmDatasetConfig {
  /** WebSocket broker URL, e.g. `ws://localhost:8081`. */
  websocketUrl: string;
  /** Topic carrying snapshot batches + live ticks. */
  listenerTopic: string;
  /** SEND destination that triggers the snapshot (optional for push-only brokers). */
  requestMessage?: string;
  /** Literal body for the trigger frame. */
  requestBody?: string;
  /** Extra STOMP headers on the trigger SEND (e.g. `snapshot-rows`). */
  requestHeaders?: Record<string, string>;
  /** Case-insensitive substring marking end-of-snapshot in a frame body. */
  snapshotEndToken?: string;
  /**
   * Table index — unique row identity. REQUIRED: the pull plane keys
   * every write on it. Single column only in P1.
   */
  keyColumn: string;
  /**
   * Column definitions — the single declaration of table schema and
   * grid columns. Missing/`object`-typed entries are refined from the
   * first snapshot rows while `seeding`.
   */
  columnDefinitions?: ColumnDefinition[];
  /** Perspective table name windows `open_table(...)`. Default `'dataset'`. */
  tableName?: string;
  /** STOMP heartbeat (ms). Default 4000/4000. */
  heartbeat?: { outgoing?: number; incoming?: number };
  /**
   * Bound on the pre-table row buffer (frames that arrive before the
   * table exists). Overflow is a hard dataset error — the buffer is a
   * startup shim, never a second book. Default 100_000.
   */
  maxBufferedRows?: number;
}

// ─── Control-port wire protocol ────────────────────────────────────
//
// One SharedWorker serves two port dialects, discriminated by the
// FIRST message on each port:
//   • `{ cmd: 'init' }`  → Perspective client protocol (vendor shape —
//     see @finos/perspective src/ts/perspective-server.worker.ts).
//   • `{ kind: ... }`    → this control protocol.

export interface SsrmConfigureRequest {
  kind: 'ssrm-configure';
  reqId: number;
  config: SsrmDatasetConfig;
}

export interface SsrmRestartRequest {
  kind: 'ssrm-restart';
  reqId: number;
}

export interface SsrmStateRequest {
  kind: 'ssrm-state';
  reqId: number;
}

/**
 * Cell-edit write-back (P4b): keyed PARTIAL rows written into the
 * hosted table so every window converges on the same book. The worker
 * owns the table, so edits route through it — never a window-side
 * table write. Each row MUST carry the config `keyColumn`; values are
 * schema-coerced worker-side (string input on a float column → number).
 * `generation` is the token the edit was computed against — a stale
 * generation is REFUSED (acked with an error, nothing written).
 */
export interface SsrmUpdateRowsRequest {
  kind: 'ssrm-update-rows';
  reqId: number;
  generation: number;
  rows: Array<Record<string, unknown>>;
}

export type SsrmControlRequest =
  | SsrmConfigureRequest
  | SsrmRestartRequest
  | SsrmStateRequest
  | SsrmUpdateRowsRequest;

/** Reply to a specific request (carries its `reqId`). */
export interface SsrmAckEvent {
  kind: 'ssrm-ack';
  reqId: number;
  state: DatasetStateSnapshot;
  tableName: string | null;
  error?: string;
}

/** Unsolicited broadcast on every DatasetState transition. */
export interface SsrmStateEvent {
  kind: 'ssrm-state';
  state: DatasetStateSnapshot;
  tableName: string | null;
}

export type SsrmControlEvent = SsrmAckEvent | SsrmStateEvent;

export function isSsrmControlRequest(data: unknown): data is SsrmControlRequest {
  if (!data || typeof data !== 'object') return false;
  const kind = (data as { kind?: unknown }).kind;
  return (
    kind === 'ssrm-configure' ||
    kind === 'ssrm-restart' ||
    kind === 'ssrm-state' ||
    kind === 'ssrm-update-rows'
  );
}

export function isSsrmControlEvent(data: unknown): data is SsrmControlEvent {
  if (!data || typeof data !== 'object') return false;
  const kind = (data as { kind?: unknown }).kind;
  return kind === 'ssrm-ack' || kind === 'ssrm-state';
}
