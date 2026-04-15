import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useProfileManager,
  RESERVED_DEFAULT_PROFILE_ID,
  RESERVED_DEFAULT_PROFILE_NAME,
  isReservedDefaultProfile,
} from './useProfileManager';
import { LocalStorageAdapter } from '../persistence/LocalStorageAdapter';
import { createGridStore, destroyGridStore } from '../stores/createGridStore';
import { savedFiltersModule } from '../modules/saved-filters';
import { toolbarVisibilityModule } from '../modules/toolbar-visibility';
import type { GridCustomizerCore } from '../core/GridCustomizerCore';
import { EventBus } from '../core/EventBus';

/**
 * Lightweight stand-in for `GridCustomizerCore` used by `useProfileManager`.
 * The hook only touches: `serializeAll()`, `deserializeAll()`, `getGridApi()`,
 * and `eventBus.emit()` — so we can avoid the full AG-Grid bootstrap.
 */
function makeFakeCore(initialModuleStates: Record<string, unknown> = {}): GridCustomizerCore {
  const eventBus = new EventBus();
  let lastDeserialized: Record<string, unknown> | null = null;
  const fake = {
    eventBus,
    getGridApi: () => null,
    serializeAll: vi.fn(() => ({ ...initialModuleStates })),
    deserializeAll: vi.fn((data: Record<string, unknown>) => {
      lastDeserialized = data;
    }),
    // Hook never reads these but keep the type happy.
    get _lastDeserialized() { return lastDeserialized; },
  } as unknown as GridCustomizerCore;
  return fake;
}

