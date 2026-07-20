/**
 * Public contract of the SSRM grid surface — the imperative handle and props.
 * Split from the component so the controller hook and the surface share them
 * without a cycle (worklog T4).
 */
import type {
  ChartType,
  ColDef,
  GridApi,
  GridReadyEvent,
  IServerSideGroupSelectionState,
  IServerSideSelectionState,
  Theme,
} from "ag-grid-community";
import type { SsrmEngine } from "../engine/types";
import type { DirtyMessage } from "../ssrm/applyWorkerDirtyToGrid";
import type { QueryAllRequest, QueryAllResult } from "../ssrm/types";
import type { SSRMColDef } from "./columnOverride";
import type {
  GrandTotalRowMode,
  GroupTotalRowMode,
  SSRMTransaction,
} from "../types/ssrmTransaction.js";

export interface SsrmGridHandle {
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

export interface SsrmGridProps {
  columnDefs: SSRMColDef[];
  /**
   * Push mode: the full book, loaded into the engine via `setRowData` and
   * replaced when the prop identity changes. **Omit entirely for pull mode**
   * (an injected engine that already owns the data — e.g.
   * `createPerspectiveEngine` attached to a worker-hosted table): the grid
   * then only fetches viewport blocks and never writes the dataset.
   */
  rowData?: Record<string, unknown>[];
  /**
   * Engine to drive instead of the built-in main-thread RowMirror engine
   * (`createCustomEngine`). Captured on mount and OWNED BY THE INJECTOR —
   * the grid never disposes it, so it survives grid remounts. This is the
   * T1 seam: pair with `rowData` omitted for the pull path.
   */
  engine?: SsrmEngine;
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
