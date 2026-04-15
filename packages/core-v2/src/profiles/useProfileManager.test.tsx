import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { GridCore } from '../core/GridCore';
import { createGridStore } from '../store/createGridStore';
import { MemoryAdapter } from '../persistence/MemoryAdapter';
import {
  RESERVED_DEFAULT_PROFILE_ID,
  activeProfileKey,
} from '../persistence/StorageAdapter';
import { useProfileManager } from './useProfileManager';
import type { Module } from '../core/types';

interface CounterState { value: number }

const counter: Module<CounterState> = {
  id: 'counter',
  name: 'counter',
  schemaVersion: 1,
  priority: 100,
  getInitialState: () => ({ value: 0 }),
  serialize: (s) => s,
  deserialize: (raw) =>
    raw && typeof raw === 'object' && 'value' in raw
      ? { value: Number((raw as { value: unknown }).value) || 0 }
      : { value: 0 },
};

function bootHarness(opts?: { gridId?: string; disableAutoSave?: boolean; debounceMs?: number }) {
  const gridId = opts?.gridId ?? 'g1';
  const adapter = new MemoryAdapter();
  const store = createGridStore({ gridId, modules: [counter] });
  const core = new GridCore({
    gridId,
    modules: [counter],
    getModuleState: <T,>(id: string) => store.getModuleState<T>(id),
    setModuleState: <T,>(id: string, u: (prev: T) => T) => store.setModuleState<T>(id, u),
  });
  return { gridId, adapter, store, core };
}

/**
 * The profile-manager boot effect chains multiple async awaits (migrate →
 * load Default → load active → deserialize → refreshProfiles). Under fake
 * timers we can't use RTL's waitFor (it relies on real time). Flush the
 * microtask queue inside act() until the hook reports !isLoading.
 */
