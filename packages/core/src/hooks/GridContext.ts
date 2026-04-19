/**
 * Compatibility hooks for v2-ported panels.
 *
 * v2 panels reach for `useGridCore()` + `useGridStore()` via the
 * `GridContext` React context. v3 removes that context in favour of
 * `useGridPlatform()`, but the panel source is substantial, so this
 * module exposes the two v2 hook names as thin shims around the platform.
 *
 * New v3 code should use `useGridPlatform()` + `useGridApi()` +
 * `useModuleState()` directly — `useGridCore()` exists ONLY for
 * back-compat with ported panels.
 */
import type { GridApi } from 'ag-grid-community';
import { useGridPlatform } from './GridProvider';
import type { Store } from '../platform/types';

/**
 * Minimal shape the v2 panels consume — just `getGridApi`. Other v2 GridCore
 * surface area (transform pipeline, serialize) isn't used from panels.
 */
export interface GridCoreLike {
  readonly gridId: string;
  getGridApi(): GridApi | null;
}

export function useGridCore(): GridCoreLike {
  const platform = useGridPlatform();
  return {
    gridId: platform.gridId,
    getGridApi: () => platform.api.api,
  };
}

export function useGridStore(): Store {
  const platform = useGridPlatform();
  return platform.store;
}
