/**
 * SSRM (Server-Side Row Model) query path — public barrel.
 *
 * The worker-side engine ({@link runQuery}) and the client-side
 * datasource ({@link SsrmDataProvider}) are both framework-agnostic and
 * pure TypeScript. See docs/SSRM_WORKER_PLAN.md.
 */

export { runQuery } from './queryEngine.js';
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
} from './types.js';
