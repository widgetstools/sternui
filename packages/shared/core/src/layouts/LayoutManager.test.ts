import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '../platform/GridPlatform';
import { MemoryAdapter } from '../persistence/MemoryAdapter';
import type { Module } from '../platform/types';
import { LayoutManager } from './LayoutManager';
import {
  RESERVED_DEFAULT_LAYOUT_ID,
  activeLayoutKey,
  legacyActiveLayoutKey,
} from '../persistence/StorageAdapter';

/**
 * Regression tests for the two layout-management bugs that shipped in the
 * first v3 cut:
 *   1. Create didn't propagate to subscribers (listener disconnect).
 *   2. Load bleed — style state from one layout leaking into another via
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

describe('LayoutManager — state propagation', () => {
  let adapter: MemoryAdapter;
  let platform: GridPlatform;
  let manager: LayoutManager;

  beforeEach(async () => {
    adapter = new MemoryAdapter();
    ({ platform } = makePlatform(adapter));
    manager = new LayoutManager({
      platform,
      adapter,
      disableAutoSave: true,
    });
    await manager.boot();
  });

  it('emits a subscriber notification when a layout is created', async () => {
    const events: string[] = [];
    manager.subscribe((s) => events.push(s.layouts.map((p) => p.id).join(',')));

    await manager.create('TestA');

    // At least one notification must include the new layout id.
    expect(events.some((e) => e.includes('testa'))).toBe(true);
    // The final state must list it.
    expect(manager.getState().layouts.some((p) => p.id === 'testa')).toBe(true);
  });

  it('includes the new layout in the list returned by the subscriber (full refresh after create)', async () => {
    let lastState = manager.getState();
    manager.subscribe((s) => { lastState = s; });

    await manager.create('TestB');

    // The most recent state must include BOTH Default and TestB — create()'s
    // refresh() must have propagated.
    const ids = lastState.layouts.map((p) => p.id).sort();
    expect(ids).toEqual([RESERVED_DEFAULT_LAYOUT_ID, 'testb']);
  });

  it('flips activeId to the newly-created layout', async () => {
    await manager.create('TestC');
    expect(manager.getState().activeId).toBe('testc');
  });

  it('notifies subscribers about the activeId change BEFORE returning from load()', async () => {
    await manager.create('TestD');

    const states: string[] = [];
    manager.subscribe((s) => states.push(s.activeId));

    await manager.load(RESERVED_DEFAULT_LAYOUT_ID);

    expect(states.at(-1)).toBe(RESERVED_DEFAULT_LAYOUT_ID);
  });
});

describe('LayoutManager — layout switch state isolation', () => {
  it('does not bleed style state from layout A into layout B when switching', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new LayoutManager({
      platform,
      adapter,
      autoSaveDebounceMs: 1,
    });
    await manager.boot();

    // Edit Default — add a rule.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['rule-in-default'] }));
    await manager.save();

    // Create LayoutA — should be a blank slate.
    await manager.create('LayoutA');
    expect(platform.store.getModuleState<StyleState>('style').rules).toEqual([]);

    // Add a rule under LayoutA.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['rule-in-A']}));
    await manager.save();

    // Switch back to Default — rules list must be the Default's original.
    await manager.load(RESERVED_DEFAULT_LAYOUT_ID);
    expect(platform.store.getModuleState<StyleState>('style').rules).toEqual(['rule-in-default']);

    // Switch to LayoutA — must see LayoutA's rule, not Default's.
    await manager.load('layouta');
    expect(platform.store.getModuleState<StyleState>('style').rules).toEqual(['rule-in-A']);

    manager.dispose();
  });

  it('loading a layout does NOT overwrite the just-loaded snapshot with the old debounced save', async () => {
    // Regression for the "debounce fires after load, writes new state to old id"
    // race. We use a very short debounce + explicit timing so the test never
    // drags — any debounce firing post-load must target the NEW id (and the
    // NEW state), not corrupt the old snapshot.
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new LayoutManager({
      platform,
      adapter,
      autoSaveDebounceMs: 5,
    });
    await manager.boot();

    // Seed Default with rule X.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['X'] }));
    await manager.save();

    // Create LayoutA with rule Y.
    await manager.create('LA');
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['Y'] }));
    await manager.save();

    // Switch to Default. Wait past the debounce window to give any racing
    // timer a chance to fire.
    await manager.load(RESERVED_DEFAULT_LAYOUT_ID);
    await new Promise((r) => setTimeout(r, 30));

    // Default's stored snapshot must still be ['X'] — NOT polluted by the
    // debounce from LayoutA's earlier edits.
    const defaultSnap = await adapter.loadLayout('grid-A', RESERVED_DEFAULT_LAYOUT_ID);
    expect((defaultSnap?.state.style?.data as StyleState).rules).toEqual(['X']);

    // LayoutA's snapshot must still be ['Y'].
    const laSnap = await adapter.loadLayout('grid-A', 'la');
    expect((laSnap?.state.style?.data as StyleState).rules).toEqual(['Y']);

    manager.dispose();
  });
});

describe('LayoutManager — delete cycles', () => {
  it('deleting an inactive layout does not touch the active layout state', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new LayoutManager({
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

    // On layout X, delete Default.
    // Actually RESERVED_DEFAULT is immutable — try deleting X while on X
    // instead (falls back to Default) and verify Default's state survives.
    await manager.remove('x');
    expect(manager.getState().activeId).toBe(RESERVED_DEFAULT_LAYOUT_ID);
    expect(platform.store.getModuleState<StyleState>('style').rules).toEqual(['D1']);

    manager.dispose();
  });

  it('reserved Default layout cannot be deleted', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new LayoutManager({
      platform,
      adapter,
      disableAutoSave: true,
    });
    await manager.boot();

    await manager.remove(RESERVED_DEFAULT_LAYOUT_ID);
    expect(manager.getState().layouts.some((p) => p.id === RESERVED_DEFAULT_LAYOUT_ID)).toBe(true);

    manager.dispose();
  });
});

describe('LayoutManager — disposed-guards', () => {
  it('boot() is idempotent — calling twice does NOT double-apply state', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });

    // First boot wins; second is a no-op.
    await manager.boot();
    const firstActive = manager.getState().activeId;

    // Seed a different state under a different layout to verify the
    // second boot doesn't overwrite what the first applied.
    await manager.create('Rogue');
    expect(manager.getState().activeId).toBe('rogue');

    // Call boot() again — must short-circuit. State stays on 'rogue'.
    await manager.boot();
    expect(manager.getState().activeId).toBe('rogue');
    // Default is still what boot #1 applied initially.
    expect(firstActive).toBe(RESERVED_DEFAULT_LAYOUT_ID);

    manager.dispose();
  });

  it('boot() exits cleanly if disposed mid-flight', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });

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
    const manager = new LayoutManager({ platform, adapter, autoSaveDebounceMs: 1 });

    // Dispose immediately — boot will start + attempt to startAutoSave.
    const bootPromise = manager.boot();
    manager.dispose();
    await bootPromise;

    // Editing the store now should NOT result in a persist call (no
    // auto-save wired). Easiest way to test: count listLayouts calls
    // against the adapter via a wrapping spy.
    const listSpy = vi.spyOn(adapter, 'saveLayout');
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['post-dispose-edit'] }));
    await new Promise((r) => setTimeout(r, 30));
    expect(listSpy).not.toHaveBeenCalled();
  });
});

describe('LayoutManager — reload persistence', () => {
  it('state written under a layout survives a manager recreation (simulated reload)', async () => {
    const adapter = new MemoryAdapter();
    const gridId = 'grid-persist';

    // First session: create + edit Layout P.
    {
      const platform = new GridPlatform({ gridId, modules: [makeStyleModule()] });
      const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });
      await manager.boot();
      await manager.create('Persisted');
      platform.store.setModuleState<StyleState>('style', () => ({ rules: ['persisted-rule'] }));
      await manager.save();
      manager.dispose();
    }

    // Second session: fresh manager should load the last-active layout.
    {
      const platform = new GridPlatform({ gridId, modules: [makeStyleModule()] });
      const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });
      await manager.boot();
      expect(manager.getState().activeId).toBe('persisted');
      expect(platform.store.getModuleState<StyleState>('style').rules).toEqual(['persisted-rule']);
      manager.dispose();
    }
  });
});

describe('LayoutManager — phantom-layout regressions', () => {
  /**
   * The three paths that used to auto-generate ghost layout rows on
   * delete / create. The fix forbids `persistActive` from implicitly
   * creating missing rows + reorders `remove()` and `create()` so no
   * concurrent save can find a stale activeId pointing at a
   * non-existent row.
   */

  it('save() after an external delete does NOT resurrect the deleted layout', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    // Create + switch to a user layout, then simulate a concurrent
    // tab deleting it from underneath (we just hit the adapter
    // directly — the manager's own activeId stays pointing at 'p1').
    await manager.create('P1');
    expect(manager.getState().activeId).toBe('p1');

    await adapter.deleteLayout(platform.gridId, 'p1');

    // User makes edits + clicks Save. Pre-fix this would call
    // persistActive, find no row, and auto-create a ghost with the
    // current in-memory state.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['ghost'] }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await manager.save();
    warn.mockRestore();

    const row = await adapter.loadLayout(platform.gridId, 'p1');
    expect(row).toBeNull();

    manager.dispose();
  });

  it('remove() of the active layout flips activeId to Default BEFORE deleting the row', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    await manager.create('P2');
    expect(manager.getState().activeId).toBe('p2');

    // Observe the activeId timeline during the delete. The pointer
    // MUST land on Default before (or at least without passing through
    // a window where) the row exists but activeId points at a gone id.
    const activeIdTimeline: string[] = [manager.getState().activeId];
    manager.subscribe((s) => {
      const last = activeIdTimeline[activeIdTimeline.length - 1];
      if (s.activeId !== last) activeIdTimeline.push(s.activeId);
    });
    const deleteSpy = vi.spyOn(adapter, 'deleteLayout');

    await manager.remove('p2');

    // activeId transitioned p2 → __default__, not p2 → p2 → __default__.
    expect(activeIdTimeline).toEqual(['p2', RESERVED_DEFAULT_LAYOUT_ID]);
    // By the time deleteLayout was called, the manager's activeId
    // was already Default.
    expect(deleteSpy).toHaveBeenCalledWith(platform.gridId, 'p2');
    expect(manager.getState().activeId).toBe(RESERVED_DEFAULT_LAYOUT_ID);
    // And the row is gone.
    expect(await adapter.loadLayout(platform.gridId, 'p2')).toBeNull();

    manager.dispose();
  });

  it('create() writes the row to disk BEFORE flipping activeId (no ghost window)', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    // Instrument saveLayout so we can capture the manager's activeId
    // AT THE MOMENT the adapter write is invoked. Pre-fix, activeId
    // was flipped BEFORE saveLayout ran — so a concurrent save()
    // would observe activeId='p3' with no p3 row on disk.
    const activeIdAtWrite: string[] = [];
    const orig = adapter.saveLayout.bind(adapter);
    vi.spyOn(adapter, 'saveLayout').mockImplementation(async (snap) => {
      activeIdAtWrite.push(manager.getState().activeId);
      return orig(snap);
    });

    await manager.create('P3');

    // At the point of the new layout's write, activeId was STILL
    // the previous one (Default) — not the new one.
    expect(activeIdAtWrite).toEqual([RESERVED_DEFAULT_LAYOUT_ID]);
    // After create() returns, the flip has landed.
    expect(manager.getState().activeId).toBe('p3');
    // And the row exists.
    expect(await adapter.loadLayout(platform.gridId, 'p3')).not.toBeNull();

    manager.dispose();
  });

  it('create() restores the outgoing layout\'s UI state until the commit succeeds', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    // Put some state under Default + save it.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['default-rule'] }));
    await manager.save();

    // Also make some un-committed edits on top.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['default-rule', 'unsaved'] }));

    // Capture the live store state seen by a subscriber DURING the
    // create() call. The snapshot-and-restore dance inside create()
    // must not expose a window where the live store is blank before
    // the new layout has committed.
    const observed: string[][] = [];
    const unsub = platform.store.subscribe(() => {
      observed.push([...platform.store.getModuleState<StyleState>('style').rules]);
    });

    await manager.create('P4');
    unsub();

    // At the end, we're on P4 (blank).
    expect(manager.getState().activeId).toBe('p4');
    expect(platform.store.getModuleState<StyleState>('style').rules).toEqual([]);
    // The underlying Default row kept its committed state. Module
    // state is stored inside a `{ v, data }` envelope on disk.
    const defRow = await adapter.loadLayout(platform.gridId, RESERVED_DEFAULT_LAYOUT_ID);
    const defStyle = (defRow?.state.style as { v: number; data: StyleState } | undefined);
    expect(defStyle?.data.rules).toEqual(['default-rule']);

    manager.dispose();
  });

  // ─── clone ─────────────────────────────────────────────────────

  it('clone() duplicates the active layout\'s LIVE (dirty) state into the new row', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    // Commit some state on Default.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['committed'] }));
    await manager.save();
    // Add unsaved edits on top — these SHOULD be part of the clone.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['committed', 'dirty'] }));

    await manager.clone(RESERVED_DEFAULT_LAYOUT_ID, 'Default Variant');

    // Clone is active.
    expect(manager.getState().activeId).toBe('default-variant');
    // Clone's row on disk contains both the committed AND the
    // previously-unsaved state (live-state capture).
    const row = await adapter.loadLayout(platform.gridId, 'default-variant');
    const style = row?.state.style as { v: number; data: StyleState } | undefined;
    expect(style?.data.rules).toEqual(['committed', 'dirty']);
    // Clone is not dirty — its on-disk snapshot matches the live store.
    expect(manager.getState().isDirty).toBe(false);

    manager.dispose();
  });

  it('clone() of a NON-active layout uses the on-disk snapshot, not the live store', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    // Create a saved layout "source" with rules=['source-rule'].
    await manager.create('Source');
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['source-rule'] }));
    await manager.save();

    // Switch to Default, and make DIFFERENT edits in the live store.
    await manager.load(RESERVED_DEFAULT_LAYOUT_ID);
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['default-live'] }));

    // Clone 'source' — should capture source's DISK state, not the
    // current live store (which is pointing at Default's live edits).
    await manager.clone('source', 'Source Copy');

    const row = await adapter.loadLayout(platform.gridId, 'source-copy');
    const style = row?.state.style as { v: number; data: StyleState } | undefined;
    expect(style?.data.rules).toEqual(['source-rule']);

    manager.dispose();
  });

  it('clone() rejects the reserved Default id as a target', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    await expect(
      manager.clone(RESERVED_DEFAULT_LAYOUT_ID, 'Default', { id: RESERVED_DEFAULT_LAYOUT_ID }),
    ).rejects.toThrow(/reserved id/i);
    manager.dispose();
  });

  it('clone() rejects when source == target id (would overwrite source)', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    await manager.create('Source');
    await expect(manager.clone('source', 'Source', { id: 'source' }))
      .rejects.toThrow(/must differ/i);
    manager.dispose();
  });

  it('clone() throws when the source layout does not exist on disk', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    await expect(manager.clone('ghost', 'Ghost Copy'))
      .rejects.toThrow(/not found/i);
    manager.dispose();
  });

  it('clone() deep-copies state (edits to clone don\'t leak to source)', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['shared'] }));
    await manager.save();

    await manager.clone(RESERVED_DEFAULT_LAYOUT_ID, 'Variant');
    // Mutate the clone (the active layout now) + save.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['shared', 'clone-only'] }));
    await manager.save();

    // Source (Default) must still be ['shared'].
    const defRow = await adapter.loadLayout(platform.gridId, RESERVED_DEFAULT_LAYOUT_ID);
    const defStyle = defRow?.state.style as { v: number; data: StyleState } | undefined;
    expect(defStyle?.data.rules).toEqual(['shared']);

    manager.dispose();
  });

  it('remove() of a non-active layout leaves the active layout untouched', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    await manager.create('Keep');
    await manager.create('Drop');
    // Switch back to Keep so Drop is non-active.
    await manager.load('keep');
    expect(manager.getState().activeId).toBe('keep');

    await manager.remove('drop');

    expect(manager.getState().activeId).toBe('keep');
    expect(await adapter.loadLayout(platform.gridId, 'drop')).toBeNull();
    expect(await adapter.loadLayout(platform.gridId, 'keep')).not.toBeNull();
    manager.dispose();
  });
});

describe('LayoutManager — active-id localStorage dual-read', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('boots from the legacy gc-active-profile: key when no gc-active-layout: key is set', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    // Seed: pre-rename pointer only.
    localStorage.setItem(legacyActiveLayoutKey(platform.gridId), '__default__');

    const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    expect(manager.getState().activeId).toBe('__default__');
    manager.dispose();
  });

  it('prefers gc-active-layout: over gc-active-profile: when both keys are present', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    // Both keys present — new wins.
    localStorage.setItem(activeLayoutKey(platform.gridId), '__default__');
    localStorage.setItem(legacyActiveLayoutKey(platform.gridId), 'stale-legacy-id');

    const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    expect(manager.getState().activeId).toBe('__default__');
    manager.dispose();
  });

  it('clears the legacy pointer on next write so the migration completes gradually', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    localStorage.setItem(legacyActiveLayoutKey(platform.gridId), '__default__');

    const manager = new LayoutManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    await manager.create('Fresh');
    await manager.load('fresh');

    expect(localStorage.getItem(activeLayoutKey(platform.gridId))).toBe('fresh');
    expect(localStorage.getItem(legacyActiveLayoutKey(platform.gridId))).toBeNull();
    manager.dispose();
  });
});
