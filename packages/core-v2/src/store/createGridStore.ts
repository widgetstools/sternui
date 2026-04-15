import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AnyModule } from '../core/types';

interface GridStoreShape {
  /** Per-module state, keyed by `module.id`. Treated as immutable —
   *  setModuleState produces a new outer object so subscribers can compare by
   *  reference. */
  moduleStates: Record<string, unknown>;
}

/**
 * Vanilla, framework-agnostic store. The React layer (`useModuleState`) sits
 * on top via `useSyncExternalStore`; consumers that don't need React (tests,
 * server-side renderers) can talk to this directly.
 *
 * Why a wrapper instead of exposing the Zustand store raw: the GridCore needs
 * a stable `getModuleState` / `setModuleState` pair that survives destructuring,
 * and consumers shouldn't have to know the internal `moduleStates` shape.
 */
export interface GridStore {
  readonly gridId: string;

  /** Read the current state of one module. Returns whatever was last written
   *  (initial value if nothing has been written yet). */
  getModuleState<T>(moduleId: string): T;

  /** Update one module via a pure updater. The updater is called with the
   *  previous value (or the module's initial state if none exists). Returning
   *  the same reference is a no-op — the store treats it as a skip and
   *  doesn't notify subscribers. */
  setModuleState<T>(moduleId: string, updater: (prev: T) => T): void;

  /** Replace one module's state wholesale. Used by the deserialize path,
   *  where we don't want to thread an updater closure. Always notifies. */
  replaceModuleState<T>(moduleId: string, value: T): void;

  /** Snapshot of every module's state. Caller treats it as read-only. */
  getAllModuleStates(): Record<string, unknown>;

  /** Subscribe to *any* state change. Listener fires after the change is
   *  applied; returns a disposer. */
  subscribe(listener: (state: GridStoreShape, prev: GridStoreShape) => void): () => void;

  /** Subscribe to a single module's slice. Fires only when that module's
   *  state reference changes — set-to-the-same-value is suppressed. */
  subscribeToModule<T>(moduleId: string, listener: (state: T, prev: T) => void): () => void;
}

export interface CreateGridStoreOptions {
  gridId: string;
  modules: readonly AnyModule[];
}

export function createGridStore(opts: CreateGridStoreOptions): GridStore {
  // Seed initial state from each module's getInitialState() so the first
  // getModuleState call after construction always returns a well-formed value.
  const initial: Record<string, unknown> = {};
  for (const m of opts.modules) {
    initial[m.id] = m.getInitialState();
  }

  const inner: StoreApi<GridStoreShape> = createStore(() => ({
    moduleStates: initial,
  }));

  const getModuleState = <T,>(moduleId: string): T =>
    inner.getState().moduleStates[moduleId] as T;

  const setModuleState = <T,>(
    moduleId: string,
    updater: (prev: T) => T,
  ): void => {
    inner.setState((s) => {
      const prev = s.moduleStates[moduleId] as T;
      const next = updater(prev);
      // No-op when the updater returns the exact same reference. This keeps
      // auto-save quiet on idempotent updates and lets React skip re-renders.
      if (next === prev) return s;
      return { moduleStates: { ...s.moduleStates, [moduleId]: next } };
    });
  };

  const replaceModuleState = <T,>(moduleId: string, value: T): void => {
    inner.setState((s) => ({
      moduleStates: { ...s.moduleStates, [moduleId]: value },
    }));
  };

  return {
    gridId: opts.gridId,
    getModuleState,
    setModuleState,
    replaceModuleState,
    getAllModuleStates: () => inner.getState().moduleStates,
    subscribe: (listener) => inner.subscribe(listener),
    subscribeToModule: <T,>(
      moduleId: string,
      listener: (state: T, prev: T) => void,
    ): (() => void) => {
      // Track the slice ourselves so we only notify on actual changes — Zustand's
      // root subscribe fires for every setState regardless of which slice moved.
      let prevSlice = inner.getState().moduleStates[moduleId] as T;
      return inner.subscribe((state) => {
        const nextSlice = state.moduleStates[moduleId] as T;
        if (nextSlice === prevSlice) return;
        const old = prevSlice;
        prevSlice = nextSlice;
        listener(nextSlice, old);
      });
    },
  };
}
