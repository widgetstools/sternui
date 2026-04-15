import type { SerializedState } from '../core/types';

/**
 * Persisted profile shape. The `state` field is the snapshot returned by
 * `core.serializeAll()` — a map of module id → versioned envelope. Adapters
 * treat it as an opaque blob; only the core knows how to interpret it.
 */
export interface ProfileSnapshot {
  /** Unique within (`gridId`). The reserved sentinel `__default__` identifies
   *  the auto-managed Default profile, which the profile manager guarantees
   *  always exists. */
  readonly id: string;
  readonly gridId: string;
  /** Display name. Mutable via `useProfileManager.renameProfile`. */
  name: string;
  /** Module-id → versioned envelope. */
  state: Record<string, SerializedState>;
  /** Epoch ms. */
  createdAt: number;
  /** Epoch ms. Bumped on every save. */
  updatedAt: number;
}

/**
 * Storage backend contract. Deliberately thin compared to v1 — no per-grid
 * config blobs, no export/import/clone, no implicit "default" tracking. The
 * profile manager owns all of those concerns and uses the adapter purely as
 * dumb K/V over `(gridId, profileId)`.
 *
 * Implementations:
 *  - `MemoryAdapter` — in-memory Map; used by tests and SSR.
 *  - `DexieAdapter`  — IndexedDB-backed; used in the browser.
 */
export interface StorageAdapter {
  loadProfile(gridId: string, profileId: string): Promise<ProfileSnapshot | null>;
  saveProfile(snapshot: ProfileSnapshot): Promise<void>;
  deleteProfile(gridId: string, profileId: string): Promise<void>;
  /** Returns all profiles for the grid. Order is not guaranteed; the profile
   *  manager sorts by name for display. */
  listProfiles(gridId: string): Promise<ProfileSnapshot[]>;
}

/** Sentinel id for the auto-managed Default profile. Reserved — `createProfile`
 *  rejects this id; `deleteProfile` on this id is a no-op. */
export const RESERVED_DEFAULT_PROFILE_ID = '__default__';

/** localStorage key holding the active profile id for a grid. The only
 *  localStorage key v2 writes — everything else lives in IndexedDB via Dexie. */
export const activeProfileKey = (gridId: string): string =>
  `gc-active-profile:${gridId}`;
