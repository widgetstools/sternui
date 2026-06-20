/**
 * SsrmBlotter — Phase-1 proof-of-concept for Server-Side Row Model backed by
 * the SharedWorker hub. Route: `/blotters/ssrm`.
 *
 * A deliberately minimal grid (no toolbar/customizer): it pulls visible blocks
 * from the hub via `subscribeServerSide` and applies live updates only for rows
 * in loaded blocks. Open many instances side-by-side and compare capacity vs
 * the CSRM `/blotters/marketsgrid` route — each window here holds ~100 rows, not
 * 20k. The `[ssrm-grid]` console line reports rows applied/sec per window.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  ModuleRegistry,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type IServerSideDatasource,
  type IServerSideGetRowsParams,
  type SetFilterValuesFuncParams,
  type SideBarDef,
} from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import {
  useDataServices,
  useDataProviderConfig,
  useResolvedCfg,
} from '@starui/host-data-react/runtime';
import type { ServerSideHandle } from '@starui/host-data/runtime';

ModuleRegistry.registerModules([AllEnterpriseModule]);

/** Same STOMP provider the CSRM blotter route uses, so they share the hub cache. */
const PROVIDER_ID = 'dp-121e4569-5100-4f6b-b946-c3423d8aff7c';

interface ColumnDefinition {
  field: string;
  headerName?: string;
  cellDataType?: string;
}

/**
 * Always-visible row-count status panel (the built-in count panels are
 * CSRM-only). Shows the total rows in the hub cache (from `cacheCountRef`, fed
 * by the datasource) and the currently shown/filtered count.
 */
function RowCountStatusPanel(props: { api: GridApi; cacheCountRef?: { current: number } }): ReactNode {
  const [, force] = useState(0);
  useEffect(() => {
    const update = () => force((n) => n + 1);
    props.api.addEventListener('modelUpdated', update);
    return () => {
      try { props.api.removeEventListener('modelUpdated', update); } catch { /* grid gone */ }
    };
  }, [props.api]);
  const cacheTotal = props.cacheCountRef?.current ?? 0;
  const shown = props.api.getDisplayedRowCount();
  return (
    <div className="ag-status-name-value" style={{ padding: '0 12px' }}>
      <span>Cache rows:&nbsp;</span>
      <span className="ag-status-name-value-value">{cacheTotal.toLocaleString()}</span>
      <span style={{ opacity: 0.6 }}>&nbsp;·&nbsp;shown {shown.toLocaleString()}</span>
    </div>
  );
}

/** Per-window throughput probe: how many rows/sec this grid actually applies. */
function makeGridProbe() {
  let rows = 0;
  let txns = 0;
  let last = 0;
  return (appliedRows: number) => {
    rows += appliedRows;
    txns += 1;
    const now = Date.now();
    if (last === 0) { last = now; return; }
    if (now - last >= 1000) {
      // eslint-disable-next-line no-console
      console.log(`[ssrm-grid] rowsApplied/s=${rows} txns/s=${txns}`);
      rows = 0; txns = 0; last = now;
    }
  };
}

