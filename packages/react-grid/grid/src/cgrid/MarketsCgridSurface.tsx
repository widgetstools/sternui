/**
 * MarketsCgridSurface — the cgrid twin of MarketsGridSurface.
 *
 * Same prop contract as MarketsGridSurface (the host renders either
 * surface from identical inputs), but mounts a vanilla `CGrid` into a
 * div and hands the host a `CGridApiAdapter` through the SAME
 * `onGridReady({ api })` path AG uses — the platform never knows the
 * engine changed.
 *
 * Prop-change handling mirrors what AgGridReact does internally:
 *  - `rowData` reference change → setRowData through the adapter
 *    (cache-refreshing);
 *  - `columnDefs` reference change → translate + updateGridOptions;
 *  - `gridOptions` reference change → the HOST's sync loop already
 *    pushes per-key setGridOption through the adapter, so the surface
 *    only handles construction;
 *  - host overrides (rowHeight/headerHeight/animateRows) → setGridOption.
 *
 * Theming: the design-system cgrid adapter is a stylesheet of live
 * OKLCH token indirections — inject once, pass the theme class; light/
 * dark flips with `data-theme` with no JS. The AG `theme` prop is
 * intentionally unused here. Density arrives via the wrapper class.
 */

import { memo, useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactElement } from 'react';
import type { GridReadyEvent } from 'ag-grid-community';
import { CGrid } from '@cgrid/kernel';
import '@cgrid/kernel/style.css';
import {
  ensureCgridThemeStyles,
  cgridThemeClass,
  cgridDensityClass,
} from '@starui/design-system/adapters/cgrid';
import { resolveGridDensity } from '@starui/design-system/adapters/ag-grid';
import type { MarketsGridProps } from '../widget/types';
import { useGeneralSettingsFromContext } from '../widget/GeneralSettingsContext';
import { CGridApiAdapter } from './CGridApiAdapter';
import { translateColumnDefs } from './colDefTranslator';
import { translateGridOptionsBag } from './gridOptionsTranslator';

type AnyRow = Record<string, unknown>;

export interface MarketsCgridSurfaceProps<TData> {
  readonly gridOptions: Record<string, unknown>;
  readonly hostOverrideKeys: ReadonlySet<string>;
  readonly rowData: TData[];
  readonly columnDefs: unknown[];
  readonly rowHeight?: number;
  readonly headerHeight?: number;
  readonly animateRows?: boolean;
  readonly sideBar: MarketsGridProps<TData>['sideBar'];
  readonly statusBar: MarketsGridProps<TData>['statusBar'];
  readonly defaultColDef: MarketsGridProps<TData>['defaultColDef'];
  readonly getContextMenuItems?: unknown;
  readonly onGridReady: (event: GridReadyEvent) => void;
  readonly onGridPreDestroyed: () => void;
}

const SURFACE_STYLE: CSSProperties = { flex: 1, minHeight: 0 };

interface ResolvedRowId {
  getRowId: (row: AnyRow) => string;
  /** Field name for cgrid's worker RowStore (bypasses source inference). */
  rowIdField: string;
}

/** Resolve the AG-shaped getRowId + discover which field it reads by
 *  probing it with a Proxy (the platform's composeRowId does a plain
 *  property read, so the probe captures the key without real data).
 *  Composite keys (multiple reads) degrade to the first field with a
 *  warning — full composite support is M3 (synthesized id column). */
function resolveGetRowId(gridOptions: Record<string, unknown>): ResolvedRowId {
  const agGetRowId = gridOptions.getRowId as ((params: { data: AnyRow }) => string) | undefined;
  if (typeof agGetRowId === 'function') {
    const accessed: string[] = [];
    try {
      const probe = new Proxy({}, {
        get: (_t, prop) => {
          if (typeof prop === 'string') accessed.push(prop);
          return 'probe';
        },
      });
      agGetRowId({ data: probe as AnyRow });
    } catch { /* probe best-effort */ }
    const rowIdField = accessed[0] ?? 'id';
    if (accessed.length > 1) {
      // eslint-disable-next-line no-console
      console.warn(`[MarketsCgrid] composite row id (${accessed.join('+')}) degrades to '${rowIdField}' — composite keys land with the M3 adapter work`);
    }
    return { getRowId: (row) => agGetRowId({ data: row }), rowIdField };
  }
  // eslint-disable-next-line no-console
  console.warn("[MarketsCgrid] no getRowId in grid options — assuming 'id'");
  return { getRowId: (row) => String(row.id), rowIdField: 'id' };
}

