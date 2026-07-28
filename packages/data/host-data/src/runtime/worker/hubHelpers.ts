/**
 * Stateless helpers for {@link SharedWorkerDataServicesHub}: stats
 * reset, row keying, and restart-overlay comparison. No hub state.
 */
import { composeRowId } from '@starui/types';
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

/** Stable compare for restart overlay payloads (e.g. `{ asOfDate }`). */
export function restartExtrasEqual(
  active: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): boolean {
  if (!active) return false;
  return JSON.stringify(active) === JSON.stringify(incoming);
}

/**
 * The SEMANTIC part of a restart overlay — `__`-prefixed keys dropped.
 * `__refresh` is a cache-buster nonce (the Restart button stamps
 * `Date.now()`), not a provider-affecting overlay like `asOfDate` /
 * `rowShape`. Comparing semantic overlays lets a late-joining subscriber
 * that merely omits `__refresh` be recognised as unchanged.
 */
function semanticOverlay(
  extra: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!extra) return {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(extra)) {
    if (!key.startsWith('__')) out[key] = extra[key];
  }
  return out;
}

/**
 * Decide whether an attach to an ALREADY-RUNNING provider warrants a restart
 * (tear down + re-dial + re-fetch the whole snapshot) rather than a cheap
 * late-join. A restart is warranted only on a POSITIVE change signal:
 *
 *  1. A fresh manual-refresh nonce — `incoming.__refresh` present and
 *     different from the running slot's (the Restart button forces a re-dial
 *     even when nothing else changed).
 *  2. A genuine semantic-overlay change — `asOfDate` / `rowShape` differ,
 *     compared with the transient `__`-prefixed nonce stripped from both.
 *
 * It must NOT restart for a late-joining subscriber that simply OMITS
 * `__refresh`. The first window starts the provider via its `!running` branch
 * with `{ rowShape, __refresh: ts }`, so the slot's stored overlay carries
 * that nonce; a second window on the running provider sends the same overlay
 * WITHOUT `__refresh`. A raw compare reads that asymmetry as a change and
 * re-fetches all N rows per extra window — this guard makes it late-join.
 */
export function restartOverlayChanged(
  active: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): boolean {
  const activeRefresh = typeof active?.__refresh === 'number' ? active.__refresh : undefined;
  const incomingRefresh = typeof incoming.__refresh === 'number' ? incoming.__refresh : undefined;
  if (incomingRefresh !== undefined && incomingRefresh !== activeRefresh) return true;
  return JSON.stringify(semanticOverlay(active)) !== JSON.stringify(semanticOverlay(incoming));
}

/**
 * Stable compare for provider configs. Since P1a the window supplies `cfg`
 * on EVERY attach (not just the editor's Restart) — so a late-joining
 * subscriber carrying the same cfg the running provider already holds must
 * NOT trigger a recreate/redial; only a genuine cfg change (an editor edit)
 * should. Mirrors {@link restartExtrasEqual}: JSON-stable because both cfgs
 * originate from the same catalog row shape, so key order matches.
 */
export function providerCfgEqual(active: unknown, incoming: unknown): boolean {
  if (active == null) return false;
  return JSON.stringify(active) === JSON.stringify(incoming);
}
