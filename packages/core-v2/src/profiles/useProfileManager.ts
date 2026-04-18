import { useCallback, useEffect, useRef, useState } from 'react';
import type { GridCore } from '../core/GridCore';
import type { GridStore } from '../store/createGridStore';
import type { SerializedState } from '../core/types';
import { startAutoSave, type AutoSaveHandle } from '../store/autosave';
import {
  RESERVED_DEFAULT_PROFILE_ID,
  activeProfileKey,
  type ProfileSnapshot,
  type StorageAdapter,
} from '../persistence/StorageAdapter';
import { migrateLegacyLocalStorage } from '../persistence/migrations';

export interface UseProfileManagerOptions {
  gridId: string;
  core: GridCore;
  store: GridStore;
  adapter: StorageAdapter;
  /** Auto-save debounce window. Default 300ms — see `startAutoSave`. */
  autoSaveDebounceMs?: number;
  /** Disable auto-save entirely — useful for tests that want to drive the
   *  pipeline manually. Default false (auto-save on). */
  disableAutoSave?: boolean;
}

export interface ProfileMeta {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: number;
  readonly isDefault: boolean;
}

export interface UseProfileManagerResult {
  /** Active profile id. `__default__` while Default is loaded. */
  activeProfileId: string;
  /** Sorted by name; Default is always present and first. */
  profiles: ProfileMeta[];
  /** True until the initial load + migration finishes. */
  isLoading: boolean;
  /** Load a profile, applying its snapshot via `core.deserializeAll`. Pending
   *  auto-save flushes first so we don't lose un-persisted edits to the
   *  outgoing profile — pass `{ skipFlush: true }` to opt out (used by the
   *  delete path where flushing would resurrect the just-deleted profile). */
  loadProfile: (id: string, options?: { skipFlush?: boolean }) => Promise<void>;
  /** Persist the current store snapshot into the active profile. Called by
   *  the auto-save engine; also exposed for explicit Save All buttons. */
  saveActiveProfile: () => Promise<void>;
  /** Create a new profile seeded from the current store snapshot, then make
   *  it active. Rejects if `id` collides with the reserved Default sentinel. */
  createProfile: (name: string, opts?: { id?: string }) => Promise<ProfileMeta>;
  /** Delete a profile. Cannot delete Default — silently no-ops in that case
   *  rather than throwing, since the call usually comes from a UI handler
   *  that's already gated by the `isDefault` flag. */
  deleteProfile: (id: string) => Promise<void>;
  /** Rename. Cannot rename Default. */
  renameProfile: (id: string, name: string) => Promise<void>;
  /** Snapshot a profile as a JSON-serialisable payload. Omit `id` to export
   *  the active profile. Flushes any pending auto-save first so the payload
   *  reflects the latest edits, even if the user mashed Export right after
   *  a keystroke. */
  exportProfile: (id?: string) => Promise<ExportedProfilePayload>;
  /** Create a new profile from an imported payload. Always additive —
   *  generates a unique id + name on collision so importing never
   *  overwrites an existing profile. Activates the new profile unless
   *  `activate: false` is passed. */
  importProfile: (
    payload: unknown,
    options?: { name?: string; activate?: boolean },
  ) => Promise<ProfileMeta>;
}

/**
 * Profile manager v2. Owns:
 *  - The reserved Default profile (auto-created on first mount, never deletable).
 *  - The active-profile pointer (single localStorage key per grid).
 *  - The auto-save engine wired to write the live snapshot into the active
 *    profile on a debounce.
 *  - One-shot legacy migration from the v1 localStorage layout.
 *
 * Single source of truth: the only persisted state is `ProfileSnapshot`
 * records in the adapter. The Zustand store is the only runtime state. The
 * core is the only thing that knows how to serialize/deserialize across the
 * two. Nothing duplicates state across stores or caches.
 */
