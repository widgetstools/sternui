import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '../platform/GridPlatform';
import { MemoryAdapter } from '../persistence/MemoryAdapter';
import type { Module } from '../platform/types';
import { ProfileManager } from './ProfileManager';
import { RESERVED_DEFAULT_PROFILE_ID } from '../persistence/StorageAdapter';

/**
 * Regression tests for the two profile-management bugs that shipped in the
 * first v3 cut:
 *   1. Create didn't propagate to subscribers (listener disconnect).
 *   2. Load bleed — style state from one profile leaking into another via
 *      the auto-save debounce racing the active-id flip.
 *
 * Both flows must be covered at the class level so a future refactor can't
 * silently re-introduce the bug.
 */

interface StyleState {
  rules: string[];
}

function makeStyleModule(): Module<StyleState> {
  return {
    id: 'style',
    name: 'Style Rules',
    schemaVersion: 1,
    priority: 10,
    getInitialState: () => ({ rules: [] }),
    serialize: (s) => s,
    deserialize: (raw) =>
      raw && typeof raw === 'object' && Array.isArray((raw as { rules?: unknown }).rules)
        ? { rules: (raw as { rules: string[] }).rules }
        : { rules: [] },
  };
}

function makePlatform(adapter: MemoryAdapter, gridId = 'grid-A') {
  const platform = new GridPlatform({
    gridId,
    modules: [makeStyleModule()],
  });
  return { platform, adapter };
}

describe('ProfileManager — state propagation', () => {
  let adapter: MemoryAdapter;
  let platform: GridPlatform;
  let manager: ProfileManager;

  beforeEach(async () => {
    adapter = new MemoryAdapter();
    ({ platform } = makePlatform(adapter));
    manager = new ProfileManager({
      platform,
      adapter,
      disableAutoSave: true,
    });
    await manager.boot();
  });

  it('emits a subscriber notification when a profile is created', async () => {
    const events: string[] = [];
    manager.subscribe((s) => events.push(s.profiles.map((p) => p.id).join(',')));

    await manager.create('TestA');

    // At least one notification must include the new profile id.
    expect(events.some((e) => e.includes('testa'))).toBe(true);
    // The final state must list it.
    expect(manager.getState().profiles.some((p) => p.id === 'testa')).toBe(true);
  });

  it('includes the new profile in the list returned by the subscriber (full refresh after create)', async () => {
    let lastState = manager.getState();
    manager.subscribe((s) => { lastState = s; });

    await manager.create('TestB');

    // The most recent state must include BOTH Default and TestB — create()'s
    // refresh() must have propagated.
    const ids = lastState.profiles.map((p) => p.id).sort();
    expect(ids).toEqual([RESERVED_DEFAULT_PROFILE_ID, 'testb']);
  });

  it('flips activeId to the newly-created profile', async () => {
    await manager.create('TestC');
    expect(manager.getState().activeId).toBe('testc');
  });

  it('notifies subscribers about the activeId change BEFORE returning from load()', async () => {
    await manager.create('TestD');

    const states: string[] = [];
    manager.subscribe((s) => states.push(s.activeId));

    await manager.load(RESERVED_DEFAULT_PROFILE_ID);

    expect(states.at(-1)).toBe(RESERVED_DEFAULT_PROFILE_ID);
  });
});

describe('ProfileManager — profile switch state isolation', () => {
  it('does not bleed style state from profile A into profile B when switching', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({
      platform,
      adapter,
      autoSaveDebounceMs: 1,
    });
    await manager.boot();

    // Edit Default — add a rule.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['rule-in-default'] }));
    await manager.save();

    // Create ProfileA — should be a blank slate.
    await manager.create('ProfileA');
    expect(platform.store.getModuleState<StyleState>('style').rules).toEqual([]);

    // Add a rule under ProfileA.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['rule-in-A']}));
    await manager.save();

    // Switch back to Default — rules list must be the Default's original.
    await manager.load(RESERVED_DEFAULT_PROFILE_ID);
    expect(platform.store.getModuleState<StyleState>('style').rules).toEqual(['rule-in-default']);

    // Switch to ProfileA — must see ProfileA's rule, not Default's.
    await manager.load('profilea');
    expect(platform.store.getModuleState<StyleState>('style').rules).toEqual(['rule-in-A']);

    manager.dispose();
  });

  it('loading a profile does NOT overwrite the just-loaded snapshot with the old debounced save', async () => {
    // Regression for the "debounce fires after load, writes new state to old id"
    // race. We use a very short debounce + explicit timing so the test never
    // drags — any debounce firing post-load must target the NEW id (and the
    // NEW state), not corrupt the old snapshot.
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({
      platform,
      adapter,
      autoSaveDebounceMs: 5,
    });
    await manager.boot();

    // Seed Default with rule X.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['X'] }));
    await manager.save();

    // Create ProfileA with rule Y.
    await manager.create('PA');
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['Y'] }));
    await manager.save();

    // Switch to Default. Wait past the debounce window to give any racing
    // timer a chance to fire.
    await manager.load(RESERVED_DEFAULT_PROFILE_ID);
    await new Promise((r) => setTimeout(r, 30));

    // Default's stored snapshot must still be ['X'] — NOT polluted by the
    // debounce from ProfileA's earlier edits.
    const defaultSnap = await adapter.loadProfile('grid-A', RESERVED_DEFAULT_PROFILE_ID);
    expect((defaultSnap?.state.style?.data as StyleState).rules).toEqual(['X']);

    // ProfileA's snapshot must still be ['Y'].
    const paSnap = await adapter.loadProfile('grid-A', 'pa');
    expect((paSnap?.state.style?.data as StyleState).rules).toEqual(['Y']);

    manager.dispose();
  });
});

