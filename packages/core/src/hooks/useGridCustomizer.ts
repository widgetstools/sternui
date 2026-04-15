import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ColDef, ColGroupDef, GridOptions, GridReadyEvent } from 'ag-grid-community';
import type { AnyModule } from '../types/module';
import type { ProfileMeta } from '../types/profile';
import { GridCustomizerCore } from '../core/GridCustomizerCore';
import { createGridStore, destroyGridStore, type GridStore, type GridCustomizerStore } from '../stores/createGridStore';
import { useProfileManager, RESERVED_DEFAULT_PROFILE_ID } from './useProfileManager';
import type { StorageAdapter } from '../persistence/StorageAdapter';
import { setProfilesPanelConfig } from '../modules/profiles/ProfilesPanel';

const LS_PREFIX = 'gc-state:';
const LS_ACTIVE_PROFILE_PREFIX = 'gc-active-profile:';

// A do-nothing StorageAdapter used when no adapter is provided. This lets us
// always call useProfileManager (React rules-of-hooks) while having no I/O.
const NOOP_ADAPTER: StorageAdapter = {
  async saveProfile() { /* noop */ },
  async loadProfile() { return null; },
  async deleteProfile() { /* noop */ },
  async listProfiles() { return []; },
  async getDefault() { return null; },
  async setDefault() { /* noop */ },
  async exportProfile() { return '{}'; },
  async importProfile() { return ''; },
  async loadGridConfig() { return null; },
  async saveGridConfig() { /* noop */ },
  async deleteGridConfig() { /* noop */ },
  async exportGridConfig() { return '{}'; },
  async importGridConfig() { return ''; },
  async cloneGridConfig() { /* noop */ },
};

export interface UseGridCustomizerOptions {
  gridId: string;
  baseColumnDefs: (ColDef | ColGroupDef)[];
  baseGridOptions?: Partial<GridOptions>;
  modules: AnyModule[];
  rowIdField?: string;
  /** Auto-persist module state to localStorage on every apply. Default: true */
  persistState?: boolean;
  /**
   * Optional storage backend enabling the Profiles panel (save / load /
   * export / import multiple named profiles). If omitted, the panel shows
   * its "not configured" empty state.
   */
  storageAdapter?: StorageAdapter;
}

export interface UseGridCustomizerReturn {
  columnDefs: (ColDef | ColGroupDef)[];
  gridOptions: Partial<GridOptions>;
  onGridReady: (event: GridReadyEvent) => void;
  onGridPreDestroyed: () => void;
  core: GridCustomizerCore;
  store: GridStore;
  openSettings: () => void;
  closeSettings: () => void;
  /** Active profile name (null if none). Requires `storageAdapter`. */
  activeProfileName: string | null;
  /** Active profile id (null if none). Requires `storageAdapter`. */
  activeProfileId: string | null;
  /** All profiles persisted for this grid. Empty when `storageAdapter` is omitted. */
  profiles: ProfileMeta[];
  /** True when the consumer passed a `storageAdapter`. */
  hasProfileStorage: boolean;
  /** Save the current state as a new profile. Returns the new id. */
  saveProfile: (name: string, description?: string) => Promise<string | undefined>;
  /** Load (activate) a profile by id. */
  loadProfile: (id: string) => Promise<void>;
  /** Delete a profile by id. */
  deleteProfile: (id: string) => Promise<void>;
  /** Overwrite the active profile's snapshot with the current state. No-op when no profile is active. */
  saveActiveProfile: () => Promise<boolean>;
  /** Serialize this grid's entire config (all profiles + default) as JSON. */
  exportGridConfig: () => Promise<string>;
  /** Import a grid config JSON. Pass `asGridId` to clone it under a different grid id. */
  importGridConfig: (json: string, asGridId?: string) => Promise<string>;
  /** Copy this grid's entire config to a different gridId (overwrites destination). */
  cloneGridConfigTo: (destGridId: string) => Promise<void>;
  /** True if state has changed since the last profile save/load. */
  isDirty: boolean;
}

