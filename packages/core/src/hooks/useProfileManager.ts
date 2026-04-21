import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { StorageAdapter } from '../persistence/StorageAdapter';
import {
  ProfileManager,
  type ProfileManagerOptions,
  type ProfileManagerState,
} from '../profiles/ProfileManager';
import type { ExportedProfilePayload, ProfileMeta } from '../profiles/types';
import { useGridPlatform } from './GridProvider';
import type { GridPlatform } from '../platform/GridPlatform';

export interface UseProfileManagerResult {
  activeProfileId: string;
  profiles: ProfileMeta[];
  isLoading: boolean;
  /** True when the live store has diverged from the last successful
   *  persist of the active profile. Drives the dirty-dot indicator on
   *  the Save button + triggers the unsaved-changes confirm flow on
   *  profile switch and page unload. */
  isDirty: boolean;
  loadProfile: (id: string) => Promise<void>;
  saveActiveProfile: () => Promise<void>;
  /** Throw away in-memory changes and reload the active profile from
   *  disk. Used by the Discard branch of the unsaved-changes prompt. */
  discardActiveProfile: () => Promise<void>;
  createProfile: (name: string, opts?: { id?: string }) => Promise<ProfileMeta>;
  /** Duplicate an existing profile into a new one under `name`.
   *  Activates the clone immediately. If `sourceId` is the active
   *  profile, captures the live (possibly-dirty) state so the clone
   *  reflects what the user currently sees. */
  cloneProfile: (sourceId: string, name: string, opts?: { id?: string }) => Promise<ProfileMeta>;
  deleteProfile: (id: string) => Promise<void>;
  renameProfile: (id: string, name: string) => Promise<void>;
  exportProfile: (id?: string) => Promise<ExportedProfilePayload>;
  importProfile: (
    payload: unknown,
    options?: { name?: string; activate?: boolean },
  ) => Promise<ProfileMeta>;
}

/**
 * Per-platform singleton map — one `ProfileManager` lives for the platform
 * instance's lifetime. React 19 StrictMode fires a synthetic unmount+remount
 * on the initial mount; naïve `managerRef.current = null` + `dispose()` in
 * the useEffect cleanup would build a fresh manager on every simulated
 * remount, leaving zombie auto-save subscriptions on the shared store and
 * orphaning the listener binding React holds.
 *
 * Keying off the platform (which already survives StrictMode via
 * useGridHost's fix) ensures a single manager per grid, initialised lazily
 * on first hook call and disposed when the platform is destroyed — not
 * when React decides to run a second mount pass.
 */
const MANAGERS_BY_PLATFORM = new WeakMap<GridPlatform, ProfileManager>();

function getOrCreateManager(opts: ProfileManagerOptions): ProfileManager {
  const existing = MANAGERS_BY_PLATFORM.get(opts.platform);
  if (existing) return existing;
  const manager = new ProfileManager(opts);
  MANAGERS_BY_PLATFORM.set(opts.platform, manager);
  // Dispose when the platform tears down — the real teardown, not the
  // StrictMode simulated one.
  opts.platform.events.on('grid:destroyed', () => {
    manager.dispose();
    MANAGERS_BY_PLATFORM.delete(opts.platform);
  });
  // Boot once. Subsequent hook callers return the same (already-booted)
  // manager.
  void manager.boot();
  return manager;
}

/**
 * Thin React binding over `ProfileManager`. The class is the source of
 * truth; this hook exposes a React-shaped state via `useSyncExternalStore`
 * (prevents tearing under concurrent rendering) + a stable callbacks
 * surface. Angular ships its own binding.
 */
export function useProfileManager(opts: {
  adapter: StorageAdapter;
  autoSaveDebounceMs?: number;
  disableAutoSave?: boolean;
}): UseProfileManagerResult {
  const platform = useGridPlatform();

  // Keep the FIRST options seen — the manager is a per-platform singleton;
  // passing different options on re-renders can't rebuild the manager
  // without a grid remount, so we snapshot the initial values.
  const optsRef = useRef(opts);
  const manager = getOrCreateManager({
    platform,
    adapter: optsRef.current.adapter,
    autoSaveDebounceMs: optsRef.current.autoSaveDebounceMs,
    disableAutoSave: optsRef.current.disableAutoSave,
  });

  // Subscribe via useSyncExternalStore for tear-free concurrent reads. The
  // subscribe fn adds a listener to the manager; React uses getSnapshot to
  // read the current state. No useEffect cleanup race: when the component
  // unmounts for real, React removes the subscription cleanly.
  const subscribe = useCallback(
    (onChange: () => void) => manager.subscribe(() => onChange()),
    [manager],
  );
  const getSnapshot = useCallback(
    (): ProfileManagerState => manager.getState(),
    [manager],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const loadProfile = useCallback((id: string) => manager.load(id), [manager]);
  const saveActiveProfile = useCallback(() => manager.save(), [manager]);
  const discardActiveProfile = useCallback(() => manager.discard(), [manager]);
  const createProfile = useCallback(
    (name: string, o?: { id?: string }) => manager.create(name, o),
    [manager],
  );
  const cloneProfile = useCallback(
    (sourceId: string, name: string, o?: { id?: string }) => manager.clone(sourceId, name, o),
    [manager],
  );
  const deleteProfile = useCallback((id: string) => manager.remove(id), [manager]);
  const renameProfile = useCallback(
    (id: string, name: string) => manager.rename(id, name),
    [manager],
  );
  const exportProfile = useCallback((id?: string) => manager.export(id), [manager]);
  const importProfile = useCallback(
    (payload: unknown, o?: { name?: string; activate?: boolean }) => manager.import(payload, o),
    [manager],
  );

  return {
    activeProfileId: state.activeId,
    profiles: state.profiles,
    isLoading: state.isLoading,
    isDirty: state.isDirty,
    loadProfile,
    saveActiveProfile,
    discardActiveProfile,
    createProfile,
    cloneProfile,
    deleteProfile,
    renameProfile,
    exportProfile,
    importProfile,
  };
}
