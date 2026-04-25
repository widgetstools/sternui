// ─── Workspace initialization ────────────────────────────────────────
export { initWorkspace } from './workspace';
export { launchApp, launchRegisteredComponent } from './launch';
export type { LaunchRegisteredComponentOptions } from './launch';

// ─── Dock management ─────────────────────────────────────────────────
export {
  updateDockButtons,
  getDefaultEditorConfig,
  recolorDockIcons,
  shutdownDock,
  // IAB topic names — exported so packages that publish/subscribe
  // to these topics use the same string constant, not separate literals.
  IAB_DOCK_CONFIG_UPDATE,
  IAB_RELOAD_AFTER_IMPORT,
  IAB_THEME_CHANGED,
  IAB_REGISTRY_CONFIG_UPDATE,
  ACTION_OPEN_REGISTRY_EDITOR,
  ACTION_OPEN_CONFIG_BROWSER,
  ACTION_LAUNCH_COMPONENT,
} from './dock';

// ─── Persistence (config service) ────────────────────────────────────
export { saveDockConfig, loadDockConfig, clearDockConfig } from './db';
export { saveRegistryConfig, loadRegistryConfig, clearRegistryConfig } from './db';
export {
  getConfigManager,
  setConfigManager,
  setPlatformDefaultScope,
  migrateLegacyPlatformScope,
  realignAllConfigsToPlatformScope,
} from './db';
export type { ConfigScope } from './db';

// ─── Registry config types ──────────────────────────────────────────
export {
  generateTemplateConfigId,
  deriveSingletonConfigId,
  REGISTRY_CONFIG_VERSION,
  type RegistryEditorConfig,
  type RegistryEntry,
} from './registry-config-types';

// ─── Registry v2 validators, migrator, host env reader ──────────────
export {
  validateEntry,
  validateSingletonUniqueness,
  type ValidationError,
} from './registry-validate';

export {
  migrateRegistryToV2,
  type RegistryEntryV1,
  type RegistryEditorConfigV1,
  type HostEnv,
} from './registry-migrate';

export {
  readHostEnv,
  isHostEnvMissing,
} from './registry-host-env';

// Re-export config service types for convenience
export { createConfigManager, type ConfigManager } from "@marketsui/config-service";
export type {
  AppConfigRow,
  AppRegistryRow,
  UserProfileRow,
  RoleRow,
} from "@marketsui/config-service";

// ─── Dock config types + converter ───────────────────────────────────
export {
  toDock3Favorites,
  toDock3UserContentMenu,
  appsToEditorConfig,
  type DockEditorConfig,
  type DockButtonConfig,
  type DockActionButtonConfig,
  type DockDropdownButtonConfig,
  type DockMenuItemConfig,
  type Dock3Entry,
  type Dock3ItemEntry,
  type Dock3FolderEntry,
  type DockEntryIcon,
  type ContentMenuEntryType,
  type ContentMenuItemEntry,
  type ContentMenuFolderEntry,
} from './dock-config-types';

// ─── Icon library ────────────────────────────────────────────────────
export {
  MARKET_ICON_SVGS,
  svgToDataUrl,
  marketIconToDataUrl,
} from './icons/index';

export {
  ICON_META,
  ICON_NAMES,
  ICON_CATEGORIES,
  ICON_CATEGORY_NAMES,
  getIconsByCategory,
  type MarketIconName,
  type IconCategory,
  type IconMeta,
} from './icons/index';

// ─── Types ───────────────────────────────────────────────────────────
export type {
  WorkspaceConfig,
  PlatformSettings,
  CustomSettings,
  UserRole,
} from './types';
