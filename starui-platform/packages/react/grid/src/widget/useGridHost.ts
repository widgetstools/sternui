import { useEffect, useMemo, useRef, useState } from 'react';
import type { GridOptions, GridReadyEvent } from 'ag-grid-community';
import { GridPlatform, type AnyColDef, type AnyModule, type AppDataLookup } from '@starui/engine';
import { shouldSkipGridOptionSync } from './gridSurfaceOptions';

/**
 * AG-Grid options that can ONLY be set at construction time. Calling
 * `api.setGridOption(key, ...)` for any of these after init logs the
 * warning: "AG Grid: warning #22 <key> is an initial property and
 * cannot be updated."
 *
 * AG-Grid doesn't export this list, so we mirror it from the docs
 * (https://www.ag-grid.com/react-data-grid/grid-options/#reference-misc).
 * Add new entries here when AG-Grid surfaces additional warning #22s.
 *
 * The pipeline still emits these as part of `gridOptions` so the FIRST
 * mount picks them up via the `{...gridOptions}` spread on AgGridReact;
 * we just skip the post-mount push.
 */
/** Stable empty base — fresh `{}` literals defeat the pipeline input-identity cache. */
const EMPTY_GRID_OPTIONS: Partial<GridOptions> = {};

const INITIAL_ONLY_GRID_OPTIONS: ReadonlySet<string> = new Set([
  'suppressGroupRowsSticky',
  'groupLockGroupColumns',
  'stopEditingWhenCellsLoseFocus',
  'undoRedoCellEditing',
  'undoRedoCellEditingLimit',
  'tooltipShowMode',
  'suppressColumnVirtualisation',
  'suppressMaxRenderedRowRestriction',
  'suppressAnimationFrame',
  'debounceVerticalScrollbar',
  'enableRtl',
  'rowModelType',
  'debug',
  'getRowId',
  'pivotPanelShow',
]);

/**
 * Whether the value (or any nested value, up to a shallow guard depth)
 * is a function. Function-valued grid options (`rowClassRules`,
 * `getRowClass`, `getRowStyle`, value getters, etc.) lose their bodies
 * under `JSON.stringify` — every payload hashes to the same string
 * regardless of which predicates it carries. The diff path in
 * `useGridHost` compares function references instead.
 */
function containsFunction(value: unknown, depth = 0): boolean {
  if (typeof value === 'function') return true;
  if (depth > 4) return false;
  if (Array.isArray(value)) {
    return value.some((v) => containsFunction(v, depth + 1));
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (containsFunction(v, depth + 1)) return true;
    }
  }
  return false;
}

/**
 * Binds a `GridPlatform` instance to the React lifecycle:
 *   - Constructs once per MarketsGrid instance. Shared across renders.
 *   - Subscribes to the store and bumps a tick so `columnDefs` / `gridOptions`
 *     re-run the transform pipeline on state changes.
 *   - Fires `platform.destroy()` on REAL unmount only (via grid-pre-destroyed
 *     + a ref-counted effect teardown that ignores StrictMode double-unmounts).
 *
 * React / AG-Grid churn invariants (do not regress):
 *   1. Pass `EMPTY_GRID_OPTIONS` (stable ref) into `transformGridOptions` —
 *      never an inline `{}`.
 *   2. `GridPlatform.transformGridOptions()` uses a stable base object when
 *      the caller passes an empty base (see engine `transformGridOptionsBase`).
 *   3. Post-mount option sync skips keys whose JSON or function reference is
 *      unchanged — never call `setGridOption` + `redrawRows` speculatively.
 *   4. Store ticks are rAF-coalesced so profile hydration can't stampede
 *      React renders in a single frame.
 *   5. `MarketsGridSurface` is memo'd — AgGridReact runs `useEffect([props])`
 *      on every parent render when prop references change.
 *   6. Never `setGridOption` keys that `MarketsGridSurface` passes as explicit
 *      AgGridReact props — pipeline + props dual-sourcing those keys loops.
 */
export function useGridHost(opts: {
  gridId: string;
  modules: AnyModule[];
  baseColumnDefs: AnyColDef[];
  rowIdField?: string | readonly string[];
  appData?: AppDataLookup;
  hostOverrideKeys?: ReadonlySet<string>;
}) {
  const platformRef = useRef<GridPlatform | null>(null);
  if (!platformRef.current) {
    platformRef.current = new GridPlatform({
      gridId: opts.gridId,
      modules: opts.modules,
      rowIdField: opts.rowIdField,
      appData: opts.appData,
    });
  }
  const platform = platformRef.current;
  const hostOverrideKeys = opts.hostOverrideKeys ?? new Set<string>();

  // A single "state changed" tick drives pipeline re-runs. Coalesce bursts
  // (profile deserialize touches every module) into one rAF tick per frame.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let rafId = 0;
    return platform.store.subscribe(() => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        setTick((n) => n + 1);
      });
    });
  }, [platform]);

  const columnDefs = useMemo(
    () => platform.transformColumnDefs(opts.baseColumnDefs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [platform, opts.baseColumnDefs, tick],
  );

  const gridOptions = useMemo<Partial<GridOptions>>(
    () => platform.transformGridOptions(EMPTY_GRID_OPTIONS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [platform, tick],
  );

  // AG-Grid's React adapter doesn't reactively forward grid-option-shaped
  // props after mount — push via setGridOption when a key actually changes.
  const lastSynced = useRef<Record<string, string>>({});
  const lastFuncSynced = useRef<Record<string, unknown>>({});
  const lastGridOptionsRef = useRef<Partial<GridOptions> | null>(null);
  useEffect(() => {
    if (lastGridOptionsRef.current === gridOptions) return;
    lastGridOptionsRef.current = gridOptions;
    const api = platform.api.api;
    if (!api) return;
    if ((api as unknown as { isDestroyed?: () => boolean }).isDestroyed?.()) return;
    const prev = lastSynced.current;
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(gridOptions)) {
      const json = JSON.stringify(value) ?? 'undefined';
      next[key] = json;
      if (INITIAL_ONLY_GRID_OPTIONS.has(key)) continue;
      if (shouldSkipGridOptionSync(key, hostOverrideKeys)) continue;
      if (containsFunction(value)) {
        if (lastFuncSynced.current[key] === value) continue;
        lastFuncSynced.current[key] = value;
      } else if (prev[key] === json) {
        continue;
      }
      (api.setGridOption as (k: string, v: unknown) => void)(key, value);
    }
    lastSynced.current = { ...prev, ...next };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, tick, hostOverrideKeys]);

  const onGridReady = (event: GridReadyEvent) => {
    platform.onGridReady(event.api);
    setTick((n) => n + 1); // re-run transforms now that api is live
  };

  const onGridPreDestroyed = () => {
    platform.destroy();
    platformRef.current = null;
  };

  return { platform, columnDefs, gridOptions, onGridReady, onGridPreDestroyed };
}
