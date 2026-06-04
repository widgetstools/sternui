/**
 * MarketsGridSurface — the AgGridReact element with every option the
 * MarketsGrid host wires up: module-pipeline options first, then the
 * explicit prop overrides (rowHeight, headerHeight, animateRows,
 * sideBar, statusBar, defaultColDef), the streaming-safe filter
 * components, and the ready/pre-destroy callbacks.
 *
 * View-only. The ref is forwarded from the parent; controller callbacks
 * (`onGridReady`, `onGridPreDestroyed`) are pre-bound by the parent and
 * passed straight through. The wrapping `<div style={{ flex: 1 }}>` is
 * intentional — AG-Grid requires a flex parent to size itself.
 *
 * Memo'd with referential equality: AgGridReact runs `useEffect([props])`
 * and re-processes every changed prop reference. Parent re-renders that
 * don't change pipeline outputs must not reach the grid.
 */

import { memo, useMemo, type CSSProperties, type ReactElement, type RefObject } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { GridReadyEvent, Theme } from 'ag-grid-community';
import { StreamSafeTextFloatingFilter } from './streamSafeFloatingFilter';
import { StreamSafeNumberFloatingFilter } from './streamSafeNumberFloatingFilter';
import { StreamSafeDateFloatingFilter } from './streamSafeDateFloatingFilter';
import { cellRendererComponents } from '@starui/design-system';
import type { MarketsGridProps } from './types';
import { stripSurfaceManagedGridOptions } from './gridSurfaceOptions';

export interface MarketsGridSurfaceProps<TData> {
  readonly gridRef: RefObject<AgGridReact<TData> | null>;
  readonly gridOptions: Record<string, unknown>;
  readonly hostOverrideKeys: ReadonlySet<string>;
  readonly theme: MarketsGridProps<TData>['theme'];
  readonly rowData: TData[];
  readonly columnDefs: unknown[];
  readonly rowHeight?: number;
  readonly headerHeight?: number;
  readonly animateRows?: boolean;
  readonly sideBar: MarketsGridProps<TData>['sideBar'];
  readonly statusBar: MarketsGridProps<TData>['statusBar'];
  readonly defaultColDef: MarketsGridProps<TData>['defaultColDef'];
  readonly onGridReady: (event: GridReadyEvent) => void;
  readonly onGridPreDestroyed: () => void;
}

const SURFACE_STYLE: CSSProperties = { flex: 1 };

/**
 * Hoisted — inline `components={{…}}` re-triggers AgGridReact sync every
 * parent render. Combines the streamSafe floating-filter components with
 * the design-system cell-renderer registry so a colDef can reference
 * either kind by string id (`'streamSafeText'`, `'pill'`, `'heatmap'`,
 * `'side'`, etc.).
 *
 * `cellRendererComponents` is `Object.freeze`-d in the registry, so
 * inlining it into a fresh object once is safe — AgGridReact's
 * referential equality on the `components` prop survives subsequent
 * renders because this object literal is hoisted to module scope.
 */
const STREAM_SAFE_COMPONENTS = {
  streamSafeText: StreamSafeTextFloatingFilter,
  streamSafeNumber: StreamSafeNumberFloatingFilter,
  streamSafeDate: StreamSafeDateFloatingFilter,
  ...cellRendererComponents,
} as const;

function surfacePropsEqual<TData>(
  prev: Readonly<MarketsGridSurfaceProps<TData>>,
  next: Readonly<MarketsGridSurfaceProps<TData>>,
): boolean {
  return (
    prev.gridRef === next.gridRef
    && prev.gridOptions === next.gridOptions
    && prev.hostOverrideKeys === next.hostOverrideKeys
    && prev.theme === next.theme
    && prev.rowData === next.rowData
    && prev.columnDefs === next.columnDefs
    && prev.rowHeight === next.rowHeight
    && prev.headerHeight === next.headerHeight
    && prev.animateRows === next.animateRows
    && prev.sideBar === next.sideBar
    && prev.statusBar === next.statusBar
    && prev.defaultColDef === next.defaultColDef
    && prev.onGridReady === next.onGridReady
    && prev.onGridPreDestroyed === next.onGridPreDestroyed
  );
}

