import type { ProfileSnapshot, StorageAdapter } from './StorageAdapter';
import { RESERVED_DEFAULT_PROFILE_ID, activeProfileKey } from './StorageAdapter';

const LEGACY_STATE_KEY = (gridId: string) => `gc-state:${gridId}`;
const LEGACY_GRID_KEY = (gridId: string) => `gc-grid:${gridId}`;

/**
 * Idempotent one-shot migration from the v1 localStorage layout to the v2
 * adapter. Called by `useProfileManager` on first mount per grid.
 *
 * v1 wrote three keys:
 *   - `gc-state:<gridId>`         — flat module snapshot (the canonical state)
 *   - `gc-grid:<gridId>`          — secondary cache (redundant)
 *   - `gc-active-profile:<gridId>` — id of the active profile (we keep this one)
 *
 * v2 keeps only `gc-active-profile:<gridId>` in localStorage; everything else
 * lives in the storage adapter (Dexie in production). On migration we:
 *   1. Read the legacy `gc-state` blob (if present).
 *   2. If a Default profile already exists in the adapter, leave it alone
 *      (someone migrated already). Otherwise seed Default with the legacy
 *      state.
 *   3. Remove both legacy keys.
 *
 * Safe to call repeatedly — once the legacy keys are gone, this is a no-op.
 */
export async function migrateLegacyLocalStorage(
  gridId: string,
  adapter: StorageAdapter,
): Promise<void> {
  if (typeof localStorage === 'undefined') return;

  const stateRaw = localStorage.getItem(LEGACY_STATE_KEY(gridId));
  const gridRaw = localStorage.getItem(LEGACY_GRID_KEY(gridId));

  // Nothing to migrate. Drop the (probably-empty) gridRaw key for hygiene.
  if (!stateRaw && !gridRaw) return;

  if (stateRaw) {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(stateRaw) as Record<string, unknown>;
    } catch {
      // Corrupt JSON — drop it and move on. A corrupt cache shouldn't block
      // boot; the user will land on a fresh Default profile.
      parsed = null;
    }

    if (parsed && typeof parsed === 'object') {
      const existing = await adapter.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID);
      // Only seed Default from legacy state if Default doesn't already exist.
      // If it does, the user's already on v2 and we'd otherwise stomp newer
      // saves with a stale legacy snapshot.
      if (!existing) {
        const now = Date.now();
        const seeded: ProfileSnapshot = {
          id: RESERVED_DEFAULT_PROFILE_ID,
          gridId,
          name: 'Default',
          state: parsed as ProfileSnapshot['state'],
          createdAt: now,
          updatedAt: now,
        };
        await adapter.saveProfile(seeded);
      }
    }
  }

  // Always drop the legacy keys after a migration attempt — even if the parse
  // failed, leaving them around just means we'd retry the same broken parse on
  // every reload.
  try { localStorage.removeItem(LEGACY_STATE_KEY(gridId)); } catch { /* noop */ }
  try { localStorage.removeItem(LEGACY_GRID_KEY(gridId)); } catch { /* noop */ }

  // Note: `gc-active-profile:<gridId>` (computed via activeProfileKey) is
  // intentionally preserved — v2 still uses it. Touch the function so this
  // file's intent is greppable from the call site.
  void activeProfileKey;
}
