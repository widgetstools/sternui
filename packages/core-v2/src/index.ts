// Public API for @grid-customizer/core-v2.
//
// Implementation modules live under src/{core,store,persistence,profiles}.
// Day 1 ships only the core orchestrator + types; later days add the store,
// persistence adapters, and profile manager.

export { GridCore } from './core/GridCore';
export type { GridCoreOptions } from './core/GridCore';
export { EventBus } from './core/EventBus';
export { topoSortModules } from './core/topoSort';
export {
  inferCellDataType,
  sampleColumn,
  inferCellDataTypeFromRows,
} from './core/inferCellDataType';
export type { InferredCellDataType } from './core/inferCellDataType';

export type {
  AnyColDef,
  AnyModule,
  EditorPaneProps,
  EventBusInstance,
  EventMap,
  GridContext,
  ListPaneProps,
  Module,
  ModuleContext,
  SerializedState,
  SettingsPanelProps,
} from './core/types';

// Store layer
export { createGridStore } from './store/createGridStore';
export type { CreateGridStoreOptions, GridStore } from './store/createGridStore';
export { useModuleState } from './store/useModuleState';
export { useDraftModuleItem } from './store/useDraftModuleItem';
export type {
  UseDraftModuleItemOptions,
  UseDraftModuleItemResult,
} from './store/useDraftModuleItem';
export { startAutoSave } from './store/autosave';
export type { AutoSaveHandle, AutoSaveOptions } from './store/autosave';

// Persistence
export {
  RESERVED_DEFAULT_PROFILE_ID,
  activeProfileKey,
} from './persistence/StorageAdapter';
export type { ProfileSnapshot, StorageAdapter } from './persistence/StorageAdapter';
export { MemoryAdapter } from './persistence/MemoryAdapter';
export { DexieAdapter } from './persistence/DexieAdapter';
export { migrateLegacyLocalStorage } from './persistence/migrations';

// UI context (v2 SettingsPanel host integration)
export { GridProvider, useGridStore, useGridCore } from './ui/GridContext';
export { v2SheetCSS, V2_SHEET_STYLE_ID } from './ui/v2-sheet-styles';

// Cockpit Terminal SettingsPanel primitives (shared across v2 panels)
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
  type DirtyDotProps,
  type LedBarProps,
  type GhostIconProps,
  type SubLabelProps,
  type IconInputProps,
  type PillToggleGroupProps,
  type PillToggleBtnProps,
  type PairRowProps,
  type FigmaPanelSectionProps,
  type ItemCardProps,
  type ObjectTitleRowProps,
  type TitleInputProps,
  type PanelChromeProps,
  type TabStripProps,
  type TabItem,
  type CapsProps,
  type MonoProps,
  type SharpBtnProps,
  type SharpBtnVariant,
  type TGroupProps,
  type TBtnProps,
  type BandProps,
  type MetaCellProps,
  type StepperProps,
} from './ui/SettingsPanel';

// Compact color picker kit (inline 30px field + Figma-style popover)
export {
  CompactColorField,
  ColorPickerPopover,
  type CompactColorFieldProps,
  type ColorPickerPopoverProps,
} from './ui/ColorPicker';

// Shared FormatterPicker — the horizontally-collapsible value-formatter
// selector embedded in FormattingToolbar, Style Rule editor, and
// Calculated Column editor. Value shape is ValueFormatterTemplate so
// persistence and rendering stay on one code path.
export {
  FormatterPicker,
  inferPickerDataType,
  defaultSampleValue,
  findMatchingPreset,
  presetsForDataType,
  EXCEL_EXAMPLES,
  type FormatterPickerProps,
  type FormatterPickerDataType,
  type FormatterPreset,
  type ExcelExample,
  type ExcelExampleCategory,
} from './ui/FormatterPicker';

// Shared StyleEditor (text + color + border + format) for every v2 panel
export {
  StyleEditor,
  TextSection,
  ColorSection,
  BorderSection,
  FormatSection,
  BorderStyleEditor,
  type StyleEditorProps,
  type StyleEditorValue,
  type StyleEditorSection,
  type StyleEditorVariant,
  type StyleEditorDataType,
  type TextAlign,
  type FontWeight,
  type BorderStyleEditorProps,
  type BordersValue,
} from './ui/StyleEditor';

// Profile manager
export { useProfileManager } from './profiles/useProfileManager';
export type {
  ProfileMeta,
  UseProfileManagerOptions,
  UseProfileManagerResult,
  ExportedProfilePayload,
} from './profiles/useProfileManager';

// Built-in modules
export { generalSettingsModule, INITIAL_GENERAL_SETTINGS } from './modules/general-settings';
export type { GeneralSettingsState } from './modules/general-settings';
export { columnTemplatesModule, INITIAL_COLUMN_TEMPLATES } from './modules/column-templates';
export type { ColumnTemplate, ColumnDataType, ColumnTemplatesState } from './modules/column-templates';
export { resolveTemplates } from './modules/column-templates/resolveTemplates';
export { isValidExcelFormat } from './modules/column-customization/adapters/excelFormatter';
export { presetToExcelFormat } from './modules/column-customization/adapters/presetToExcelFormat';
export {
  tickFormatter,
  TICK_LABELS,
  TICK_SAMPLES,
} from './modules/column-customization/adapters/tickFormatter';
export { valueFormatterFromTemplate } from './modules/column-customization/adapters/valueFormatterFromTemplate';
export { columnCustomizationModule, INITIAL_COLUMN_CUSTOMIZATION } from './modules/column-customization';
export type { ColumnAssignment, ColumnCustomizationState } from './modules/column-customization';
// Type-only re-exports for the structured style/formatter shapes — consumers
// like FormattingToolbar build these at edit time, so they must be reachable
// from the package root without deep-importing module internals.
export type {
  BorderSpec,
  CellStyleOverrides,
  ValueFormatterTemplate,
  PresetId,
  TickToken,
} from './modules/column-customization/state';
export { conditionalStylingModule, INITIAL_CONDITIONAL_STYLING } from './modules/conditional-styling';
export type {
  CellStyleProperties,
  ConditionalRule,
  ConditionalStylingState,
  RuleScope,
  ThemeAwareStyle,
} from './modules/conditional-styling';
export { calculatedColumnsModule, INITIAL_CALCULATED_COLUMNS } from './modules/calculated-columns';
export type {
  CalculatedColumnsState,
  VirtualColumnDef,
} from './modules/calculated-columns';
export { columnGroupsModule, INITIAL_COLUMN_GROUPS } from './modules/column-groups';
export type {
  ColumnGroupsState,
  ColumnGroupNode,
  ColumnGroupChild,
} from './modules/column-groups';
export { savedFiltersModule, INITIAL_SAVED_FILTERS } from './modules/saved-filters';
export type { SavedFiltersState } from './modules/saved-filters';
export { toolbarVisibilityModule, INITIAL_TOOLBAR_VISIBILITY } from './modules/toolbar-visibility';
export type { ToolbarVisibilityState } from './modules/toolbar-visibility';
export {
  gridStateModule,
  INITIAL_GRID_STATE,
  GRID_STATE_SCHEMA_VERSION,
  captureGridState,
  applyGridState,
  captureGridStateInto,
} from './modules/grid-state';
export type { GridStateState, SavedGridState } from './modules/grid-state';
