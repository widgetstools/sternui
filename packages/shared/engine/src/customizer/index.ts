/**
 * Customizer module logic — framework-agnostic state, transforms, and helpers.
 * React panel registration stays in `@starui/grid`.
 */

export * from './modules/calculated-columns/state.js';
export {
  buildVirtualColDef,
  getAllRowsSnapshot,
  invalidateAllRowsCache,
  type AllRowsEntry,
} from './modules/calculated-columns/virtualColumn.js';

export * from './modules/column-customization/state.js';
export {
  applyAssignments,
  reinjectCSS,
  cssEscapeColId,
  cellDataTypeToDomain,
  applyFilterConfigToColDef,
  applyRowGroupingConfigToColDef,
} from './modules/column-customization/transforms.js';
export * from './modules/column-customization/formattingActions.js';

export * from './modules/column-groups/state.js';
export {
  composeGroups,
  collectGroupIds,
  collectAssignedColIds,
  groupHeaderBorderOverlayCSS,
  groupHeaderStyleToCSS,
  hasHeaderBorders,
  hasHeaderStyle,
} from './modules/column-groups/composeGroups.js';
export * from './modules/column-groups/treeOps.js';

export * from './modules/column-templates/state.js';
export { resolveTemplates } from './modules/column-templates/resolveTemplates.js';
export * from './modules/column-templates/snapshotTemplate.js';

export * from './modules/conditional-styling/state.js';
export * from './modules/conditional-styling/transforms.js';
export { INDICATOR_ICONS, findIndicatorIcon } from './modules/conditional-styling/indicatorIcons.js';
export type { IndicatorIconDef } from './modules/conditional-styling/indicatorIcons.js';
export { toStyleEditorValue, fromStyleEditorValue } from './modules/conditional-styling/styleBridge.js';

export * from './modules/general-settings/state.js';

export * from './modules/grid-state/state.js';
export * from './modules/grid-state/helpers.js';

export * from './modules/alerts/state.js';
export * from './modules/alerts/evaluator.js';
export { applyAlertTransforms, applyAlertGridOptions } from './modules/alerts/transforms.js';

export * from './modules/smart-edit/state.js';
export { applyNumericOp } from './modules/smart-edit/operations.js';
export { parseMagnitudeSuffix } from './modules/smart-edit/parseMagnitudeSuffix.js';
export { applySmartEditColDefTransforms } from './modules/smart-edit/transforms.js';
export { isNumericCellDataType } from './modules/smart-edit/isNumericCellDataType.js';
export {
  collectTargetCells,
  collectFocusedCell,
  type SmartEditGridReader,
  type TargetCell,
} from './modules/smart-edit/collectTargetCells.js';
