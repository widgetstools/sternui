import type {
  AggregateRequest,
  AggregateResult,
  DetailRowsRequest,
  FeedConfig,
  QueryAllRequest,
  QueryAllResult,
  SeriesDataRequest,
  SeriesDataResult,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  TransactionRequest,
  DatasetId,
} from "../ssrm/types.js";
import type { DirtyMessage } from "../ssrm/applyWorkerDirtyToGrid.js";

/**
 * Shared data-plane contract for `<SSRMGrid>` (Perspective) and
 * `<SsrmGrid>` (RowMirror / main-thread).
 *
 * Grid chrome, ColDefs, and AG Grid SSRM wiring stay shared; only the engine
 * behind getRows / mutations / full-set queries changes.
 */
export interface SsrmEngine {
  configure(config: FeedConfig): Promise<void> | void;
  setRowData(dataset: DatasetId, rows: Record<string, unknown>[]): Promise<number> | number;
  getRows(request: SsrmGetRowsRequest): Promise<SsrmGetRowsResult> | SsrmGetRowsResult;
  getFilterValues(dataset: DatasetId, field: string): Promise<(string | null)[]> | (string | null)[];
  updateRows(dataset: DatasetId, rows: Record<string, unknown>[]): Promise<void> | void;
  removeRows(dataset: DatasetId, ids: (string | number)[]): Promise<void> | void;
  applyTransaction(request: TransactionRequest): Promise<void> | void;
  getAggregates(request: AggregateRequest): Promise<AggregateResult> | AggregateResult;
  queryAll(request: QueryAllRequest): Promise<QueryAllResult> | QueryAllResult;
  getSeriesData(request: SeriesDataRequest): Promise<SeriesDataResult> | SeriesDataResult;
  getDetailRows(request: DetailRowsRequest): Promise<Record<string, unknown>[]> | Record<string, unknown>[];
  setDirtyHandler?(handler: ((msg: DirtyMessage) => void) | null): void;
  dispose(): void;

  // Optional synchronous capabilities. Engines that can serve reads without a
  // worker round-trip (RowMirror) implement these; async-only engines
  // (Perspective) omit them and callers fall back to the async methods.

  /**
   * Synchronous getRows fast path. Returns null when the request cannot be
   * served synchronously (unconfigured, empty book, pivot, unsafe filter).
   */
  trySyncRows?(request: SsrmGetRowsRequest): SsrmGetRowsResult | null;
  /** Leaf at an absolute index of the current root view (loading-stub paint). */
  tryLeafAt?(viewIndex: number): Record<string, unknown> | null;
  /** Row lookup by primary key (leaf-update merge fast path). */
  tryFindById?(id: string): Record<string, unknown> | null;
  /** Drop memoized view state after an external invalidation (filter / data replace). */
  invalidateView?(): void;
}

export type SsrmEngineKind = "perspective" | "custom";
