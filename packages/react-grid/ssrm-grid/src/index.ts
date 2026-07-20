/// <reference path="./vite-env.d.ts" />

export const SSRM_GRID_PACKAGE = '@wellsfargo-starui/ssrm-grid' as const;

export { SsrmGrid } from './custom/SsrmGrid.js';
export type { SsrmGridHandle, SsrmGridProps } from './custom/types.js';
export type { SSRMColDef } from './custom/columnOverride.js';
export type {
  SSRMTransaction,
  GrandTotalRowMode,
  GroupTotalRowMode,
} from './types/ssrmTransaction.js';
export type { DirtyMessage } from './ssrm/applyWorkerDirtyToGrid.js';

export {
  createCustomEngine,
  createPerspectiveEngine,
  materializeCalcColumns,
} from './engine/index.js';
export type {
  SsrmEngine,
  PerspectiveEngineOpts,
  PerspectiveClient,
} from './engine/index.js';

export { foldTrafficLight, isTrafficLightAgg } from './ssrm/trafficLightAgg.js';
export {
  shareOfTotal,
  shareOfAggregate,
  formatShareOfTotal,
  formatShareOfAggregate,
  shareExceeds,
  resolveAggregate,
} from './ssrm/shareOfTotal.js';
export {
  fetchAllGroupLeafRows,
  mergeGroupPathIntoFilterModel,
  toGroupLeafCols,
} from './ssrm/getGroupLeafRows.js';
export {
  compileExpression,
  compileEditableExpression,
  compileCellStyleExpression,
  compileCellClassRuleExpression,
  resolveAggFuncName,
} from './ssrm/compileColExpression.js';
