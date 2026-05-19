/**
 * @starui/grid — merged MarketsGrid widget + grid customizer.
 *
 *   widget/      MarketsGrid product surface (was @starui/markets-grid)
 *   customizer/  Module pipeline UI, hooks, editors (was @starui/grid-react)
 *   runtime/     Host-runtime helpers (OpenFin popout — not in engine)
 */

export { MarketsGrid, DEFAULT_MODULES } from './widget/MarketsGrid.js';
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
} from './widget/types.js';

export { isOpenFin, openFinWindowOpener } from './runtime/openFin.js';
