import { useCallback, useRef, useSyncExternalStore } from 'react';
import {
  LayoutManager,
  type ActiveIdSource,
  type ExportedLayoutPayload,
  type GridPlatform,
  type LayoutManagerOptions,
  type LayoutManagerState,
  type LayoutMeta,
  type StorageAdapter,
} from '@starui/core';
import { useGridPlatform } from './GridProvider';

export interface UseLayoutManagerResult {
  activeLayoutId: string;
  layouts: LayoutMeta[];
  isLoading: boolean;
  /** True when the live store has diverged from the last successful
   *  persist of the active layout. Drives the dirty-dot indicator on
   *  the Save button + triggers the unsaved-changes confirm flow on
   *  layout switch and page unload. */
  isDirty: boolean;
  loadLayout: (id: string) => Promise<void>;
  saveActiveLayout: () => Promise<void>;
  /** Throw away in-memory changes and reload the active layout from
   *  disk. Used by the Discard branch of the unsaved-changes prompt. */
  discardActiveLayout: () => Promise<void>;
  createLayout: (name: string, opts?: { id?: string }) => Promise<LayoutMeta>;
  /** Duplicate an existing layout into a new one under `name`.
   *  Activates the clone immediately. If `sourceId` is the active
   *  layout, captures the live (possibly-dirty) state so the clone
   *  reflects what the user currently sees. */
  cloneLayout: (sourceId: string, name: string, opts?: { id?: string }) => Promise<LayoutMeta>;
  deleteLayout: (id: string) => Promise<void>;
  renameLayout: (id: string, name: string) => Promise<void>;
  exportLayout: (id?: string) => Promise<ExportedLayoutPayload>;
  importLayout: (
    payload: unknown,
    options?: { name?: string; activate?: boolean },
  ) => Promise<LayoutMeta>;
}

/**
 * Per-platform singleton map — one `LayoutManager` lives for the platform
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
const MANAGERS_BY_PLATFORM = new WeakMap<GridPlatform, LayoutManager>();

function getOrCreateManager(opts: LayoutManagerOptions): LayoutManager {
  const existing = MANAGERS_BY_PLATFORM.get(opts.platform);
  if (existing) return existing;
  const manager = new LayoutManager(opts);
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
 * Thin React binding over `LayoutManager`. The class is the source of
 * truth; this hook exposes a React-shaped state via `useSyncExternalStore`
 * (prevents tearing under concurrent rendering) + a stable callbacks
 * surface. Angular ships its own binding.
 */
export function useLayoutManager(opts: {
  adapter: StorageAdapter;
  autoSaveDebounceMs?: number;
  disableAutoSave?: boolean;
  /** Optional higher-priority active-id pointer (e.g. OpenFin view
   *  customData). See `ActiveIdSource` in `@starui/core`. */
  activeIdSource?: ActiveIdSource;
}): UseLayoutManagerResult {
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
    activeIdSource: optsRef.current.activeIdSource,
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
    (): LayoutManagerState => manager.getState(),
    [manager],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const loadLayout = useCallback((id: string) => manager.load(id), [manager]);
  const saveActiveLayout = useCallback(() => manager.save(), [manager]);
  const discardActiveLayout = useCallback(() => manager.discard(), [manager]);
  const createLayout = useCallback(
    (name: string, o?: { id?: string }) => manager.create(name, o),
    [manager],
  );
  const cloneLayout = useCallback(
    (sourceId: string, name: string, o?: { id?: string }) => manager.clone(sourceId, name, o),
    [manager],
  );
  const deleteLayout = useCallback((id: string) => manager.remove(id), [manager]);
  const renameLayout = useCallback(
    (id: string, name: string) => manager.rename(id, name),
    [manager],
  );
  const exportLayout = useCallback((id?: string) => manager.export(id), [manager]);
  const importLayout = useCallback(
    (payload: unknown, o?: { name?: string; activate?: boolean }) => manager.import(payload, o),
    [manager],
  );

  return {
    activeLayoutId: state.activeId,
    layouts: state.layouts,
    isLoading: state.isLoading,
    isDirty: state.isDirty,
    loadLayout,
    saveActiveLayout,
    discardActiveLayout,
    createLayout,
    cloneLayout,
    deleteLayout,
    renameLayout,
    exportLayout,
    importLayout,
  };
}
