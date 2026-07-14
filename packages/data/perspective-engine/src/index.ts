export { perspectiveEngineRegistry, resolveRowStore } from './PerspectiveEngineRegistry';
export type { PerspectiveEngineAttachOptions } from './PerspectiveEngineRegistry';
export { createPerspectiveDatasource, throttle } from './ssrm/createPerspectiveDatasource';
export { createWorkerClient } from './ssrm/workerClient';
export type { PerspectiveWorkerClient } from './ssrm/workerClient';
export type {
  ProviderTableId,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  TableConfig,
} from './ssrm/types';
export {
  getRowAggregates,
  getRowSums,
  resolveAggregate,
  shareOfAggregate,
  shareOfTotal,
  formatShareOfTotal,
  formatShareOfAggregate,
  shareExceeds,
} from './ssrm/shareOfTotal';
export type { SsrmAggregates, SsrmSums } from './ssrm/shareOfTotal';
