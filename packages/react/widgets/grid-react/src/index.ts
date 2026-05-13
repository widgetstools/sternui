/**
 * @starui/grid-react — React UI for the MarketsUI grid customizer.
 *
 * Hosts every React surface that previously lived under
 * `@starui/core/src/{ui,hooks,modules}` (extracted in PR-8). Consumers
 * are `@starui/markets-grid` and any host app that needs the
 * settings-panel primitives, hooks, or module definitions.
 *
 * `@starui/core` remains framework-agnostic vanilla TS: GridPlatform,
 * ProfileManager, expression engine, persistence adapters, etc.
 */

// ─── React bindings ──────────────────────────────────────────────────────
export { GridProvider, useGridPlatform } from './hooks/GridProvider';
export { useModuleState } from './hooks/useModuleState';
export { useGridApi, useGridEvent } from './hooks/useGridApi';
export { useProfileManager } from './hooks/useProfileManager';
export type { UseProfileManagerResult } from './hooks/useProfileManager';
export type { GridCoreLike } from './hooks/GridContext';
export { useDirty, useDirtyCount, type DirtyHandle } from './hooks/useDirty';
export {
  useGridColumns,
  type GridColumnInfo,
} from './hooks/useGridColumns';
export {
  useModuleDraft,
  type UseModuleDraftOptions,
  type UseModuleDraftResult,
} from './hooks/useModuleDraft';
export { useUndoRedo, type UseUndoRedoResult } from './hooks/useUndoRedo';
export { useActiveThemeMode } from './hooks/useActiveThemeMode';

// Back-compat alias — preserved from the old core barrel. Some
// markets-grid helpers still thread `GridCore` (the minimal
// `{ getGridApi, gridId }` shape) through their props.
export type { GridCoreLike as GridCore } from './hooks/GridContext';

// ─── ExpressionEditor ────────────────────────────────────────────────────
export { ExpressionEditor } from './ui/ExpressionEditor';
export type {
  ExpressionEditorProps,
  ExpressionEditorHandle,
} from './ui/ExpressionEditor';

// ─── Popout window primitives ────────────────────────────────────────────
export { PopoutPortal } from './ui/PopoutPortal';
export type { PopoutPortalProps } from './ui/PopoutPortal';
export { Poppable } from './ui/Poppable';
export type {
  PoppableProps,
  PoppableHandle,
  PoppableRenderProps,
  PopoutButtonProps,
} from './ui/Poppable';
export {
  PortalContainerProvider,
  usePortalContainer,
  useResolvedPortalContainer,
} from './ui/PortalContainer';
export type { PortalContainerProviderProps } from './ui/PortalContainer';

// ─── Settings-panel primitives ───────────────────────────────────────────
export {
  DirtyDot,
  LedBar,
  GhostIcon,
  SubLabel,
  IconInput,
  PillToggleGroup,
  PillToggleBtn,
  PairRow,
  FigmaPanelSection,
  ItemCard,
  ObjectTitleRow,
  TitleInput,
  PanelChrome,
  TabStrip,
  Caps,
  Mono,
  SharpBtn,
  TGroup,
  TBtn,
  TDivider,
  Band,
  MetaCell,
  Stepper,
} from './ui/SettingsPanel';
export type {
  DirtyDotProps,
  LedBarProps,
  GhostIconProps,
  SubLabelProps,
  IconInputProps,
  PillToggleGroupProps,
  PillToggleBtnProps,
  PairRowProps,
  FigmaPanelSectionProps,
  ItemCardProps,
  ObjectTitleRowProps,
  TitleInputProps,
  PanelChromeProps,
  TabStripProps,
  TabItem,
  CapsProps,
  MonoProps,
  SharpBtnProps,
  SharpBtnVariant,
  TGroupProps,
  TBtnProps,
  BandProps,
  MetaCellProps,
  StepperProps,
} from './ui/SettingsPanel';

// ─── shadcn primitives (ds-themed; distinct from @starui/ui) ─────────────
export { Button, buttonVariants } from './ui/shadcn/button';
export type { ButtonProps } from './ui/shadcn/button';
export { GhostIconButton } from './ui/shadcn/ghost-icon-button';
export type {
  GhostIconButtonProps,
  GhostIconButtonVariant,
  GhostIconButtonSize,
  GhostIconButtonReveal,
} from './ui/shadcn/ghost-icon-button';
export { Input } from './ui/shadcn/input';
export type { InputProps } from './ui/shadcn/input';
export { Textarea, type TextareaProps } from './ui/shadcn/textarea';
export { Select } from './ui/shadcn/select';
export { Switch } from './ui/shadcn/switch';
export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverClose,
  PopoverCompat,
} from './ui/shadcn/popover';
export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from './ui/shadcn/alert-dialog';
export { Tooltip } from './ui/shadcn/tooltip';
export { Separator } from './ui/shadcn/separator';
export { Label } from './ui/shadcn/label';
export { cn } from './ui/shadcn/utils';
export { ToggleGroup, ToggleGroupItem } from './ui/shadcn/toggle-group';
export { ColorPicker, ColorPickerPopover } from './ui/shadcn/color-picker';

