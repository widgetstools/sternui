// Public API for @grid-customizer/core-v2.
//
// Implementation modules live under src/{core,store,persistence,profiles}.
// Day 1 ships only the core orchestrator + types; later days add the store,
// persistence adapters, and profile manager.

export { GridCore } from './core/GridCore';
export type { GridCoreOptions } from './core/GridCore';
export { EventBus } from './core/EventBus';
export { topoSortModules } from './core/topoSort';

export type {
  AnyColDef,
  AnyModule,
  EventBusInstance,
  EventMap,
  GridContext,
  Module,
  ModuleContext,
  SerializedState,
  SettingsPanelProps,
} from './core/types';

// Store layer
export { createGridStore } from './store/createGridStore';
export type { CreateGridStoreOptions, GridStore } from './store/createGridStore';
export { useModuleState } from './store/useModuleState';
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

// Profile manager
export { useProfileManager } from './profiles/useProfileManager';
export type {
  ProfileMeta,
  UseProfileManagerOptions,
  UseProfileManagerResult,
} from './profiles/useProfileManager';

// Built-in modules
export { generalSettingsModule, INITIAL_GENERAL_SETTINGS } from './modules/general-settings';
export type { GeneralSettingsState } from './modules/general-settings';
export { columnCustomizationModule, INITIAL_COLUMN_CUSTOMIZATION } from './modules/column-customization';
export type { ColumnAssignment, ColumnCustomizationState } from './modules/column-customization';
export { conditionalStylingModule, INITIAL_CONDITIONAL_STYLING } from './modules/conditional-styling';
export type {
  CellStyleProperties,
  ConditionalRule,
  ConditionalStylingState,
  RuleScope,
  ThemeAwareStyle,
} from './modules/conditional-styling';
export { savedFiltersModule, INITIAL_SAVED_FILTERS } from './modules/saved-filters';
export type { SavedFiltersState } from './modules/saved-filters';
export { toolbarVisibilityModule, INITIAL_TOOLBAR_VISIBILITY } from './modules/toolbar-visibility';
export type { ToolbarVisibilityState } from './modules/toolbar-visibility';
