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
  useProfileManager,
} from './hooks';
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

// ─── Cockpit settings-panel primitives ──────────────────────────────────────
export {
  Caps,
  Mono,
  Band,
  Row,
  SharpBtn,
  IconInput,
  Stepper,
  PillGroup,
  PillBtn,
  DirtyDot,
  Led,
  TBtn,
  TGroup,
  TDivider,
  GhostIcon,
  TitleInput,
  MetaCell,
  ItemCard,
  TabStrip,
} from './ui/settings';
export type { BtnVariant, TabItem } from './ui/settings';

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
export type {
  BorderSpec,
  CellStyleOverrides,
  ColumnAssignment,
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

// ─── StyleEditor + ColorPicker + FormatterPicker ────────────────────────────
export { StyleEditor } from './ui/StyleEditor';
export type {
  StyleEditorProps,
  StyleEditorValue,
  StyleEditorSection,
  StyleEditorDataType,
  TextAlign,
  FontWeight,
} from './ui/StyleEditor';
export { CompactColorField } from './ui/ColorPicker';
export type { CompactColorFieldProps } from './ui/ColorPicker';
export {
  FormatterPicker,
  presetsForDataType,
  findMatchingPreset,
  defaultSampleValue,
} from './ui/FormatterPicker';
export type {
  FormatterPickerProps,
  FormatterPreset,
  FormatterPickerDataType,
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