export function useProfileManager(opts: UseProfileManagerOptions): UseProfileManagerResult {
  const { gridId, core, store, adapter } = opts;

  const [activeProfileId, setActiveProfileId] = useState<string>(RESERVED_DEFAULT_PROFILE_ID);
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Refs let async closures see the *current* active id without re-binding
  // every render — the profile manager outlives any individual render.
  const activeIdRef = useRef(activeProfileId);
  activeIdRef.current = activeProfileId;

  const autoSaveRef = useRef<AutoSaveHandle | null>(null);

  // ─── Persist the live snapshot into whichever profile is active ──────────
  //
  // Read the *current* active id from the ref so a profile switch that hasn't
  // been re-rendered yet doesn't write to the previous profile.
  const persistSnapshot = useCallback(async () => {
    const id = activeIdRef.current;
    const snap = core.serializeAll();
    const existing = await adapter.loadProfile(gridId, id);
    const now = Date.now();
    const next: ProfileSnapshot = existing
      ? { ...existing, state: snap, updatedAt: now }
      : {
          id,
          gridId,
          name: id === RESERVED_DEFAULT_PROFILE_ID ? 'Default' : id,
          state: snap,
          createdAt: now,
          updatedAt: now,
        };
    await adapter.saveProfile(next);
    core.eventBus.emit('profile:saved', { gridId, profileId: id });
  }, [adapter, core, gridId]);

  const refreshProfiles = useCallback(async () => {
    const list = await adapter.listProfiles(gridId);
    setProfiles(toMetaList(list));
  }, [adapter, gridId]);

  // ─── Boot: legacy migrate → ensure Default → load active → wire auto-save ─
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await migrateLegacyLocalStorage(gridId, adapter);

        // Make sure Default exists. If a fresh Default was just seeded by
        // legacy migration, this load returns it; otherwise we create a blank.
        let defaultProfile = await adapter.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID);
        if (!defaultProfile) {
          const now = Date.now();
          defaultProfile = {
            id: RESERVED_DEFAULT_PROFILE_ID,
            gridId,
            name: 'Default',
            state: {},
            createdAt: now,
            updatedAt: now,
          };
          await adapter.saveProfile(defaultProfile);
        }

        // Resolve which profile to load (fallback chain):
        //   1. localStorage active id, if it points at an existing profile
        //   2. Default
        const lsId = readActiveId(gridId);
        let resolvedId = RESERVED_DEFAULT_PROFILE_ID;
        let snapshot: ProfileSnapshot = defaultProfile;
        if (lsId && lsId !== RESERVED_DEFAULT_PROFILE_ID) {
          const candidate = await adapter.loadProfile(gridId, lsId);
          if (candidate) {
            resolvedId = lsId;
            snapshot = candidate;
          } else {
            // Stale pointer — clear it and fall through to Default.
            writeActiveId(gridId, RESERVED_DEFAULT_PROFILE_ID);
          }
        }

        if (cancelled) return;

        // Apply the snapshot before announcing — modules see correct state in
        // any 'profile:loaded' handler that fires synchronously below.
        core.resetAll();
        core.deserializeAll(snapshot.state);

        setActiveProfileId(resolvedId);
        writeActiveId(gridId, resolvedId);
        core.eventBus.emit('profile:loaded', { gridId, profileId: resolvedId });

        await refreshProfiles();
        setIsLoading(false);

        if (!opts.disableAutoSave) {
          autoSaveRef.current = startAutoSave({
            core,
            store,
            persist: persistSnapshot,
            debounceMs: opts.autoSaveDebounceMs ?? 300,
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[core-v2] profile manager boot failed:', err);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      // Flush any pending write before tearing down the auto-save loop —
      // unmounting mid-edit shouldn't lose the user's last keystroke. The
      // promise is intentionally floated; React's effect cleanup is sync.
      const h = autoSaveRef.current;
      autoSaveRef.current = null;
      if (h) {
        void h.flushNow().finally(() => h.dispose());
      }
    };
    // gridId is the only thing that can semantically change — re-mount the
    // effect on grid changes (rare, but defensible). Other deps are refs or
    // stable identities provided by the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridId]);

  // ─── User-facing API ─────────────────────────────────────────────────────

  const saveActiveProfile = useCallback(async () => {
    // Cancel the debounce and persist now so the explicit save is the next
    // thing to land in the adapter.
    if (autoSaveRef.current) {
      await autoSaveRef.current.flushNow();
    } else {
      await persistSnapshot();
    }
  }, [persistSnapshot]);

  const loadProfile = useCallback(
    async (id: string, options?: { skipFlush?: boolean }) => {
      // Drain any pending auto-save for the *outgoing* profile before we
      // overwrite the in-memory store. Otherwise the next debounce fire would
      // write the new profile's snapshot into the old one's slot.
      //
      // `skipFlush` is used by the delete path — the outgoing profile has
      // just been erased from storage, so flushing would silently re-create
      // it by writing a fresh snapshot under the deleted id.
      if (autoSaveRef.current) {
        if (options?.skipFlush) {
          autoSaveRef.current.cancelScheduled();
        } else {
          await autoSaveRef.current.flushNow();
        }
      }

      const target = await adapter.loadProfile(gridId, id);
      if (!target) {
        throw new Error(`[core-v2] No profile "${id}" exists for grid "${gridId}"`);
      }
      core.resetAll();
      core.deserializeAll(target.state);
      activeIdRef.current = id;
      setActiveProfileId(id);
      writeActiveId(gridId, id);
      core.eventBus.emit('profile:loaded', { gridId, profileId: id });
      await refreshProfiles();
    },
    [adapter, core, gridId, refreshProfiles],
  );

  const createProfile = useCallback(
    async (name: string, createOpts?: { id?: string }): Promise<ProfileMeta> => {
      const id = createOpts?.id ?? generateProfileId(name);
      if (id === RESERVED_DEFAULT_PROFILE_ID) {
        throw new Error(
          `[core-v2] Cannot use reserved id "${RESERVED_DEFAULT_PROFILE_ID}" for a new profile`,
        );
      }

      // Flush any pending auto-save for the OUTGOING profile first so we
      // don't lose un-persisted edits to it when we reset the in-memory
      // store below. (Same drain pattern loadProfile uses.)
      if (autoSaveRef.current) {
        await autoSaveRef.current.flushNow();
      }

      // New profiles start from a true blank slate — reset every module to
      // its `getInitialState()` BEFORE snapshotting so the saved state for
      // the new profile does NOT inherit filters / rules / column layout /
      // conditional-styling / column-groups / etc. from whatever profile
      // was previously active. Only the row data (owned by the host app,
      // not any module) carries over.
      //
      // Emitting `profile:loaded` after the reset lets modules with
      // side-effectful restore logic — grid-state in particular — push
      // the reset through to the live grid (clearing sort/filter/column
      // order that AG-Grid owns natively, which a module-state reset
      // alone can't touch).
      core.resetAll();

      const now = Date.now();
      const snap: ProfileSnapshot = {
        id,
        gridId,
        name: name.trim() || id,
        state: core.serializeAll(),
        createdAt: now,
        updatedAt: now,
      };
      await adapter.saveProfile(snap);
      activeIdRef.current = id;
      setActiveProfileId(id);
      writeActiveId(gridId, id);
      core.eventBus.emit('profile:saved', { gridId, profileId: id });
      core.eventBus.emit('profile:loaded', { gridId, profileId: id });
      await refreshProfiles();
      return toMeta(snap);
    },
    [adapter, core, gridId, refreshProfiles],
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      if (id === RESERVED_DEFAULT_PROFILE_ID) return; // can't delete Default

      // Cancel any pending debounced auto-save BEFORE we erase the record.
      // Without this, a debounce that was scheduled moments ago will fire
      // after the delete lands — `persistSnapshot` reads the still-active
      // outgoing-profile id and writes a fresh snapshot under it, silently
      // recreating the profile the user just deleted.
      autoSaveRef.current?.cancelScheduled();

      await adapter.deleteProfile(gridId, id);
      core.eventBus.emit('profile:deleted', { gridId, profileId: id });

      // If the deleted profile was active, fall back to Default. Pass
      // `skipFlush` so `loadProfile` doesn't flush the auto-save buffer
      // (which would also recreate the profile — same race as above).
      if (activeIdRef.current === id) {
        await loadProfile(RESERVED_DEFAULT_PROFILE_ID, { skipFlush: true });
      } else {
        await refreshProfiles();
      }
    },
    [adapter, core, gridId, loadProfile, refreshProfiles],
  );

  const renameProfile = useCallback(
    async (id: string, name: string) => {
      if (id === RESERVED_DEFAULT_PROFILE_ID) {
        throw new Error('[core-v2] Cannot rename the Default profile');
      }
      const existing = await adapter.loadProfile(gridId, id);
      if (!existing) return;
      await adapter.saveProfile({ ...existing, name: name.trim() || id, updatedAt: Date.now() });
      await refreshProfiles();
    },
    [adapter, gridId, refreshProfiles],
  );

  /**
   * Snapshot a profile (or the active one) as a portable JSON payload. The
   * payload is versioned (`schemaVersion: 1`) so future consumers can migrate
   * older exports if the shape ever changes. The payload includes the module
   * state verbatim — each module's own `schemaVersion` + `data` envelope
   * travels along, so importing into a future build runs the same migration
   * path a live snapshot would.
   */
  const exportProfile = useCallback(
    async (id?: string): Promise<ExportedProfilePayload> => {
      const targetId = id ?? activeIdRef.current;
      // Pending debounce first — otherwise we could export a stale snapshot.
      await autoSaveRef.current?.flushNow?.();
      const snap = await adapter.loadProfile(gridId, targetId);
      if (!snap) throw new Error(`[core-v2] No profile with id "${targetId}" to export`);
      return {
        schemaVersion: 1,
        kind: 'gc-profile',
        exportedAt: new Date().toISOString(),
        profile: {
          name: snap.name,
          gridId: snap.gridId,
          state: snap.state,
        },
      };
    },
    [adapter, gridId],
  );

  /**
   * Import a previously-exported profile payload. Creates a new profile row
   * (never overwrites — uses the provided `name` or falls back to the
   * payload's own name with a "(imported)" suffix on collision). Activates
   * the new profile after writing.
   *
   * Strict shape validation: any missing or wrong-typed field throws so the
   * user sees a clear error message instead of silently writing a broken
   * profile the grid then fails to render.
   */
  const importProfile = useCallback(
    async (
      payload: unknown,
      options?: { name?: string; activate?: boolean },
    ): Promise<ProfileMeta> => {
      const parsed = validateExportedPayload(payload);
      // Resolve a unique id/name so imports are always additive.
      const existing = await adapter.listProfiles(gridId);
      const existingIds = new Set(existing.map((p) => p.id));
      const existingNames = new Set(existing.map((p) => p.name.toLowerCase()));

      let name = options?.name?.trim() || parsed.profile.name || 'Imported profile';
      if (existingNames.has(name.toLowerCase())) {
        let suffix = 2;
        while (existingNames.has(`${name} (imported ${suffix})`.toLowerCase())) suffix++;
        name = `${name} (imported ${suffix})`;
      }

      const baseId = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || `imported-${Date.now().toString(36)}`;
      let id = baseId;
      let counter = 2;
      while (existingIds.has(id) || id === RESERVED_DEFAULT_PROFILE_ID) {
        id = `${baseId}-${counter++}`;
      }

      const now = Date.now();
      const snap: ProfileSnapshot = {
        id,
        gridId,
        name,
        state: parsed.profile.state,
        createdAt: now,
        updatedAt: now,
      };
      await adapter.saveProfile(snap);
      core.eventBus.emit('profile:saved', { gridId, profileId: id });
      await refreshProfiles();

      if (options?.activate !== false) {
        // Deserialize and mark active so the grid reflects the new profile.
        core.deserializeAll(snap.state);
        activeIdRef.current = id;
        setActiveProfileId(id);
        writeActiveId(gridId, id);
        core.eventBus.emit('profile:loaded', { gridId, profileId: id });
      }

      return toMeta(snap);
    },
    [adapter, core, gridId, refreshProfiles],
  );

  return {
    activeProfileId,
    profiles,
    isLoading,
    loadProfile,
    saveActiveProfile,
    createProfile,
    deleteProfile,
    renameProfile,
    exportProfile,
    importProfile,
  };
}

