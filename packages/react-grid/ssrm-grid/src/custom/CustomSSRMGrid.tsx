/**
 * CustomSSRMGrid — AG Grid SSRM over the main-thread RowMirror engine.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { AgGridReact } from "ag-grid-react";
import {
  GRAND_TOTAL_ROW_ID,
  type CellValueChangedEvent,
  type ChartType,
  type ColDef,
  type DefaultMenuItem,
  type GetContextMenuItemsParams,
  type GetDetailRowDataParams,
  type GetRowIdParams,
  type GridApi,
  type GridReadyEvent,
  type IServerSideGroupSelectionState,
  type IServerSideSelectionState,
  type MenuItemDef,
  type Theme,
} from "ag-grid-community";
import "../agGrid/modules";
import { theme as defaultTheme } from "../agGrid/theme";
import {
  applyWorkerDirtyToGrid,
  type DirtyMessage,
} from "../ssrm/applyWorkerDirtyToGrid";
import { chartAllViaAgGrid } from "../ssrm/chartAllViaAgGrid";
import { ConfiguredGate } from "../ssrm/configuredGate";
import { createCustomDatasource } from "../ssrm/createCustomDatasource";
import { createCustomEngine } from "../engine/customEngine.js";
import type { SsrmEngine } from "../engine/types";
import { exportAllViaAgGrid } from "../ssrm/exportAllViaAgGrid";
import { fetchAllGroupLeafRows, toGroupLeafCols } from "../ssrm/getGroupLeafRows";
import { mergeLeafUpdateRows } from "../ssrm/mergeLeafUpdateRows";
import {
  MirrorLoadingCellRenderer,
  setActiveStubLeafReader,
  type SsrmStubLeafReader,
} from "../ssrm/mirrorLoadingCell";
import {
  patchGrandTotalFromEngine,
  patchLoadedGroupAggregatesFromEngine,
} from "../ssrm/patchLoadedGroupAggregates";
import { buildQueryAllRequestFromApi } from "../ssrm/readGridQueryState";
import { refreshAllLoadedServerSideStores } from "../ssrm/refreshAllLoadedStores";
import { SsrmBlockCache } from "../ssrm/ssrmBlockCache";
import type { FeedConfig, QueryAllRequest, QueryAllResult } from "../ssrm/types";
import { foldTrafficLight } from "../ssrm/trafficLightAgg";
import { buildColumnOverride, type SSRMColDef } from "./columnOverride";
import { stripSsrmStructuralGridOptions } from "./ssrmGridOptionsPassthrough";
import { QuickFilterHighlightCellRenderer } from "./QuickFilterHighlightCellRenderer";
import "./quickFilterHighlight.css";
import { SSRM_DEFAULT_STATUS_BAR } from "./ssrmStatusBarPanels";
import { parseQuickFilterTokens } from "../filters/ssrmFilters.js";
import type {
  GrandTotalRowMode,
  GroupTotalRowMode,
  SSRMTransaction,
} from "../types/ssrmTransaction.js";

const DATASET = "main";

function trafficLightAggFunc(params: { values: unknown[] }): number | null {
  const nums = params.values
    .map((v) => (typeof v === "number" ? v : Number(v)))
    .filter((n): n is number => Number.isFinite(n));
  if (nums.length === 0) return null;
  return foldTrafficLight(Math.min(...nums), Math.max(...nums));
}

function resolveGrandTotalRow(
  mode: GrandTotalRowMode | undefined,
): "top" | "bottom" | "pinnedTop" | "pinnedBottom" | undefined {
  if (mode === true) return "pinnedBottom";
  if (mode === false || mode == null) return undefined;
  return mode;
}

function usesNativeGrandTotal(mode: GrandTotalRowMode | undefined): boolean {
  const resolved = resolveGrandTotalRow(mode);
  return (
    resolved === "top" ||
    resolved === "bottom" ||
    resolved === "pinnedTop" ||
    resolved === "pinnedBottom"
  );
}

export interface CustomSSRMGridHandle {
  applyTransaction(tx: SSRMTransaction): void;
  applyTransactionAsync(tx: SSRMTransaction): void;
  getApi(): GridApi | null;
  getServerSideSelectionState():
    | IServerSideSelectionState
    | IServerSideGroupSelectionState
    | null;
  setServerSideSelectionState(
    state: IServerSideSelectionState | IServerSideGroupSelectionState,
  ): void;
  countMatching(filterModel: Record<string, unknown>): Promise<number>;
  getGroupLeafRows(opts: {
    groupKeys: string[];
    filterModel?: Record<string, unknown>;
    quickFilterText?: string;
  }): Promise<Record<string, unknown>[]>;
  queryAll(
    opts?: Partial<Omit<QueryAllRequest, "dataset">>,
  ): Promise<QueryAllResult>;
  forEachMatching(
    callback: (data: Record<string, unknown>, index: number) => void,
    opts?: Partial<Omit<QueryAllRequest, "dataset">>,
  ): Promise<{ rowCount: number }>;
  chartFilteredData(opts?: {
    categoryField?: string;
    chartType?: ChartType;
  }): Promise<{ rowCount: number; chartId?: string } | null>;
  /**
   * Export the FULL filtered set via the engine (not just loaded blocks —
   * worklog T6 fetch-or-refuse). `visual: true` runs each cell through its
   * display formatter, matching visual-excel's output.
   */
  exportAll(opts: {
    format: "excel" | "csv";
    fileName?: string;
    visual?: boolean;
  }): Promise<{ rowCount: number }>;
}

