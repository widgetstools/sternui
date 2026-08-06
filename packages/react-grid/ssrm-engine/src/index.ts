/**
 * @starui/ssrm-engine — a columnar row engine built to AG Grid's server-side
 * row model contract.
 *
 * One store, N queries. The store is columnar (typed arrays, dictionary-encoded
 * strings); a query is a request shape owning a materialised `Int32Array` index
 * of row offsets. That is the same idea as a Perspective View with three
 * differences that are the reason this exists: the index is MUTABLE so a
 * re-sort is a permute rather than a rebuild, writes do not block reads, and
 * the engine knows which rows changed so a live tick can be PUSHED to the grid
 * as a transaction instead of invalidating blocks.
 *
 * Free of any AG Grid import — the contract is restated structurally in
 * `types.ts`, so the engine runs in a worker, is testable without a grid, and
 * cannot depend on AG internals that move between majors.
 */
export { createSsrmEngine, SsrmEngine } from './engine.js';
export type {
  SsrmEngineOptions,
  SsrmDelta,
  SsrmDeltaListener,
  SsrmCalcPatchMode,
} from './engine.js';
export { createSsrmDatasource, makeSsrmGetRowId } from './datasource.js';
export type {
  SsrmDatasourceLike,
  SsrmDatasourceOptions,
  SsrmGetRowsParamsLike,
} from './datasource.js';
export { createAsyncSsrmDatasource, SSRM_BLOCK_TIMEOUT_MS } from './asyncDatasource.js';
export type { AsyncSsrmDatasourceOptions, AsyncSsrmSource } from './asyncDatasource.js';
export {
  createSsrmEngineRowEngine,
  SSRM_GRAND_TOTAL_FLAG,
  SSRM_GRAND_TOTAL_ROW_ID,
} from './rowEngine.js';
export type {
  SsrmCellEdit,
  SsrmEngineClientLike,
  SsrmEngineRowEngine,
  SsrmEngineRowEngineOpts,
  SsrmGridApiLike,
  SsrmGridStatus,
} from './rowEngine.js';
export { createSsrmRowPump } from './rowPump.js';
export type {
  SsrmRowPump,
  SsrmRowPumpFlush,
  SsrmRowPumpGrid,
  SsrmRowPumpOptions,
  SsrmRowPumpStats,
} from './rowPump.js';
export { ColumnStore } from './columnStore.js';
export type { StoredColumn } from './columnStore.js';
export {
  createColumnResolver,
  numericOrderKey,
  orderKeyOfValue,
} from './columnAccess.js';
export type { SsrmColumnAccess, SsrmColumnResolver } from './columnAccess.js';
export { compileCalcColumns } from './calc.js';
export type {
  SsrmCalcColumn,
  SsrmCalcCompileResult,
  SsrmCalcDiagnostic,
  SsrmCalcEvaluator,
} from './calc.js';
export { CALC_FUNCTIONS, applyBinary, applyUnary, isTruthy } from './calcOps.js';
export type { CalcFunction } from './calcOps.js';
export type {
  SsrmArrayNode,
  SsrmBinaryNode,
  SsrmCalcColumnDef,
  SsrmCallNode,
  SsrmColumnRefNode,
  SsrmExpressionNode,
  SsrmLiteralNode,
  SsrmMemberNode,
  SsrmTernaryNode,
  SsrmUnaryNode,
  SsrmVariableNode,
} from './calcAst.js';
export { compileFilter, compileQuickFilter, type RowPredicate } from './filter.js';
export { sortIndex, lowerBound, compareOrderKeys } from './sort.js';
export { aggregateMembers, activeAggregations, toAggFunc } from './aggregate.js';
export type { SsrmAggregation } from './aggregate.js';
export {
  SSRM_GROUP_FLAG,
  SSRM_GROUP_PATH,
  SSRM_CHILD_COUNT,
  SSRM_TREE_GROUP,
  SSRM_TREE_KEY,
  type SsrmAggFunc,
  type SsrmColumnVO,
  type SsrmFieldDef,
  type SsrmFieldType,
  type SsrmFilterItem,
  type SsrmFilterModel,
  type SsrmGetRowsRequest,
  type SsrmGetRowsResult,
  type SsrmRow,
  type SsrmSchema,
  type SsrmSortModelItem,
} from './types.js';
