/// <reference path="./types/openfin.d.ts" />

/**
 * @marketsui/openfin-platform-stern
 * OpenFin platform integration with PlatformAdapter, dock, IAB, and workspace services.
 */

// ─── Adapters (NEW) ─────────────────────────────
export { OpenFinAdapter } from './adapters/OpenFinAdapter.js';
export type { OpenFinAdapterOptions } from './adapters/OpenFinAdapter.js';

// ─── Core interfaces and context ────────────────
export type { ILogger, IConfigService, IViewManager, ViewInstance, CreateViewOptions, OpenFinPlatformOptions } from './core/interfaces.js';
export { ConsoleLogger } from './core/interfaces.js';
export { platformContext } from './core/PlatformContext.js';

// ─── Types ──────────────────────────────────────
export type {
  DockMenuItem,
  DockButton,
  DockButtonOption,
  DockConfigFilter,
} from './types/dockConfig.js';
export {
  DEFAULT_WINDOW_OPTIONS,
  DEFAULT_VIEW_OPTIONS,
  createMenuItem,
} from './types/dockConfig.js';

export * from './types/openfin.js';
export * from './types/openfinEvents.js';

// ─── Services ───────────────────────────────────
export { iabService, iabBroadcast, iabSubscribe } from './services/OpenfinIABService.js';
export type { IABMessage, IABMessageHandler } from './services/OpenfinIABService.js';
export { clearOpenFinCache, clearCacheAndReload } from './services/cache.js';

// ─── Utils ──────────────────────────────────────
export {
  isOpenFin,
  createWindow,
  launchApp,
  broadcastMessage,
  subscribeToMessage,
  getCurrentWindow,
  setTheme,
} from './utils/openfinUtils.js';
export {
  buildUrl,
  setBaseUrl,
  clearBaseUrl,
  getCurrentBaseUrl,
  getBaseUrlConfig,
  initializeBaseUrlFromManifest,
} from './utils/urlHelper.js';

// ─── Platform ───────────────────────────────────
export { THEME_PALETTES, DEFAULT_THEME_MODE, THEME_MODES } from './platform/openfinThemePalettes.js';
export type { ThemeMode } from './platform/openfinThemePalettes.js';
export {
  registerConfigLookupCallback,
  clearConfigLookupCallback,
  launchMenuItem,
  launchMenuItems,
  isComponentOpen,
  focusComponent,
  launchOrFocusComponent,
} from './platform/menuLauncher.js';
export type { ConfigLookupResult, ConfigLookupCallback } from './platform/menuLauncher.js';

// ─── Dock Utils ─────────────────────────────────
export {
  findMenuItem,
  updateMenuItem,
  deleteMenuItem,
  addMenuItem,
  duplicateMenuItem,
  moveMenuItem,
  countItems,
  getAllItemIds,
} from './utils/treeUtils.js';
export { getDefaultMenuIcon } from './utils/defaultIcons.js';

// ─── Bootstrap ──────────────────────────────────
export {
  bootstrapPlatform,
  AppContext,
  resolveInstanceId,
} from './bootstrap.js';
export type {
  AppConfig,
  DockActions,
  BootstrapPlatformOptions,
  RegistrationEntry,
} from './bootstrap.js';

