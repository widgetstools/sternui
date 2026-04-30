import { useEffect, useMemo, useRef, useState } from 'react';
import type { GridOptions, GridReadyEvent } from 'ag-grid-community';
import { GridPlatform, type AnyColDef, type AnyModule } from '@marketsui/core';

/**
 * Binds a `GridPlatform` instance to the React lifecycle:
 *   - Constructs once per MarketsGrid instance. Shared across renders.
 *   - Subscribes to the store and bumps a tick so `columnDefs` / `gridOptions`
 *     re-run the transform pipeline on state changes.
 *   - Fires `platform.destroy()` on REAL unmount only (via grid-pre-destroyed
 *     + a ref-counted effect teardown that ignores StrictMode double-unmounts).
 *
 * Module-level state lives INSIDE the platform instance, so StrictMode
 * double-mounts can't corrupt anything — each platform has its own
 * `resources` / `eventBus`.
 *
 * WHY we don't destroy on useEffect cleanup: React 19 StrictMode fires a
 * synthetic unmount + remount on every mount. If the cleanup destroyed the
 * platform, the second mount would create a fresh platform whose ApiHub
 * never receives the api (AG-Grid's onGridReady was captured by the first
 * handleGridReady closure, which targets the DESTROYED platform). Keeping
 * the same platform across simulated mounts preserves the api attachment.
 * The real teardown happens in `onGridPreDestroyed` below — that fires
 * exactly once on the true grid destroy.
 */
export function useGridHost(opts: {
  gridId: string;
  modules: AnyModule[];
  baseColumnDefs: AnyColDef[];
  rowIdField?: string | readonly string[];
}) {
  const platformRef = useRef<GridPlatform | null>(null);
  if (!platformRef.current) {
    platformRef.current = new GridPlatform({
      gridId: opts.gridId,
      modules: opts.modules,
      rowIdField: opts.rowIdField,
    });
  }
  const platform = platformRef.current;

  // A single "state changed" tick drives pipeline re-runs. Cheap because
  // the PipelineRunner caches per-module outputs on reference identity —
  // unaffected modules skip their transforms entirely.
  const [tick, setTick] = useState(0);
  useEffect(() => platform.store.subscribe(() => setTick((n) => n + 1)), [platform]);

  const columnDefs = useMemo(
    () => platform.transformColumnDefs(opts.baseColumnDefs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [platform, opts.baseColumnDefs, tick],
  );

  const gridOptions = useMemo<Partial<GridOptions>>(
    () => platform.transformGridOptions({}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [platform, tick],
  );

  // AG-Grid's React adapter doesn't reactively forward grid-option-shaped
  // props after mount — push via setGridOption when a key actually changes.
  const lastSynced = useRef<Record<string, string>>({});
  useEffect(() => {
    const api = platform.api.api;
    if (!api) return;
    const prev = lastSynced.current;
    const next: Record<string, string> = {};
    let dirty = false;
    for (const [key, value] of Object.entries(gridOptions)) {
      const json = JSON.stringify(value) ?? 'undefined';
      next[key] = json;
      if (prev[key] === json) continue;
      dirty = true;
      (api.setGridOption as (k: string, v: unknown) => void)(key, value);
    }
    lastSynced.current = { ...prev, ...next };
    if (dirty) {
      try { api.redrawRows(); } catch { /* teardown race */ }
    }
  }, [platform, gridOptions]);

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
