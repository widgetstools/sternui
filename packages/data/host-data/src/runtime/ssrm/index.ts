/**
 * SSRM (Server-Side Row Model) query path — public barrel.
 *
 * The worker-side engine ({@link runQuery}) and the client-side
 * datasource ({@link SsrmDataProvider}) are both framework-agnostic and
 * pure TypeScript. See docs/SSRM_WORKER_PLAN.md.
 */

export { runQuery, filterRows } from './queryEngine.js';
export type { SsrmShapeBlock } from './queryEngine.js';
export { distinctValues, computeAggregates } from './indexes.js';
export { shapeRows } from './shaping.js';
export { SsrmDataProvider } from './SsrmDataProvider.js';
export type {
  SsrmDatasourceLike,
  SsrmGetRowsParamsLike,
  SsrmFetchBlock,
} from './SsrmDataProvider.js';
export type {
  SsrmGetRowsRequest,
  SsrmSortModelItem,
  SsrmColumnVO,
  SsrmQueryResult,
  SsrmQueryOptions,
  SsrmAggregation,
  SsrmAggFunc,
  SsrmCalcColumn,
  SsrmShapingSpec,
} from './types.js';
