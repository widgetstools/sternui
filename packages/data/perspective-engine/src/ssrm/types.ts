/** Provider-scoped Perspective table id (same as hub `providerId`). */
export type ProviderTableId = string;

export interface TableConfig {
  providerId: ProviderTableId;
  /** Row identity column — must match provider `keyColumn`. */
  indexColumn?: string;
  cacheBlockSize?: number;
}

export interface SsrmSortEntry {
  colId: string;
  sort: 'asc' | 'desc';
  /** Compare / sort by abs(value) for numeric columns. */
  abs?: boolean;
}

export interface SsrmGetRowsRequest {
  providerId: ProviderTableId;
  startRow: number;
  endRow: number;
  rowGroupCols: { id: string; field: string; displayName: string }[];
  valueCols: { id: string; field: string; aggFunc: string }[];
  pivotCols: { id: string; field: string; displayName: string }[];
  pivotMode: boolean;
  groupKeys: string[];
  filterModel: Record<string, unknown>;
  sortModel: SsrmSortEntry[];
  quickFilterText?: string;
  treeData?: boolean;
  absSort?: boolean;
}

export interface SsrmGetRowsResult {
  rowData: Record<string, unknown>[];
  rowCount: number;
  pivotResultFields?: string[];
  totals?: Record<string, unknown>;
  aggregates?: Record<string, Record<string, unknown>>;
  filteredRowCount?: number;
}

export interface AggregateRequest {
  providerId: ProviderTableId;
  valueCols: { id: string; field: string; aggFunc: string }[];
  filterModel: Record<string, unknown>;
  quickFilterText?: string;
}

export interface AggregateResult {
  totals: Record<string, unknown>;
  aggregates: Record<string, Record<string, unknown>>;
  rowCount: number;
}

export interface QueryAllRequest {
  providerId: ProviderTableId;
  filterModel: Record<string, unknown>;
  sortModel: SsrmSortEntry[];
  limit?: number;
  quickFilterText?: string;
  includeStructure?: boolean;
  rowGroupCols?: SsrmGetRowsRequest['rowGroupCols'];
  valueCols?: SsrmGetRowsRequest['valueCols'];
  pivotCols?: SsrmGetRowsRequest['pivotCols'];
  pivotMode?: boolean;
  groupKeys?: string[];
  treeData?: boolean;
  absSort?: boolean;
}

export interface QueryAllResult {
  rowData: Record<string, unknown>[];
  rowCount: number;
  pivotResultFields?: string[];
}

export interface SeriesDataRequest {
  providerId: ProviderTableId;
  categoryField: string;
  valueCols: { id: string; field: string; aggFunc: string }[];
  filterModel: Record<string, unknown>;
  quickFilterText?: string;
  limit?: number;
}

export interface SeriesDataResult {
  rowData: Record<string, unknown>[];
  rowCount: number;
}

export interface DetailRowsRequest {
  providerId: ProviderTableId;
  match: Record<string, string | number | boolean | null>;
  limit?: number;
}

export interface TransactionRequest {
  providerId: ProviderTableId;
  add?: Record<string, unknown>[];
  update?: Record<string, unknown>[];
  remove?: (string | number)[];
}

export type WorkerInbound =
  | { type: 'ensureTable'; requestId: string; config: TableConfig }
  | { type: 'replace'; requestId: string; providerId: ProviderTableId; rows: Record<string, unknown>[]; indexColumn?: string }
  | { type: 'getRows'; requestId: string; request: SsrmGetRowsRequest }
  | { type: 'getFilterValues'; requestId: string; providerId: ProviderTableId; field: string }
  | { type: 'updateRows'; requestId: string; providerId: ProviderTableId; rows: Record<string, unknown>[] }
  | { type: 'removeRows'; requestId: string; providerId: ProviderTableId; ids: (string | number)[] }
  | { type: 'applyTransaction'; requestId: string; request: TransactionRequest }
  | { type: 'getAggregates'; requestId: string; request: AggregateRequest }
  | { type: 'queryAll'; requestId: string; request: QueryAllRequest }
  | { type: 'getSeriesData'; requestId: string; request: SeriesDataRequest }
  | { type: 'getDetailRows'; requestId: string; request: DetailRowsRequest }
  | { type: 'releaseTable'; requestId: string; providerId: ProviderTableId }
  | { type: 'dispose'; requestId: string };

export type WorkerOutbound =
  | { type: 'ensureTableResult'; requestId: string; ok: true }
  | { type: 'ensureTableResult'; requestId: string; ok: false; error: string }
  | { type: 'replaceResult'; requestId: string; ok: true; rowCount: number }
  | { type: 'replaceResult'; requestId: string; ok: false; error: string }
  | { type: 'getRowsResult'; requestId: string; ok: true; result: SsrmGetRowsResult }
  | { type: 'getRowsResult'; requestId: string; ok: false; error: string }
  | { type: 'getFilterValuesResult'; requestId: string; ok: true; values: string[] }
  | { type: 'getFilterValuesResult'; requestId: string; ok: false; error: string }
  | { type: 'updateRowsResult'; requestId: string; ok: true }
  | { type: 'updateRowsResult'; requestId: string; ok: false; error: string }
  | { type: 'removeRowsResult'; requestId: string; ok: true }
  | { type: 'removeRowsResult'; requestId: string; ok: false; error: string }
  | { type: 'applyTransactionResult'; requestId: string; ok: true }
  | { type: 'applyTransactionResult'; requestId: string; ok: false; error: string }
  | { type: 'getAggregatesResult'; requestId: string; ok: true; result: AggregateResult }
  | { type: 'getAggregatesResult'; requestId: string; ok: false; error: string }
  | { type: 'queryAllResult'; requestId: string; ok: true; rowData: Record<string, unknown>[]; rowCount: number; pivotResultFields?: string[] }
  | { type: 'queryAllResult'; requestId: string; ok: false; error: string }
  | { type: 'getSeriesDataResult'; requestId: string; ok: true; result: SeriesDataResult }
  | { type: 'getSeriesDataResult'; requestId: string; ok: false; error: string }
  | { type: 'getDetailRowsResult'; requestId: string; ok: true; rowData: Record<string, unknown>[] }
  | { type: 'getDetailRowsResult'; requestId: string; ok: false; error: string }
  | { type: 'releaseTableResult'; requestId: string; ok: true }
  | { type: 'releaseTableResult'; requestId: string; ok: false; error: string }
  | {
      type: 'dirty';
      providerId: ProviderTableId;
      at: number;
      transaction?: {
        update?: Record<string, unknown>[];
        add?: Record<string, unknown>[];
      };
    };
