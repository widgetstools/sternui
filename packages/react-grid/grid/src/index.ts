/**
 * @starui/grid — merged MarketsGrid widget + grid customizer.
 *
 *   widget/      MarketsGrid product surface (was @starui/markets-grid)
 *   customizer/  Module pipeline UI, hooks, editors (was @starui/grid-react)
 *   runtime/     Host-runtime helpers (OpenFin popout — not in engine)
 */

export { MarketsGrid, MarketsGridCore, DEFAULT_MODULES, MINIMAL_MODULES } from './widget/MarketsGrid.js';
export { useGridTheme } from './widget/theme/index.js';
export { FiltersToolbar, type FiltersToolbarProps } from './widget/FiltersToolbar.js';
export { FormattingToolbar } from './widget/FormattingToolbar.js';
export { DraggableFloat } from './widget/DraggableFloat.js';
export { SettingsSheet, type SettingsSheetProps } from './widget/SettingsSheet.js';
export { ProfileSelector, type ProfileSelectorProps } from './widget/ProfileSelector.js';
export { HelpPanel } from './widget/HelpPanel.js';
export {
  createMarketsGridLocalStorageStorage,
  isMarketsGridLocalStorageStorageFactory,
} from './widget/createMarketsGridLocalStorageStorage.js';
export type {
  MarketsGridProps,
  SavedFilter,
  AdminAction,
  MarketsGridHandle,
  StorageAdapterFactory,
  StorageAdapterFactoryOpts,
  MarketsGridLocalStorageConfig,
  ProviderGridHostApi,
  ProviderGridHostMode,
  GridEventBindingsHostApi,
} from './widget/types.js';

export {
  MARKETS_GRID_EVENT_CATALOG,
  isMarketsGridEventId,
  marketsGridEventCatalogByCategory,
  type MarketsGridEventId,
  type MarketsGridEventCatalogEntry,
} from './events/marketsGridEventCatalog.js';
export type {
  MarketsGridEventContext,
  MarketsGridEventHandler,
  MarketsGridEventHandlerRegistry,
  MarketsGridHandlerMeta,
  ProviderStatusEventPayload,
  ProviderSwitchedEventPayload,
  ProviderDataStaleEventPayload,
  ToolbarDateChangedEventPayload,
} from './events/marketsGridEventHandlers.js';
export {
  createMarketsGridContainerEventBus,
  type MarketsGridContainerEventBus,
  type MarketsGridContainerEventMap,
} from './events/containerEventBus.js';
export { useMarketsGridEventBridge } from './events/useMarketsGridEventBridge.js';

export { isOpenFin, openFinWindowOpener } from './runtime/openFin.js';