function SsrmBlotter(): ReactNode {
  const { client } = useDataServices();
  const activeRow = useDataProviderConfig(PROVIDER_ID);
  const resolvedCfg = useResolvedCfg(activeRow.cfg?.config ?? null);
  const apiRef = useRef<GridApi | null>(null);
  const handleRef = useRef<ServerSideHandle<Record<string, unknown>> | null>(null);
  const probeRef = useRef(makeGridProbe());
  /** Active row-group column ids, so getRowId can key group rows by their level. */
  const groupColsRef = useRef<string[]>([]);
  /** Total provider cache rows (from the hub) for the status bar. */
  const cacheCountRef = useRef(0);
  const [datasource, setDatasource] = useState<IServerSideDatasource | null>(null);

  // columnDefinitions / keyColumn live on the provider-type-specific configs
  // (STOMP/REST/…), not the ProviderConfig union root — read them structurally.
  const cfgFields = resolvedCfg as
    | { columnDefinitions?: ColumnDefinition[]; keyColumn?: string | readonly string[] }
    | null;

  const columnDefs = useMemo<ColDef[]>(() => {
    const defs = cfgFields?.columnDefinitions ?? [];
    return defs.map((d) => {
      const isNumber = d.cellDataType === 'number';
      const isDate = d.cellDataType === 'date' || d.cellDataType === 'dateString';
      const typeFilter = isNumber ? 'agNumberColumnFilter' : isDate ? 'agDateColumnFilter' : 'agTextColumnFilter';
      return {
        field: d.field,
        headerName: d.headerName,
        cellDataType: d.cellDataType,
        sortable: true,
        enableRowGroup: !isNumber,
        enableValue: isNumber,
        ...(isNumber ? { aggFunc: 'sum' } : {}),
        // Multi Filter (matches MarketsGrid): tab 1 = the cellDataType-appropriate
        // filter (text/number/date), tab 2 = the Set Filter whose values come from
        // the hub. The hub resolves all of these server-side (compileFilter handles
        // 'multi'). The floating filter is the type filter's input (not the Set
        // Filter's read-only box).
        filter: 'agMultiColumnFilter',
        filterParams: {
          filters: [
            { filter: typeFilter },
            {
              filter: 'agSetColumnFilter',
              filterParams: {
                values: (p: SetFilterValuesFuncParams) => {
                  handleRef.current
                    ?.getSetFilterValues(d.field)
                    .then((vals) => p.success(vals as (string | null)[]))
                    .catch(() => p.success([]));
                },
              },
            },
          ],
        },
      } satisfies ColDef;
    });
  }, [cfgFields]);

  // Numeric columns to total when AG-Grid sends no valueCols (i.e. a flat view
  // with nothing dragged into Values) — so the grand total row always sums the
  // numeric fields. When the user groups/aggregates, AG-Grid's valueCols win.
  const numericValueCols = useMemo(
    () =>
      (cfgFields?.columnDefinitions ?? [])
        .filter((d) => d.cellDataType === 'number')
        .map((d) => ({ id: d.field, field: d.field, aggFunc: 'sum' })),
    [cfgFields],
  );
  const numericValueColsRef = useRef(numericValueCols);
  numericValueColsRef.current = numericValueCols;

  const keyColumn =
    (typeof cfgFields?.keyColumn === 'string' ? cfgFields.keyColumn : undefined) ?? 'positionId';
  // Leaf rows key by the provider key column; GROUP rows have no leaf key, so key
  // them by their group path (parentKeys + the group column value at this level).
  // Without this, every group row gets id `undefined` → AG-Grid warning #205.
  const getRowId = useCallback(
    (p: { data: Record<string, unknown>; parentKeys?: string[] }) => {
      const parentKeys = p.parentKeys ?? [];
      const leaf = p.data[keyColumn];
      if (leaf != null) {
        return parentKeys.length ? `${parentKeys.join('/')}/${leaf}` : String(leaf);
      }
      const groupCol = groupColsRef.current[parentKeys.length];
      const groupKey = groupCol ? p.data[groupCol] : undefined;
      return `g:${[...parentKeys, String(groupKey)].join('/')}`;
    },
    [keyColumn],
  );

  // Subscribe in SSRM mode once the cfg resolves; the datasource closes over the
  // live handle. Re-subscribes (and tears down) if the provider cfg changes.
  useEffect(() => {
    if (!resolvedCfg) return;
    const handle = client.subscribeServerSide<Record<string, unknown>>(PROVIDER_ID, resolvedCfg);
    handleRef.current = handle;
    handle.onTransaction((tx) => {
      probeRef.current(tx.rows.length);
      const api = apiRef.current;
      if (!api) return;
      if (tx.replaceLevel) {
        // Re-aggregated group rows → overwrite the level (subtotals tick).
        api.applyServerSideRowData({
          route: tx.route,
          successParams: { rowData: tx.rows.slice() as Record<string, unknown>[], rowCount: tx.rowCount ?? tx.rows.length },
        });
      } else {
        // In-place leaf cell updates.
        api.applyServerSideTransactionAsync({ route: tx.route, update: tx.rows.slice() as Record<string, unknown>[] });
      }
    });
    // Live (throttled) grand total → keep the pinned bottom row current.
    handle.onGrandTotal((grandTotal) => {
      apiRef.current?.setGridOption('pinnedBottomRowData', grandTotal ? [grandTotal] : []);
    });
    handle.onRefresh(() => apiRef.current?.refreshServerSide({ purge: true }));
    setDatasource({
      getRows: (params: IServerSideGetRowsParams) => {
        const r = params.request;
        handle
          .getRows(r.startRow ?? 0, r.endRow ?? 0, {
            sortModel: r.sortModel as { colId: string; sort: 'asc' | 'desc' }[],
            filterModel: r.filterModel as Record<string, unknown>,
            rowGroupCols: r.rowGroupCols,
            // AG-Grid sends valueCols only when columns are in Values; fall back
            // to the numeric columns so a flat view still gets a grand total.
            valueCols: r.valueCols?.length ? r.valueCols : numericValueColsRef.current,
            groupKeys: r.groupKeys,
          })
          .then(({ rows, rowCount, cacheRowCount, grandTotal }) => {
            cacheCountRef.current = cacheRowCount;
            // Grand total row: hub-computed aggregation of the filtered set,
            // pinned at the bottom. Only the top-level pull carries it.
            if ((r.groupKeys?.length ?? 0) === 0) {
              apiRef.current?.setGridOption(
                'pinnedBottomRowData',
                grandTotal ? [grandTotal] : [],
              );
            }
            params.success({ rowData: rows.slice() as Record<string, unknown>[], rowCount });
          })
          .catch(() => params.fail());
      },
      destroy: () => handle.unsubscribe(),
    });
    return () => {
      handle.unsubscribe();
      handleRef.current = null;
      setDatasource(null);
    };
  }, [client, resolvedCfg]);

  const onGridReady = useCallback((e: GridReadyEvent) => {
    apiRef.current = e.api;
  }, []);

  // Track active row-group columns for getRowId's group-row keys.
  const onColumnRowGroupChanged = useCallback(() => {
    groupColsRef.current = apiRef.current?.getRowGroupColumns().map((c) => c.getColId()) ?? [];
  }, []);

  const sideBar = useMemo<SideBarDef>(
    () => ({ toolPanels: ['columns', 'filters'] }),
    [],
  );
  // The built-in count panels are CSRM-only (warning #224); use a custom
  // always-visible row-count panel + the range-aggregation panel (on selection).
  const statusBar = useMemo(
    () => ({
      statusPanels: [
        { statusPanel: 'rowCountStatus', statusPanelParams: { cacheCountRef }, align: 'left' },
        { statusPanel: 'agAggregationComponent', align: 'right' },
      ],
    }),
    [],
  );

  if (activeRow.loading) return <div style={{ padding: 16 }}>Loading provider…</div>;
  if (!resolvedCfg) return <div style={{ padding: 16 }}>Provider {PROVIDER_ID} not found.</div>;
  if (!datasource) return <div style={{ padding: 16 }}>Connecting to data hub…</div>;

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <AgGridReact
        columnDefs={columnDefs}
        defaultColDef={{ sortable: true, resizable: true, floatingFilter: true, enableRowGroup: true, enableCellChangeFlash: true }}
        rowModelType="serverSide"
        serverSideDatasource={datasource}
        getRowId={getRowId}
        cacheBlockSize={100}
        maxBlocksInCache={4}
        blockLoadDebounceMillis={50}
        rowGroupPanelShow="always"
        groupTotalRow="bottom"
        sideBar={sideBar}
        statusBar={statusBar}
        cellSelection
        components={{ rowCountStatus: RowCountStatusPanel }}
        onGridReady={onGridReady}
        onColumnRowGroupChanged={onColumnRowGroupChanged}
      />
    </div>
  );
}

export default SsrmBlotter;