export function useGridCustomizer(options: UseGridCustomizerOptions): UseGridCustomizerReturn {
  const { gridId, baseColumnDefs, baseGridOptions = {}, modules, rowIdField, persistState = true, storageAdapter } = options;

  const store = useMemo(() => createGridStore(gridId, modules), [gridId, modules]);

  const coreRef = useRef<GridCustomizerCore | null>(null);
  if (!coreRef.current) {
    coreRef.current = new GridCustomizerCore({
      gridId,
      modules,
      getModuleState: store.getState().getModuleState,
      setModuleState: store.getState().setModuleState,
      rowIdField,
    });

    // ── Auto-load persisted state from localStorage on init ──
    if (persistState) {
      try {
        const saved = localStorage.getItem(LS_PREFIX + gridId);
        if (saved) {
          const parsed = JSON.parse(saved) as Record<string, unknown>;
          coreRef.current.deserializeAll(parsed);
        }
      } catch {
        // Ignore corrupt localStorage
      }
    }
  }
  const core = coreRef.current;

  // Keep core's store bindings in sync (React strict mode may recreate the store)
  core.updateStoreBindings(store.getState().getModuleState, store.getState().setModuleState);

  // Subscribe to module state changes to trigger re-render
  const moduleStates = store((s: GridCustomizerStore) => s.modules);

  const columnDefs = useMemo(
    () => core.transformColumnDefs(baseColumnDefs),
    [core, baseColumnDefs, moduleStates],
  );

  const gridOptions = useMemo(
    () => core.transformGridOptions(baseGridOptions),
    [core, baseGridOptions, moduleStates],
  );

  const onGridReady = useCallback(
    (event: GridReadyEvent) => {
      core.onGridReady(event.api);
    },
    [core],
  );

  const onGridPreDestroyed = useCallback(() => {
    core.onGridDestroy();
  }, [core]);

  useEffect(() => {
    return () => {
      core.onGridDestroy();
      destroyGridStore(gridId);
    };
  }, [core, gridId]);

  // Auto-persist removed — styles only save when user explicitly clicks the Save button.
  // The Save button in FormattingToolbar calls core.serializeAll() + localStorage.setItem().

  // ─── Profile manager + panel wiring ─────────────────────────────────────
  // Always call the hook (React rules), but fall back to a no-op adapter when
  // none is provided so the hook is cheap and side-effect-free.
  const adapter = storageAdapter ?? NOOP_ADAPTER;
  const profileManager = useProfileManager({ gridId, core, store, storage: adapter });

  // Subscribe to store so the panel re-renders on activeProfileId changes
  const activeProfileId = store((s: GridCustomizerStore) => s.activeProfileId);

  // Publish config to the panel — only when an adapter was actually provided
  useEffect(() => {
    if (!storageAdapter) {
      setProfilesPanelConfig(gridId, null);
      return;
    }
    const list = profileManager.profiles.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      isDefault: p.isDefault,
    }));
    setProfilesPanelConfig(gridId, {
      profiles: list,
      activeProfileId,
      loading: profileManager.loading,
      onSave: (name, description) => { profileManager.save(name, description); },
      onLoad: (id) => { profileManager.load(id); },
      onDelete: (id) => { profileManager.remove(id); },
      onRename: (id, name) => { profileManager.rename(id, name); },
      onSetDefault: (id) => { profileManager.setDefault(id); },
      onExport: async (id) => {
        try {
          const json = await profileManager.exportProfile(id);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const meta = profileManager.profiles.find((p) => p.id === id);
          const safeName = (meta?.name ?? 'profile').replace(/[^a-z0-9_-]+/gi, '_');
          const a = document.createElement('a');
          a.href = url;
          a.download = `${safeName}.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) { console.error('Profile export failed', err); }
      },
      onImport: (json) => { profileManager.importProfile(json); },
    });
    return () => setProfilesPanelConfig(gridId, null);
  }, [gridId, storageAdapter, profileManager.profiles, activeProfileId, profileManager.loading, profileManager.save, profileManager.load, profileManager.remove, profileManager.rename, profileManager.setDefault, profileManager.exportProfile, profileManager.importProfile]);

  // ─── Persist + auto-restore the last selected profile ─────────────────
  // The active profile id is mirrored to localStorage so a page refresh restores
  // whichever profile the user last loaded. Falls back to the explicit DEFAULT
  // profile when no last-active is recorded yet.
  //
  // Ordering matters:
  //  1. On first mount, the store's `activeProfileId` is null. We must NOT write
  //     that null to localStorage — it would clobber the value we want to read.
  //  2. The profiles list is fetched asynchronously by useProfileManager, so the
  //     auto-load effect waits for `profiles.length > 0` before deciding.
  //  3. Only after the auto-load decision is made do we start mirroring future
  //     `activeProfileId` changes back to localStorage.

  const didAutoLoadRef = useRef(false);

  // Auto-load on first mount (only when adapter provided + profiles list ready)
  useEffect(() => {
    if (!storageAdapter || didAutoLoadRef.current) return;
    if (profileManager.profiles.length === 0) return;

    // 1st preference: the profile that was active when the user last left the app
    let targetId: string | null = null;
    try {
      const stored = localStorage.getItem(LS_ACTIVE_PROFILE_PREFIX + gridId);
      if (stored && profileManager.profiles.some((p) => p.id === stored)) {
        targetId = stored;
      }
    } catch { /* ignore */ }

    // 2nd preference: a profile explicitly marked as DEFAULT (user-marked)
    if (!targetId) {
      const defaultProfile = profileManager.profiles.find((p) => p.isDefault);
      if (defaultProfile) targetId = defaultProfile.id;
    }

    // 3rd preference: the always-present built-in Default profile.
    // useProfileManager auto-seeds this on first load, so it should always
    // be in the list — guarantees the grid never starts with no profile.
    if (!targetId) {
      const builtin = profileManager.profiles.find((p) => p.id === RESERVED_DEFAULT_PROFILE_ID);
      if (builtin) targetId = builtin.id;
    }

    didAutoLoadRef.current = true;
    if (targetId && store.getState().activeProfileId !== targetId) {
      profileManager.load(targetId);
    }
  }, [storageAdapter, gridId, profileManager.profiles, profileManager.load, store]);

  // Persist activeProfileId on every change AFTER auto-load has run.
  // Gating on didAutoLoadRef prevents the initial `null` value from wiping
  // the localStorage entry we need to read in the auto-load effect above.
  useEffect(() => {
    if (!storageAdapter) return;
    if (!didAutoLoadRef.current) return;
    try {
      const key = LS_ACTIVE_PROFILE_PREFIX + gridId;
      if (activeProfileId) localStorage.setItem(key, activeProfileId);
      else localStorage.removeItem(key);
    } catch { /* quota / disabled storage */ }
  }, [storageAdapter, gridId, activeProfileId]);

  const openSettings = useCallback(() => {
    store.getState().setSettingsOpen(true);
  }, [store]);

  const closeSettings = useCallback(() => {
    store.getState().setSettingsOpen(false);
  }, [store]);

  const isDirty = store((s: GridCustomizerStore) => s.isDirty);
  const activeProfileName = useMemo(() => {
    if (!activeProfileId) return null;
    return profileManager.profiles.find((p) => p.id === activeProfileId)?.name ?? null;
  }, [activeProfileId, profileManager.profiles]);

  const saveProfile = useCallback(
    (name: string, description?: string) => profileManager.save(name, description),
    [profileManager],
  );
  const loadProfile = useCallback(
    (id: string) => profileManager.load(id),
    [profileManager],
  );
  const deleteProfile = useCallback(
    (id: string) => profileManager.remove(id),
    [profileManager],
  );
  const saveActiveProfile = useCallback(async () => {
    const id = store.getState().activeProfileId;
    if (!id) return false;
    return profileManager.update(id);
  }, [profileManager, store]);
  const exportGridConfig = useCallback(
    () => profileManager.exportGridConfig(),
    [profileManager],
  );
  const importGridConfig = useCallback(
    (json: string, asGridId?: string) => profileManager.importGridConfig(json, asGridId),
    [profileManager],
  );
  const cloneGridConfigTo = useCallback(
    (destGridId: string) => profileManager.cloneGridConfigTo(destGridId),
    [profileManager],
  );

  return {
    columnDefs,
    gridOptions,
    onGridReady,
    onGridPreDestroyed,
    core,
    store,
    openSettings,
    closeSettings,
    activeProfileName,
    activeProfileId,
    profiles: profileManager.profiles,
    hasProfileStorage: !!storageAdapter,
    saveProfile,
    loadProfile,
    deleteProfile,
    saveActiveProfile,
    exportGridConfig,
    importGridConfig,
    cloneGridConfigTo,
    isDirty,
  };
}