export interface CustomSSRMGridProps {
  columnDefs: SSRMColDef[];
  rowData?: Record<string, unknown>[];
  getRowId: string;
  refreshThrottleMs?: number;
  cacheBlockSize?: number;
  blockLoadDebounceMillis?: number;
  maxBlocksInCache?: number;
  rowBuffer?: number;
  suppressAnimationFrame?: boolean;
  enableCellChangeFlash?: boolean;
  defaultColDef?: SSRMColDef;
  onTotals?: (summary: string) => void;
  onDirty?: (msg: DirtyMessage) => void;
  height?: string | number;
  theme?: Theme;
  loadThemeGoogleFonts?: boolean;
  rowHeight?: number;
  headerHeight?: number;
  sideBar?: unknown;
  statusBar?: unknown;
  components?: Record<string, unknown>;
  onGridReady?: (event: GridReadyEvent) => void;
  suppressNoRowsOverlay?: boolean;
  overlayNoRowsTemplate?: string;
  showLoadingOverlay?: boolean;
  quickFilterText?: string;
  quickFilterFields?: string[];
  highlightQuickFilter?: boolean;
  pagination?: boolean;
  paginationPageSize?: number;
  advancedFilter?: boolean;
  pinnedTopRowData?: Record<string, unknown>[];
  pinnedBottomRowData?: Record<string, unknown>[];
  grandTotalRow?: GrandTotalRowMode;
  groupTotalRow?: GroupTotalRowMode;
  calculatedColumns?: boolean;
  /** Absolute-value sort for numeric measures. */
  absSort?: boolean;
  /** Perspective-like keep predicate (main-thread eval). */
  rowKeepExpression?: string;
  /** Tree hierarchy fields (outer → inner). Enables AG Grid SSRM treeData. */
  treeFields?: string[];
  /** Integrated charts + full-set chart via context menu / handle. */
  enableCharts?: boolean;
  masterDetail?: {
    detailColumnDefs: ColDef[];
    getDetailRowData?: (
      masterRow: Record<string, unknown>,
    ) => Promise<Record<string, unknown>[]>;
    matchFields?: Record<string, string>;
    detailDataset?: string;
    detailLimit?: number;
    isRowMaster?: (row: Record<string, unknown>) => boolean;
  };
  /**
   * Module-pipeline gridOptions pass-through (general-settings et al —
   * worklog T5). SSRM-structural keys are stripped
   * (`ssrmGridOptionsPassthrough`); the rest override the component's
   * defaults but never its server-row-model wiring.
   */
  gridOptions?: Record<string, unknown>;
}

