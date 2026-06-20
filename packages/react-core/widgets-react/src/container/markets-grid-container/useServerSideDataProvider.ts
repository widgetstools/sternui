/**
 * useServerSideDataProvider — the Server-Side Row Model counterpart to
 * {@link useProviderDataWiring}. Where the CSRM path subscribes a provider and
 * streams the full cache into `rowData`, this drives the SAME hub provider in
 * SSRM mode (`client.subscribeServerSide`): the grid pulls visible blocks and
 * the hub pushes only in-range updates + a live grand total. The provider config
 * is identical — only the subscription mode differs.
 *
 * Returns the pieces MarketsGrid needs in `rowModelType: 'serverSide'` mode:
 * the `IServerSideDatasource`, a stable `getRowId`, and `bindApi` to wire the
 * live transaction/grand-total/refresh callbacks once the grid is ready.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GetRowIdFunc,
  GridApi,
  IServerSideDatasource,
  IServerSideGetRowsParams,
} from 'ag-grid-community';
import { useDataServices } from '@starui/host-data-react/runtime';
import type { ServerSideHandle } from '@starui/host-data/runtime';
import type { ProviderStatus } from '@starui/host-data/runtime';

export interface UseServerSideDataProviderParams {
  /** Active provider id, or null until one resolves. */
  providerId: string | null;
  /** Resolved provider config (needed for the hub to create the provider). */
  cfg: unknown;
  /** Provider key column(s) — drives `getRowId` and the hub's row keys. */
  keyColumn: string | readonly string[];
  /** Numeric columns to total for the grand total when AG-Grid sends none. */
  numericValueCols?: { id: string; field?: string; aggFunc?: string }[];
}

export interface ServerSideDataProvider<TData extends Record<string, unknown>> {
  datasource: IServerSideDatasource<TData> | null;
  getRowId: GetRowIdFunc<TData>;
  /** Wire the live callbacks to the grid api (call from `onGridReady`). */
  bindApi: (api: GridApi<TData> | null) => void;
  /** Active row-group column ids — keep updated for group-row ids. */
  setGroupCols: (colIds: string[]) => void;
  /** Total provider cache rows (for a status bar); read after a pull. */
  cacheRowCountRef: { readonly current: number };
  /** Provider status — `'loading'` until the hub snapshot is ready. Drives the
   *  loading overlay (the CSRM snapshot-resolution path doesn't run in SSRM). */
  status: ProviderStatus;
  error?: string;
}

const composeKey = (data: Record<string, unknown>, keyColumn: string | readonly string[]): string =>
  Array.isArray(keyColumn)
    ? keyColumn.map((k) => String(data[k])).join('|')
    : String(data[keyColumn as string]);

export function useServerSideDataProvider<TData extends Record<string, unknown>>(
  params: UseServerSideDataProviderParams,
): ServerSideDataProvider<TData> {
  const { providerId, cfg, keyColumn, numericValueCols } = params;
  const { client } = useDataServices();

  const apiRef = useRef<GridApi<TData> | null>(null);
  const groupColsRef = useRef<string[]>([]);
  const cacheRowCountRef = useRef(0);
  const valueColsRef = useRef(numericValueCols);
  valueColsRef.current = numericValueCols;
  const [datasource, setDatasource] = useState<IServerSideDatasource<TData> | null>(null);
  const [status, setStatus] = useState<ProviderStatus>('loading');
  const [error, setError] = useState<string | undefined>(undefined);

  const getRowId = useCallback<GetRowIdFunc<TData>>(
    (p) => {
      const parentKeys = (p as { parentKeys?: string[] }).parentKeys ?? [];
      const data = p.data as Record<string, unknown>;
      const leaf = data[Array.isArray(keyColumn) ? keyColumn[0]! : (keyColumn as string)];
      if (leaf != null) {
        const id = composeKey(data, keyColumn);
        return parentKeys.length ? `${parentKeys.join('/')}/${id}` : id;
      }
      const groupCol = groupColsRef.current[parentKeys.length];
      const groupKey = groupCol ? data[groupCol] : undefined;
      return `g:${[...parentKeys, String(groupKey)].join('/')}`;
    },
    [keyColumn],
  );

  const bindApi = useCallback((api: GridApi<TData> | null) => { apiRef.current = api; }, []);
  const setGroupCols = useCallback((colIds: string[]) => { groupColsRef.current = colIds; }, []);

  useEffect(() => {
    if (!providerId || !cfg) return;
    setStatus('loading');
    setError(undefined);
    const handle = client.subscribeServerSide<TData>(providerId, cfg as never);

    handle.onStatus((s, err) => {
      setStatus(s);
      setError(err);
      // The hub re-snapshots (loading→ready) on restart; re-pull so the grid
      // shows the fresh data once ready.
      if (s === 'ready') apiRef.current?.refreshServerSide({ purge: true });
    });
    handle.onTransaction((tx) => {
      const api = apiRef.current;
      if (!api) return;
      if (tx.replaceLevel) {
        api.applyServerSideRowData({
          route: tx.route,
          successParams: { rowData: tx.rows.slice() as TData[], rowCount: tx.rowCount ?? tx.rows.length },
        });
      } else {
        api.applyServerSideTransactionAsync({ route: tx.route, update: tx.rows.slice() as TData[] });
      }
    });
    handle.onGrandTotal((grandTotal) => {
      apiRef.current?.setGridOption('pinnedBottomRowData', grandTotal ? [grandTotal as TData] : []);
    });
    handle.onRefresh(() => apiRef.current?.refreshServerSide({ purge: true }));

    setDatasource(makeDatasource(handle, valueColsRef, cacheRowCountRef, apiRef));
    return () => {
      handle.unsubscribe();
      setDatasource(null);
    };
  }, [client, providerId, cfg]);

  return useMemo(
    () => ({ datasource, getRowId, bindApi, setGroupCols, cacheRowCountRef, status, error }),
    [datasource, getRowId, bindApi, setGroupCols, status, error],
  );
}

function makeDatasource<TData extends Record<string, unknown>>(
  handle: ServerSideHandle<TData>,
  valueColsRef: { current: { id: string; field?: string; aggFunc?: string }[] | undefined },
  cacheRowCountRef: { current: number },
  apiRef: { current: GridApi<TData> | null },
): IServerSideDatasource<TData> {
  return {
    getRows: (p: IServerSideGetRowsParams<TData>) => {
      const r = p.request;
      handle
        .getRows(r.startRow ?? 0, r.endRow ?? 0, {
          sortModel: r.sortModel as { colId: string; sort: 'asc' | 'desc' }[],
          filterModel: r.filterModel as Record<string, unknown>,
          rowGroupCols: r.rowGroupCols,
          valueCols: r.valueCols?.length ? r.valueCols : valueColsRef.current,
          groupKeys: r.groupKeys,
        })
        .then(({ rows, rowCount, cacheRowCount, grandTotal }) => {
          cacheRowCountRef.current = cacheRowCount;
          if ((r.groupKeys?.length ?? 0) === 0) {
            apiRef.current?.setGridOption('pinnedBottomRowData', grandTotal ? [grandTotal as TData] : []);
          }
          p.success({ rowData: rows.slice() as TData[], rowCount });
        })
        .catch(() => p.fail());
    },
  };
}
