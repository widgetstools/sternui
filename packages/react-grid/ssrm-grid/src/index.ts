/// <reference path="./vite-env.d.ts" />

export const SSRM_GRID_PACKAGE = '@starui/ssrm-grid' as const;

export { CustomSSRMGrid } from './custom/CustomSSRMGrid.js';
export type {
  CustomSSRMGridHandle,
  CustomSSRMGridProps,
} from './custom/CustomSSRMGrid.js';
export type { SSRMColDef } from './custom/columnOverride.js';
export type {
  SSRMTransaction,
  GrandTotalRowMode,
  GroupTotalRowMode,
} from './types/ssrmTransaction.js';
export type { DirtyMessage } from './ssrm/applyWorkerDirtyToGrid.js';

export {
  createCustomEngine,
  materializeCalcColumns,
} from './engine/index.js';
export type { SsrmEngine } from './engine/index.js';

/**
 * SSRM-safe status bar panels. AG 36 gates its built-in status panels by
 * row model (`AgStatusBarValidationMap`): `agTotalRowCountComponent`,
 * `agFilteredRowCountComponent` and `agTotalAndFilteredRowCountComponent`
 * are **clientSide only** and are silently dropped under `serverSide`,
 * leaving an empty status bar. Only `agAggregationComponent` and
 * `agSelectedRowCountComponent` survive. These stand-ins reproduce the
 * CSRM look and read their counts from the grid `context`
 * (`{ totalRowCount, filteredRowCount }`), which the datasource owner
 * keeps current.
 */
export {
  ServerTotalAndFilteredRowCountPanel,
  ServerFilteredRowCountPanel,
  ServerSelectedRowCountPanel,
  SSRM_DEFAULT_STATUS_BAR,
} from './custom/ssrmStatusBarPanels.js';

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
