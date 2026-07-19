import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import type { GridReadyEvent, Theme } from 'ag-grid-community';
import { buildStreamSafeComponents } from '../widget/buildStreamSafeComponents.js';
import { stripSurfaceManagedGridOptions } from '../widget/gridSurfaceOptions.js';
import {
  SsrmGrid,
  type SSRMGridHandle,
  type SSRMColDef,
} from './ssrmgrid-entry.js';

const EMPTY_OVERRIDE_KEYS: ReadonlySet<string> = new Set();

export type SsrmMarketsGridSurfaceProps = {
  rowData: Record<string, unknown>[];
  columnDefs: SSRMColDef[];
  rowIdField: string;
  height?: string | number;
  quickFilterText?: string;
  /** StarUI design-system AG Grid theme. */
  theme?: Theme;
  rowHeight?: number;
  headerHeight?: number;
  sideBar?: unknown;
  statusBar?: unknown;
  defaultColDef?: SSRMColDef;
  includeAllStreamSafeFilters?: boolean;
  onGridReady?: (event: GridReadyEvent) => void;
  /**
   * Module-pipeline gridOptions (general-settings et al — worklog T5).
   * Forwarded to the SSRM grid after stripping surface-managed keys; the
   * grid strips its own SSRM-structural keys on top.
   */
  gridOptions?: Record<string, unknown>;
  /** Keys the host passed explicitly — pipeline must not fight these. */
  hostOverrideKeys?: ReadonlySet<string>;
  /** From general-settings (same defaults as CSRM). */
  grandTotalRow?: boolean | 'top' | 'bottom' | 'pinnedTop' | 'pinnedBottom';
  groupTotalRow?: 'top' | 'bottom';
  /**
   * Keep predicate for row-exclusion under SSRM (`not(excludeExpr)`).
   * Compiled by MarketsGrid from toolbar DSL; evaluated on the custom engine.
   */
  rowKeepExpression?: string;
  /**
   * @deprecated Ignored — MarketsGrid SSRM is SsrmGrid only.
   * Kept optional so existing call sites compile.
   */
  ssrmEngine?: 'custom' | 'auto' | 'perspective';
  /** @deprecated Ignored — reserved for older auto-engine heuristics. */
  ssrmExpectedRowCount?: number;
};

/**
 * SSRM presentation surface — peer to MarketsGridSurface.
 * Always mounts SsrmGrid (main-thread RowMirror).
 */
export const SsrmMarketsGridSurface = forwardRef<
  SSRMGridHandle,
  SsrmMarketsGridSurfaceProps
>(function SsrmMarketsGridSurface(props, ref) {
  const inner = useRef<SSRMGridHandle>(null);
  useImperativeHandle(ref, () => ({
    applyTransaction: (tx) => {
      inner.current?.applyTransaction(tx);
    },
    applyTransactionAsync: (tx) => {
      inner.current?.applyTransactionAsync(tx);
    },
    getApi: () => inner.current?.getApi() ?? null,
    getServerSideSelectionState: () =>
      inner.current?.getServerSideSelectionState() ?? null,
    setServerSideSelectionState: (s) => {
      inner.current?.setServerSideSelectionState(s);
    },
    chartFilteredData: (opts) =>
      inner.current?.chartFilteredData(opts) ?? Promise.resolve(null),
    countMatching: (filterModel) =>
      inner.current?.countMatching(filterModel) ?? Promise.resolve(0),
    getGroupLeafRows: (opts) =>
      inner.current?.getGroupLeafRows(opts) ?? Promise.resolve([]),
    queryAll: (opts) =>
      inner.current?.queryAll(opts) ??
      Promise.resolve({ rowData: [], rowCount: 0 }),
    forEachMatching: (cb, opts) =>
      inner.current?.forEachMatching(cb, opts) ??
      Promise.resolve({ rowCount: 0 }),
    exportAll: (opts) =>
      inner.current?.exportAll(opts) ?? Promise.resolve({ rowCount: 0 }),
  }));

  const streamSafeComponents = useMemo(
    () =>
      buildStreamSafeComponents(
        props.columnDefs as Parameters<typeof buildStreamSafeComponents>[0],
        props.includeAllStreamSafeFilters ?? true,
      ),
    [props.columnDefs, props.includeAllStreamSafeFilters],
  );

  const pipelineGridOptions = useMemo(
    () =>
      stripSurfaceManagedGridOptions(
        props.gridOptions ?? {},
        props.hostOverrideKeys ?? EMPTY_OVERRIDE_KEYS,
      ),
    [props.gridOptions, props.hostOverrideKeys],
  );

  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
      <SsrmGrid
        ref={inner}
        columnDefs={props.columnDefs}
        rowData={props.rowData}
        getRowId={props.rowIdField}
        height={props.height ?? '100%'}
        quickFilterText={props.quickFilterText}
        rowKeepExpression={props.rowKeepExpression}
        theme={props.theme}
        loadThemeGoogleFonts={false}
        rowHeight={props.rowHeight}
        headerHeight={props.headerHeight}
        sideBar={props.sideBar}
        statusBar={props.statusBar}
        defaultColDef={props.defaultColDef}
        gridOptions={pipelineGridOptions}
        components={streamSafeComponents as Record<string, unknown>}
        suppressNoRowsOverlay
        overlayNoRowsTemplate=" "
        onGridReady={props.onGridReady}
        grandTotalRow={props.grandTotalRow}
        groupTotalRow={props.groupTotalRow}
        cacheBlockSize={100}
        blockLoadDebounceMillis={50}
        rowBuffer={10}
        suppressAnimationFrame
      />
    </div>
  );
});
