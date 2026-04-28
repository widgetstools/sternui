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

import type { ProviderConfig, ProviderType } from '@marketsui/shared-types';

// ─── Provider stats ─────────────────────────────────────────────────

export interface ProviderStats {
  /** Live row count = cache.size. */
  rowCount: number;
  /** Cumulative bytes received from upstream (raw frame bodies). */
  byteCount: number;
  /** Cumulative messages parsed. */
  msgCount: number;
  /** Sliding-window throughput (last 5s). */
  msgPerSec: number;
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
   * Required on FIRST attach for a providerId. Ignored on subsequent
   * attaches (the running provider keeps its existing cfg).
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

export type Request = AttachRequest | DetachRequest | StopRequest;

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

export type Event = DeltaEvent | StatusEvent | StatsEvent;

// ─── Type guards ───────────────────────────────────────────────────

export function isRequest(value: unknown): value is Request {
  if (!value || typeof value !== 'object') return false;
  const k = (value as { kind?: string }).kind;
  return k === 'attach' || k === 'detach' || k === 'stop';
}

export function isEvent(value: unknown): value is Event {
  if (!value || typeof value !== 'object') return false;
  const v = value as { kind?: string; subId?: unknown };
  if (typeof v.subId !== 'string') return false;
  return v.kind === 'delta' || v.kind === 'status' || v.kind === 'stats';
}

// ─── Re-exports for ergonomics ─────────────────────────────────────

export type { ProviderConfig, ProviderType };
