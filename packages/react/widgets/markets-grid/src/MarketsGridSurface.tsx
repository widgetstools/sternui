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
 */

import type { CSSProperties, RefObject } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { GridReadyEvent } from 'ag-grid-community';
import { StreamSafeTextFloatingFilter } from './streamSafeFloatingFilter';
import { StreamSafeNumberFloatingFilter } from './streamSafeNumberFloatingFilter';
import type { MarketsGridProps } from './types';

export interface MarketsGridSurfaceProps<TData> {
  readonly gridRef: RefObject<AgGridReact<TData> | null>;
  readonly gridOptions: Record<string, unknown>;
  readonly theme: MarketsGridProps<TData>['theme'];
  readonly rowData: TData[];
  readonly columnDefs: unknown[];
  readonly rowHeight: number;
  readonly headerHeight: number;
  readonly animateRows: boolean;
  readonly sideBar: MarketsGridProps<TData>['sideBar'];
  readonly statusBar: MarketsGridProps<TData>['statusBar'];
  readonly defaultColDef: MarketsGridProps<TData>['defaultColDef'];
  readonly onGridReady: (event: GridReadyEvent) => void;
  readonly onGridPreDestroyed: () => void;
}

const SURFACE_STYLE: CSSProperties = { flex: 1 };

export function MarketsGridSurface<TData>({
  gridRef,
  gridOptions,
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
  return (
    <div style={SURFACE_STYLE}>
      <AgGridReact
        ref={gridRef}
        // Spread the module-pipeline options FIRST so explicit host props
        // (rowHeight / headerHeight / animateRows / etc.) win on conflict —
        // the consumer's prop is authoritative unless a module deliberately
        // wants to override it.
        {...(gridOptions as Record<string, unknown>)}
        theme={theme}
        rowData={rowData}
        columnDefs={columnDefs as never}
        // `maintainColumnOrder: true` preserves the user's drag-reordered
        // column positions when `columnDefs` re-derives (every module-state
        // change). AG-Grid's default would match the current columnDefs
        // order on every update, resetting the user's drag reorders.
        maintainColumnOrder
        rowHeight={rowHeight}
        headerHeight={headerHeight}
        animateRows={animateRows}
        cellSelection={true}
        sideBar={sideBar}
        statusBar={statusBar}
        defaultColDef={defaultColDef}
        // Suppress AG-Grid's built-in "No Rows To Show" overlay —
        // the container's own loading overlay covers the empty
        // state during snapshot fetch, and consumers handle the
        // truly-empty case themselves.
        suppressNoRowsOverlay={true}
        // Belt-and-suspenders: blank the template too in case the
        // option name is renamed in a future AG-Grid version.
        overlayNoRowsTemplate=" "
        // Coalesce live-update transactions every 100ms instead of
        // AG-Grid's 60ms default. Higher value → fewer main-thread
        // tasks under fast feeds (each task processes more rows but
        // they fire less often), reducing the rate of >50ms
        // "message handler" violations. 100ms is comfortably under
        // human-perceivable lag (~150ms threshold).
        asyncTransactionWaitMillis={100}
        // Register custom AG-Grid component types referenced by name
        // from colDef. `streamSafeText` is our focus-aware floating
        // filter that ignores onParentModelChanged while the input
        // has focus — defends against the multi-filter set-sub-filter
        // mid-typing input clobber on streaming-data grids.
        components={{
          streamSafeText: StreamSafeTextFloatingFilter,
          streamSafeNumber: StreamSafeNumberFloatingFilter,
        }}
        onGridReady={onGridReady}
        onGridPreDestroyed={onGridPreDestroyed}
      />
    </div>
  );
}
