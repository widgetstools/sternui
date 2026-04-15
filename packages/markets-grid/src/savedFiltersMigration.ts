import type { SavedFilter } from './types';

/**
 * Pre-profile builds wrote saved-filter pills to `localStorage[gc-filters:<gridId>]`.
 * This module owns the one-time migration path: the value is read once on a
 * grid mount where the per-profile `saved-filters` module state is empty, then
 * removed regardless so it can never be re-applied.
 *
 * Kept as a small standalone module for two reasons:
 *  1. It's pure (no React) → easy to unit test with vitest.
 *  2. Future cleanup: once we're confident no users have legacy keys left, we
 *     can delete this file in one move without touching the toolbar component.
 */
export const LEGACY_STORAGE_KEY_PREFIX = 'gc-filters:';

export function legacyFiltersKey(gridId: string): string {
  return LEGACY_STORAGE_KEY_PREFIX + gridId;
}

/**
 * Read (and consume) the legacy filters list for a grid id.
 *
 * Returns `null` when:
 *  - The legacy key is absent.
 *  - The stored JSON is malformed.
 *  - The parsed payload is not an array.
 *
 * In every case where the key was present, it is removed before the function
 * returns. This is intentional: even if the parse fails or the shape is wrong,
 * the legacy data is unrecoverable noise — keeping it around would just trigger
 * the same failure on the next mount.
 */
export function readLegacyFilters(gridId: string): SavedFilter[] | null {
  const key = legacyFiltersKey(gridId);
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  // Always remove the key — see docstring above.
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore — best effort */
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SavedFilter[]) : null;
  } catch {
    return null;
  }
}
