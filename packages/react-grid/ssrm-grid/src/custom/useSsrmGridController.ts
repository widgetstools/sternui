/**
 * Controller for {@link SsrmGrid} — engine lifecycle, dirty routing, the AG
 * datasource, and grid callbacks. The imperative surface lives in
 * {@link useSsrmGridHandle}; the component only renders
 * (worklog T4: replaces the monolithic CustomSSRMGrid).
 *
 * Refresh policy is {@link createSsrmDirtyRouter} over `RefreshScheduler` —
 * no inline quiet-window timers.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CellValueChangedEvent,
  GetDetailRowDataParams,
  GetRowIdParams,
  GridApi,
  GridReadyEvent,
} from "ag-grid-community";
import { GRAND_TOTAL_ROW_ID } from "ag-grid-community";
import { ConfiguredGate } from "../ssrm/configuredGate";
import { createCustomDatasource } from "../ssrm/createCustomDatasource";
import { createCustomEngine } from "../engine/customEngine.js";
import type { SsrmEngine } from "../engine/types";
import {
  setActiveStubLeafReader,
  type SsrmStubLeafReader,
} from "../ssrm/mirrorLoadingCell";
import {
  patchGrandTotalFromEngine,
  patchLoadedGroupAggregatesFromEngine,
} from "../ssrm/patchLoadedGroupAggregates";
import { refreshAllLoadedServerSideStores } from "../ssrm/refreshAllLoadedStores";
import { SsrmBlockCache } from "../ssrm/ssrmBlockCache";
import type { FeedConfig } from "../ssrm/types";
import { buildColumnOverride } from "./columnOverride";
import { createSsrmDirtyRouter } from "./ssrmDirtyRouter";
import { useSsrmGridHandle } from "./useSsrmGridHandle";
import { parseQuickFilterTokens } from "../filters/ssrmFilters.js";
import type { GrandTotalRowMode } from "../types/ssrmTransaction.js";
import type { SsrmGridProps } from "./types";

export const DATASET = "main";

export function resolveGrandTotalRow(
  mode: GrandTotalRowMode | undefined,
): "top" | "bottom" | "pinnedTop" | "pinnedBottom" | undefined {
  if (mode === true) return "pinnedBottom";
  if (mode === false || mode == null) return undefined;
  return mode;
}

function usesNativeGrandTotal(mode: GrandTotalRowMode | undefined): boolean {
  return resolveGrandTotalRow(mode) !== undefined;
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

/** Everything the surface renders with. */
export function useSsrmGridController(props: SsrmGridProps) {
  const { columnDefs, rowData, getRowId: idField } = props;
  const apiRef = useRef<GridApi | null>(null);
  // Typed as the seam — compile-time proof the controller works with any
  // engine. An injected engine (pull path) is captured once on mount.
  const engineRef = useRef<SsrmEngine>(props.engine ?? createCustomEngine());
  const configuredGateRef = useRef(new ConfiguredGate());
  const configuredRef = useRef(false);
  const configureInFlightRef = useRef(false);
  const configureGenRef = useRef(0);
  const refreshGenerationRef = useRef(0);
  const blockCacheRef = useRef(new SsrmBlockCache());
  const grandTotalRowRef = useRef(props.grandTotalRow);
  grandTotalRowRef.current = props.grandTotalRow;

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
  const onDirtyPropRef = useRef(props.onDirty);
  onDirtyPropRef.current = props.onDirty;
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

  // ── Dirty routing (RefreshScheduler policy) ─────────────────────────
  const routerRef = useRef<ReturnType<typeof createSsrmDirtyRouter> | null>(null);
  if (!routerRef.current) {
    routerRef.current = createSsrmDirtyRouter({
      engine,
      blockCache: blockCacheRef.current,
      idField,
      // Live-refresh cadence. The scheduler's own 60ms floor is tuned for
      // surgical row txs; bare-dirty SOFT refreshes refetch every loaded
      // block, and under a live async engine (every subscribed view fires
      // per tick batch) a 60ms cadence is a refetch storm that competes
      // with the user's sort/group interactions. Pace it at the documented
      // refreshThrottleMs default instead.
      scheduler: {
        minIntervalMs: Math.max(60, props.refreshThrottleMs ?? 150),
      },
      getApi: () => apiRef.current,
      isConfigured: () => configuredRef.current,
      bumpGeneration: () => {
        refreshGenerationRef.current += 1;
      },
      patchAggregates: (api) => {
        const extras = {
          dataset: DATASET,
          quickFilterText: quickFilterRef.current || undefined,
          quickFilterFields: quickFilterFieldsRef.current,
          absSort: absSortRef.current,
          rowKeepExpression: rowKeepExpressionRef.current || undefined,
          idField,
        };
        if (usesNativeGrandTotal(grandTotalRowRef.current)) {
          patchGrandTotalFromEngine(api, engine, extras);
        }
        if ((api.getRowGroupColumns?.() ?? []).length > 0) {
          patchLoadedGroupAggregatesFromEngine(api, engine, extras);
        }
      },
    });
  }

  useEffect(() => {
    const router = routerRef.current!;
    engine.setDirtyHandler?.((msg) => {
      onDirtyPropRef.current?.(msg);
      router.handleDirty(msg);
    });
    return () => {
      engine.setDirtyHandler?.(null);
      setActiveStubLeafReader(null);
      router.dispose();
      engine.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  const onBodyScroll = useCallback(() => {
    // Horizontal + vertical — AG fires bodyScroll for both axes.
    routerRef.current?.onScroll();
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
    const engineNow = engineRef.current;
    const rows = rowDataRef.current;
    // Push mode waits for a first non-empty book; pull mode (no rowData —
    // the engine owns the data) configures immediately and never writes it.
    if (rows !== undefined && !sampleRowRef.current && rows.length === 0) return;
    if (configureInFlightRef.current) return;
    configureInFlightRef.current = true;
    const gen = ++configureGenRef.current;
    configuredRef.current = false;
    configuredGateRef.current.reset();
    refreshGenerationRef.current += 1;
    blockCacheRef.current.clear();
    try {
      await Promise.resolve(engineNow.configure(feedConfigRef.current));
      if (gen !== configureGenRef.current) return;
      if (rows !== undefined) {
        await Promise.resolve(engineNow.setRowData(DATASET, rows));
        if (gen !== configureGenRef.current) return;
      }
      configuredRef.current = true;
      configuredGateRef.current.markReady();
      if (rows !== undefined) publishRowCounts(rows.length, rows.length);
      const api = apiRef.current;
      if (api) {
        api.setGridOption("context", {
          ...(api.getGridOption("context") as object | undefined),
          ssrmLeafAt: stubLeafAt,
          ssrmConfigured: true,
          ...(rows !== undefined
            ? { totalRowCount: rows.length, filteredRowCount: rows.length }
            : {}),
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
    // Pull mode: the engine owns the data — there is no book to replace.
    if (rowDataRef.current === undefined) return;
    const rows = rowDataRef.current;
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

  const { handle, countMatching, getContextMenuItems } = useSsrmGridHandle({
    dataset: DATASET,
    idField,
    treeData,
    enableCharts: props.enableCharts,
    engineRef,
    apiRef,
    quickFilterRef,
    quickFilterFieldsRef,
    rowKeepExpressionRef,
    absSortRef,
  });

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
  }, []);

  const onFilterChanged = useCallback(() => {
    engineRef.current.invalidateView?.();
    blockCacheRef.current.clear();
  }, []);

  const onGridReady = useCallback(
    (e: GridReadyEvent) => {
      apiRef.current = e.api;
      e.api.setGridOption("context", {
        ...(e.api.getGridOption("context") as object | undefined),
        ssrmLeafAt: stubLeafAt,
        ssrmCountMatching: countMatching,
        // Full-book distinct values (bulk-update dropdown, worklog T8) —
        // a client scan over displayed rows sees loaded blocks only.
        ssrmDistinctValues: getFilterValues,
        ssrmConfigured: configuredRef.current,
        quickFilterText: props.quickFilterText ?? "",
        quickFilterTokens: parseQuickFilterTokens(props.quickFilterText),
        highlightQuickFilter: props.highlightQuickFilter !== false,
      });
      if (!configuredRef.current) {
        void configureAndLoad();
      }
      props.onGridReady?.(e);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- props read live
    [stubLeafAt, countMatching, getFilterValues, configureAndLoad, props.onGridReady, props.quickFilterText, props.highlightQuickFilter],
  );

  return {
    treeData,
    override,
    datasource,
    handle,
    grandTotalRowOpt: resolveGrandTotalRow(props.grandTotalRow),
    md,
    getRowIdCb,
    getContextMenuItems,
    isServerSideGroup,
    getServerSideGroupKey,
    isRowMaster,
    detailCellRendererParams,
    onBodyScroll,
    onCellValueChanged,
    onStructureChanged,
    onFilterChanged,
    onGridReady,
  };
}