export const MarketsCgridSurface = memo(function MarketsCgridSurface<TData extends AnyRow>({
  gridOptions,
  hostOverrideKeys,
  rowData,
  columnDefs,
  rowHeight,
  headerHeight,
  animateRows,
  sideBar,
  statusBar,
  defaultColDef,
  onGridReady,
  onGridPreDestroyed,
}: MarketsCgridSurfaceProps<TData>) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<CGridApiAdapter<TData> | null>(null);
  const mountedRef = useRef(false);
  // StrictMode-safe teardown: `GridPlatform.destroy()` is terminal (its
  // `onGridReady` early-returns forever after), so the dev-mode transient
  // unmount must NOT reach `onGridPreDestroyed`. Cleanup schedules the real
  // teardown on a macrotask; an immediate remount (StrictMode) cancels it
  // and keeps the live grid + platform attachment.
  const pendingDestroyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);
  const scheduleDestroy = () => {
    if (teardownRef.current === null) return;
    pendingDestroyRef.current = setTimeout(() => {
      pendingDestroyRef.current = null;
      teardownRef.current?.();
    }, 0);
  };

  // Construction-time option snapshot — later changes flow through the
  // host's setGridOption sync loop / the prop effects below.
  const initialRef = useRef({ gridOptions, columnDefs, rowData, sideBar, statusBar, defaultColDef, rowHeight, headerHeight, animateRows, hostOverrideKeys });
  initialRef.current = { gridOptions, columnDefs, rowData, sideBar, statusBar, defaultColDef, rowHeight, headerHeight, animateRows, hostOverrideKeys };

  useLayoutEffect(() => {
    // Remount before the scheduled teardown ran (StrictMode) — cancel it
    // and keep the existing grid/adapter/platform attachment.
    if (pendingDestroyRef.current !== null) {
      clearTimeout(pendingDestroyRef.current);
      pendingDestroyRef.current = null;
      return () => scheduleDestroy();
    }
    const host = hostRef.current;
    if (!host || mountedRef.current) return;
    mountedRef.current = true;
    ensureCgridThemeStyles(host.ownerDocument);

    const init = initialRef.current;
    const bag = translateGridOptionsBag(init.gridOptions);
    const overrides: Record<string, unknown> = {};
    if (init.hostOverrideKeys.has('rowHeight') && init.rowHeight !== undefined) overrides.rowHeight = init.rowHeight;
    if (init.hostOverrideKeys.has('headerHeight') && init.headerHeight !== undefined) overrides.headerHeight = init.headerHeight;
    if (init.hostOverrideKeys.has('animateRows') && init.animateRows !== undefined) overrides.animateRows = init.animateRows;
    if (init.hostOverrideKeys.has('sideBar') && init.sideBar !== undefined) overrides.sideBar = init.sideBar;
    if (init.hostOverrideKeys.has('statusBar') && init.statusBar !== undefined) overrides.statusBar = init.statusBar;
    if (init.hostOverrideKeys.has('defaultColDef') && init.defaultColDef !== undefined) overrides.defaultColDef = init.defaultColDef;

    const { getRowId: getRowIdFn, rowIdField } = resolveGetRowId(init.gridOptions);
    const grid = new CGrid<TData>(host, {
      ...(bag as object),
      ...(overrides as object),
      theme: cgridThemeClass(),
      columnDefs: translateColumnDefs(init.columnDefs) as never,
      rowData: init.rowData,
      getRowId: getRowIdFn,
      rowIdField,
      // AG-parity synchronous displayed-row access (forEachNodeAfterFilter,
      // getDisplayedRowAtIndex, smart-edit/bulk-update collectors) — the
      // adapter reads grid.getDisplayedRowIds() off this mirror.
      mirrorDisplayedRowIds: true,
      cellSelection: {},
    } as never);

    const adapter = new CGridApiAdapter<TData>(grid, getRowIdFn);
    adapter.setAgColumnDefs(init.columnDefs);
    adapterRef.current = adapter;
    // Seed the adapter's node cache: route the construction rowData
    // through its canonical path so getRowNode lookups see it.
    if (init.rowData.length > 0) adapter.setGridOption('rowData', init.rowData);

    onGridReady({ api: adapter } as unknown as GridReadyEvent);

    teardownRef.current = () => {
      teardownRef.current = null;
      mountedRef.current = false;
      adapterRef.current = null;
      onGridPreDestroyed();
      adapter.destroy();
    };
    return () => scheduleDestroy();
    // Mount-once: construction inputs are snapshotted via initialRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rowData reference changes (snapshot replaces from the provider).
  const lastRowDataRef = useRef(rowData);
  useEffect(() => {
    if (lastRowDataRef.current === rowData) return;
    lastRowDataRef.current = rowData;
    adapterRef.current?.setGridOption('rowData', rowData);
  }, [rowData]);

  // columnDefs reference changes (pipeline re-runs).
  const lastDefsRef = useRef(columnDefs);
  useEffect(() => {
    if (lastDefsRef.current === columnDefs) return;
    lastDefsRef.current = columnDefs;
    adapterRef.current?.setGridOption('columnDefs', columnDefs);
  }, [columnDefs]);

  // Host override live changes.
  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter) return;
    if (hostOverrideKeys.has('rowHeight') && rowHeight !== undefined) adapter.setGridOption('rowHeight', rowHeight);
    if (hostOverrideKeys.has('headerHeight') && headerHeight !== undefined) adapter.setGridOption('headerHeight', headerHeight);
    if (hostOverrideKeys.has('animateRows') && animateRows !== undefined) adapter.setGridOption('animateRows', animateRows);
  }, [hostOverrideKeys, rowHeight, headerHeight, animateRows]);

  // The canvas snapshots resolved `--cg-*` values at read time, so any
  // change to the LIVE token values needs an explicit re-read:
  // `setTheme(sameClass)` re-runs cssReader + repaints without touching
  // grid state. Two triggers: the app's light/dark flip (data-theme on
  // <html>) and a density change (wrapper class swaps the density vars).
  useEffect(() => {
    const observer = new MutationObserver(() => {
      adapterRef.current?.cgrid.setTheme(cgridThemeClass());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const generalSettings = useGeneralSettingsFromContext();
  const gridDensity = resolveGridDensity(generalSettings);
  const wrapperClass = useMemo(() => cgridDensityClass(gridDensity), [gridDensity]);

  useEffect(() => {
    // Runs post-commit, after the wrapper class is in the DOM, so the
    // re-read resolves the new density's row/header heights.
    adapterRef.current?.cgrid.setTheme(cgridThemeClass());
  }, [wrapperClass]);

  return <div ref={hostRef} className={wrapperClass} style={SURFACE_STYLE} />;
}) as <TData extends AnyRow>(props: MarketsCgridSurfaceProps<TData>) => ReactElement;
