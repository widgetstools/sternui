/**
 * The imperative surface of {@link SsrmGrid} — transactions in, full-book
 * queries/exports/charts out — plus the context-menu items that reuse the
 * same full-book export path. Split from the controller (worklog T4).
 */
import { useCallback, useMemo, useRef, type MutableRefObject } from "react";
import type {
  ChartType,
  DefaultMenuItem,
  GetContextMenuItemsParams,
  GridApi,
  MenuItemDef,
} from "ag-grid-community";
import type { SsrmEngine } from "../engine/types";
import { chartAllViaAgGrid } from "../ssrm/chartAllViaAgGrid";
import { exportAllViaAgGrid } from "../ssrm/exportAllViaAgGrid";
import { fetchAllGroupLeafRows, toGroupLeafCols } from "../ssrm/getGroupLeafRows";
import { buildQueryAllRequestFromApi } from "../ssrm/readGridQueryState";
import type { QueryAllRequest, QueryAllResult } from "../ssrm/types";
import type { SSRMTransaction } from "../types/ssrmTransaction.js";
import type { SsrmGridHandle } from "./types";

export interface SsrmGridHandleDeps {
  dataset: string;
  idField: string;
  treeData: boolean;
  enableCharts: boolean | undefined;
  engineRef: MutableRefObject<SsrmEngine>;
  apiRef: MutableRefObject<GridApi | null>;
  quickFilterRef: MutableRefObject<string>;
  quickFilterFieldsRef: MutableRefObject<string[] | undefined>;
  rowKeepExpressionRef: MutableRefObject<string>;
  absSortRef: MutableRefObject<boolean>;
}

export function useSsrmGridHandle(deps: SsrmGridHandleDeps) {
  const {
    dataset,
    idField,
    treeData,
    enableCharts,
    engineRef,
    apiRef,
    quickFilterRef,
    quickFilterFieldsRef,
    rowKeepExpressionRef,
    absSortRef,
  } = deps;
  const asyncBufferRef = useRef<SSRMTransaction | null>(null);

  const commit = useCallback(
    (tx: SSRMTransaction) => {
      const removeIds = (tx.remove ?? []).map((r) =>
        typeof r === "object" && r != null ? String(r[idField]) : r,
      );
      engineRef.current.applyTransaction({
        dataset,
        add: tx.add,
        update: tx.update,
        remove: removeIds,
      });
    },
    [dataset, idField, engineRef],
  );

  const countMatching = useCallback(
    async (
      filterModel: Record<string, unknown>,
      opts?: { rowKeepExpression?: string },
    ) => {
      // With opts (conditional-styling header painter, worklog T7): count
      // over the DISPLAYED book — quick filter + the grid's own keep compose
      // with the rule's keep via `and(...)`. Without opts (status bar /
      // filter chips): unchanged full-book count for the filter model.
      const ownKeep = rowKeepExpressionRef.current || undefined;
      const ruleKeep = opts?.rowKeepExpression;
      const rowKeepExpression =
        ownKeep && ruleKeep
          ? `and((${ownKeep}), (${ruleKeep}))`
          : (ruleKeep ?? (opts ? ownKeep : undefined));
      const result = await Promise.resolve(
        engineRef.current.getAggregates({
          dataset,
          valueCols: [],
          filterModel,
          ...(opts
            ? {
                quickFilterText: quickFilterRef.current || undefined,
                quickFilterFields: quickFilterFieldsRef.current,
                rowKeepExpression,
              }
            : {}),
        }),
      );
      return result.rowCount;
    },
    [dataset, engineRef, quickFilterRef, quickFilterFieldsRef, rowKeepExpressionRef],
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
          dataset,
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
    [dataset, engineRef, apiRef, quickFilterRef, quickFilterFieldsRef, rowKeepExpressionRef],
  );

  const queryAll = useCallback(
    async (
      opts: Partial<Omit<QueryAllRequest, "dataset">> = {},
    ): Promise<QueryAllResult> => {
      const api = apiRef.current;
      if (!api) {
        return Promise.resolve(
          engineRef.current.queryAll({
            dataset,
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
              dataset,
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
    [dataset, treeData, engineRef, apiRef, quickFilterRef, quickFilterFieldsRef, rowKeepExpressionRef, absSortRef],
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
        dataset,
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
    [dataset, treeData, engineRef, apiRef, quickFilterRef, quickFilterFieldsRef, rowKeepExpressionRef, absSortRef],
  );

  const handleChartAll = useCallback(
    async (opts?: { categoryField?: string; chartType?: ChartType }) => {
      const api = apiRef.current;
      if (!api || !enableCharts) return null;
      return chartAllViaAgGrid({
        liveApi: api,
        client: engineRef.current,
        dataset,
        categoryField: opts?.categoryField,
        chartType: opts?.chartType,
        quickFilterText: quickFilterRef.current,
        quickFilterFields: quickFilterFieldsRef.current,
        rowKeepExpression: rowKeepExpressionRef.current || undefined,
      });
    },
    [dataset, enableCharts, engineRef, apiRef, quickFilterRef, quickFilterFieldsRef, rowKeepExpressionRef],
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
      if (enableCharts) {
        items.push({
          name: "Chart all filtered rows",
          action: () => void handleChartAll(),
        });
      }
      return items;
    },
    [handleExportAll, handleChartAll, enableCharts],
  );

  const handle = useMemo<SsrmGridHandle>(
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
      apiRef,
    ],
  );

  return { handle, countMatching, getContextMenuItems };
}
