/**
 * @starui/ssrm-grid/pull — the SSRM STOMP provider V2 window plane:
 * connect to the provider SharedWorker (control + direct Perspective
 * read client) and serve AG Grid's server-side row model from the
 * hosted table. See docs/SSRM_PROVIDER_V2_DESIGN.md (P2).
 */

export type {
  PullDatasourceConnection,
  PullFilter,
  PullFilterOp,
  PullFilterTerm,
  PullSort,
  PullTable,
  PullView,
  PullViewConfig,
} from './types.js';

export {
  connectSsrmProvider,
  type ConnectSsrmProviderOpts,
  type SharedWorkerHandle,
  type SsrmDataClient,
  type SsrmProviderConnection,
} from './connectSsrmProvider.js';

export {
  createSsrmPullDatasource,
  diffRowsByKey,
  type QueryAllOpts,
  type QueryAllResult,
  type SsrmPullDatasource,
  type SsrmPullDatasourceOpts,
  type SsrmPullDatasourceStats,
} from './createSsrmPullDatasource.js';

export {
  createSsrmCellEditHandler,
  fetchLoadedRowsOrRefuse,
  updateLoadedRowsOrRefuse,
  type LoadedRowReader,
  type SsrmCellEdit,
  type SsrmCellEditHandlerOpts,
  type SsrmCellValueChange,
  type SsrmEditConnection,
  type UpdateLoadedRowsOpts,
} from './editRows.js';

export {
  csvEscapeCell,
  rowsToCsv,
  type CsvColumn,
  type RowsToCsvOpts,
} from './exportRows.js';

export {
  agFilterModelToPerspective,
  type FilterMappingResult,
} from './agFilterToPerspective.js';
export {
  AUTO_COLUMN_ID,
  buildQueryPlan,
  buildRollupPlan,
  canonicalViewKey,
  type GroupPlanInfo,
  type QueryPlan,
  type QueryPlanOpts,
  type RollupPlan,
} from './buildQueryPlan.js';
export {
  CHILD_COUNT_FIELD,
  createSsrmRowIdGetter,
  encodeGroupRowId,
  getSsrmServerSideGroupKey,
  GROUP_ID_FIELD,
  GROUP_KEY_FIELD,
  isSsrmServerSideGroup,
  toGroupRowData,
} from './groupRows.js';
export {
  createSsrmDetailFetcher,
  createSsrmRowMasterGetter,
  type SsrmDetailConnection,
  type SsrmDetailFetcherOpts,
  type SsrmDetailQuery,
  type SsrmDetailQueryContext,
  type SsrmGetDetailParams,
} from './detailRows.js';
export {
  DEFAULT_SWEEP_THROTTLE_WIDE_MS,
  DEFAULT_WIDE_COLUMN_THRESHOLD,
  NARROW_SWEEP_MAX_BLOCKS,
  resolveSweepGate,
  WIDE_SWEEP_MAX_BLOCKS,
  type SweepGateConfig,
  type SweepGateDecision,
} from './sweepGate.js';
export {
  conditionExpr,
  filterExprName,
  QUICK_FILTER_EXPR,
  quickFilterExpr,
  regexNeedle,
  ROLLUP_GROUP_EXPR,
  setWithNullExpr,
} from './filterExpressions.js';
export { ViewCache, type ViewCacheOpts } from './ViewCache.js';
export { BlockCache, type CachedBlock } from './BlockCache.js';

// Re-exported so pull consumers share one lifecycle vocabulary without
// importing @starui/host-data directly.
export type {
  DatasetPhase,
  DatasetStateSnapshot,
  SsrmDatasetConfig,
  StompSsrmProviderConfig,
} from '@starui/host-data/runtime/ssrm';
export {
  ssrmWorkerName,
  SSRM_WORKER_ASSET,
  toSsrmDatasetConfig,
} from '@starui/host-data/runtime/ssrm';
