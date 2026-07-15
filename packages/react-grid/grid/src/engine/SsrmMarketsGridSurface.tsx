import { forwardRef, useImperativeHandle, useRef } from 'react';
import { SSRMGrid, type SSRMGridHandle, type SSRMColDef } from './ssrmgrid-entry.js';

export type SsrmMarketsGridSurfaceProps<TData> = {
  rowData: TData[];
  columnDefs: SSRMColDef[];
  rowIdField: string;
  height?: string | number;
  quickFilterText?: string;
};

export const SsrmMarketsGridSurface = forwardRef<
  SSRMGridHandle,
  SsrmMarketsGridSurfaceProps<Record<string, unknown>>
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
  }));

  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
      <SSRMGrid
        ref={inner}
        columnDefs={props.columnDefs}
        rowData={props.rowData as Record<string, unknown>[]}
        getRowId={props.rowIdField}
        height="100%"
        quickFilterText={props.quickFilterText}
      />
    </div>
  );
});