export const MarketsGridSurface = memo(function MarketsGridSurface<TData>({
  gridRef,
  gridOptions,
  hostOverrideKeys,
  theme,
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
}: MarketsGridSurfaceProps<TData>) {
  const pipelineGridOptions = useMemo(
    () => stripSurfaceManagedGridOptions(gridOptions, hostOverrideKeys),
    [gridOptions, hostOverrideKeys],
  );

  // AG Grid centers ordinary cell text via `line-height`, derived from the
  // theme's STATIC `--ag-row-height` param clamped against the runtime
  // `--ag-line-height` (set from the grid `rowHeight` option):
  //   line-height = min(--ag-row-height, --ag-line-height) - border - 2px
  // When the live row height exceeds the theme's baked height, the min()
  // clamps line-height below the real row height and text rides the top.
  // Fix: keep the theme's height PARAMS in sync with whatever height the grid
  // actually uses (host-override prop OR general-settings pipeline option), so
  // --ag-row-height == --ag-line-height and the clamp never bites. Pure
  // parameter-based theming — no CSS, no effect on horizontal align / ellipsis.
  const effRowHeight = hostOverrideKeys.has('rowHeight')
    ? rowHeight
    : (gridOptions.rowHeight as number | undefined);
  const effHeaderHeight = hostOverrideKeys.has('headerHeight')
    ? headerHeight
    : (gridOptions.headerHeight as number | undefined);

  const effectiveTheme = useMemo(() => {
    const overrides: Record<string, number> = {};
    if (typeof effRowHeight === 'number') overrides.rowHeight = effRowHeight;
    if (typeof effHeaderHeight === 'number') overrides.headerHeight = effHeaderHeight;
    const t = theme as Theme | undefined;
    if (Object.keys(overrides).length === 0 || typeof t?.withParams !== 'function') {
      return theme;
    }
    return t.withParams(overrides);
  }, [theme, effRowHeight, effHeaderHeight]);

  const hostOverrides = useMemo(() => {
    const out: Record<string, unknown> = {};
    if (hostOverrideKeys.has('rowHeight')) out.rowHeight = rowHeight;
    if (hostOverrideKeys.has('headerHeight')) out.headerHeight = headerHeight;
    if (hostOverrideKeys.has('animateRows')) out.animateRows = animateRows;
    if (hostOverrideKeys.has('sideBar')) out.sideBar = sideBar;
    if (hostOverrideKeys.has('statusBar')) out.statusBar = statusBar;
    if (hostOverrideKeys.has('defaultColDef')) out.defaultColDef = defaultColDef;
    return out;
  }, [
    hostOverrideKeys,
    rowHeight,
    headerHeight,
    animateRows,
    sideBar,
    statusBar,
    defaultColDef,
  ]);

  return (
    <div style={SURFACE_STYLE}>
      <AgGridReact
        ref={gridRef}
        {...pipelineGridOptions}
        {...hostOverrides}
        theme={effectiveTheme}
        rowData={rowData}
        columnDefs={columnDefs as never}
        maintainColumnOrder
        cellSelection={true}
        suppressNoRowsOverlay={true}
        overlayNoRowsTemplate=" "
        // Flush async transactions on the next animation frame instead of
        // holding them for a fixed window. Transactions arriving within the
        // same frame still coalesce into one render (the perf win of
        // applyTransactionAsync), but we no longer add a 100ms latency floor
        // on top of any worker-side throttle/conflation — so disabling the
        // provider's throttle (StompProviderConfig.throttleEnabled) yields
        // near-immediate grid updates end-to-end.
        asyncTransactionWaitMillis={0}
        components={STREAM_SAFE_COMPONENTS}
        onGridReady={onGridReady}
        onGridPreDestroyed={onGridPreDestroyed}
      />
    </div>
  );
}, surfacePropsEqual) as <TData>(props: MarketsGridSurfaceProps<TData>) => ReactElement;
