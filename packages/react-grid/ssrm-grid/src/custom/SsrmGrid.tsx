/**
 * SsrmGrid — AG Grid server-side row model over an {@link SsrmEngine}.
 *
 * The presentation half of the SSRM surface (worklog T4): props → AG Grid
 * wiring in three precedence tiers, with all behavior in
 * {@link useSsrmGridController}. Replaces the monolithic CustomSSRMGrid.
 */
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, GridReadyEvent } from "ag-grid-community";
import "../agGrid/modules";
import { theme as defaultTheme } from "../agGrid/theme";
import { MirrorLoadingCellRenderer } from "../ssrm/mirrorLoadingCell";
import { foldTrafficLight } from "../ssrm/trafficLightAgg";
import {
  SSRM_DEFAULT_STATUS_BAR,
  translateSsrmStatusBar,
} from "./ssrmStatusBarPanels";
import { QuickFilterHighlightCellRenderer } from "./QuickFilterHighlightCellRenderer";
import "./quickFilterHighlight.css";
import { stripSsrmStructuralGridOptions } from "./ssrmGridOptionsPassthrough";
import { useSsrmGridController } from "./useSsrmGridController";
import type { SsrmGridHandle, SsrmGridProps } from "./types";

export type { SsrmGridHandle, SsrmGridProps } from "./types";

function trafficLightAggFunc(params: { values: unknown[] }): number | null {
  const nums = params.values
    .map((v) => (typeof v === "number" ? v : Number(v)))
    .filter((n): n is number => Number.isFinite(n));
  if (nums.length === 0) return null;
  return foldTrafficLight(Math.min(...nums), Math.max(...nums));
}

export const SsrmGrid = forwardRef<SsrmGridHandle, SsrmGridProps>(
  function SsrmGrid(props, ref) {
    // AG's `quickFilterText` gridOption is client-row-model-only — the SSRM
    // query reads the React prop instead. Widget chrome (QuickSearch,
    // grid-state restore) writes the OPTION, so intercept those writes and
    // fold them into the controller's quick filter. The prop, when the host
    // passes one, stays the controlled source and wins.
    const [optionQuickFilter, setOptionQuickFilter] = useState<
      string | undefined
    >(undefined);
    const effectiveQuickFilter = props.quickFilterText ?? optionQuickFilter;
    const controllerProps =
      effectiveQuickFilter === props.quickFilterText
        ? props
        : { ...props, quickFilterText: effectiveQuickFilter };

    const c = useSsrmGridController(controllerProps);
    useImperativeHandle(ref, () => c.handle, [c.handle]);

    const controllerGridReady = c.onGridReady;
    const onGridReady = useCallback(
      (e: GridReadyEvent) => {
        const api = e.api;
        const orig = api.setGridOption.bind(api);
        // Keep calling through so `getGridOption('quickFilterText')` still
        // answers (grid-state capture reads it back on Save).
        (api as { setGridOption: (key: never, value: never) => void }).setGridOption =
          (key: never, value: never) => {
            orig(key, value);
            if ((key as string) === "quickFilterText") {
              setOptionQuickFilter(typeof value === "string" ? value : "");
            }
          };
        controllerGridReady(e);
      },
      [controllerGridReady],
    );

    const hasQuickFilterHighlight =
      props.highlightQuickFilter !== false &&
      Boolean((effectiveQuickFilter ?? "").trim());

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
          // Avoid a custom cellRenderer on every cell when there is nothing to
          // highlight (400-col stress books pay heavily for React wrappers).
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

    // Pipeline statusBar (general-settings) translated to the SSRM panels;
    // wins over the surface prop when present — same precedence as CSRM,
    // where the pipeline statusBar overrides the host's when the toggle is on.
    const pipelineStatusBar = useMemo(
      () =>
        translateSsrmStatusBar(
          (props.gridOptions as Record<string, unknown> | undefined)?.statusBar,
        ),
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
      columnDefs: c.override.agGridColumnDefs,
      defaultColDef,
      rowModelType: "serverSide",
      serverSideDatasource: c.datasource,
      cacheBlockSize: props.cacheBlockSize ?? 100,
      // BOUNDED — unbounded, every block a scrollbar drag passed stayed
      // "loaded" forever, and each soft-refresh cycle re-requested ALL of
      // them (each stale hit spawning a background revalidate): after a
      // long drag the engine port drowned in revalidation traffic and the
      // viewport's own blocks queued behind it. Evicted blocks revisit via
      // the stale-serving main-thread cache, so eviction costs ~nothing.
      maxBlocksInCache: props.maxBlocksInCache ?? 10,
      maxConcurrentDatasourceRequests: 4,
      blockLoadDebounceMillis: props.blockLoadDebounceMillis ?? 50,
      suppressAnimationFrame: props.suppressAnimationFrame ?? true,
      animateRows: false,
      suppressServerSideFullWidthLoadingRow: !(props.showLoadingOverlay ?? false),
      rowHeight: props.rowHeight,
      headerHeight: props.headerHeight,
      asyncTransactionWaitMillis: 50,
      ...(c.treeData ? { rowGroupPanelShow: "never" } : {}),
      sideBar: (props.sideBar ?? { toolPanels: ["columns", "filters"] }) as never,
      statusBar: (pipelineStatusBar ?? props.statusBar ?? SSRM_DEFAULT_STATUS_BAR) as never,
      components: {
        ...(props.components ?? {}),
        agLoadingCellRenderer: MirrorLoadingCellRenderer,
      } as never,
      suppressNoRowsOverlay: props.suppressNoRowsOverlay ?? true,
      overlayNoRowsTemplate: props.overlayNoRowsTemplate ?? " ",
      aggFuncs,
      enableCharts: props.enableCharts,
      calculatedColumns: props.calculatedColumns !== false,
      grandTotalRow: c.grandTotalRowOpt,
      groupTotalRow: props.groupTotalRow,
      pinnedTopRowData: props.pinnedTopRowData,
      pinnedBottomRowData: props.pinnedBottomRowData,
      treeData: c.treeData,
      isServerSideGroup: c.treeData ? c.isServerSideGroup : undefined,
      getServerSideGroupKey: c.treeData ? c.getServerSideGroupKey : undefined,
      masterDetail: Boolean(c.md),
      isRowMaster: c.md ? c.isRowMaster : undefined,
      detailCellRendererParams: c.detailCellRendererParams,
      getContextMenuItems: c.getContextMenuItems,
      getRowId: c.getRowIdCb,
    } as Record<string, unknown>;

    return (
      <div style={{ height: props.height ?? "100%", width: "100%" }}>
        <AgGridReact
          {...agGridProps}
          getChildCount={(data) =>
            typeof data?.childCount === "number" ? data.childCount : undefined
          }
          onColumnRowGroupChanged={c.onStructureChanged}
          onBodyScroll={c.onBodyScroll}
          onFilterChanged={c.onFilterChanged}
          onCellValueChanged={c.onCellValueChanged}
          onGridReady={onGridReady}
        />
      </div>
    );
  },
);
