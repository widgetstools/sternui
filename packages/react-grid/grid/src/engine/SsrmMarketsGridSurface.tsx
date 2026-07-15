import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import type { GridReadyEvent, Theme } from 'ag-grid-community';
import { buildStreamSafeComponents } from '../widget/buildStreamSafeComponents.js';
import { SSRMGrid, type SSRMGridHandle, type SSRMColDef } from './ssrmgrid-entry.js';

export type SsrmMarketsGridSurfaceProps = {
  rowData: Record<string, unknown>[];
  columnDefs: SSRMColDef[];
  rowIdField: string;
  height?: string | number;
  quickFilterText?: string;
  /** Required from MarketsGrid — StarUI design-system AG Grid theme. */
  theme: Theme;
  rowHeight?: number;
  headerHeight?: number;
  sideBar?: unknown;
  statusBar?: unknown;
  defaultColDef?: SSRMColDef;
  includeAllStreamSafeFilters?: boolean;
  onGridReady?: (event: GridReadyEvent) => void;
  /** From general-settings (same defaults as CSRM). */
  grandTotalRow?: boolean | 'top' | 'bottom' | 'pinnedTop' | 'pinnedBottom';
  groupTotalRow?: 'top' | 'bottom';
  /**
   * Perspective keep predicate for row-exclusion under SSRM
   * (`not(excludeExpr)`). Compiled by MarketsGrid from toolbar DSL.
   */
  rowKeepExpression?: string;
};

/**
 * SSRM presentation surface — peer to MarketsGridSurface.
 * Owns design-system chrome passthrough; SSRMGrid owns the Perspective engine.
 */
export const SsrmMarketsGridSurface = forwardRef<
  SSRMGridHandle,
  SsrmMarketsGridSurfaceProps
>(function SsrmMarketsGridSurface(props, ref) {
  const inner = useRef<SSRMGridHandle>(null);
  useImperativeHandle(ref, () => ({
    applyTransaction: (tx) => inner.current?.applyTransaction(tx),
    applyTransactionAsync: (tx) => inner.current?.applyTransactionAsync(tx),
    getApi: () => inner.current?.getApi() ?? null,
    getServerSideSelectionState: () =>
      inner.current?.getServerSideSelectionState() ?? null,
    setServerSideSelectionState: (s) =>
      inner.current?.setServerSideSelectionState(s),
    chartFilteredData: (opts) =>
      inner.current?.chartFilteredData(opts) ?? Promise.resolve(null),
    countMatching: (filterModel) =>
      inner.current?.countMatching(filterModel) ?? Promise.resolve(0),
    getGroupLeafRows: (opts) =>
      inner.current?.getGroupLeafRows(opts) ?? Promise.resolve([]),
  }));

  const streamSafeComponents = useMemo(
    () =>
      buildStreamSafeComponents(
        props.columnDefs as Parameters<typeof buildStreamSafeComponents>[0],
        props.includeAllStreamSafeFilters ?? true,
      ),
    [props.columnDefs, props.includeAllStreamSafeFilters],
  );

  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
      <SSRMGrid
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
        components={streamSafeComponents as Record<string, unknown>}
        suppressNoRowsOverlay
        overlayNoRowsTemplate=" "
        onGridReady={props.onGridReady}
        grandTotalRow={props.grandTotalRow}
        groupTotalRow={props.groupTotalRow}
      />
    </div>
  );
});