function formatTotals(totals: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(totals)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      parts.push(
        `${k}=${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      );
    }
  }
  return parts.slice(0, 4).join(" · ");
}

function coerceEdited(
  schema: Record<string, string>,
  field: string,
  value: unknown,
): unknown {
  const type = schema[field];
  if (type === "float" || type === "integer") {
    if (value === null || value === undefined || value === "") return null;
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return null;
    return type === "integer" ? Math.trunc(n) : n;
  }
  if (value == null) return null;
  return String(value);
}

export const CustomSSRMGrid = forwardRef<
  CustomSSRMGridHandle,
  CustomSSRMGridProps
>(function CustomSSRMGrid(props, ref) {
  const { columnDefs, rowData, getRowId: idField } = props;
  const apiRef = useRef<GridApi | null>(null);
  // Typed as the seam — compile-time proof the component works with any engine.
  const engineRef = useRef<SsrmEngine>(createCustomEngine());
  const configuredGateRef = useRef(new ConfiguredGate());
  const configuredRef = useRef(false);
  const configureInFlightRef = useRef(false);
  const configureGenRef = useRef(0);
  const refreshGenerationRef = useRef(0);
  const blockCacheRef = useRef(new SsrmBlockCache());
  const asyncBufferRef = useRef<SSRMTransaction | null>(null);
  const groupAggPatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  /** Skip AG leaf txs / soft-refresh while the user is scrolling (thumb / wheel). */
  const tickQuietUntilRef = useRef(0);
  const grandTotalRowRef = useRef(props.grandTotalRow);
  grandTotalRowRef.current = props.grandTotalRow;
  const grandTotalRowOpt = resolveGrandTotalRow(props.grandTotalRow);

  const engine = engineRef.current;
  const stubLeafAt = useMemo<SsrmStubLeafReader | null>(
    () => (engine.tryLeafAt ? (i) => engine.tryLeafAt!(i) : null),
    [engine],
  );
  setActiveStubLeafReader(stubLeafAt);

  const quickFilterRef = useRef(props.quickFilterText ?? "");
  quickFilterRef.current = props.quickFilterText ?? "";
  const quickFilterFieldsRef = useRef(props.quickFilterFields);
  quickFilterFieldsRef.current = props.quickFilterFields;
  const rowKeepExpressionRef = useRef(props.rowKeepExpression ?? "");
  rowKeepExpressionRef.current = props.rowKeepExpression ?? "";
  const absSortRef = useRef(props.absSort ?? false);
  absSortRef.current = props.absSort ?? false;
  /** Unfiltered book size for status bar (`Rows : N` / `N of M`). */
  const totalRowCountRef = useRef<number | null>(null);
  const onTotalsPropRef = useRef(props.onTotals);
  onTotalsPropRef.current = props.onTotals;
  const treeData = (props.treeFields?.length ?? 0) > 0;

  const sampleRowRef = useRef<Record<string, unknown> | undefined>(rowData?.[0]);
  const [sampleVersion, setSampleVersion] = useState(() =>
    rowData?.[0] ? 1 : 0,
  );
  if (rowData?.[0] && !sampleRowRef.current) {
    sampleRowRef.current = rowData[0];
  }
  if (sampleRowRef.current && sampleVersion === 0) {
    setSampleVersion(1);
  }
  const rowDataRef = useRef(rowData);
  rowDataRef.current = rowData;

  const getFilterValues = useCallback(async (field: string) => {
    const ok = await configuredGateRef.current.wait(10_000);
    if (!ok || !configuredRef.current) return [];
    return engineRef.current.getFilterValues(DATASET, field);
  }, []);

  const override = useMemo(
    () =>
      buildColumnOverride(columnDefs, {
        index: idField,
        sampleRow: sampleRowRef.current,
        getFilterValues,
      }),
    [columnDefs, idField, getFilterValues, sampleVersion],
  );
  const schemaRef = useRef(override.schema);
  schemaRef.current = override.schema;

  const feedConfig = useMemo((): FeedConfig => {
    return {
      dataset: DATASET,
      schema: override.schema,
      index: idField,
      calcExpressions: override.calcExpressions,
      refreshThrottleMs: props.refreshThrottleMs,
      treeFields: props.treeFields,
      treeDataMode: treeData,
      absSort: props.absSort,
    };
  }, [
    override,
    idField,
    props.refreshThrottleMs,
    props.treeFields,
    treeData,
    props.absSort,
  ]);
  const feedConfigRef = useRef(feedConfig);
  feedConfigRef.current = feedConfig;

  useEffect(() => {
    const engine = engineRef.current;
    const scheduleLiveAggPatch = (api: GridApi) => {
      const grouped = (api.getRowGroupColumns?.() ?? []).length > 0;
      const nativeGrand = usesNativeGrandTotal(grandTotalRowRef.current);
      // Flat books don't need main-thread group/grand-total rebuilds every tick.
      if (!grouped && !nativeGrand) return;
      if (Date.now() < tickQuietUntilRef.current) return;
      if (groupAggPatchTimerRef.current) return;
      groupAggPatchTimerRef.current = setTimeout(() => {
        groupAggPatchTimerRef.current = null;
        if (Date.now() < tickQuietUntilRef.current) return;
        const patchExtras = {
          dataset: DATASET,
          quickFilterText: quickFilterRef.current || undefined,
          quickFilterFields: quickFilterFieldsRef.current,
          absSort: absSortRef.current,
          rowKeepExpression: rowKeepExpressionRef.current || undefined,
          idField,
        };
        if (usesNativeGrandTotal(grandTotalRowRef.current)) {
          patchGrandTotalFromEngine(api, engine, patchExtras);
        }
        if ((api.getRowGroupColumns?.() ?? []).length > 0) {
          patchLoadedGroupAggregatesFromEngine(api, engine, patchExtras);
        }
      }, 250);
    };

    engine.setDirtyHandler?.((msg) => {
      props.onDirty?.(msg);
      const api = apiRef.current;
      if (!api || !configuredRef.current) return;
      applyWorkerDirtyToGrid(msg, {
        applyLeafTransaction: (leaf) => {
          // Mirror is already patched by the engine. Only push AG txs for
          // rows currently in the client cache — unloaded "adds" from SSRM
          // tick splitters must not become store inserts or purge refreshes.
          const patchCache = (rows: Record<string, unknown>[]) => {
            if (rows.length) blockCacheRef.current.patchRows(idField, rows);
          };

          const loadedUpdates: Record<string, unknown>[] = [];
          for (const row of leaf.update ?? []) {
            const id = row[idField];
            if (id == null || id === "") continue;
            if (api.getRowNode(String(id))) loadedUpdates.push(row);
          }
          for (const row of leaf.add ?? []) {
            const id = row[idField];
            if (id == null || id === "") continue;
            if (api.getRowNode(String(id))) loadedUpdates.push(row);
            else patchCache([row]);
          }

          scheduleLiveAggPatch(api);
          if (Date.now() < tickQuietUntilRef.current) {
            patchCache(loadedUpdates);
            return;
          }

          if (loadedUpdates.length) {
            const update = mergeLeafUpdateRows(
              idField,
              loadedUpdates,
              (id) =>
                engine.tryFindById?.(id) ??
                blockCacheRef.current.findRow(idField, id) ??
                (api.getRowNode(id)?.data as
                  | Record<string, unknown>
                  | undefined),
            );
            patchCache(update);
            api.applyServerSideTransactionAsync({ update });
          }
        },
        throttleRefresh: () => {
          if (Date.now() < tickQuietUntilRef.current) return;
          // Soft refresh without wiping the block cache — scroll still hits sync.
          refreshAllLoadedServerSideStores(api, { purge: false });
        },
        purgeRefresh: () => {
          refreshGenerationRef.current += 1;
          blockCacheRef.current.clear();
          engine.invalidateView?.();
          refreshAllLoadedServerSideStores(api, { purge: true });
        },
      });
    });
    return () => {
      engine.setDirtyHandler?.(null);
      setActiveStubLeafReader(null);
      if (groupAggPatchTimerRef.current) {
        clearTimeout(groupAggPatchTimerRef.current);
      }
      engine.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  const onBodyScroll = useCallback(() => {
    // Horizontal + vertical — AG fires bodyScroll for both axes.
    tickQuietUntilRef.current = Date.now() + 1000;
  }, []);

  const publishRowCounts = useCallback(
    (filteredRowCount: number, totalRowCount?: number) => {
      if (totalRowCount != null) totalRowCountRef.current = totalRowCount;
      const api = apiRef.current;
      if (!api) return;
      const prev =
        (api.getGridOption("context") as Record<string, unknown> | undefined) ??
        {};
      const nextTotal =
        totalRowCountRef.current ??
        (typeof prev.totalRowCount === "number"
          ? prev.totalRowCount
          : filteredRowCount);
      if (
        prev.filteredRowCount === filteredRowCount &&
        prev.totalRowCount === nextTotal
      ) {
        return;
      }
      api.setGridOption("context", {
        ...prev,
        filteredRowCount,
        totalRowCount: nextTotal,
      });
    },
    [],
  );

  const configureAndLoad = useCallback(async () => {
    const engine = engineRef.current;
    const rows = rowDataRef.current ?? [];
    if (!sampleRowRef.current && rows.length === 0) return;
    if (configureInFlightRef.current) return;
    configureInFlightRef.current = true;
    const gen = ++configureGenRef.current;
    configuredRef.current = false;
    configuredGateRef.current.reset();
    refreshGenerationRef.current += 1;
    blockCacheRef.current.clear();
    try {
      await Promise.resolve(engine.configure(feedConfigRef.current));
      if (gen !== configureGenRef.current) return;
      await Promise.resolve(engine.setRowData(DATASET, rows));
      if (gen !== configureGenRef.current) return;
      configuredRef.current = true;
      configuredGateRef.current.markReady();
      publishRowCounts(rows.length, rows.length);
      const api = apiRef.current;
      if (api) {
        api.setGridOption("context", {
          ...(api.getGridOption("context") as object | undefined),
          ssrmLeafAt: stubLeafAt,
          ssrmConfigured: true,
          totalRowCount: rows.length,
          filteredRowCount: rows.length,
        });
        refreshAllLoadedServerSideStores(api, { purge: true });
      }
    } finally {
      if (gen === configureGenRef.current) {
        configureInFlightRef.current = false;
      }
    }
  }, [publishRowCounts, stubLeafAt]);

  useEffect(() => {
    void configureAndLoad();
  }, [feedConfig, configureAndLoad]);

  useEffect(() => {
    if (!configuredRef.current || configureInFlightRef.current) return;
    const rows = rowDataRef.current ?? [];
    void Promise.resolve(engineRef.current.setRowData(DATASET, rows)).then(
      () => {
        publishRowCounts(rows.length, rows.length);
        refreshGenerationRef.current += 1;
        blockCacheRef.current.clear();
        // In-place book replace — leaf objects are new; drop cached view.
        engineRef.current.invalidateView?.();
        const api = apiRef.current;
        if (api) refreshAllLoadedServerSideStores(api, { purge: true });
      },
    );
    // Identity of rowData snapshot — host replaces book
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowData, publishRowCounts]);

  useEffect(() => {
    engineRef.current.invalidateView?.();
    refreshGenerationRef.current += 1;
    blockCacheRef.current.clear();
    const api = apiRef.current;
    if (api && configuredRef.current) {
      tickQuietUntilRef.current = Date.now() + 400;
      refreshAllLoadedServerSideStores(api, { purge: true });
    }
    api?.setGridOption("context", {
      ...(api.getGridOption("context") as object | undefined),
      quickFilterText: props.quickFilterText ?? "",
      quickFilterTokens: parseQuickFilterTokens(props.quickFilterText),
      highlightQuickFilter: props.highlightQuickFilter !== false,
    });
  }, [
    props.quickFilterText,
    props.quickFilterFields,
    props.highlightQuickFilter,
    props.rowKeepExpression,
    props.absSort,
  ]);

  const commit = useCallback(
    (tx: SSRMTransaction) => {
      const removeIds = (tx.remove ?? []).map((r) =>
        typeof r === "object" && r != null ? String(r[idField]) : r,
      );
      engineRef.current.applyTransaction({
        dataset: DATASET,
        add: tx.add,
        update: tx.update,
        remove: removeIds,
      });
    },
    [idField],
  );

  const datasource = useMemo(
    () =>
      createCustomDatasource(
        () => engineRef.current,
        () => DATASET,
        () => ({
          quickFilterText: quickFilterRef.current || undefined,
          quickFilterFields: quickFilterFieldsRef.current,
          includeGrandTotal: usesNativeGrandTotal(grandTotalRowRef.current),
          isConfigured: configuredRef.current,
          waitUntilConfigured: () => configuredGateRef.current.wait(10_000),
          treeData,
          absSort: absSortRef.current,
          rowKeepExpression: rowKeepExpressionRef.current || undefined,
          refreshGeneration: refreshGenerationRef.current,
        }),
        (totals, filteredRowCount, aggregates) => {
          const api = apiRef.current;
          if (!api) return;
          const prev =
            (api.getGridOption("context") as
              | Record<string, unknown>
              | undefined) ?? {};
          const nextTotal =
            totalRowCountRef.current ??
            (typeof prev.totalRowCount === "number"
              ? prev.totalRowCount
              : filteredRowCount);
          const totalsChanged =
            Object.keys(totals).length > 0 && prev.totals !== totals;
          if (
            prev.filteredRowCount === filteredRowCount &&
            prev.totalRowCount === nextTotal &&
            !totalsChanged
          ) {
            return;
          }
          api.setGridOption("context", {
            ...prev,
            ...(totalsChanged ? { totals, aggregates } : {}),
            filteredRowCount,
            totalRowCount: nextTotal,
          });
          if (totalsChanged) {
            onTotalsPropRef.current?.(formatTotals(totals));
          }
        },
        blockCacheRef.current,
      ),
    [treeData],
  );

  const countMatching = useCallback(
    async (filterModel: Record<string, unknown>) => {
      const result = await Promise.resolve(
        engineRef.current.getAggregates({
          dataset: DATASET,
          valueCols: [],
          filterModel,
        }),
      );
      return result.rowCount;
    },
    [],
  );

  const getGroupLeafRows = useCallback(
    async (opts: {
      groupKeys: string[];
      filterModel?: Record<string, unknown>;
      quickFilterText?: string;
    }) => {
      const api = apiRef.current;
      const rowGroupCols = toGroupLeafCols(
        (api?.getRowGroupColumns() ?? []).map((col) => {
          const def = col.getColDef();
          return {
            field: def.field ?? col.getColId(),
            id: col.getColId(),
            displayName: def.headerName,
          };
        }),
      );
      const filterModel =
        opts.filterModel ??
        (api ? ((api.getFilterModel() as Record<string, unknown>) ?? {}) : {});
        return fetchAllGroupLeafRows(
        (req) => Promise.resolve(engineRef.current.queryAll(req)),
        {
          dataset: DATASET,
          rowGroupCols,
          groupKeys: opts.groupKeys,
          filterModel,
          quickFilterText:
            opts.quickFilterText ?? (quickFilterRef.current || undefined),
          quickFilterFields: quickFilterFieldsRef.current,
          rowKeepExpression: rowKeepExpressionRef.current || undefined,
        },
      );
    },
    [],
  );

  const queryAll = useCallback(
    async (
      opts: Partial<Omit<QueryAllRequest, "dataset">> = {},
    ): Promise<QueryAllResult> => {
      const api = apiRef.current;
      if (!api) {
        return Promise.resolve(
          engineRef.current.queryAll({
            dataset: DATASET,
            filterModel: opts.filterModel ?? {},
            sortModel: opts.sortModel ?? [],
            limit: opts.limit ?? 50_000,
            quickFilterText:
              opts.quickFilterText ?? (quickFilterRef.current || undefined),
            quickFilterFields:
              opts.quickFilterFields ?? quickFilterFieldsRef.current,
            rowKeepExpression:
              opts.rowKeepExpression ??
              (rowKeepExpressionRef.current || undefined),
            includeStructure: opts.includeStructure ?? false,
            treeData: opts.treeData ?? treeData,
            absSort: opts.absSort ?? absSortRef.current,
            ...opts,
          }),
        );
      }
      return Promise.resolve(
        engineRef.current.queryAll(
          buildQueryAllRequestFromApi(
            api,
            {
              dataset: DATASET,
              quickFilterText: quickFilterRef.current || undefined,
              quickFilterFields: quickFilterFieldsRef.current,
              rowKeepExpression: rowKeepExpressionRef.current || undefined,
              treeData,
              absSort: absSortRef.current,
              limit: 50_000,
            },
            opts,
          ),
        ),
      );
    },
    [treeData],
  );

  const forEachMatching = useCallback(
    async (
      callback: (data: Record<string, unknown>, index: number) => void,
      opts?: Partial<Omit<QueryAllRequest, "dataset">>,
    ) => {
      const { rowData: rows, rowCount } = await queryAll({
        ...opts,
        includeStructure: opts?.includeStructure ?? false,
      });
      for (let i = 0; i < rows.length; i++) callback(rows[i]!, i);
      return { rowCount };
    },
    [queryAll],
  );

  const handleExportAll = useCallback(
    async (
      format: "excel" | "csv",
      opts?: { fileName?: string; visual?: boolean },
    ) => {
      const api = apiRef.current;
      if (!api) return { rowCount: 0 };
      return exportAllViaAgGrid({
        liveApi: api,
        client: engineRef.current,
        dataset: DATASET,
        format,
        fileName:
          opts?.fileName ?? `export-all.${format === "excel" ? "xlsx" : "csv"}`,
        limit: 100_000,
        quickFilterText: quickFilterRef.current,
        quickFilterFields: quickFilterFieldsRef.current,
        rowKeepExpression: rowKeepExpressionRef.current || undefined,
        treeData,
        absSort: absSortRef.current,
        ...(opts?.visual
          ? {
              processCellCallback: (p: {
                value: unknown;
                formatValue: (value: unknown) => string;
              }) => p.formatValue(p.value),
            }
          : {}),
      });
    },
    [treeData],
  );

  const handleChartAll = useCallback(
    async (opts?: { categoryField?: string; chartType?: ChartType }) => {
      const api = apiRef.current;
      if (!api || !props.enableCharts) return null;
      return chartAllViaAgGrid({
        liveApi: api,
        client: engineRef.current,
        dataset: DATASET,
        categoryField: opts?.categoryField,
        chartType: opts?.chartType,
        quickFilterText: quickFilterRef.current,
        quickFilterFields: quickFilterFieldsRef.current,
        rowKeepExpression: rowKeepExpressionRef.current || undefined,
      });
    },
    [props.enableCharts],
  );

  const getContextMenuItems = useCallback(
    (params: GetContextMenuItemsParams): (DefaultMenuItem | MenuItemDef)[] => {
      const items = (params.defaultItems ?? []).flatMap(
        (item): (DefaultMenuItem | MenuItemDef)[] => {
          if (item === "csvExport")
            return [
              {
                name: "CSV export (all filtered rows)",
                action: () => void handleExportAll("csv"),
              },
            ];
          if (item === "excelExport")
            return [
              {
                name: "Excel export (all filtered rows)",
                action: () => void handleExportAll("excel"),
              },
            ];
          if (item === "export")
            return [
              {
                name: "Export (all filtered rows)",
                subMenu: [
                  { name: "CSV", action: () => void handleExportAll("csv") },
                  {
                    name: "Excel",
                    action: () => void handleExportAll("excel"),
                  },
                ],
              },
            ];
          return [item];
        },
      );
      if (props.enableCharts) {
        items.push({
          name: "Chart all filtered rows",
          action: () => void handleChartAll(),
        });
      }
      return items;
    },
    [handleExportAll, handleChartAll, props.enableCharts],
  );

  const md = props.masterDetail;
  const isRowMaster = useCallback(
    (data: Record<string, unknown> | undefined) => {
      if (!md || !data || typeof data.childCount === "number" || data.group === true) {
        return false;
      }
      return md.isRowMaster ? md.isRowMaster(data) : true;
    },
    [md],
  );
  const detailCellRendererParams = useMemo(() => {
    if (!md) return undefined;
    const fetchDetail = async (
      master: Record<string, unknown>,
    ): Promise<Record<string, unknown>[]> => {
      if (md.getDetailRowData) return md.getDetailRowData(master);
      if (md.matchFields && Object.keys(md.matchFields).length > 0) {
        const match: Record<string, string | number | boolean | null> = {};
        for (const [detailField, masterField] of Object.entries(md.matchFields)) {
          const v = master[masterField];
          match[detailField] =
            v === undefined ? null : (v as string | number | boolean | null);
        }
        return Promise.resolve(
          engineRef.current.getDetailRows({
            dataset: md.detailDataset ?? DATASET,
            match,
            limit: md.detailLimit ?? 500,
          }),
        );
      }
      return [];
    };
    return {
      detailGridOptions: {
        columnDefs: md.detailColumnDefs,
        defaultColDef: { flex: 1, minWidth: 90 },
      },
      getDetailRowData: (p: GetDetailRowDataParams<Record<string, unknown>>) => {
        void fetchDetail(p.data)
          .then((rows) => p.successCallback(rows))
          .catch(() => p.successCallback([]));
      },
    };
  }, [md]);

  const isServerSideGroup = useCallback(
    (d: Record<string, unknown>) => d.group === true,
    [],
  );
  const getServerSideGroupKey = useCallback(
    (d: Record<string, unknown>) => String(d.__treeKey ?? ""),
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      applyTransaction: commit,
      applyTransactionAsync: (tx) => {
        const buf = asyncBufferRef.current ?? {
          add: [],
          update: [],
          remove: [],
        };
        buf.add = [...(buf.add ?? []), ...(tx.add ?? [])];
        buf.update = [...(buf.update ?? []), ...(tx.update ?? [])];
        buf.remove = [...(buf.remove ?? []), ...(tx.remove ?? [])];
        if (!asyncBufferRef.current) {
          asyncBufferRef.current = buf;
          queueMicrotask(() => {
            const flush = asyncBufferRef.current;
            asyncBufferRef.current = null;
            if (flush) commit(flush);
          });
        }
      },
      getApi: () => apiRef.current,
      getServerSideSelectionState: () =>
        apiRef.current?.getServerSideSelectionState() ?? null,
      setServerSideSelectionState: (state) => {
        apiRef.current?.setServerSideSelectionState(state);
      },
      countMatching,
      getGroupLeafRows,
      queryAll,
      forEachMatching,
      chartFilteredData: (opts) => handleChartAll(opts),
      exportAll: (opts) =>
        handleExportAll(opts.format, {
          fileName: opts.fileName,
          visual: opts.visual,
        }),
    }),
    [
      commit,
      countMatching,
      getGroupLeafRows,
      queryAll,
      forEachMatching,
      handleChartAll,
      handleExportAll,
    ],
  );

  const getRowIdCb = useCallback(
    (params: GetRowIdParams) => {
      const data = params.data as Record<string, unknown> | undefined;
      if (!data) return crypto.randomUUID();
      if (data[idField] === GRAND_TOTAL_ROW_ID) return GRAND_TOTAL_ROW_ID;
      if (treeData && data.__treeKey != null) {
        const route = [...(params.parentKeys ?? []), String(data.__treeKey)].join(
          "|",
        );
        return data.group ? `t:${route}` : `tl:${data.__treeKey}`;
      }
      if (typeof data.childCount === "number") {
        const key =
          typeof data.__ssrmGroupKey === "string" ? data.__ssrmGroupKey : "";
        return `g:${[...(params.parentKeys ?? []), key].join("|")}`;
      }
      const id = data[idField];
      if (id == null || id === "") {
        return `missing:${JSON.stringify(params.parentKeys ?? [])}`;
      }
      return String(id);
    },
    [idField, treeData],
  );

  const onCellValueChanged = useCallback(
    (e: CellValueChangedEvent) => {
      const field = e.colDef.field;
      if (!field || !e.data) return;
      const id = e.data[idField];
      if (id == null) return;
      const patch = {
        [idField]: id,
        [field]: coerceEdited(schemaRef.current, field, e.newValue),
      };
      engineRef.current.updateRows(DATASET, [patch]);
    },
    [idField],
  );

  const onStructureChanged = useCallback(() => {
    refreshGenerationRef.current += 1;
    blockCacheRef.current.clear();
    engineRef.current.invalidateView?.();
    tickQuietUntilRef.current = Date.now() + 300;
  }, []);

  const hasQuickFilterHighlight =
    props.highlightQuickFilter !== false &&
    Boolean((props.quickFilterText ?? "").trim());

  const defaultColDef = useMemo(
    () =>
      ({
      flex: 1,
      minWidth: 100,
      filter: true,
      floatingFilter: true,
      suppressHeaderFilterButton: false,
      enableValue: true,
      enableRowGroup: true,
      enablePivot: false,
      enableCellChangeFlash: props.enableCellChangeFlash ?? false,
      ...((props.showLoadingOverlay ?? false)
        ? {}
        : { loadingCellRenderer: MirrorLoadingCellRenderer }),
      // Avoid a custom cellRenderer on every cell when there is nothing to highlight
      // (400-col stress books pay heavily for React cell wrappers).
      ...(hasQuickFilterHighlight
        ? { cellRenderer: QuickFilterHighlightCellRenderer }
        : {}),
      ...(props.defaultColDef ?? {}),
    }) as ColDef,
    [
      props.defaultColDef,
      hasQuickFilterHighlight,
      props.enableCellChangeFlash,
      props.showLoadingOverlay,
    ],
  );

  const autoGroupColumnDef = useMemo(
    () => ({
      minWidth: 200,
      cellRendererParams: { suppressCount: false },
    }),
    [],
  );

  const rowSelection = useMemo(
    () => ({
      mode: "multiRow" as const,
      checkboxes: true,
      headerCheckbox: true,
      enableClickSelection: true,
      selectAll: "all" as const,
      groupSelects: "descendants" as const,
    }),
    [],
  );

  const cellSelection = useMemo(
    () => ({ handle: { mode: "fill" as const } }),
    [],
  );

  const aggFuncs = useMemo(
    () => ({
      trafficLight: trafficLightAggFunc,
      rag: trafficLightAggFunc,
    }),
    [],
  );

  const resolvedTheme = props.theme ?? defaultTheme;

  // Module-pipeline gridOptions (general-settings et al) with the
  // SSRM-structural keys removed — see ssrmGridOptionsPassthrough.
  const passthroughGridOptions = useMemo(
    () => stripSsrmStructuralGridOptions(props.gridOptions ?? {}),
    [props.gridOptions],
  );

  // Three precedence tiers: SSRM defaults the pipeline may override, the
  // pipeline pass-through, then SSRM-structural wiring that always wins.
  const agGridProps = {
    // ── Tier 1: overridable defaults ──
    autoGroupColumnDef,
    rowGroupPanelShow: "always",
    pivotPanelShow: "never",
    rowSelection,
    cellSelection,
    undoRedoCellEditing: true,
    rowBuffer: props.rowBuffer ?? 10,
    cellFlashDuration: props.enableCellChangeFlash ? 500 : 0,
    pagination: props.pagination,
    paginationPageSize: props.paginationPageSize ?? 100,
    enableAdvancedFilter: props.advancedFilter,

    // ── Tier 2: host module pipeline (worklog T5) ──
    ...passthroughGridOptions,

    // ── Tier 3: SSRM-structural — always win ──
    theme: resolvedTheme,
    loadThemeGoogleFonts: props.loadThemeGoogleFonts ?? props.theme == null,
    columnDefs: override.agGridColumnDefs,
    defaultColDef,
    rowModelType: "serverSide",
    serverSideDatasource: datasource,
    cacheBlockSize: props.cacheBlockSize ?? 100,
    ...(props.maxBlocksInCache != null
      ? { maxBlocksInCache: props.maxBlocksInCache }
      : {}),
    maxConcurrentDatasourceRequests: 4,
    blockLoadDebounceMillis: props.blockLoadDebounceMillis ?? 50,
    suppressAnimationFrame: props.suppressAnimationFrame ?? true,
    animateRows: false,
    suppressServerSideFullWidthLoadingRow: !(props.showLoadingOverlay ?? false),
    rowHeight: props.rowHeight,
    headerHeight: props.headerHeight,
    asyncTransactionWaitMillis: 50,
    ...(treeData ? { rowGroupPanelShow: "never" } : {}),
    sideBar: (props.sideBar ?? { toolPanels: ["columns", "filters"] }) as never,
    statusBar: (props.statusBar ?? SSRM_DEFAULT_STATUS_BAR) as never,
    components: {
      ...(props.components ?? {}),
      agLoadingCellRenderer: MirrorLoadingCellRenderer,
    } as never,
    suppressNoRowsOverlay: props.suppressNoRowsOverlay ?? true,
    overlayNoRowsTemplate: props.overlayNoRowsTemplate ?? " ",
    aggFuncs,
    enableCharts: props.enableCharts,
    calculatedColumns: props.calculatedColumns !== false,
    grandTotalRow: grandTotalRowOpt,
    groupTotalRow: props.groupTotalRow,
    pinnedTopRowData: props.pinnedTopRowData,
    pinnedBottomRowData: props.pinnedBottomRowData,
    treeData,
    isServerSideGroup: treeData ? isServerSideGroup : undefined,
    getServerSideGroupKey: treeData ? getServerSideGroupKey : undefined,
    masterDetail: Boolean(md),
    isRowMaster: md ? isRowMaster : undefined,
    detailCellRendererParams,
    getContextMenuItems,
    getRowId: getRowIdCb,
  } as Record<string, unknown>;

  return (
    <div style={{ height: props.height ?? "100%", width: "100%" }}>
      <AgGridReact
        {...agGridProps}
        getChildCount={(data) =>
          typeof data?.childCount === "number" ? data.childCount : undefined
        }
        onColumnRowGroupChanged={onStructureChanged}
        onBodyScroll={onBodyScroll}
        onFilterChanged={() => {
          engineRef.current.invalidateView?.();
          blockCacheRef.current.clear();
        }}
        onCellValueChanged={onCellValueChanged}
        onGridReady={(e) => {
          apiRef.current = e.api;
          e.api.setGridOption("context", {
            ...(e.api.getGridOption("context") as object | undefined),
            ssrmLeafAt: stubLeafAt,
            ssrmCountMatching: countMatching,
            ssrmConfigured: configuredRef.current,
            quickFilterText: props.quickFilterText ?? "",
            quickFilterTokens: parseQuickFilterTokens(props.quickFilterText),
            highlightQuickFilter: props.highlightQuickFilter !== false,
          });
          if (!configuredRef.current) {
            void configureAndLoad();
          }
          props.onGridReady?.(e);
        }}
      />
    </div>
  );
});
