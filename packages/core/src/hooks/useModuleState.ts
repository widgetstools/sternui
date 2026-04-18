import { useCallback, useSyncExternalStore } from 'react';
import { useGridPlatform } from './GridProvider';

/**
 * Typed React binding for one module's slice.
 *
 *   const [state, setState] = useModuleState<MyState>('my-module');
 *
 * Uses `useSyncExternalStore` so concurrent rendering never tears.
 */
export function useModuleState<T>(moduleId: string): [T, (updater: (prev: T) => T) => void] {
  const platform = useGridPlatform();
  const store = platform.store;

  const subscribe = useCallback(
    (onChange: () => void) => store.subscribeToModule<T>(moduleId, onChange),
    [store, moduleId],
  );
  const getSnapshot = useCallback(
    () => store.getModuleState<T>(moduleId),
    [store, moduleId],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setState = useCallback(
    (updater: (prev: T) => T) => store.setModuleState<T>(moduleId, updater),
    [store, moduleId],
  );

  return [state, setState];
}
