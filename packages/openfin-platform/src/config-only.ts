/**
 * Side-effect-free config entry point for @marketsui/openfin-platform.
 *
 * Why this file exists:
 *   @openfin/workspace-platform performs module-top-level work that
 *   reads properties off the global `fin` object. In plain browser
 *   contexts (Vite dev server on localhost, standalone test harnesses,
 *   SSR), `fin` is undefined and the import throws
 *   `Cannot read properties of undefined (reading 'uuid')` before any
 *   user code runs.
 *
 *   The main package barrel (`./index`) re-exports from `workspace.ts`
 *   and `dock.ts`, which top-level-import workspace-platform. Tree-
 *   shaking can eliminate unused named exports at build time, but
 *   Vite's dev server evaluates the full module graph — so anyone who
 *   does `import { setConfigManager } from '@marketsui/openfin-platform'`
 *   in a non-OpenFin dev environment triggers the crash.
 *
 *   This file re-exports ONLY the items that don't drag in workspace-
 *   platform: the ConfigManager singleton accessor, the host-env
 *   reader, the registry schema utilities. Consumers whose code runs
 *   outside OpenFin (the Config Browser mounted in a plain browser,
 *   the demo apps) import from `@marketsui/openfin-platform/config`
 *   instead of the main barrel.
 *
 *   The main `./index` barrel continues to re-export these same
 *   symbols for backward compat with OpenFin-hosted consumers.
 */

// ── ConfigManager singleton (delegates to ./db) ─────────────────────
export {
  getConfigManager,
  setConfigManager,
  saveDockConfig,
  loadDockConfig,
  clearDockConfig,
  saveRegistryConfig,
  loadRegistryConfig,
  clearRegistryConfig,
} from './db';

// ── IAB topic + action-ID constants (pure strings, no runtime deps) ──
export {
  IAB_DOCK_CONFIG_UPDATE,
  IAB_RELOAD_AFTER_IMPORT,
  IAB_THEME_CHANGED,
  IAB_REGISTRY_CONFIG_UPDATE,
  ACTION_LAUNCH_APP,
  ACTION_TOGGLE_THEME,
  ACTION_OPEN_DOCK_EDITOR,
  ACTION_RELOAD_DOCK,
  ACTION_SHOW_DEVTOOLS,
  ACTION_EXPORT_CONFIG,
  ACTION_IMPORT_CONFIG,
  ACTION_TOGGLE_PROVIDER,
  ACTION_OPEN_REGISTRY_EDITOR,
  ACTION_OPEN_CONFIG_BROWSER,
} from './iab-topics';

// ── Dock config types (pure TS shapes; serializable) ────────────────
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

// ── Host-env reader + registry schema utilities ─────────────────────
// (all pure TS, no workspace-platform transitively)
export {
  readHostEnv,
  isHostEnvMissing,
  encodeHostEnvForQueryString,
} from './registry-host-env';
export {
  generateTemplateConfigId,
  deriveSingletonConfigId,
  REGISTRY_CONFIG_VERSION,
  type RegistryEditorConfig,
  type RegistryEntry,
} from './registry-config-types';
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
