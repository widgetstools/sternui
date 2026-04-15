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
import type { GridOptions, GridReadyEvent } from 'ag-grid-community';

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
  /** Aggregated grid options from the module pipeline. The host should spread
   *  this onto `<AgGridReact>` (under any explicit prop overrides) so module
   *  outputs like `rowClassRules` (conditional-styling row scope), pagination,
   *  rowSelection, etc. actually reach AG-Grid. */
  gridOptions: Partial<GridOptions>;
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

  // Re-run the grid-options pipeline alongside the column-defs pipeline so
  // module outputs that live on GridOptions (rowClassRules, pagination toggles,
  // rowSelection, etc.) flow into AG-Grid the same way structural column
  // changes do.
  const gridOptions = useMemo(
    () => core.transformGridOptions({}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [core, tick],
  );

  // AG-Grid's React adapter does NOT reactively forward grid-options-shaped
  // props (rowClassRules, pagination, etc.) to the live grid instance — those
  // have to be pushed via `api.setGridOption()`. Without this, a row-scope
  // conditional rule lives in the rendered prop but never actually paints
  // because AG-Grid's internal state never sees it.
  //
  // We then force a row redraw so already-rendered rows in the viewport pick
  // up the freshly-applied predicate (AG-Grid only EVALUATES rules at row
  // render time, so existing rows keep stale classes otherwise).
  //
  // Cheap when called post-mount; a no-op while the api isn't alive yet.
  useEffect(() => {
    const api = core.getGridApi();
    if (!api) return;
    try {
      // Push every key the module pipeline emits — keeps rowClassRules,
      // pagination toggles, rowSelection etc. in sync without us having to
      // enumerate which ones are reactive in the React adapter.
      for (const [key, value] of Object.entries(gridOptions)) {
        // Cast: `setGridOption` is keyof GridOptions but Object.entries widens.
        (api.setGridOption as (k: string, v: unknown) => void)(key, value);
      }
      api.redrawRows();
    } catch {
      /* ignore — happens during teardown / hot-reload windows */
    }
  }, [core, gridOptions]);

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

  return { core, store, columnDefs, gridOptions, onGridReady, onGridPreDestroyed, profiles };
}
