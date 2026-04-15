import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GridCore,
  createGridStore,
  useProfileManager,
  type AnyModule,
  type GridStore,
  type StorageAdapter,
  type UseProfileManagerResult,
} from '@grid-customizer/core-v2';
import type { GridReadyEvent } from 'ag-grid-community';

/**
 * Boots the core-v2 stack for a single grid:
 *   - Builds the Zustand store with the module list.
 *   - Constructs `GridCore` bound to that store's get/setModuleState.
 *   - Wires the profile manager (which kicks off auto-save once the boot
 *     load completes).
 *   - Returns a `useState`-tracked `columnDefs` ref that re-runs the transform
 *     pipeline whenever any module state changes.
 *
 * One responsibility per object — the host component (MarketsGrid) only
 * handles toolbar UI + AgGridReact wiring, and never manipulates the store
 * directly. That's what unblocks "remove `activeFiltersRef`" in the plan.
 */
export interface UseMarketsGridV2Options {
  gridId: string;
  rowIdField: string;
  modules: AnyModule[];
  baseColumnDefs: unknown[];
  adapter: StorageAdapter;
  autoSaveDebounceMs?: number;
}

export interface UseMarketsGridV2Result {
  core: GridCore;
  store: GridStore;
  /** Transformed column defs — feed straight to `<AgGridReact columnDefs={...}>`. */
  columnDefs: unknown[];
  /** Pass to `<AgGridReact onGridReady>`. Wires the GridApi into the core
   *  and re-runs the transform pipeline once the api is alive. */
  onGridReady: (event: GridReadyEvent) => void;
  /** Pass to `<AgGridReact onGridPreDestroyed>`. Tears modules down cleanly. */
  onGridPreDestroyed: () => void;
  /** Profile manager (Default + named profiles + auto-save). */
  profiles: UseProfileManagerResult;
}

export function useMarketsGridV2(opts: UseMarketsGridV2Options): UseMarketsGridV2Result {
  const { gridId, rowIdField, modules, baseColumnDefs, adapter, autoSaveDebounceMs } = opts;

  // Store + core are constructed once per (gridId, modules) tuple. We freeze
  // both behind a ref so swapping `modules` mid-mount doesn't tear down the
  // grid — that's an explicit anti-feature for v2.0 (the plan budgets simple
  // re-mount semantics; advanced hot-swap lives at v2.2+).
  const storeRef = useRef<GridStore | null>(null);
  const coreRef = useRef<GridCore | null>(null);

  if (!storeRef.current) {
    storeRef.current = createGridStore({ gridId, modules });
  }
  if (!coreRef.current) {
    const store = storeRef.current;
    coreRef.current = new GridCore({
      gridId,
      modules,
      rowIdField,
      getModuleState: (id) => store.getModuleState(id),
      setModuleState: (id, updater) => store.setModuleState(id, updater),
    });
  }

  const store = storeRef.current!;
  const core = coreRef.current!;

  const profiles = useProfileManager({
    gridId,
    core,
    store,
    adapter,
    autoSaveDebounceMs,
  });

  // Column-def transform — re-runs whenever any module state changes OR the
  // base defs change. We track a tick rather than the snapshot itself because
  // AG-Grid does its own deep equality and we just need a re-render signal.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    return store.subscribe(() => setTick((n) => n + 1));
  }, [store]);

  const columnDefs = useMemo(
    () => core.transformColumnDefs(baseColumnDefs as never),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [core, baseColumnDefs, tick],
  );

  // ─── Grid lifecycle ──────────────────────────────────────────────────────

  const onGridReady = (event: GridReadyEvent) => {
    core.onGridReady(event.api);
    // Bump tick so columnDefs re-runs through any transformer that needs the
    // GridContext (which was null before onGridReady).
    setTick((n) => n + 1);
  };

  const onGridPreDestroyed = () => {
    core.onGridDestroy();
  };

  return { core, store, columnDefs, onGridReady, onGridPreDestroyed, profiles };
}
