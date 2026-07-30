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
// The public SettingsSheet is the lazy wrapper — same props + ref
// contract as the inner sheet, but a static value import of
// `./widget/SettingsSheet.js` here would pull the whole sheet into the
// main chunk and defeat its code-splitting (Vite warned about exactly
// that). Type re-exports are erased at build, so they stay direct.
export {
  LazySettingsSheet as SettingsSheet,
  preloadSettingsSheet,
} from './widget/LazySettingsSheet.js';
export type { SettingsSheetProps } from './widget/SettingsSheet.js';
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

export { useGeneralSettingsSnapshot } from './widget/useGeneralSettingsSnapshot.js';
export {
  PerspectiveMarketsGridSurface,
  type PerspectiveMarketsGridSurfaceProps,
  type PerspectiveMarketsGridSurfaceHandle,
} from './engine/PerspectiveMarketsGridSurface.js';
export {
  resolveUseSsrm,
  resolvePerspective,
  resolveGridSurface,
  type MarketsGridRowModel,
  type GridSurfaceChoice,
} from './engine/resolveUseSsrm.js';
/**
 * Re-exported so a host wires the pull path with the one grid dep it already
 * has, instead of taking a second one on `@starui/perspective-grid`.
 */
export {
  usePerspectiveTable,
  type UsePerspectiveTableOpts,
  type UsePerspectiveTableResult,
  type PerspectiveAttachClientLike,
  type PerspectiveTableStatus,
} from '@starui/perspective-grid';
export { shouldSuggestSsrm } from './engine/shouldSuggestSsrm.js';
export { CURRENT_SSRM_PHASE, isSsrmCapabilityEnabled } from './engine/ssrmCapabilities.js';
