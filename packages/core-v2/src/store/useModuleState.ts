import { useCallback, useSyncExternalStore } from 'react';
import type { GridStore } from './createGridStore';

/**
 * Typed React binding for one module's slice of a GridStore.
 *
 * Returned tuple mirrors `useState`:
 *   const [filters, setFilters] = useModuleState<FiltersState>(store, 'saved-filters');
 *
 * Internally uses `useSyncExternalStore` so React 18+ concurrent rendering
 * stays consistent — no tearing across renders, no missed updates between
 * commit and effect.
 */
export function useModuleState<T>(
  store: GridStore,
  moduleId: string,
): [T, (updater: (prev: T) => T) => void] {
  // Stable subscriber: re-create only when store/id change. React relies on
  // referential stability to avoid resubscribing on every render.
  const subscribe = useCallback(
    (onChange: () => void) => store.subscribeToModule<T>(moduleId, onChange),
    [store, moduleId],
  );

  const getSnapshot = useCallback(
    () => store.getModuleState<T>(moduleId),
    [store, moduleId],
  );

  // Same getSnapshot for SSR — there's no server snapshot distinct from
  // the client one in this app, but useSyncExternalStore requires the arg.
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setState = useCallback(
    (updater: (prev: T) => T) => store.setModuleState<T>(moduleId, updater),
    [store, moduleId],
  );

  return [state, setState];
}
