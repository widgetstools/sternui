/**
 * @grid-customizer/core — v3.
 *
 * One package, no `-v2` suffix, no React-vs-vanilla split yet (that's a
 * future packaging decision). Keeps the layering clean internally:
 *
 *   platform/      framework-agnostic runtime (GridPlatform, store, events, api hub)
 *   expression/    CSP-safe expression engine (unchanged from v2)
 *   hooks/         thin React bindings for the platform
 *   ui/            React UI primitives (shadcn, format-editor, ExpressionEditor, …)
 *   modules/       individual modules (each exports a Module<S> + a React panel)
 *   …              shared helpers that don't need a React boundary
 *
 * Public surface kept narrow — consumers import modules by name from
 * `./modules/<moduleId>`.
 */

// ─── Platform runtime (framework-agnostic) ──────────────────────────────────
export {
  GridPlatform,
  EventBus,
  topoSortModules,
  ApiHub,
  ResourceScope,
  CssInjector,
  PipelineRunner,
} from './platform';
export type {
  GridPlatformOptions,
  AnyColDef,
  AnyModule,
  ApiEventName,
  CssHandle,
  EditorPaneProps,
  ExpressionEngineLike,
  GridApi,
  GridOptions,
  GetRowIdFunc,
  GetRowIdParams,
  ListPaneProps,
  Module,
  PlatformEventMap,
  PlatformHandle,
  SerializedState,
  SettingsPanelProps,
  Store,
  TransformContext,
} from './platform';

// ─── Store + auto-save ──────────────────────────────────────────────────────
export { createGridStore } from './store/createGridStore';
export type { CreateStoreOptions } from './store/createGridStore';
export { startAutoSave } from './store/autosave';
export type { AutoSaveHandle, AutoSaveOptions } from './store/autosave';

// ─── Persistence adapters ───────────────────────────────────────────────────
export {
  MemoryAdapter,
  DexieAdapter,
  RESERVED_DEFAULT_PROFILE_ID,
  activeProfileKey,
  type ProfileSnapshot,
  type StorageAdapter,
} from './persistence';

// ─── Profile manager ────────────────────────────────────────────────────────
export { ProfileManager } from './profiles';
export type {
  ProfileManagerOptions,
  ProfileManagerState,
  ProfileMeta,
  ExportedProfilePayload,
} from './profiles';

// ─── React bindings ─────────────────────────────────────────────────────────
export {
  GridProvider,
  useGridPlatform,
  useModuleState,
  useGridApi,
  useGridEvent,
  useGridStore,
  useGridCore,
  useProfileManager,
} from './hooks';
export type { GridCoreLike } from './hooks';

// Back-compat aliases for ported v2 UI code. `GridCore` is the minimal
// surface panels actually consume (gridId + getGridApi); `GridStore` is
// the same `Store` v3 exposes. New code should prefer `Store` +
// `useGridPlatform()` directly.
export type { GridCoreLike as GridCore } from './hooks';
export type { Store as GridStore } from './platform/types';
export type { UseProfileManagerResult } from './hooks';

// ─── Expression Engine (unchanged, re-exported) ─────────────────────────────
export {
  ExpressionEngine,
  tokenize,
  parse,
  Evaluator,
  tryCompileToAgString,
} from './expression';
export type {
  ExpressionNode,
  EvaluationContext,
  ValidationResult,
  FunctionDefinition,
} from './expression';
export { migrateExpressionSyntax, migrateExpressionsInObject } from './expression/migrate';

// ─── Monaco ExpressionEditor (unchanged, re-exported) ───────────────────────
export { ExpressionEditor } from './ui/ExpressionEditor';
export type { ExpressionEditorProps, ExpressionEditorHandle } from './ui/ExpressionEditor';

// ─── Types ──────────────────────────────────────────────────────────────────
export type { CellStyleProperties, ThemeAwareStyle } from './types/common';

// ─── Shared CSS / cockpit tokens ────────────────────────────────────────────
export { settingsCSS, STYLE_ID } from './ui/styles';
export { cockpitCSS, COCKPIT_STYLE_ID } from './css';

// v2 name aliases for ported host chrome (SettingsSheet ensures the <style>
// tag directly rather than relying on the grid's ensureCockpitStyles()).
export { cockpitCSS as v2SheetCSS, COCKPIT_STYLE_ID as V2_SHEET_STYLE_ID } from './css';

// ─── Cockpit settings-panel primitives (v2 surface, verbatim) ──────────────
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

// ─── shadcn primitives ──────────────────────────────────────────────────────
export { Button, buttonVariants } from './ui/shadcn/button';
export type { ButtonProps } from './ui/shadcn/button';
export { Input } from './ui/shadcn/input';
export { Textarea, type TextareaProps } from './ui/shadcn/textarea';
export type { InputProps } from './ui/shadcn/input';
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

// ─── Shared colDef types ────────────────────────────────────────────────────
//
// `ColumnAssignment` exported from this barrel is the NARROWED
// column-customization shape (with concrete `filter: ColumnFilterConfig`
// + `rowGrouping: RowGroupingConfig`). The base shape (with those slots
// as `unknown`) is exported as `BaseColumnAssignment` — only needed by
// colDef internals that shouldn't pre-commit to the narrowed types.
export type {
  BorderSpec,
  CellStyleOverrides,
  ColumnAssignment as BaseColumnAssignment,
  ColumnDataType,
  PresetId,
  TickToken,
  ValueFormatterTemplate,
} from './colDef';

// ─── Modules ────────────────────────────────────────────────────────────────
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
  type ColumnTemplate,
  type ColumnTemplatesState,
} from './modules/column-templates';
export {
  columnCustomizationModule,
  COLUMN_CUSTOMIZATION_MODULE_ID,
  INITIAL_COLUMN_CUSTOMIZATION,
  applyFilterConfigToColDef,
  applyRowGroupingConfigToColDef,
  // Narrowed ColumnAssignment (with concrete filter + rowGrouping shapes).
  // This is what every consumer wants — the base shape with `unknown`
  // slots ships as `BaseColumnAssignment` from colDef.
  type ColumnAssignment,
  type ColumnCustomizationAssignment,
  type ColumnCustomizationState,
  type ColumnFilterConfig,
  type RowGroupingConfig,
  type FilterKind,
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

// ─── StyleEditor + ColorPicker + FormatterPicker ────────────────────────────
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
export { CompactColorField, ColorPickerPopover as CockpitColorPickerPopover } from './ui/ColorPicker';
export type { CompactColorFieldProps, ColorPickerPopoverProps as CockpitColorPickerPopoverProps } from './ui/ColorPicker';
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

// ─── Format editor primitives (unchanged) ───────────────────────────────────
export {
  FormatPopover,
  FormatDropdown,
  FormatColorPicker,
  FormatSwatch,
  BorderSidesEditor,
  registerPopoverRoot,
  clickIsInsideAnyOpenPopover,
  EDGE_ORDER,
  defaultSideSpec,
  makeDefaultSides,
} from './ui/format-editor';
export type { BorderSide, BorderStyle, BorderMode, SideSpec } from './ui/format-editor';
