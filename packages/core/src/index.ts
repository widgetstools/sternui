// ─── Core ────────────────────────────────────────────────────────────────────
export { GridCustomizerCore } from './core/GridCustomizerCore';
export { EventBus } from './core/EventBus';
export { CssInjector } from './core/CssInjector';
export { BatchProcessor } from './core/BatchProcessor';
export { GridLifecycle } from './core/lifecycle';

// ─── Hooks ───────────────────────────────────────────────────────────────────
export { useGridCustomizer } from './hooks/useGridCustomizer';
export type { UseGridCustomizerOptions, UseGridCustomizerReturn } from './hooks/useGridCustomizer';
export {
  useProfileManager,
  RESERVED_DEFAULT_PROFILE_ID,
  RESERVED_DEFAULT_PROFILE_NAME,
  isReservedDefaultProfile,
} from './hooks/useProfileManager';
export { useModuleState } from './stores/useModuleState';

// ─── Stores ──────────────────────────────────────────────────────────────────
export { createGridStore, destroyGridStore } from './stores/createGridStore';
export type { GridCustomizerStore, GridStore } from './stores/createGridStore';

// ─── Expression Engine ───────────────────────────────────────────────────────
export { ExpressionEngine, tokenize, parse, Evaluator, tryCompileToAgString } from './expression';
export type { ExpressionNode, EvaluationContext, ValidationResult, FunctionDefinition } from './expression';

// ─── Persistence ─────────────────────────────────────────────────────────────
export type { StorageAdapter } from './persistence/StorageAdapter';
export { BaseStorageAdapter } from './persistence/BaseStorageAdapter';
export { DexieAdapter } from './persistence/DexieAdapter';
export { LocalStorageAdapter } from './persistence/LocalStorageAdapter';
export { RestAdapter } from './persistence/RestAdapter';
export type { RestAdapterOptions } from './persistence/RestAdapter';

// ─── Modules (17) ───────────────────────────────────────────────────────────
export { generalSettingsModule } from './modules/general-settings';
export { columnTemplatesModule } from './modules/column-templates';
export { columnCustomizationModule } from './modules/column-customization';
export { columnGroupsModule } from './modules/column-groups';
export { conditionalStylingModule } from './modules/conditional-styling';
export { calculatedColumnsModule } from './modules/calculated-columns';
export { namedQueriesModule } from './modules/named-queries';
export { cellFlashingModule } from './modules/cell-flashing';
export { entitlementsModule } from './modules/entitlements';
export { dataManagementModule } from './modules/data-management';
export { sortFilterModule } from './modules/sort-filter';
export { editingModule } from './modules/editing';
export { undoRedoModule } from './modules/undo-redo';
export { exportClipboardModule } from './modules/export-clipboard';
export { performanceModule } from './modules/performance';
export { themingModule } from './modules/theming';
export { profilesModule } from './modules/profiles';
export { setProfilesPanelConfig } from './modules/profiles/ProfilesPanel';
export type { ProfilesPanelConfig } from './modules/profiles/ProfilesPanel';
export { expressionEditorModule } from './modules/expression-editor';
export { toolbarVisibilityModule } from './modules/toolbar-visibility';
export type { ToolbarVisibilityState } from './modules/toolbar-visibility';
export { savedFiltersModule } from './modules/saved-filters';
export type { SavedFiltersState } from './modules/saved-filters';

// ─── Types ───────────────────────────────────────────────────────────────────
export type { GridCustomizerModule, SettingsPanelProps, AnyModule } from './types/module';
export type {
  GridContext,
  ModuleContext,
  CssInjectorInstance,
  EventBusInstance,
  EventMap,
  CellStyleProperties,
  ThemeAwareStyle,
  ColumnOverride,
} from './types/common';
export type { ProfileSnapshot, ProfileMeta, GridConfig } from './types/profile';
export { CURRENT_SCHEMA_VERSION } from './types/profile';

// ─── UI ──────────────────────────────────────────────────────────────────────
export { SettingsSheet } from './ui/SettingsSheet';
export { ModuleNav } from './ui/ModuleNav';
export { FieldRow, SwitchField, NumberField, TextField, SelectField, ColorField, ExpressionField } from './ui/FormFields';
export { GridCustomizerProvider, useGridCustomizerStore, useGridCustomizerCore } from './ui/GridCustomizerContext';
export { ColumnPickerSingle, ColumnPickerMulti, useGridColumns } from './ui/ColumnPicker';
export { PropertySection, PropRow, PropSwitch, PropSelect, PropNumber, PropText, PropColor } from './ui/PropertyPanel';

// ─── Shadcn Components ───────────────────────────────────────────────────────
export { Button, buttonVariants } from './ui/shadcn/button';
export type { ButtonProps } from './ui/shadcn/button';
export { Input } from './ui/shadcn/input';
export type { InputProps } from './ui/shadcn/input';
export { Select } from './ui/shadcn/select';
export { Switch } from './ui/shadcn/switch';
export { Popover } from './ui/shadcn/popover';
export { Tooltip } from './ui/shadcn/tooltip';
export { Separator } from './ui/shadcn/separator';
export { Label } from './ui/shadcn/label';
export { cn } from './ui/shadcn/utils';
export { ToggleGroup, ToggleGroupItem } from './ui/shadcn/toggle-group';
export { ColorPicker, ColorPickerPopover } from './ui/shadcn/color-picker';

// ─── All Modules (ordered by priority) ───────────────────────────────────────
import { generalSettingsModule } from './modules/general-settings';
import { themingModule } from './modules/theming';
import { columnTemplatesModule } from './modules/column-templates';
import { columnCustomizationModule } from './modules/column-customization';
import { columnGroupsModule } from './modules/column-groups';
import { conditionalStylingModule } from './modules/conditional-styling';
import { calculatedColumnsModule } from './modules/calculated-columns';
import { cellFlashingModule } from './modules/cell-flashing';
import { editingModule } from './modules/editing';
import { entitlementsModule } from './modules/entitlements';
import { sortFilterModule } from './modules/sort-filter';
import { namedQueriesModule } from './modules/named-queries';
import { undoRedoModule } from './modules/undo-redo';
import { dataManagementModule } from './modules/data-management';
import { exportClipboardModule } from './modules/export-clipboard';
import { performanceModule } from './modules/performance';
import { profilesModule } from './modules/profiles';
import { expressionEditorModule } from './modules/expression-editor';
import { toolbarVisibilityModule } from './modules/toolbar-visibility';
import { savedFiltersModule } from './modules/saved-filters';

export const allModules = [
  generalSettingsModule,
  profilesModule,
  themingModule,
  columnTemplatesModule,
  columnCustomizationModule,
  columnGroupsModule,
  conditionalStylingModule,
  calculatedColumnsModule,
  cellFlashingModule,
  editingModule,
  entitlementsModule,
  sortFilterModule,
  namedQueriesModule,
  undoRedoModule,
  dataManagementModule,
  exportClipboardModule,
  performanceModule,
  expressionEditorModule,
  toolbarVisibilityModule,
  savedFiltersModule,
];

/** Lightweight default set for quick start */
export const defaultModules = [
  generalSettingsModule,
  columnCustomizationModule,
  conditionalStylingModule,
  profilesModule,
  toolbarVisibilityModule,
  savedFiltersModule,
];
