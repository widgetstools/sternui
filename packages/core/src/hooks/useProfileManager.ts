import { useCallback, useEffect, useRef, useState } from 'react';
import type { StorageAdapter } from '../persistence/StorageAdapter';
import {
  ProfileManager,
  type ProfileManagerOptions,
  type ProfileManagerState,
} from '../profiles/ProfileManager';
import type { ExportedProfilePayload, ProfileMeta } from '../profiles/types';
import { useGridPlatform } from './GridProvider';

export interface UseProfileManagerResult {
  activeProfileId: string;
  profiles: ProfileMeta[];
  isLoading: boolean;
  loadProfile: (id: string) => Promise<void>;
  saveActiveProfile: () => Promise<void>;
  createProfile: (name: string, opts?: { id?: string }) => Promise<ProfileMeta>;
  deleteProfile: (id: string) => Promise<void>;
  renameProfile: (id: string, name: string) => Promise<void>;
  exportProfile: (id?: string) => Promise<ExportedProfilePayload>;
  importProfile: (
    payload: unknown,
    options?: { name?: string; activate?: boolean },
  ) => Promise<ProfileMeta>;
}

/**
 * Thin React binding over `ProfileManager`. The class is the source of
 * truth; this hook exposes a React-shaped state + a stable callbacks
 * surface. Angular ships its own binding.
 */
export function useProfileManager(opts: {
  adapter: StorageAdapter;
  autoSaveDebounceMs?: number;
  disableAutoSave?: boolean;
}): UseProfileManagerResult {
  const platform = useGridPlatform();

  const managerRef = useRef<ProfileManager | null>(null);
  if (!managerRef.current) {
    const managerOpts: ProfileManagerOptions = {
      platform,
      adapter: opts.adapter,
      autoSaveDebounceMs: opts.autoSaveDebounceMs,
      disableAutoSave: opts.disableAutoSave,
    };
    managerRef.current = new ProfileManager(managerOpts);
  }
  const manager = managerRef.current;

  const [state, setState] = useState<ProfileManagerState>(manager.getState());

  useEffect(() => {
    const unsubscribe = manager.subscribe((s) => setState(s));
    void manager.boot();
    return () => {
      unsubscribe();
      manager.dispose();
      managerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProfile = useCallback((id: string) => manager.load(id), [manager]);
  const saveActiveProfile = useCallback(() => manager.save(), [manager]);
  const createProfile = useCallback(
    (name: string, o?: { id?: string }) => manager.create(name, o),
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
    loadProfile,
    saveActiveProfile,
    createProfile,
    deleteProfile,
    renameProfile,
    exportProfile,
    importProfile,
  };
}
