/**
 * @starui/perspective-grid — Perspective-backed MarketsGrid engine.
 *
 * Topology (validated by `scripts/viewCostProbe.mjs` against 4.5.2):
 * ONE Table lives in the SharedWorker and is fed by the STOMP provider;
 * each blotter window opens its own View and renders only the rows in
 * its viewport. A window therefore never materializes the full book —
 * a 100-row window read measured ~2-6ms flat with scroll depth, against
 * ~1.3ms per extra live View per tick.
 *
 * AG Grid is retained as the surface (the MarketsGrid customizer, cell
 * renderers, conditional styling and column defs are all built on it);
 * Perspective replaces only the row-supply engine underneath.
 *
 * Views MUST be closed through `createSafeView` — deleting one while a
 * read is in flight throws an uncatchable wasm borrow error that can take
 * the whole SharedWorker down. See `safeView.ts`.
 */
export {
  createPerspectiveDatasource,
  columnsToRows,
  cloneRequest,
  type PerspectiveDatasource,
  type PerspectiveDatasourceOpts,
  type PerspectiveViewLike,
  type SsrmRequestLike,
  type SsrmGetRowsParamsLike,
} from './perspectiveDatasource.js';
export { createSafeView, type SafeView, type DeletableView } from './safeView.js';
export {
  coerceEditedValue,
  type CoercedValue,
  type PerspectiveColumnType,
} from './cellEdits.js';
export {
  createPerspectiveRowEngine,
  GRAND_TOTAL_ROW_ID,
  GRAND_TOTAL_FLAG,
  type PerspectiveRowEngine,
  type PerspectiveGridStatus,
  type PerspectiveRowEngineOpts,
  type PerspectiveCellEdit,
  type GridApiLike,
  type GridNodeLike,
} from './perspectiveRowEngine.js';
export {
  createViewManager,
  type ViewManager,
  type ViewManagerOpts,
  type ViewManagerEvent,
  type PerspectiveTableLike,
  type UpdatableView,
} from './viewManager.js';
export {
  usePerspectiveTable,
  type UsePerspectiveTableOpts,
  type UsePerspectiveTableResult,
  type PerspectiveAttachClientLike,
  type PerspectiveAttachOutcome,
  type PerspectiveClientModuleLike,
  type PerspectiveTableStatus,
} from './usePerspectiveTable.js';
export {
  toPerspectiveViewConfig,
  toPerspectiveGroupLevel,
  toGroupColumns,
  toTreeColumns,
  TREE_KEY_FIELD,
  TREE_GROUP_FIELD,
  toPerspectiveSort,
  toPerspectiveFilter,
  toPerspectiveFilterClauses,
  isFilterModelMappable,
  toQuickFilterExpression,
  sanitizeQuickFilterTerm,
  QUICK_FILTER_COLUMN,
  toPerspectiveAggregate,
  viewConfigKey,
  type PerspectiveViewConfig,
  type PerspectiveGroupLevel,
  type PerspectiveAggregate,
  type AgRequestState,
  type AgGroupLevelState,
  type AgSortItem,
  type AgFilterItem,
} from './viewConfig.js';
