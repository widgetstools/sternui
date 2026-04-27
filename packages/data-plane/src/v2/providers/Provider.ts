/**
 * Provider primitive — three free functions, no class hierarchy.
 *
 * The Hub owns the cache; providers just emit. Three event shapes:
 *
 *   • `{ rows, replace? }` — keyed upserts (or full reset on restart).
 *     Hub merges into its cache by `cfg.keyColumn` then broadcasts.
 *   • `{ status, error? }` — lifecycle transition (loading → ready →
 *     error). Hub stashes + broadcasts.
 *   • `{ byteSize }` — increment the stats byte counter without
 *     emitting a row event. Lets providers track raw frame size for
 *     bandwidth monitoring even on no-op messages (heartbeats, end
 *     tokens, etc.).
 *
 * Keeping these as plain functions has two upsides over a Provider
 * class:
 *   1. There's no `state` object to leak through the contract — the
 *      Hub's cache is the single source of truth.
 *   2. Adding a new transport is one file with one function, no
 *      base class to extend.
 */

import type { ProviderStatus } from '../protocol.js';

export interface ProviderHandle {
  /** Idempotent. Disconnects upstream + releases resources. */
  stop(): void | Promise<void>;
  /** Re-fetches with optional overlay. Implementations clear local
   *  state, re-emit `replace: true`, and re-run their lifecycle. */
  restart(extra?: Record<string, unknown>): void | Promise<void>;
}

export type ProviderEmit = (event: ProviderEmitEvent) => void;

export type ProviderEmitEvent =
  | { rows: readonly unknown[]; replace?: boolean }
  | { status: ProviderStatus; error?: string }
  | { byteSize: number };
