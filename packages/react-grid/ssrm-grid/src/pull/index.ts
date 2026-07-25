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
  type SsrmPullDatasource,
  type SsrmPullDatasourceOpts,
} from './createSsrmPullDatasource.js';

export {
  agFilterModelToPerspective,
  type FilterMappingResult,
} from './agFilterToPerspective.js';
export {
  buildQueryPlan,
  canonicalViewKey,
  type QueryPlan,
  type QueryPlanOpts,
} from './buildQueryPlan.js';
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
