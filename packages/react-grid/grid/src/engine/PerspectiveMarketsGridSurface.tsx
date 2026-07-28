/**
 * Perspective presentation surface — peer to MarketsGridSurface (CSRM) and
 * SsrmMarketsGridSurface (CustomSSRMGrid).
 *
 * AG Grid stays the surface; only the row supply changes. The book lives once
 * as a Table in the worker and this window reads the blocks its viewport asks
 * for, so nothing here ever holds more than a few hundred rows — which is the
 * whole reason a second and third blotter open as fast as the first.
 *
 * Everything with a non-obvious rule behind it (per-level refresh, the
 * grand-total transaction, the row count that is illegal while grouping, the
 * throttle) belongs to `createPerspectiveRowEngine`. This file is the mount.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { GetRowIdParams, GridApi, GridReadyEvent, Theme } from 'ag-grid-community';
import {
  createPerspectiveRowEngine,
  GRAND_TOTAL_FLAG,
  GRAND_TOTAL_ROW_ID,
  type PerspectiveRowEngine,
  type PerspectiveTableLike,
} from '@starui/perspective-grid';
import { buildStreamSafeComponents } from '../widget/buildStreamSafeComponents.js';

export interface PerspectiveMarketsGridSurfaceHandle {
  getApi(): GridApi | null;
  /** Re-read every level now — used after an out-of-band change. */
  refresh(): void;
  /** Pause/resume re-reading when the Table moves. */
  setLive(live: boolean): void;
}

export interface PerspectiveMarketsGridSurfaceProps {
  /** Worker-held Table this window reads. Opened by the host, never built here. */
  table: PerspectiveTableLike;
  /** Index column — also labels the grand total row. */
  keyColumn: string;
  columnDefs: unknown[];
  height?: string | number;
  theme?: Theme;
  rowHeight?: number;
  headerHeight?: number;
  sideBar?: unknown;
  statusBar?: unknown;
  defaultColDef?: unknown;
  includeAllStreamSafeFilters?: boolean;
  onGridReady?: (event: GridReadyEvent) => void;
  grandTotalRow?: boolean | 'top' | 'bottom' | 'pinnedTop' | 'pinnedBottom';
  groupTotalRow?: 'top' | 'bottom';
  /** Coalesce Table updates into at most one re-read per this many ms. */
  refreshMs?: number;
  onError?: (error: unknown) => void;
}

/**
 * Row ids must be the group PATH, not a leaf key.
 *
 * Group rows carry no key column of their own, so an id derived from it
 * collides across every group at a level — and duplicate ids turn a
 * successful block into a failed one (AG warn 205) rather than warning
 * visibly.
 */
function makeGetRowId(keyColumn: string) {
  return ({ level, parentKeys = [], data, api }: GetRowIdParams): string => {
    const row = data as Record<string, unknown> | undefined;
    if (row?.[GRAND_TOTAL_FLAG]) return GRAND_TOTAL_ROW_ID;
    const groupCols = api.getRowGroupColumns?.() ?? [];
    if (level < groupCols.length) {
      const field = groupCols[level].getColDef().field;
      return [...parentKeys, field ? row?.[field] : undefined].join('/');
    }
    return [...parentKeys, row?.[keyColumn]].join('/');
  };
}

export const PerspectiveMarketsGridSurface = forwardRef<
  PerspectiveMarketsGridSurfaceHandle,
  PerspectiveMarketsGridSurfaceProps
>(function PerspectiveMarketsGridSurface(props, ref) {
  const { table, keyColumn, refreshMs, onError } = props;
  const apiRef = useRef<GridApi | null>(null);
  const [engine, setEngine] = useState<PerspectiveRowEngine | null>(null);

  // One engine per Table. Rebuilt when the Table changes (a provider restart
  // hands over a new one), and always closed — its Views hold engine memory
  // and are charged on every tick until they are deleted.
  useEffect(() => {
    const next = createPerspectiveRowEngine({ table, keyColumn, refreshMs, onError });
    if (apiRef.current) next.setApi(apiRef.current as never);
    setEngine(next);
    return () => {
      void next.close();
    };
  }, [table, keyColumn, refreshMs, onError]);

  useImperativeHandle(
    ref,
    () => ({
      getApi: () => apiRef.current,
      refresh: () => engine?.refreshNow(),
      setLive: (live: boolean) => engine?.setLive(live),
    }),
    [engine],
  );

  const streamSafeComponents = useMemo(
    () =>
      buildStreamSafeComponents(
        props.columnDefs as Parameters<typeof buildStreamSafeComponents>[0],
        props.includeAllStreamSafeFilters ?? true,
      ),
    [props.columnDefs, props.includeAllStreamSafeFilters],
  );

  const getRowId = useMemo(() => makeGetRowId(keyColumn), [keyColumn]);

  // The shell still carries the legacy boolean form of this setting; AG Grid 36
  // takes a position only.
  const grandTotalRow =
    props.grandTotalRow === true
      ? ('pinnedBottom' as const)
      : props.grandTotalRow === false
        ? undefined
        : props.grandTotalRow;

  const datasource = useMemo(
    () =>
      engine === null
        ? undefined
        : {
            getRows: (params: Parameters<typeof engine.datasource.getRows>[0]) =>
              engine.datasource.getRows(params),
          },
    [engine],
  );

  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%', height: props.height ?? '100%' }}>
      <AgGridReact
        theme={props.theme}
        loadThemeGoogleFonts={false}
        columnDefs={props.columnDefs as never}
        defaultColDef={props.defaultColDef as never}
        rowModelType="serverSide"
        serverSideDatasource={datasource as never}
        getRowId={getRowId}
        // 100 rows is the window size every measurement in the package's
        // ARCHITECTURE.md used, and the depth at which reads stay flat.
        cacheBlockSize={100}
        maxBlocksInCache={20}
        blockLoadDebounceMillis={0}
        rowHeight={props.rowHeight}
        headerHeight={props.headerHeight}
        sideBar={props.sideBar as never}
        statusBar={props.statusBar as never}
        components={streamSafeComponents as Record<string, unknown>}
        grandTotalRow={grandTotalRow}
        groupTotalRow={props.groupTotalRow}
        suppressAggFuncInHeader
        suppressNoRowsOverlay
        overlayNoRowsTemplate=" "
        onGridReady={(event) => {
          apiRef.current = event.api;
          engine?.setApi(event.api as never);
          props.onGridReady?.(event);
        }}
      />
    </div>
  );
});
