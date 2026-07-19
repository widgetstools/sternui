/**
 * Stateless helpers for {@link SharedWorkerDataServicesHub}: stats
 * reset, row keying, and restart-overlay comparison. No hub state.
 */
import { composeRowId } from '@wellsfargo-starui/types';
import type { ProviderSlot } from './hubTypes.js';

/** Reset every diagnostics counter when a provider (re)starts. */
export function resetProviderStats(slot: ProviderSlot, now = Date.now()): void {
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
  slot.restartRequestMs = null;
  slot.firstMessageMs = null;
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
export function keyOf(
  row: unknown,
  keyColumn: string | readonly string[] | undefined,
): string | null {
  return composeRowId(row, keyColumn);
}

/**
 * Click-to-hub latency annotation for restart-attach trace logs.
 * `extra.__refresh` carries Date.now() at the user's Restart click,
 * so the delta is the port + main-thread latency before the hub
 * even started the restart.
 */
export function restartClickLatency(extra: Record<string, unknown>): string {
  const clickAt = typeof extra.__refresh === 'number' ? extra.__refresh : null;
  return clickAt === null ? '' : `sinceClick=+${Date.now() - clickAt}ms`;
}

/**
 * Stable overlay keys for late-join dedup — strips `__`-prefixed
 * cache-busters (e.g. `__refresh` from cold-start / Reload) and
 * null/undefined values. Those exist only to force an intentional
 * re-acquire and must not make a second window's `{ rowShape }` attach
 * look like a different overlay (that would restart STOMP and broadcast
 * `loading` to every peer blotter).
 */
export function stableRestartExtra(
  extra: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!extra) return null;
  const entries = Object.entries(extra)
    .filter(([k, v]) => !k.startsWith('__') && v !== undefined && v !== null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (entries.length === 0) return null;
  return Object.fromEntries(entries);
}

/**
 * Compare restart overlay payloads for late-join vs forced restart.
 *
 * Stable keys only (`rowShape`, `asOfDate`, …). `__refresh` is timing /
 * legacy cache-buster noise and must NOT force a restart (demux used to
 * stamp a fresh `__refresh` on every blotter because monolith
 * `isProviderRunning` is blind). Intentional re-acquire uses `__reload`
 * (or `__forceRestart: true`) — see MarketsGrid Reload.
 *
 * When the running slot has never recorded an overlay (`active == null`):
 * - `rowShape`-only (or empty stable overlay) → late-join. Grid peers
 *   always send `rowShape`; treating that as a restart after a cfg-only
 *   cold start tore STOMP down and flashed "Refreshing…" on settled blotters.
 * - Other stable keys (`asOfDate`, …) → not equal (caller restarts).
 */
export function restartExtrasEqual(
  active: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): boolean {
  if (incoming.__reload != null || incoming.__forceRestart === true) {
    return false;
  }
  const incomingStable = stableRestartExtra(incoming);
  if (!active) {
    if (!incomingStable) return true;
    return Object.keys(incomingStable).every((k) => k === 'rowShape');
  }
  return JSON.stringify(stableRestartExtra(active)) === JSON.stringify(incomingStable);
}

/**
 * True when an attach `cfg` matches the running slot cfg closely enough
 * that we should not tear down / recreate the provider (catalog grids
 * often re-send the same cfg on every subscribe).
 */
export function providerCfgsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
