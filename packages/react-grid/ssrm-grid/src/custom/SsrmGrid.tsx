/**
 * SsrmGrid — AG Grid server-side row model over an {@link SsrmEngine}.
 *
 * The presentation half of the SSRM surface (worklog T4): props → AG Grid
 * wiring in three precedence tiers, with all behavior in
 * {@link useSsrmGridController}. Replaces the monolithic CustomSSRMGrid.
 */
import { forwardRef, useImperativeHandle, useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import "../agGrid/modules";
import { theme as defaultTheme } from "../agGrid/theme";
import { MirrorLoadingCellRenderer } from "../ssrm/mirrorLoadingCell";
import { foldTrafficLight } from "../ssrm/trafficLightAgg";
import { SSRM_DEFAULT_STATUS_BAR } from "./ssrmStatusBarPanels";
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
    const c = useSsrmGridController(props);
    useImperativeHandle(ref, () => c.handle, [c.handle]);

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
      ...(c.treeData ? { rowGroupPanelShow: "never" } : {}),
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
          onGridReady={c.onGridReady}
        />
      </div>
    );
  },
);