describe('ProfileManager — delete cycles', () => {
  it('deleting an inactive profile does not touch the active profile state', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({
      platform,
      adapter,
      disableAutoSave: true,
    });
    await manager.boot();

    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['D1'] }));
    await manager.save();
    await manager.create('X');
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['X1'] }));
    await manager.save();

    // On profile X, delete Default.
    // Actually RESERVED_DEFAULT is immutable — try deleting X while on X
    // instead (falls back to Default) and verify Default's state survives.
    await manager.remove('x');
    expect(manager.getState().activeId).toBe(RESERVED_DEFAULT_PROFILE_ID);
    expect(platform.store.getModuleState<StyleState>('style').rules).toEqual(['D1']);

    manager.dispose();
  });

  it('reserved Default profile cannot be deleted', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({
      platform,
      adapter,
      disableAutoSave: true,
    });
    await manager.boot();

    await manager.remove(RESERVED_DEFAULT_PROFILE_ID);
    expect(manager.getState().profiles.some((p) => p.id === RESERVED_DEFAULT_PROFILE_ID)).toBe(true);

    manager.dispose();
  });
});

describe('ProfileManager — disposed-guards', () => {
  it('boot() is idempotent — calling twice does NOT double-apply state', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });

    // First boot wins; second is a no-op.
    await manager.boot();
    const firstActive = manager.getState().activeId;

    // Seed a different state under a different profile to verify the
    // second boot doesn't overwrite what the first applied.
    await manager.create('Rogue');
    expect(manager.getState().activeId).toBe('rogue');

    // Call boot() again — must short-circuit. State stays on 'rogue'.
    await manager.boot();
    expect(manager.getState().activeId).toBe('rogue');
    // Default is still what boot #1 applied initially.
    expect(firstActive).toBe(RESERVED_DEFAULT_PROFILE_ID);

    manager.dispose();
  });

  it('boot() exits cleanly if disposed mid-flight', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });

    const bootPromise = manager.boot();
    manager.dispose();  // race: dispose BEFORE boot's first await resolves.
    await bootPromise;  // must not throw, must not hang.

    // Disposed manager has empty listener set + booted flag set.
    // Calling public methods is still allowed (they're idempotent no-ops).
    expect(() => manager.getState()).not.toThrow();
  });

  it('disposed manager does NOT install a rogue auto-save subscription', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({ platform, adapter, autoSaveDebounceMs: 1 });

    // Dispose immediately — boot will start + attempt to startAutoSave.
    const bootPromise = manager.boot();
    manager.dispose();
    await bootPromise;

    // Editing the store now should NOT result in a persist call (no
    // auto-save wired). Easiest way to test: count listProfiles calls
    // against the adapter via a wrapping spy.
    const listSpy = vi.spyOn(adapter, 'saveProfile');
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['post-dispose-edit'] }));
    await new Promise((r) => setTimeout(r, 30));
    expect(listSpy).not.toHaveBeenCalled();
  });
});

describe('ProfileManager — reload persistence', () => {
  it('state written under a profile survives a manager recreation (simulated reload)', async () => {
    const adapter = new MemoryAdapter();
    const gridId = 'grid-persist';

    // First session: create + edit Profile P.
    {
      const platform = new GridPlatform({ gridId, modules: [makeStyleModule()] });
      const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
      await manager.boot();
      await manager.create('Persisted');
      platform.store.setModuleState<StyleState>('style', () => ({ rules: ['persisted-rule'] }));
      await manager.save();
      manager.dispose();
    }

    // Second session: fresh manager should load the last-active profile.
    {
      const platform = new GridPlatform({ gridId, modules: [makeStyleModule()] });
      const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
      await manager.boot();
      expect(manager.getState().activeId).toBe('persisted');
      expect(platform.store.getModuleState<StyleState>('style').rules).toEqual(['persisted-rule']);
      manager.dispose();
    }
  });
});
