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
import type { GetContextMenuItems, GetRowIdFunc, GridReadyEvent, IServerSideDatasource } from 'ag-grid-community';
import type { MarketsGridProps } from './types';
import { stripSurfaceManagedGridOptions } from './gridSurfaceOptions';
import { buildStreamSafeComponents } from './buildStreamSafeComponents';
import { adaptStatusBarForServerSide, SSRM_STATUS_BAR_COMPONENTS } from './ssrmStatusBar';

export interface MarketsGridSurfaceProps<TData> {
  readonly gridRef: RefObject<AgGridReact<TData> | null>;
  readonly gridOptions: Record<string, unknown>;
  readonly hostOverrideKeys: ReadonlySet<string>;
  readonly theme: MarketsGridProps<TData>['theme'];
  readonly rowData: TData[];
  readonly columnDefs: unknown[];
  /** `'serverSide'` switches the grid to the Server-Side Row Model and uses
   *  `serverSideDatasource` instead of `rowData`. Default `'clientSide'`. */
  readonly rowModelType?: 'clientSide' | 'serverSide';
  readonly serverSideDatasource?: IServerSideDatasource<TData>;
  readonly getRowId?: GetRowIdFunc<TData>;
  readonly cacheBlockSize?: number;
  readonly maxBlocksInCache?: number;
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
    && prev.columnDefs === next.columnDefs
    && prev.rowModelType === next.rowModelType
    && prev.serverSideDatasource === next.serverSideDatasource
    && prev.getRowId === next.getRowId
    && prev.cacheBlockSize === next.cacheBlockSize
    && prev.maxBlocksInCache === next.maxBlocksInCache
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
  columnDefs,
  rowModelType,
  serverSideDatasource,
  getRowId,
  cacheBlockSize,
  maxBlocksInCache,
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
  const serverSide = rowModelType === 'serverSide';
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

  // SSRM: register the row-count status panel + swap CSRM-only count panels for
  // it (those don't render under SSRM, leaving the status bar empty/absent).
  const components = useMemo(
    () => (serverSide ? { ...streamSafeComponents, ...SSRM_STATUS_BAR_COMPONENTS } : streamSafeComponents),
    [serverSide, streamSafeComponents],
  );
  const serverSideStatusBar = useMemo(() => {
    if (!serverSide) return undefined;
    const raw = hostOverrideKeys.has('statusBar')
      ? statusBar
      : (pipelineGridOptions as { statusBar?: unknown }).statusBar;
    return adaptStatusBarForServerSide(raw);
  }, [serverSide, hostOverrideKeys, statusBar, pipelineGridOptions]);

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
        {...(serverSide
          ? {
              rowModelType: 'serverSide' as const,
              serverSideDatasource,
              getRowId,
              cacheBlockSize,
              maxBlocksInCache,
              ...(serverSideStatusBar !== undefined
                ? { statusBar: serverSideStatusBar as MarketsGridProps<TData>['statusBar'] }
                : {}),
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
        components={components}
        getContextMenuItems={getContextMenuItems}
        onGridReady={onGridReady}
        onGridPreDestroyed={onGridPreDestroyed}
      />
    </div>
  );
}, surfacePropsEqual) as <TData>(props: MarketsGridSurfaceProps<TData>) => ReactElement;
