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
      return {
        field: d.field,
        headerName: d.headerName,
        cellDataType: d.cellDataType,
        sortable: true,
        enableRowGroup: !isNumber,
        enableValue: isNumber,
        ...(isNumber ? { aggFunc: 'sum' } : {}),
        // Hub-resolved filters: number/date use the simple server filters; every
        // other column uses the Set Filter, whose values come from the hub.
        filter: isNumber ? 'agNumberColumnFilter' : isDate ? 'agDateColumnFilter' : 'agSetColumnFilter',
        ...(isNumber || isDate
          ? {}
          : {
              filterParams: {
                values: (p: SetFilterValuesFuncParams) => {
                  handleRef.current
                    ?.getSetFilterValues(d.field)
                    .then((vals) => p.success(vals as (string | null)[]))
                    .catch(() => p.success([]));
                },
              },
            }),
      } satisfies ColDef;
    });
  }, [cfgFields]);

  const keyColumn =
    (typeof cfgFields?.keyColumn === 'string' ? cfgFields.keyColumn : undefined) ?? 'positionId';
  const getRowId = useCallback(
    (p: { data: Record<string, unknown> }) => String(p.data[keyColumn]),
    [keyColumn],
  );

  // Subscribe in SSRM mode once the cfg resolves; the datasource closes over the
  // live handle. Re-subscribes (and tears down) if the provider cfg changes.
  useEffect(() => {
    if (!resolvedCfg) return;
    const handle = client.subscribeServerSide<Record<string, unknown>>(PROVIDER_ID, resolvedCfg);
    handleRef.current = handle;
    handle.onTransaction((rows) => {
      probeRef.current(rows.length);
      apiRef.current?.applyServerSideTransactionAsync({ update: rows.slice() });
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
            valueCols: r.valueCols,
            groupKeys: r.groupKeys,
          })
          .then(({ rows, rowCount }) =>
            params.success({ rowData: rows.slice() as Record<string, unknown>[], rowCount }),
          )
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

  const sideBar = useMemo<SideBarDef>(
    () => ({ toolPanels: ['columns', 'filters'] }),
    [],
  );
  const statusBar = useMemo(
    () => ({
      statusPanels: [
        { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
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
        defaultColDef={{ sortable: true, resizable: true, floatingFilter: true, enableRowGroup: true }}
        rowModelType="serverSide"
        serverSideDatasource={datasource}
        getRowId={getRowId}
        cacheBlockSize={100}
        maxBlocksInCache={4}
        blockLoadDebounceMillis={50}
        rowGroupPanelShow="always"
        sideBar={sideBar}
        statusBar={statusBar}
        onGridReady={onGridReady}
      />
    </div>
  );
}

export default SsrmBlotter;
