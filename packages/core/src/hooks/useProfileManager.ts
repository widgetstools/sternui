import { useCallback, useEffect, useState } from 'react';
import type { ProfileMeta, ProfileSnapshot } from '../types/profile';
import type { StorageAdapter } from '../persistence/StorageAdapter';
import type { GridCustomizerCore } from '../core/GridCustomizerCore';
import type { GridStore } from '../stores/createGridStore';
import { CURRENT_SCHEMA_VERSION } from '../types/profile';

/**
 * Reserved id for the built-in "Default" profile. Every grid is guaranteed to
 * have one of these — it is auto-seeded on first load and protected from
 * deletion. Acts as the always-available fallback when no other profile is
 * active or marked as user-default.
 */
export const RESERVED_DEFAULT_PROFILE_ID = '__default__';
export const RESERVED_DEFAULT_PROFILE_NAME = 'Default';

export function isReservedDefaultProfile(profileId: string | null | undefined): boolean {
  return profileId === RESERVED_DEFAULT_PROFILE_ID;
}

export interface UseProfileManagerOptions {
  gridId: string;
  core: GridCustomizerCore;
  store: GridStore;
  storage: StorageAdapter;
}

export function useProfileManager(options: UseProfileManagerOptions) {
  const { gridId, core, store, storage } = options;
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [loading, setLoading] = useState(false);

  /**
   * Ensure the built-in Default profile exists for this grid. Idempotent —
   * a no-op once seeded. Captures the current (initial) module state at the
   * time of seeding so loading Default returns the user to a clean baseline.
   */
  const ensureDefaultProfile = useCallback(async () => {
    const existing = await storage.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID);
    if (existing) return;
    const moduleStates = core.serializeAll();
    const snapshot: ProfileSnapshot = {
      version: CURRENT_SCHEMA_VERSION,
      gridId,
      name: RESERVED_DEFAULT_PROFILE_NAME,
      description: 'Built-in default profile (cannot be deleted)',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      agGridState: null,
      modules: moduleStates,
    };
    await storage.saveProfile(gridId, RESERVED_DEFAULT_PROFILE_ID, snapshot);
  }, [storage, gridId, core]);

  const refresh = useCallback(async () => {
    await ensureDefaultProfile();
    const list = await storage.listProfiles(gridId);
    setProfiles(list);
  }, [storage, gridId, ensureDefaultProfile]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    async (name: string, description?: string) => {
      setLoading(true);
      try {
        const api = core.getGridApi();
        const agGridState = api ? (api as any).getState?.() ?? null : null;
        const moduleStates = core.serializeAll();

        const profileId = `${gridId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const snapshot: ProfileSnapshot = {
          version: CURRENT_SCHEMA_VERSION,
          gridId,
          name,
          description,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          agGridState,
          modules: moduleStates,
        };

        await storage.saveProfile(gridId, profileId, snapshot);
        store.getState().setActiveProfile(profileId);
        store.getState().setDirty(false);
        core.eventBus.emit('profile:saved', { gridId, profileId });
        await refresh();
        return profileId;
      } finally {
        setLoading(false);
      }
    },
    [gridId, core, store, storage, refresh],
  );

  const load = useCallback(
    async (profileId: string) => {
      setLoading(true);
      try {
        const snapshot = await storage.loadProfile(gridId, profileId);
        if (!snapshot) return;

        core.deserializeAll(snapshot.modules);

        const api = core.getGridApi();
        if (api && snapshot.agGridState && typeof (api as any).setState === 'function') {
          (api as any).setState(snapshot.agGridState);
        }

        store.getState().setActiveProfile(profileId);
        store.getState().setDirty(false);
        core.eventBus.emit('profile:loaded', { gridId, profileId });
        await refresh();
      } finally {
        setLoading(false);
      }
    },
    [gridId, core, store, storage, refresh],
  );

  const remove = useCallback(
    async (profileId: string) => {
      // The built-in Default profile is permanent — silently no-op so callers
      // (UI delete buttons, programmatic cleanup) don't crash.
      if (isReservedDefaultProfile(profileId)) return;
      await storage.deleteProfile(gridId, profileId);
      if (store.getState().activeProfileId === profileId) {
        // Fall back to the always-present Default rather than leaving the user
        // with no profile selected — keeps the grid in a known-good state.
        store.getState().setActiveProfile(RESERVED_DEFAULT_PROFILE_ID);
      }
      core.eventBus.emit('profile:deleted', { gridId, profileId });
      await refresh();
    },
    [gridId, core, store, storage, refresh],
  );

  const setDefault = useCallback(
    async (profileId: string | null) => {
      await storage.setDefault(gridId, profileId);
      store.getState().setDefaultProfile(profileId);
      await refresh();
    },
    [gridId, store, storage, refresh],
  );

  const exportProfile = useCallback(
    async (profileId: string) => {
      return storage.exportProfile(gridId, profileId);
    },
    [storage, gridId],
  );

  const importProfile = useCallback(
    async (json: string) => {
      const profileId = await storage.importProfile(gridId, json);
      await refresh();
      return profileId;
    },
    [storage, gridId, refresh],
  );

  const rename = useCallback(
    async (profileId: string, newName: string) => {
      const snapshot = await storage.loadProfile(gridId, profileId);
      if (!snapshot) return;
      snapshot.name = newName;
      snapshot.updatedAt = Date.now();
      await storage.saveProfile(gridId, profileId, snapshot);
      await refresh();
    },
    [storage, gridId, refresh],
  );

  /**
   * Overwrite an existing profile's snapshot with the current grid state.
   * Used by the global Save button to push live edits into the active profile.
   */
  const update = useCallback(
    async (profileId: string) => {
      setLoading(true);
      try {
        const existing = await storage.loadProfile(gridId, profileId);
        if (!existing) return false;

        const api = core.getGridApi();
        const agGridState = api ? (api as any).getState?.() ?? null : null;
        const moduleStates = core.serializeAll();

        const snapshot: ProfileSnapshot = {
          ...existing,
          updatedAt: Date.now(),
          agGridState,
          modules: moduleStates,
        };

        await storage.saveProfile(gridId, profileId, snapshot);
        store.getState().setDirty(false);
        core.eventBus.emit('profile:saved', { gridId, profileId });
        await refresh();
        return true;
      } finally {
        setLoading(false);
      }
    },
    [gridId, core, store, storage, refresh],
  );

  // ─── Whole-grid operations ──────────────────────────────────────────────

  const exportGridConfig = useCallback(
    async () => storage.exportGridConfig(gridId),
    [storage, gridId],
  );

  const importGridConfig = useCallback(
    async (json: string, asGridId?: string) => {
      const id = await storage.importGridConfig(json, asGridId);
      if (!asGridId || asGridId === gridId) await refresh();
      return id;
    },
    [storage, gridId, refresh],
  );

  const cloneGridConfigTo = useCallback(
    async (destGridId: string) => {
      await storage.cloneGridConfig(gridId, destGridId);
    },
    [storage, gridId],
  );

  return {
    profiles,
    loading,
    save,
    load,
    remove,
    rename,
    setDefault,
    exportProfile,
    importProfile,
    refresh,
    update,
    exportGridConfig,
    importGridConfig,
    cloneGridConfigTo,
  };
}
