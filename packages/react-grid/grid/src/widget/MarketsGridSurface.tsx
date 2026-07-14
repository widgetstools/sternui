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
import type { GetContextMenuItems, GridReadyEvent, IServerSideDatasource } from 'ag-grid-community';
import type { MarketsGridProps } from './types';
import { stripSurfaceManagedGridOptions } from './gridSurfaceOptions';
import { buildStreamSafeComponents } from './buildStreamSafeComponents';

export interface MarketsGridSurfaceProps<TData> {
  readonly gridRef: RefObject<AgGridReact<TData> | null>;
  readonly gridOptions: Record<string, unknown>;
  readonly hostOverrideKeys: ReadonlySet<string>;
  readonly theme: MarketsGridProps<TData>['theme'];
  readonly rowData: TData[];
  readonly rowModelType?: 'clientSide' | 'serverSide';
  readonly serverSideDatasource?: IServerSideDatasource;
  readonly cacheBlockSize?: number;
  readonly columnDefs: unknown[];
  readonly rowHeight?: number;
  readonly headerHeight?: number;
  readonly animateRows?: boolean;
  readonly sideBar: MarketsGridProps<TData>['sideBar'];
  readonly statusBar: MarketsGridProps<TData>['statusBar'];
  readonly defaultColDef: MarketsGridProps<TData>['defaultColDef'];
  /** Cell right-click menu builder. Must be referentially stable (built with
   *  `useCallback` in the host) so this memo'd surface doesn't make
   *  AgGridReact re-process the option each render. */
  readonly getContextMenuItems?: GetContextMenuItems;
  readonly onGridReady: (event: GridReadyEvent) => void;
  readonly onGridPreDestroyed: () => void;
  /** When false, omit date floating filter from components map if unused. Default true. */
  readonly includeAllStreamSafeFilters?: boolean;
}

const SURFACE_STYLE: CSSProperties = { flex: 1 };

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
    && prev.rowModelType === next.rowModelType
    && prev.serverSideDatasource === next.serverSideDatasource
    && prev.cacheBlockSize === next.cacheBlockSize
    && prev.columnDefs === next.columnDefs
    && prev.rowHeight === next.rowHeight
    && prev.headerHeight === next.headerHeight
    && prev.animateRows === next.animateRows
    && prev.sideBar === next.sideBar
    && prev.statusBar === next.statusBar
    && prev.defaultColDef === next.defaultColDef
    && prev.getContextMenuItems === next.getContextMenuItems
    && prev.onGridReady === next.onGridReady
    && prev.onGridPreDestroyed === next.onGridPreDestroyed
    && prev.includeAllStreamSafeFilters === next.includeAllStreamSafeFilters
  );
}

export const MarketsGridSurface = memo(function MarketsGridSurface<TData>({
  gridRef,
  gridOptions,
  hostOverrideKeys,
  theme,
  rowData,
  rowModelType = 'clientSide',
  serverSideDatasource,
  cacheBlockSize = 100,
  columnDefs,
  rowHeight,
  headerHeight,
  animateRows,
  sideBar,
  statusBar,
  defaultColDef,
  getContextMenuItems,
  onGridReady,
  onGridPreDestroyed,
  includeAllStreamSafeFilters = true,
}: MarketsGridSurfaceProps<TData>) {
  const pipelineGridOptions = useMemo(
    () => stripSurfaceManagedGridOptions(gridOptions, hostOverrideKeys),
    [gridOptions, hostOverrideKeys],
  );

  const streamSafeComponents = useMemo(
    () => buildStreamSafeComponents(
      columnDefs as Parameters<typeof buildStreamSafeComponents>[0],
      includeAllStreamSafeFilters,
    ),
    [columnDefs, includeAllStreamSafeFilters],
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
        rowModelType={rowModelType}
        {...(rowModelType === 'serverSide'
          ? {
              serverSideDatasource,
              cacheBlockSize,
            }
          : { rowData })}
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
        components={streamSafeComponents}
        getContextMenuItems={getContextMenuItems}
        onGridReady={onGridReady}
        onGridPreDestroyed={onGridPreDestroyed}
      />
    </div>
  );
}, surfacePropsEqual) as <TData>(props: MarketsGridSurfaceProps<TData>) => ReactElement;
