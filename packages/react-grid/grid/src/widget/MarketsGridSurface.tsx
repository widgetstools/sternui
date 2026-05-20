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
import type { GridReadyEvent } from 'ag-grid-community';
import { StreamSafeTextFloatingFilter } from './streamSafeFloatingFilter';
import { StreamSafeNumberFloatingFilter } from './streamSafeNumberFloatingFilter';
import { StreamSafeDateFloatingFilter } from './streamSafeDateFloatingFilter';
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

/** Hoisted — inline `components={{…}}` re-triggers AgGridReact sync every parent render. */
const STREAM_SAFE_COMPONENTS = {
  streamSafeText: StreamSafeTextFloatingFilter,
  streamSafeNumber: StreamSafeNumberFloatingFilter,
  streamSafeDate: StreamSafeDateFloatingFilter,
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
        theme={theme}
        rowData={rowData}
        columnDefs={columnDefs as never}
        maintainColumnOrder
        cellSelection={true}
        suppressNoRowsOverlay={true}
        overlayNoRowsTemplate=" "
        asyncTransactionWaitMillis={100}
        components={STREAM_SAFE_COMPONENTS}
        onGridReady={onGridReady}
        onGridPreDestroyed={onGridPreDestroyed}
      />
    </div>
  );
}, surfacePropsEqual) as <TData>(props: MarketsGridSurfaceProps<TData>) => ReactElement;