// ─── StyleEditor + ColorPicker + FormatterPicker ─────────────────────────
export {
  StyleEditor,
  TextSection,
  ColorSection,
  BorderSection,
  FormatSection,
  BorderStyleEditor,
} from './ui/StyleEditor';
export type {
  StyleEditorProps,
  StyleEditorValue,
  StyleEditorSection,
  StyleEditorVariant,
  StyleEditorDataType,
  TextAlign,
  FontWeight,
  BorderStyleEditorProps,
  BordersValue,
} from './ui/StyleEditor';
export { CompactColorField } from './ui/ColorPicker';
export type { CompactColorFieldProps } from './ui/ColorPicker';
export {
  FormatterPicker,
  inferPickerDataType,
  presetsForDataType,
  findMatchingPreset,
  defaultSampleValue,
  EXCEL_EXAMPLES,
} from './ui/FormatterPicker';
export type {
  FormatterPickerProps,
  FormatterPreset,
  FormatterPickerDataType,
  ExcelExample,
  ExcelExampleCategory,
} from './ui/FormatterPicker';

// ─── Format editor primitives ────────────────────────────────────────────
export {
  FormatPopover,
  FormatDropdown,
  FormatColorPicker,
  registerPopoverRoot,
  clickIsInsideAnyOpenPopover,
  EDGE_ORDER,
  defaultSideSpec,
  makeDefaultSides,
} from './ui/format-editor';
export type {
  BorderSide,
  BorderStyle,
  BorderMode,
  SideSpec,
} from './ui/format-editor';

// ─── Modules ─────────────────────────────────────────────────────────────
export {
  generalSettingsModule,
  GENERAL_SETTINGS_MODULE_ID,
  INITIAL_GENERAL_SETTINGS,
  type GeneralSettingsState,
} from './modules/general-settings';
export {
  columnTemplatesModule,
  COLUMN_TEMPLATES_MODULE_ID,
  INITIAL_COLUMN_TEMPLATES,
  resolveTemplates,
  snapshotTemplate,
  snapshotTemplateUpdate,
  pickTemplateFields,
  addTemplateReducer,
  removeTemplateReducer,
  updateTemplateReducer,
  renameTemplateReducer,
  type ColumnTemplate,
  type ColumnTemplatesState,
  type RowGroupingTemplate,
  type SnapshotTemplateDeps,
} from './modules/column-templates';
export {
  columnCustomizationModule,
  COLUMN_CUSTOMIZATION_MODULE_ID,
  INITIAL_COLUMN_CUSTOMIZATION,
  applyFilterConfigToColDef,
  applyRowGroupingConfigToColDef,
  useAppDataLookup,
  useAppDataProviders,
  useAppDataKeys,
  parseValuesSource,
  overrideKey,
  stripUndefined,
  mergeOverrides,
  writeOverridesReducer,
  applyTypographyReducer,
  applyColorsReducer,
  applyAlignmentReducer,
  applyBordersReducer,
  clearAllBordersReducer,
  applyHeaderNameReducer,
  applyEditableReducer,
  applyCellEditorKindReducer,
  applyCellEditorValuesReducer,
  applyFilterPrimaryKindReducer,
  applyFloatingFilterReducer,
  applyFormatterReducer,
  applyTemplateToColumnsReducer,
  removeTemplateRefFromAssignmentsReducer,
  clearAllStylesReducer,
  clearAllStylesInProfileReducer,
  type TargetKind,
  type ColumnAssignment,
  type ColumnCustomizationAssignment,
  type ColumnCustomizationState,
  type ColumnFilterConfig,
  type RowGroupingConfig,
  type FilterKind,
  type CellEditorKind,
  type ColumnCellEditorConfig,
  type AggFuncName,
  type SetFilterOptions,
  type MultiFilterEntry,
} from './modules/column-customization';
export {
  conditionalStylingModule,
  CONDITIONAL_STYLING_MODULE_ID,
  INITIAL_CONDITIONAL_STYLING,
  INDICATOR_ICONS,
  findIndicatorIcon,
  toStyleEditorValue,
  fromStyleEditorValue,
  type ConditionalRule,
  type ConditionalStylingState,
  type FlashConfig,
  type FlashTarget,
  type IndicatorPosition,
  type IndicatorTarget,
  type RuleIndicator,
  type RuleScope,
  type IndicatorIconDef,
} from './modules/conditional-styling';
export {
  calculatedColumnsModule,
  CALCULATED_COLUMNS_MODULE_ID,
  INITIAL_CALCULATED_COLUMNS,
  type CalculatedColumnsState,
  type VirtualColumnDef,
} from './modules/calculated-columns';
export {
  savedFiltersModule,
  SAVED_FILTERS_MODULE_ID,
  INITIAL_SAVED_FILTERS,
  type SavedFiltersState,
} from './modules/saved-filters';
export {
  toolbarVisibilityModule,
  TOOLBAR_VISIBILITY_MODULE_ID,
  INITIAL_TOOLBAR_VISIBILITY,
  type ToolbarVisibilityState,
} from './modules/toolbar-visibility';
export {
  gridStateModule,
  GRID_STATE_MODULE_ID,
  GRID_STATE_SCHEMA_VERSION,
  INITIAL_GRID_STATE,
  captureGridState,
  applyGridState,
  captureGridStateInto,
  type GridStateState,
  type SavedGridState,
} from './modules/grid-state';
export {
  columnGroupsModule,
  COLUMN_GROUPS_MODULE_ID,
  INITIAL_COLUMN_GROUPS,
  composeGroups,
  collectGroupIds,
  collectAssignedColIds,
  type ColumnGroupsState,
  type ColumnGroupNode,
  type ColumnGroupChild,
  type GroupChildShow,
  type GroupHeaderStyle,
  type GroupHeaderBorderSpec,
} from './modules/column-groups';