// ─── Export payload schema ──────────────────────────────────────────────────

export interface ExportedProfilePayload {
  /** Payload schema version. Bump on breaking shape changes. */
  schemaVersion: 1;
  /** Discriminator — enables quick "is this a gc-profile export?" checks
   *  before attempting to parse the rest. */
  kind: 'gc-profile';
  /** ISO-8601 timestamp. Informational — not used for sorting / conflict
   *  resolution on import. */
  exportedAt: string;
  /** The actual profile body. */
  profile: {
    name: string;
    gridId: string;
    state: Record<string, SerializedState>;
  };
}

/**
 * Runtime validation of an imported payload. Throws with a human-readable
 * message when the shape doesn't match. Called by `importProfile` before
 * writing anything to storage so a malformed file can't corrupt an existing
 * profile list.
 */
function validateExportedPayload(raw: unknown): ExportedProfilePayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('[core-v2] Import payload is not an object');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.kind !== 'gc-profile') {
    throw new Error('[core-v2] Import payload is not a gc-profile export (kind mismatch)');
  }
  if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion < 1) {
    throw new Error('[core-v2] Import payload has an unsupported schemaVersion');
  }
  const profile = obj.profile as Record<string, unknown> | undefined;
  if (!profile || typeof profile !== 'object') {
    throw new Error('[core-v2] Import payload is missing `profile`');
  }
  if (typeof profile.name !== 'string' || !profile.name.trim()) {
    throw new Error('[core-v2] Import payload is missing `profile.name`');
  }
  if (typeof profile.gridId !== 'string') {
    throw new Error('[core-v2] Import payload is missing `profile.gridId`');
  }
  if (!profile.state || typeof profile.state !== 'object') {
    throw new Error('[core-v2] Import payload is missing `profile.state`');
  }
  return {
    schemaVersion: 1,
    kind: 'gc-profile',
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    profile: {
      name: profile.name.trim(),
      gridId: profile.gridId,
      state: profile.state as Record<string, SerializedState>,
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const readActiveId = (gridId: string): string | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(activeProfileKey(gridId));
  } catch {
    return null;
  }
};

const writeActiveId = (gridId: string, id: string): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(activeProfileKey(gridId), id);
  } catch {
    /* quota / private mode — best-effort persistence */
  }
};

const toMeta = (p: ProfileSnapshot): ProfileMeta => ({
  id: p.id,
  name: p.name,
  updatedAt: p.updatedAt,
  isDefault: p.id === RESERVED_DEFAULT_PROFILE_ID,
});

const toMetaList = (list: ProfileSnapshot[]): ProfileMeta[] =>
  list
    .map(toMeta)
    // Default first; otherwise sort by display name (case-insensitive).
    .sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

const generateProfileId = (name: string): string => {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  // Suffix with a short random tag so two profiles named "Trades" don't collide.
  const suffix = Math.random().toString(36).slice(2, 8);
  return base ? `${base}-${suffix}` : `profile-${suffix}`;
};