describe('useProfileManager — Default-profile behaviors', () => {
  // Each test gets its own gridId so the store cache (keyed by gridId) doesn't
  // bleed state across tests.
  let gridId: string;

  beforeEach(() => {
    gridId = `test-grid-${Math.random().toString(36).slice(2, 8)}`;
  });

  describe('isReservedDefaultProfile', () => {
    it('matches only the reserved id', () => {
      expect(isReservedDefaultProfile(RESERVED_DEFAULT_PROFILE_ID)).toBe(true);
      expect(isReservedDefaultProfile('__default__')).toBe(true);
      expect(isReservedDefaultProfile('user-profile-1')).toBe(false);
      expect(isReservedDefaultProfile('')).toBe(false);
      expect(isReservedDefaultProfile(null)).toBe(false);
      expect(isReservedDefaultProfile(undefined)).toBe(false);
    });
  });

  describe('auto-seed on mount', () => {
    it('creates the Default profile when none exists', async () => {
      const storage = new LocalStorageAdapter();
      const store = createGridStore(gridId, [savedFiltersModule, toolbarVisibilityModule]);
      const core = makeFakeCore({ 'saved-filters': { filters: [] } });

      const { result } = renderHook(() =>
        useProfileManager({ gridId, core, store, storage }),
      );

      // Initial render → refresh → ensureDefaultProfile → list reflects it
      await waitFor(() => {
        expect(result.current.profiles).toHaveLength(1);
      });

      const seeded = result.current.profiles[0];
      expect(seeded.id).toBe(RESERVED_DEFAULT_PROFILE_ID);
      expect(seeded.name).toBe(RESERVED_DEFAULT_PROFILE_NAME);
      // ProfileMeta carries description through from the stored snapshot.
      expect(seeded.description).toBe('Built-in default profile (cannot be deleted)');
      // The full snapshot is also persisted via the storage adapter:
      const snap = await storage.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID);
      expect(snap?.description).toBe('Built-in default profile (cannot be deleted)');

      destroyGridStore(gridId);
    });

    it('is idempotent — re-mounting does NOT overwrite an existing Default', async () => {
      const storage = new LocalStorageAdapter();
      const store = createGridStore(gridId, [savedFiltersModule]);
      const core = makeFakeCore();

      // First mount → seeds Default
      const first = renderHook(() =>
        useProfileManager({ gridId, core, store, storage }),
      );
      await waitFor(() => expect(first.result.current.profiles).toHaveLength(1));
      const firstSnap = await storage.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID);
      expect(firstSnap).toBeTruthy();
      const firstCreatedAt = firstSnap!.createdAt;

      first.unmount();

      // Second mount → must NOT create a fresh Default (createdAt unchanged)
      const second = renderHook(() =>
        useProfileManager({ gridId, core, store, storage }),
      );
      await waitFor(() => expect(second.result.current.profiles).toHaveLength(1));
      const secondSnap = await storage.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID);
      expect(secondSnap?.createdAt).toBe(firstCreatedAt);

      destroyGridStore(gridId);
    });

    it('coexists with user profiles — Default is one of N', async () => {
      const storage = new LocalStorageAdapter();
      const store = createGridStore(gridId, [savedFiltersModule]);
      const core = makeFakeCore();

      const { result } = renderHook(() =>
        useProfileManager({ gridId, core, store, storage }),
      );
      await waitFor(() => expect(result.current.profiles).toHaveLength(1));

      await act(async () => {
        await result.current.save('User Profile A');
      });
      await waitFor(() => expect(result.current.profiles).toHaveLength(2));

      const ids = result.current.profiles.map((p) => p.id);
      expect(ids).toContain(RESERVED_DEFAULT_PROFILE_ID);
      expect(ids.some((id) => id !== RESERVED_DEFAULT_PROFILE_ID)).toBe(true);

      destroyGridStore(gridId);
    });
  });

  describe('delete protection', () => {
    it('silently no-ops when remove() is called with the reserved Default id', async () => {
      const storage = new LocalStorageAdapter();
      const store = createGridStore(gridId, [savedFiltersModule]);
      const core = makeFakeCore();

      const { result } = renderHook(() =>
        useProfileManager({ gridId, core, store, storage }),
      );
      await waitFor(() => expect(result.current.profiles).toHaveLength(1));

      // Spy on storage.deleteProfile to make sure it is NEVER called for Default
      const deleteSpy = vi.spyOn(storage, 'deleteProfile');

      await act(async () => {
        await result.current.remove(RESERVED_DEFAULT_PROFILE_ID);
      });

      expect(deleteSpy).not.toHaveBeenCalled();
      // Default still in the list
      expect(result.current.profiles.find((p) => p.id === RESERVED_DEFAULT_PROFILE_ID)).toBeTruthy();

      destroyGridStore(gridId);
    });
  });

  describe('fallback after deletion of active user profile', () => {
    it('falls back to the built-in Default when the active profile is deleted', async () => {
      const storage = new LocalStorageAdapter();
      const store = createGridStore(gridId, [savedFiltersModule]);
      const core = makeFakeCore();

      const { result } = renderHook(() =>
        useProfileManager({ gridId, core, store, storage }),
      );
      await waitFor(() => expect(result.current.profiles).toHaveLength(1));

      let userProfileId = '';
      await act(async () => {
        userProfileId = await result.current.save('User');
      });
      // Sanity: save() makes it active
      expect(store.getState().activeProfileId).toBe(userProfileId);

      // Delete the active user profile → should fall back to Default
      await act(async () => {
        await result.current.remove(userProfileId);
      });

      expect(store.getState().activeProfileId).toBe(RESERVED_DEFAULT_PROFILE_ID);

      destroyGridStore(gridId);
    });

    it('does NOT change activeProfileId when a non-active profile is deleted', async () => {
      const storage = new LocalStorageAdapter();
      const store = createGridStore(gridId, [savedFiltersModule]);
      const core = makeFakeCore();

      const { result } = renderHook(() =>
        useProfileManager({ gridId, core, store, storage }),
      );
      await waitFor(() => expect(result.current.profiles).toHaveLength(1));

      let pidA = '';
      let pidB = '';
      await act(async () => {
        pidA = await result.current.save('A');
      });
      await act(async () => {
        pidB = await result.current.save('B');
      });
      // After saving B it becomes active
      expect(store.getState().activeProfileId).toBe(pidB);

      // Deleting A (not active) must leave B as active — no Default fallback.
      await act(async () => {
        await result.current.remove(pidA);
      });
      expect(store.getState().activeProfileId).toBe(pidB);

      destroyGridStore(gridId);
    });
  });

  describe('Default profile snapshot integrity', () => {
    it('seeds the Default snapshot using the current core.serializeAll() output', async () => {
      const storage = new LocalStorageAdapter();
      const store = createGridStore(gridId, [savedFiltersModule, toolbarVisibilityModule]);
      const core = makeFakeCore({
        'saved-filters': { filters: [{ id: 'sf_seed', label: 'baseline', filterModel: {}, active: false }] },
        'toolbar-visibility': { visible: { style: true } },
      });

      const { result } = renderHook(() =>
        useProfileManager({ gridId, core, store, storage }),
      );
      await waitFor(() => expect(result.current.profiles).toHaveLength(1));

      const snap = await storage.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID);
      expect(snap).toBeTruthy();
      expect(snap!.modules['saved-filters']).toEqual({
        filters: [{ id: 'sf_seed', label: 'baseline', filterModel: {}, active: false }],
      });
      expect(snap!.modules['toolbar-visibility']).toEqual({ visible: { style: true } });
      expect(snap!.agGridState).toBeNull(); // No grid api in this test

      destroyGridStore(gridId);
    });
  });
});