async function flushBoot(result: { current: { isLoading: boolean } }) {
  await act(async () => {
    for (let i = 0; i < 50 && result.current.isLoading; i++) {
      await Promise.resolve();
    }
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('useProfileManager — initial mount', () => {
  it('creates Default and selects it on first ever mount', async () => {
    const { gridId, adapter, store, core } = bootHarness({ disableAutoSave: true });
    const { result } = renderHook(() =>
      useProfileManager({ gridId, adapter, store, core, disableAutoSave: true }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activeProfileId).toBe(RESERVED_DEFAULT_PROFILE_ID);
    expect(result.current.profiles.map((p) => p.id)).toEqual([RESERVED_DEFAULT_PROFILE_ID]);
    expect(result.current.profiles[0].isDefault).toBe(true);
    // localStorage active pointer is written.
    expect(localStorage.getItem(activeProfileKey(gridId))).toBe(RESERVED_DEFAULT_PROFILE_ID);
  });

  it('resolves the active id from localStorage when it points at a real profile', async () => {
    const { gridId, adapter, store, core } = bootHarness({ disableAutoSave: true });
    // Pre-seed: Default + a "trades" profile, with active = trades.
    const now = Date.now();
    await adapter.saveProfile({
      id: RESERVED_DEFAULT_PROFILE_ID,
      gridId,
      name: 'Default',
      state: {},
      createdAt: now,
      updatedAt: now,
    });
    await adapter.saveProfile({
      id: 'trades',
      gridId,
      name: 'Trades',
      state: { counter: { v: 1, data: { value: 42 } } },
      createdAt: now,
      updatedAt: now,
    });
    localStorage.setItem(activeProfileKey(gridId), 'trades');

    const { result } = renderHook(() =>
      useProfileManager({ gridId, adapter, store, core, disableAutoSave: true }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activeProfileId).toBe('trades');
    expect(store.getModuleState<CounterState>('counter')).toEqual({ value: 42 });
  });

  it('falls back to Default when the localStorage pointer is stale', async () => {
    const { gridId, adapter, store, core } = bootHarness({ disableAutoSave: true });
    localStorage.setItem(activeProfileKey(gridId), 'ghost');

    const { result } = renderHook(() =>
      useProfileManager({ gridId, adapter, store, core, disableAutoSave: true }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activeProfileId).toBe(RESERVED_DEFAULT_PROFILE_ID);
    // Stale pointer was rewritten to Default.
    expect(localStorage.getItem(activeProfileKey(gridId))).toBe(RESERVED_DEFAULT_PROFILE_ID);
  });

  it('migrates legacy gc-state into Default and applies it', async () => {
    const { gridId, adapter, store, core } = bootHarness({ disableAutoSave: true });
    localStorage.setItem(
      `gc-state:${gridId}`,
      JSON.stringify({ counter: { v: 1, data: { value: 17 } } }),
    );

    const { result } = renderHook(() =>
      useProfileManager({ gridId, adapter, store, core, disableAutoSave: true }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activeProfileId).toBe(RESERVED_DEFAULT_PROFILE_ID);
    expect(store.getModuleState<CounterState>('counter')).toEqual({ value: 17 });
    expect(localStorage.getItem(`gc-state:${gridId}`)).toBeNull();
  });
});

describe('useProfileManager — CRUD', () => {
  it('createProfile snapshots the current store state and switches to the new profile', async () => {
    const { gridId, adapter, store, core } = bootHarness();
    const { result } = renderHook(() =>
      useProfileManager({ gridId, adapter, store, core, disableAutoSave: true }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => store.setModuleState<CounterState>('counter', () => ({ value: 99 })));

    let created!: { id: string };
    await act(async () => {
      created = await result.current.createProfile('My Profile');
    });

    expect(result.current.activeProfileId).toBe(created.id);
    const persisted = await adapter.loadProfile(gridId, created.id);
    expect(persisted!.state).toEqual({ counter: { v: 1, data: { value: 99 } } });
    expect(persisted!.name).toBe('My Profile');
  });

  it('createProfile rejects the reserved Default id', async () => {
    const { gridId, adapter, store, core } = bootHarness();
    const { result } = renderHook(() =>
      useProfileManager({ gridId, adapter, store, core, disableAutoSave: true }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.createProfile('boom', { id: RESERVED_DEFAULT_PROFILE_ID });
      }),
    ).rejects.toThrow(/reserved id/);
  });

  it('deleteProfile of the active profile falls back to Default', async () => {
    const { gridId, adapter, store, core } = bootHarness();
    const { result } = renderHook(() =>
      useProfileManager({ gridId, adapter, store, core, disableAutoSave: true }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let created!: { id: string };
    await act(async () => { created = await result.current.createProfile('temp'); });
    expect(result.current.activeProfileId).toBe(created.id);

    await act(async () => { await result.current.deleteProfile(created.id); });
    expect(result.current.activeProfileId).toBe(RESERVED_DEFAULT_PROFILE_ID);
    expect(await adapter.loadProfile(gridId, created.id)).toBeNull();
  });

  it('deleteProfile of Default is a silent no-op (Default cannot be deleted)', async () => {
    const { gridId, adapter, store, core } = bootHarness();
    const { result } = renderHook(() =>
      useProfileManager({ gridId, adapter, store, core, disableAutoSave: true }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.deleteProfile(RESERVED_DEFAULT_PROFILE_ID); });
    expect(await adapter.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID)).not.toBeNull();
  });

  it('renameProfile updates the display name and rejects on Default', async () => {
    const { gridId, adapter, store, core } = bootHarness();
    const { result } = renderHook(() =>
      useProfileManager({ gridId, adapter, store, core, disableAutoSave: true }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let created!: { id: string };
    await act(async () => { created = await result.current.createProfile('original'); });
    await act(async () => { await result.current.renameProfile(created.id, 'renamed'); });

    const reloaded = await adapter.loadProfile(gridId, created.id);
    expect(reloaded!.name).toBe('renamed');

    await expect(
      act(async () => { await result.current.renameProfile(RESERVED_DEFAULT_PROFILE_ID, 'oops'); }),
    ).rejects.toThrow(/Cannot rename the Default profile/);
  });
});

describe('useProfileManager — auto-save', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('persists store changes into the active profile after the debounce', async () => {
    const { gridId, adapter, store, core } = bootHarness();
    const { result } = renderHook(() =>
      useProfileManager({ gridId, adapter, store, core, autoSaveDebounceMs: 100 }),
    );

    // Wait for the boot effect to settle without spinning fake timers.
    await flushBoot(result);

    act(() => store.setModuleState<CounterState>('counter', () => ({ value: 5 })));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    const def = await adapter.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID);
    expect(def!.state).toEqual({ counter: { v: 1, data: { value: 5 } } });
  });

  it('saveActiveProfile() flushes the auto-save debounce immediately', async () => {
    const { gridId, adapter, store, core } = bootHarness();
    const { result } = renderHook(() =>
      useProfileManager({ gridId, adapter, store, core, autoSaveDebounceMs: 5_000 }),
    );
    await flushBoot(result);

    act(() => store.setModuleState<CounterState>('counter', () => ({ value: 7 })));
    // Without flush, debounce hasn't fired.
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    let def = await adapter.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID);
    expect(def!.state).toEqual({});

    await act(async () => { await result.current.saveActiveProfile(); });
    def = await adapter.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID);
    expect(def!.state).toEqual({ counter: { v: 1, data: { value: 7 } } });
  });
});

describe('useProfileManager — loadProfile', () => {
  it('flushes pending edits to the outgoing profile before applying the new one', async () => {
    vi.useFakeTimers();
    try {
      const { gridId, adapter, store, core } = bootHarness();
      // Pre-seed a target profile so loadProfile has something to switch to.
      const now = Date.now();
      await adapter.saveProfile({
        id: 'target',
        gridId,
        name: 'Target',
        state: { counter: { v: 1, data: { value: 1000 } } },
        createdAt: now,
        updatedAt: now,
      });

      const { result } = renderHook(() =>
        useProfileManager({ gridId, adapter, store, core, autoSaveDebounceMs: 5_000 }),
      );
      await flushBoot(result);

      // Mutate the live store on Default; auto-save is debounced so it hasn't
      // fired yet. Switching profiles must flush this edit into Default.
      act(() => store.setModuleState<CounterState>('counter', () => ({ value: 50 })));

      await act(async () => { await result.current.loadProfile('target'); });

      const defAfter = await adapter.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID);
      expect(defAfter!.state).toEqual({ counter: { v: 1, data: { value: 50 } } });
      // And the new profile is now applied to the store.
      expect(store.getModuleState<CounterState>('counter')).toEqual({ value: 1000 });
      expect(result.current.activeProfileId).toBe('target');
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws when loading an unknown profile id', async () => {
    const { gridId, adapter, store, core } = bootHarness();
    const { result } = renderHook(() =>
      useProfileManager({ gridId, adapter, store, core, disableAutoSave: true }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => { await result.current.loadProfile('nope'); }),
    ).rejects.toThrow(/No profile "nope"/);
  });
});
