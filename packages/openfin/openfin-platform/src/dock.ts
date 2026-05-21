/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;
import { Dock, ColorSchemeOptionType, getCurrentSync } from "@openfin/workspace-platform";
import type { App } from "@openfin/workspace";
import { loadDockConfig, saveDockConfig } from './db';
import {
  appsToEditorConfig,
  toDock3Favorites,
  toDock3UserContentMenu,
  type DockEditorConfig,
  type Dock3Entry,
  type ContentMenuEntryType,
  type DockEntryIcon,
} from './dockConfigTypes';
import {
  SETTINGS_SVG,
  REFRESH_SVG,
  CODE_SVG,
  DOWNLOAD_SVG,
  UPLOAD_SVG,
  SUN_SVG,
  MOON_SVG,
  EYE_SVG,
  TOOLS_SVG,
  svgToDataUrl,
  marketIconToDataUrl,
} from "./icons/allIcons.js";
import type { DockType, PlatformSettings } from './types';
import {
  buildFullLegacyDockButtons,
  getLegacyDockRegistration,
  isLegacyDockActive,
  registerLegacyDockProvider,
  showLegacyDock,
  shutdownLegacyDockProvider,
} from './dockLegacy';
import {
  applyTheme,
  getTheme,
  isStarUIPaletteName,
  STARUI_PALETTE_NAMES,
  type StarUIPaletteName,
} from '@starui/design-system';
import {
  dockMenuIconStrokeColors,
  persistDockPaletteSelection,
  readDockPalette,
} from './staruiOpenFinPalette';

/** Lucide-style palette icon for the content-menu folder. */
const PALETTE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/></svg>';

// ─── IAB topics + action IDs ────────────────────────────────────────
// Lifted into ./iabTopics.ts so non-OpenFin consumers (Config Browser
// rendered in a plain browser, dock-editor's import panel, etc.) can
// import just the strings without pulling @openfin/workspace-platform
// through this file. Re-exported here for back-compat.
import {
  IAB_DOCK_CONFIG_UPDATE,
  IAB_DOCK_CONFIG_RESET,
  IAB_RELOAD_AFTER_IMPORT,
  IAB_THEME_CHANGED,
  IAB_PALETTE_CHANGED,
  IAB_REGISTRY_CONFIG_UPDATE,
  ACTION_LAUNCH_APP,
  ACTION_TOGGLE_THEME,
  ACTION_SET_PALETTE,
  ACTION_OPEN_DOCK_EDITOR,
  ACTION_RELOAD_DOCK,
  ACTION_SHOW_DEVTOOLS,
  ACTION_INSPECT_SHARED_WORKER,
  ACTION_EXPORT_CONFIG,
  ACTION_IMPORT_CONFIG,
  ACTION_TOGGLE_PROVIDER,
  ACTION_OPEN_REGISTRY_EDITOR,
  ACTION_OPEN_CONFIG_BROWSER,
  ACTION_OPEN_WORKSPACE_SETUP,
  ACTION_OPEN_DATA_PROVIDERS,
  ACTION_LAUNCH_COMPONENT,
} from './iabTopics';
export {
  IAB_DOCK_CONFIG_UPDATE,
  IAB_DOCK_CONFIG_RESET,
  IAB_RELOAD_AFTER_IMPORT,
  IAB_THEME_CHANGED,
  IAB_PALETTE_CHANGED,
  IAB_REGISTRY_CONFIG_UPDATE,
  ACTION_LAUNCH_APP,
  ACTION_TOGGLE_THEME,
  ACTION_SET_PALETTE,
  ACTION_OPEN_DOCK_EDITOR,
  ACTION_RELOAD_DOCK,
  ACTION_SHOW_DEVTOOLS,
  ACTION_INSPECT_SHARED_WORKER,
  ACTION_EXPORT_CONFIG,
  ACTION_IMPORT_CONFIG,
  ACTION_TOGGLE_PROVIDER,
  ACTION_OPEN_REGISTRY_EDITOR,
  ACTION_OPEN_CONFIG_BROWSER,
  ACTION_OPEN_WORKSPACE_SETUP,
  ACTION_OPEN_DATA_PROVIDERS,
  ACTION_LAUNCH_COMPONENT,
};

// ─── Module-level state ──────────────────────────────────────────────

/** Active dock implementation selected at register time. */
let activeDockType: DockType = "dock3";

/** The Dock3 provider instance returned by Dock.init(). */
let dockProvider: any;

/** Cached copy of platform settings from the manifest. */
let storedPlatformSettings: PlatformSettings | undefined;

/** The dock provider icon URL. */
let storedIcon: string | undefined;

/** Last user-configured DockEditorConfig (for re-applying on theme change). */
let lastEditorConfig: DockEditorConfig | undefined;

/** Tracks whether IAB subscriptions have been set up. */
let iabSubscribed = false;

/** Stored IAB subscription handlers for cleanup. */
let iabConfigHandler: ((config: any) => void) | null = null;
let iabReloadHandler: (() => void) | null = null;
let iabResetHandler: (() => void) | null = null;

/** Receive dock-editor / workspace-setup IAB from any child window. */
const IAB_SUBSCRIBE_ANY = { uuid: "*" };

/** Theme toggle icons. */
let themeToggleDarkIcon: string | undefined;
let themeToggleLightIcon: string | undefined;

/** Callback for dispatching actions to workspace.ts handlers. */
let actionDispatcher: ((actionId: string, customData?: any) => Promise<void>) | undefined;

// ─── Pre-built theme toggle icons ────────────────────────────────────
const DEFAULT_DARK_THEME_ICON = svgToDataUrl(SUN_SVG, "#FFB300");
const DEFAULT_LIGHT_THEME_ICON = svgToDataUrl(MOON_SVG, "#000000");

// ─── Icon helpers ────────────────────────────────────────────────────

/**
 * Generate an icon URL from an iconId string (e.g. "mkt:bond" or "lucide:home").
 */
function generateIconFromId(iconId: string, color: string): string {
  const [prefix, name] = iconId.split(":");
  if (prefix === "mkt" && name) {
    return marketIconToDataUrl(name, color);
  }
  // Iconify CDN URL
  return `https://api.iconify.design/${prefix}/${name}.svg?color=${encodeURIComponent(color)}`;
}

/**
 * Recolor an Iconify CDN URL's color parameter.
 * Non-Iconify URLs are returned unchanged.
 */
function recolorIconifyUrl(iconUrl: string, color: string): string {
  if (!iconUrl || !iconUrl.includes("api.iconify.design/")) {
    return iconUrl;
  }
  try {
    const url = new URL(iconUrl);
    url.searchParams.set("color", color);
    return url.toString();
  } catch {
    return iconUrl;
  }
}

// ─── v22 icon coercion ──────────────────────────────────────────────
//
// Dock3 in @openfin/workspace v22 types `DockEntry.icon` and
// `ContentMenuEntry.icon` as plain `string` (only the top-level
// `Dock.config.icon` accepts `string | TaskbarIcon`). v24 was lenient
// about per-item `{ dark, light }` objects, but v22's `CustomIcon`
// invokes `n.startsWith(...)` directly on the value and crashes the
// workspace browser UI when handed a non-string.
//
// We keep `{ dark, light }` internally — every editor + theme-toggle
// path produces it — and flatten to a single string at the OpenFin
// boundary, picking the variant for the live theme. `applyDock3Config`
// re-runs this flatten on every theme toggle so the dock keeps the
// correct icon variant after the user flips themes.

function readDockTheme(): "dark" | "light" {
  const theme = getTheme().theme;
  try {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.dataset["agThemeMode"] = theme;
  } catch { /* non-browser */ }
  return theme;
}

function paletteMenuLabel(name: StarUIPaletteName, active: boolean): string {
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  return active ? `✓ ${label}` : label;
}

/**
 * StarUI palette picker — checkmark on the active palette; choosing
 * an item publishes `palette-changed` to every OpenFin window (same
 * fan-out model as `theme-changed`).
 */
function buildPaletteContentMenuFolder(): ContentMenuEntryType {
  const active = readDockPalette();
  return {
    type: "folder",
    id: "palette-menu",
    label: "Color palette",
    icon: contentMenuIcon(PALETTE_SVG),
    children: STARUI_PALETTE_NAMES.map((name) => ({
      type: "item" as const,
      id: `palette-${name}`,
      label: paletteMenuLabel(name, active === name),
      icon: contentMenuIcon(PALETTE_SVG),
      itemData: { actionId: ACTION_SET_PALETTE, palette: name },
    })),
  };
}

function pickIconVariant(
  icon: string | { dark: string; light: string } | undefined,
  theme: "dark" | "light",
): string | undefined {
  if (icon == null) return undefined;
  if (typeof icon === "string") return icon;
  if (typeof icon === "object" && typeof icon[theme] === "string") return icon[theme];
  return undefined;
}

function flattenFavoritesForV22(entries: Dock3Entry[], theme: "dark" | "light"): any[] {
  return entries.map((entry) => {
    if (entry.type === "folder") {
      // v22 DockEntry folder shape does not carry an icon — strip it.
      return {
        type: "folder" as const,
        id: entry.id,
        label: entry.label,
        children: flattenFavoritesForV22(entry.children, theme),
      };
    }
    return {
      type: "item" as const,
      id: entry.id,
      label: entry.label,
      icon: pickIconVariant(entry.icon, theme) ?? "",
      itemData: entry.itemData,
    };
  });
}

function flattenContentMenuForV22(
  entries: ContentMenuEntryType[],
  theme: "dark" | "light",
): any[] {
  return entries.map((entry) => {
    if (entry.type === "folder") {
      const icon = pickIconVariant(entry.icon, theme);
      return {
        type: "folder" as const,
        id: entry.id,
        label: entry.label,
        children: flattenContentMenuForV22(entry.children, theme),
        // OpenFin's published ContentMenuEntry folder type omits `icon`, but
        // we pass it for forward-compat and inject companion CSS (see below).
        ...(icon ? { icon } : {}),
      };
    }
    return {
      type: "item" as const,
      id: entry.id,
      label: entry.label,
      icon: pickIconVariant(entry.icon, theme) ?? "",
      itemData: entry.itemData,
      ...(entry.bookmarked != null ? { bookmarked: entry.bookmarked } : {}),
    };
  });
}

// ─── Content menu builder (Tools) ────────────────────────────────────

/**
 * Create a theme-aware icon for the content menu.
 *
 * Dock3 ContentMenuEntry.icon supports { dark, light } — the platform
 * automatically picks the correct variant based on the active theme.
 * Stroke color is fixed (slate); not tied to the dock palette picker.
 */
function contentMenuIcon(svgString: string): { dark: string; light: string } {
  const { dark, light } = dockMenuIconStrokeColors();
  return {
    dark: svgToDataUrl(svgString, dark),
    light: svgToDataUrl(svgString, light),
  };
}

/**
 * Build system tool entries for the content menu.
 * Each icon uses { dark, light } so it's visible in both themes.
 */
function buildSystemContentMenuEntries(): ContentMenuEntryType[] {
  return [
    {
      type: "item",
      id: "tool-workspace-setup",
      label: "Workspace Setup (new)",
      icon: contentMenuIcon(SETTINGS_SVG),
      itemData: { actionId: ACTION_OPEN_WORKSPACE_SETUP },
    },
    {
      type: "item",
      id: "tool-data-providers",
      label: "Data Providers",
      icon: contentMenuIcon(SETTINGS_SVG),
      itemData: { actionId: ACTION_OPEN_DATA_PROVIDERS },
    },
    {
      type: "item",
      id: "tool-config-browser",
      label: "Config Browser",
      icon: contentMenuIcon(SETTINGS_SVG),
      itemData: { actionId: ACTION_OPEN_CONFIG_BROWSER },
    },
    {
      type: "item",
      id: "tool-reload-dock",
      label: "Reload Dock",
      icon: contentMenuIcon(REFRESH_SVG),
      itemData: { actionId: ACTION_RELOAD_DOCK },
    },
    {
      type: "item",
      id: "tool-devtools",
      label: "Developer Tools",
      icon: contentMenuIcon(CODE_SVG),
      itemData: { actionId: ACTION_SHOW_DEVTOOLS },
    },
    {
      type: "item",
      id: "tool-inspect-shared-worker",
      label: "Inspect Shared Worker",
      icon: contentMenuIcon(CODE_SVG),
      itemData: { actionId: ACTION_INSPECT_SHARED_WORKER },
    },
    {
      type: "item",
      id: "tool-export-config",
      label: "Export Config",
      icon: contentMenuIcon(DOWNLOAD_SVG),
      itemData: { actionId: ACTION_EXPORT_CONFIG },
    },
    {
      type: "item",
      id: "tool-import-config",
      label: "Import Config",
      icon: contentMenuIcon(UPLOAD_SVG),
      itemData: { actionId: ACTION_IMPORT_CONFIG },
    },
    {
      type: "item",
      id: "tool-toggle-provider",
      label: "Show/Hide Provider",
      icon: contentMenuIcon(EYE_SVG),
      itemData: { actionId: ACTION_TOGGLE_PROVIDER },
    },
  ];
}

/**
 * Build the full content menu: user-configured dropdown buttons (as folders
 * with nested children) + system tools folder.
 *
 * Dock3 ContentMenuEntry supports `type: "folder"` with `children[]`, which
 * renders as expandable sub-menus — exactly matching the dock editor's
 * DropdownButton → options hierarchy.
 */
function buildContentMenuEntries(editorConfig?: DockEditorConfig): ContentMenuEntryType[] {
  // User-configured dropdown buttons → content menu folders with children
  const iconColors = dockMenuIconStrokeColors();
  const userMenus = editorConfig
    ? toDock3UserContentMenu(
        editorConfig,
        generateIconFromId,
        recolorIconifyUrl,
        iconColors.dark,
        iconColors.light,
      )
    : [];

  const paletteFolder = buildPaletteContentMenuFolder();

  // System tools folder
  const toolsFolder: ContentMenuEntryType = {
    type: "folder",
    id: "system-tools",
    label: "Tools",
    icon: contentMenuIcon(TOOLS_SVG),
    children: buildSystemContentMenuEntries(),
  };

  return [...userMenus, paletteFolder, toolsFolder];
}

// ─── Build favorites from editor config ──────────────────────────────

/**
 * Convert the saved DockEditorConfig to Dock3 favorites, including
 * system entries (theme toggle).
 */
function buildAllFavorites(editorConfig?: DockEditorConfig): Dock3Entry[] {
  // User-configured favorites
  const iconColors = dockMenuIconStrokeColors();
  const userFavorites = editorConfig
    ? toDock3Favorites(
        editorConfig,
        generateIconFromId,
        recolorIconifyUrl,
        iconColors.dark,
        iconColors.light,
      )
    : [];

  // Theme toggle — always last in favorites
  const themeToggle: Dock3Entry = {
    type: "item",
    id: "theme-toggle",
    label: "Toggle Theme",
    icon: {
      dark: themeToggleDarkIcon ?? DEFAULT_DARK_THEME_ICON,
      light: themeToggleLightIcon ?? DEFAULT_LIGHT_THEME_ICON,
    },
    itemData: { actionId: ACTION_TOGGLE_THEME },
  };

  return [...userFavorites, themeToggle];
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Register the OpenFin Dock3 provider.
 *
 * Uses Dock.init() from @openfin/workspace-platform with a custom
 * override class that hooks into loadConfig/saveConfig for IndexedDB
 * persistence.
 *
 * @param onAction Callback to dispatch action IDs to workspace.ts handlers
 */
/**
 * Refresh dock UI after palette/theme changes (both implementations).
 */
export async function refreshDockAppearance(): Promise<void> {
  if (activeDockType === "legacy") {
    await applyLegacyDockConfig();
  } else {
    await applyDock3Config();
  }
}

export async function registerDock(
  platformSettings: PlatformSettings,
  apps?: App[],
  dockIcon?: string,
  darkIcon?: string,
  lightIcon?: string,
  _roles?: string[],
  onAction?: (actionId: string, customData?: any) => Promise<void>,
  dockType: DockType = "dock3",
): Promise<any> {
  activeDockType = dockType;

  if (dockType === "legacy") {
    return registerLegacyDock(
      platformSettings,
      apps,
      dockIcon,
      darkIcon,
      lightIcon,
      onAction,
    );
  }

  // Idempotency guard. The OpenFin v22 starter creates exactly one
  // Dock3Provider per platform window; calling Dock.init() again
  // produces a second provider that competes with the first for the
  // dock window's IAB channel — manifesting as
  // "client is disconnected from the target provider" on click.
  // If we've already initialized, refresh the captured callbacks/settings
  // and push the live config through the existing handle instead.
  if (dockProvider) {
    console.log("Dock3 provider already initialized — refreshing config in place.");
    storedPlatformSettings = platformSettings;
    storedIcon = dockIcon ?? platformSettings.icon;
    themeToggleDarkIcon = darkIcon ?? DEFAULT_DARK_THEME_ICON;
    themeToggleLightIcon = lightIcon ?? DEFAULT_LIGHT_THEME_ICON;
    actionDispatcher = onAction;
    if (!lastEditorConfig) {
      const saved = await loadDockConfig();
      lastEditorConfig = saved ?? appsToEditorConfig(apps ?? [], platformSettings.icon);
    }
    await applyDock3Config();
    return dockProvider;
  }

  console.log("Initializing the Dock3 provider.");

  // Cache settings before init() so the override class methods can
  // read them on first invocation. resetDockState() is intentionally
  // NOT called here — there's no prior provider to clear (the guard
  // above handles the "already initialized" branch). Calling it would
  // zombie a still-bound provider in edge cases (concurrent re-entry).
  storedPlatformSettings = platformSettings;
  storedIcon = dockIcon ?? platformSettings.icon;
  themeToggleDarkIcon = darkIcon ?? DEFAULT_DARK_THEME_ICON;
  themeToggleLightIcon = lightIcon ?? DEFAULT_LIGHT_THEME_ICON;
  actionDispatcher = onAction;

  // Load saved config or build default from apps
  const savedConfig = await loadDockConfig();
  if (savedConfig) {
    console.log("Loaded dock config from IndexedDB.");
    lastEditorConfig = savedConfig;
  } else {
    lastEditorConfig = appsToEditorConfig(apps ?? [], platformSettings.icon);
  }

  // Build the initial Dock3 config
  const theme = readDockTheme();
  const favorites = flattenFavoritesForV22(buildAllFavorites(lastEditorConfig), theme);
  const menuEntries = buildContentMenuEntries(lastEditorConfig);
  const contentMenu = flattenContentMenuForV22(menuEntries, theme);

  try {
    dockProvider = await Dock.init({
      config: {
        title: platformSettings.title,
        icon: storedIcon,
        favorites: favorites as any[],
        contentMenu: contentMenu as any[],
        defaultDockButtons: ["notifications", "switchWorkspace", "contentMenu"],
        uiConfig: {
          hideDragHandle: true,
        },
      },
      override: buildDock3Override(),
    });

    await injectContentMenuFolderIcons(menuEntries, theme);
    console.log("Dock3 provider initialized.");

    await setupDockIabSubscriptions();

    return dockProvider;
  } catch (error) {
    console.error("Failed to initialize the Dock3 provider.", error);
    return undefined;
  }
}

/**
 * Recolor all dock icons to match the current theme.
 * Called from the toggle-theme action in workspace.ts.
 *
 * Soft path only: re-flattens icons for the current theme and pushes
 * via `dockProvider.updateConfig()`. State-preserving — open menus,
 * highlighted items, drag positions all survive the toggle. The dock
 * chrome theme propagation is handled by the workspace platform's
 * own scheme dispatch when running on a properly-configured runtime.
 */
export async function recolorDockIcons(isDark: boolean): Promise<void> {
  console.log(`Recoloring dock icons for ${isDark ? "dark" : "light"} theme.`);
  await refreshDockAppearance();
}

// ─── Legacy dock (Dock.register) ─────────────────────────────────────

async function registerLegacyDock(
  platformSettings: PlatformSettings,
  apps?: App[],
  dockIcon?: string,
  darkIcon?: string,
  lightIcon?: string,
  onAction?: (actionId: string, customData?: any) => Promise<void>,
): Promise<any> {
  if (isLegacyDockActive()) {
    console.log("Legacy dock already initialized — refreshing config in place.");
    storedPlatformSettings = platformSettings;
    storedIcon = dockIcon ?? platformSettings.icon;
    themeToggleDarkIcon = darkIcon ?? DEFAULT_DARK_THEME_ICON;
    themeToggleLightIcon = lightIcon ?? DEFAULT_LIGHT_THEME_ICON;
    actionDispatcher = onAction;
    if (!lastEditorConfig) {
      const saved = await loadDockConfig();
      lastEditorConfig = saved ?? appsToEditorConfig(apps ?? [], platformSettings.icon);
    }
    await applyLegacyDockConfig();
    return getLegacyDockRegistration();
  }

  console.log("Initializing legacy dock provider.");
  storedPlatformSettings = platformSettings;
  storedIcon = dockIcon ?? platformSettings.icon;
  themeToggleDarkIcon = darkIcon ?? DEFAULT_DARK_THEME_ICON;
  themeToggleLightIcon = lightIcon ?? DEFAULT_LIGHT_THEME_ICON;
  actionDispatcher = onAction;

  const savedConfig = await loadDockConfig();
  lastEditorConfig = savedConfig ?? appsToEditorConfig(apps ?? [], platformSettings.icon);

  await setupDockIabSubscriptions();
  await applyLegacyDockConfig();
  return getLegacyDockRegistration();
}

async function applyLegacyDockConfig(): Promise<void> {
  if (!storedPlatformSettings || !storedIcon) {
    console.error("Cannot update legacy dock: not initialized yet.");
    return;
  }

  const theme = readDockTheme();
  const themeToggleIcon =
    theme === "dark"
      ? (themeToggleDarkIcon ?? DEFAULT_DARK_THEME_ICON)
      : (themeToggleLightIcon ?? DEFAULT_LIGHT_THEME_ICON);

  const buttons = buildFullLegacyDockButtons(
    lastEditorConfig,
    theme,
    themeToggleIcon,
    generateIconFromId,
    recolorIconifyUrl,
  );

  await registerLegacyDockProvider({
    id: storedPlatformSettings.id,
    title: storedPlatformSettings.title,
    icon: storedIcon,
    buttons,
  });
  await showLegacyDock();
}

async function setupDockIabSubscriptions(): Promise<void> {
  if (iabSubscribed) return;
  iabSubscribed = true;

  try {
    iabConfigHandler = async (config: DockEditorConfig) => {
      console.log("Received dock config update via IAB.");
      await saveDockConfig(config);
      lastEditorConfig = config;
      await refreshDockAppearance();
    };
    await fin.InterApplicationBus.subscribe(
      IAB_SUBSCRIBE_ANY,
      IAB_DOCK_CONFIG_UPDATE,
      iabConfigHandler,
    );
  } catch (iabError) {
    console.error("Could not subscribe to dock-config-update IAB topic.", iabError);
  }

  try {
    iabResetHandler = async () => {
      console.log("Dock config reset via IAB.");
      const saved = await loadDockConfig();
      lastEditorConfig =
        saved ?? { version: 1, buttons: [], updatedAt: new Date().toISOString() };
      await refreshDockAppearance();
    };
    await fin.InterApplicationBus.subscribe(
      IAB_SUBSCRIBE_ANY,
      IAB_DOCK_CONFIG_RESET,
      iabResetHandler,
    );
  } catch (iabError) {
    console.error("Could not subscribe to dock-config-reset IAB topic.", iabError);
  }

  try {
    iabReloadHandler = async () => {
      console.log("Reloading dock after config import.");
      const saved = await loadDockConfig();
      if (saved) {
        lastEditorConfig = saved;
      }
      await refreshDockAppearance();
    };
    await fin.InterApplicationBus.subscribe(
      IAB_SUBSCRIBE_ANY,
      IAB_RELOAD_AFTER_IMPORT,
      iabReloadHandler,
    );
  } catch (iabError) {
    console.error("Could not subscribe to reload-dock-after-import IAB topic.", iabError);
  }
}

/** Soft reload for legacy dock — update buttons in place (no deregister). */
async function reloadLegacyDockFromConfig(): Promise<void> {
  const saved = await loadDockConfig();
  lastEditorConfig =
    saved ?? { version: 1, buttons: [], updatedAt: new Date().toISOString() };
  await applyLegacyDockConfig();
  await showLegacyDock();
  console.log("Legacy dock reloaded from config (soft).");
}

/**
 * Reload dock from saved config in IndexedDB.
 *
 * Dock3's `updateConfig` is supposed to propagate config changes live,
 * but in practice the favorites/contentMenu UI doesn't always re-render
 * (no public refresh API exists — `updateConfig` and `shutdown` are the
 * only Dock3Provider public methods). For the user-facing "Reload Dock"
 * action we therefore do a full shutdown + re-init — guaranteed fresh
 * window, guaranteed visible change.
 *
 * For IAB-driven background updates we still use the soft `updateConfig`
 * path via `applyDock3Config`, since that preserves the dock's running
 * state (selected tab, drag position, etc.).
 */
export async function reloadDockFromConfig(): Promise<void> {
  const saved = await loadDockConfig();
  if (saved) {
    lastEditorConfig = saved;
  }

  // Legacy dock: `Dock.deregister()` hides the bar and re-register is
  // unreliable on some runtimes — update provider config in place instead.
  if (activeDockType === "legacy" || isLegacyDockActive()) {
    await reloadLegacyDockFromConfig();
    return;
  }

  // Dock3: full shutdown + re-init when soft updateConfig is insufficient.
  await hardReloadDock();
  console.log("Dock reloaded from config.");
}

/**
 * Tear the live Dock3Provider down and re-initialise it with the
 * cached platform settings + the latest `lastEditorConfig`. Used by
 * the "Reload Dock" menu action when the soft `updateConfig` path
 * isn't enough to force the favorites/content-menu UI to re-render.
 *
 * Sequence (matches the v22 OpenFin starter shutdown→init pattern):
 *   1. Snapshot the captured settings (resetDockState wipes them).
 *   2. `await dockProvider.shutdown()` — closes the dock window and
 *      releases the IAB channel cleanly.
 *   3. `resetDockState()` — wipes `dockProvider` so registerDock's
 *      idempotency guard takes the cold path on the next call.
 *   4. `await registerDock(...snapshot)` — creates a fresh provider,
 *      a fresh dock window, a fresh channel, all bound together.
 *
 * If shutdown fails (e.g., the SDK can't tear down a half-broken
 * provider), we still proceed: resetDockState + re-init gives us a
 * working dock at the cost of leaking the old provider. That trade
 * is preferable to leaving the user with no working dock.
 */
async function hardReloadDock(): Promise<void> {
  if (!storedPlatformSettings) {
    console.warn("[hardReloadDock] Provider not initialised — using soft update.");
    await refreshDockAppearance();
    return;
  }

  // Snapshot every cached setting before resetDockState() wipes them.
  const snapshot = {
    settings: storedPlatformSettings,
    icon: storedIcon,
    darkIcon: themeToggleDarkIcon,
    lightIcon: themeToggleLightIcon,
    dispatcher: actionDispatcher,
    dockType: activeDockType,
  };

  if (activeDockType === "legacy" || isLegacyDockActive()) {
    await reloadLegacyDockFromConfig();
    return;
  }

  if (!dockProvider) {
    console.warn("[hardReloadDock] Dock3 provider missing — using soft updateConfig.");
    await applyDock3Config();
    return;
  }

  try {
    await dockProvider.shutdown();
    console.log("[hardReloadDock] Old Dock3 provider shut down.");
  } catch (err) {
    // Don't bail — proceed to re-init. A leaked provider is recoverable;
    // a missing dock is not.
    console.error("[hardReloadDock] dockProvider.shutdown failed (continuing):", err);
  }

  // Tear off IAB subscriptions explicitly here — registerDock's
  // re-init path checks `iabSubscribed` and won't re-subscribe if it's
  // still true, leaving us subscribed to the dead provider's handlers.
  if (iabSubscribed) {
    try {
      if (iabConfigHandler) {
        await fin.InterApplicationBus.unsubscribe(
          IAB_SUBSCRIBE_ANY,
          IAB_DOCK_CONFIG_UPDATE,
          iabConfigHandler,
        );
      }
      if (iabResetHandler) {
        await fin.InterApplicationBus.unsubscribe(
          IAB_SUBSCRIBE_ANY,
          IAB_DOCK_CONFIG_RESET,
          iabResetHandler,
        );
      }
      if (iabReloadHandler) {
        await fin.InterApplicationBus.unsubscribe(
          IAB_SUBSCRIBE_ANY,
          IAB_RELOAD_AFTER_IMPORT,
          iabReloadHandler,
        );
      }
    } catch (err) {
      console.warn("[hardReloadDock] IAB unsubscribe failed (continuing):", err);
    }
  }

  // Now safe to wipe state — old provider is dead, IAB handlers detached.
  resetDockState();

  // Re-init. registerDock's guard sees no `dockProvider` and runs the
  // full Dock.init() path, producing a fresh provider + dock window.
  try {
    await registerDock(
      snapshot.settings,
      undefined,             // apps not needed — lastEditorConfig already in Dexie
      snapshot.icon,
      snapshot.darkIcon,
      snapshot.lightIcon,
      undefined,             // roles passthrough; registerDock currently ignores
      snapshot.dispatcher,
      snapshot.dockType,
    );
    console.log("[hardReloadDock] Dock3 provider re-initialised.");
  } catch (err) {
    console.error("[hardReloadDock] Re-init failed:", err);
  }
}

/**
 * Build the Dock3Provider override class. Extracted so it can be shared
 * between the initial `registerDock` and the hard-reload path.
 */
function buildDock3Override() {
  return (Base: any) => {
    return class MarketsUIDock3 extends Base {
      // Every override method wraps its body in try/catch. Per the v22
      // OpenFin starter contract, throws inside override methods are
      // surfaced through the dock-provider IAB channel as failures —
      // and consistent failures will cause the workspace SDK to mark
      // the channel as broken, manifesting as "client disconnected
      // from the target provider" on subsequent dispatches. None of
      // these methods should ever throw to the SDK; we log and return
      // a safe fallback.

      async loadConfig() {
        try {
          const saved = await loadDockConfig();
          if (saved) {
            lastEditorConfig = saved;
            const theme = readDockTheme();
            // Flatten {dark, light} → string — Dock3 calls this on every
            // dock-window bootstrap and hands the raw config straight to
            // CustomIcon. v22 CustomIcon calls .startsWith() on the icon
            // and crashes on objects.
            const favs = flattenFavoritesForV22(buildAllFavorites(saved), theme);
            const menuEntries = buildContentMenuEntries(saved);
            const menu = flattenContentMenuForV22(menuEntries, theme);
            this['config'] = {
              ...this['config'],
              favorites: favs as any[],
              contentMenu: menu as any[],
            };
            await injectContentMenuFolderIcons(menuEntries, theme);
          }
          return this['config'];
        } catch (err) {
          console.error("[Dock3] loadConfig failed (returning current config):", err);
          return this['config'];
        }
      }

      async saveConfig({ config }: { config: any }) {
        try {
          // Dock3 calls this when user reorders favorites (drag).
          // We don't persist Dock3-level saves — persistence is via dock
          // editor. Just update the internal config so the SDK's view of
          // its own state stays consistent.
          this['config'] = config;
        } catch (err) {
          console.error("[Dock3] saveConfig failed (ignored):", err);
        }
      }

      async launchEntry({ entry }: { entry: any }) {
        try {
          const data = entry?.itemData;

          // Handle theme toggle INLINE here — this is the canonical
          // pattern from OpenFin's `register-with-dock3-basic` starter
          // (see THEME_TOGGLE_ON_DOCK.md). The toggle MUST run inside
          // the dock channel's launchEntry handler, NOT routed through
          // `customActions` or an external dispatcher.
          //
          // Why: `Theme.setSelectedScheme()` dispatches back to multiple
          // channels including dock3's. If we route the toggle through
          // an external action handler, we hold the dock channel's
          // launchEntry promise open while waiting for setSelectedScheme,
          // which itself needs the dock channel free to dispatch its
          // scheme update. Result: deadlock — `setSelectedScheme` hangs
          // forever and the dock chrome never updates.
          //
          // Inline handling completes the toggle synchronously within
          // launchEntry; setSelectedScheme's dispatch then runs cleanly
          // and Dock3 chrome flips along with all other workspace
          // surfaces. No state lost, no flash.
          if (data?.actionId === ACTION_TOGGLE_THEME || entry?.id === "theme-toggle") {
            const platform = getCurrentSync();
            const currentScheme = await platform.Theme.getSelectedScheme();
            const newScheme = currentScheme === ColorSchemeOptionType.Light
              ? ColorSchemeOptionType.Dark
              : ColorSchemeOptionType.Light;
            const isDark = newScheme === ColorSchemeOptionType.Dark;
            console.log(`[Dock3 theme] ${currentScheme} → ${newScheme}`);

            // Fire setSelectedScheme WITHOUT awaiting. The SDK's internal
            // dispatch persists the choice via `System.setThemePreferences`
            // and connects to `__of_workspace_protocol__` to sync workspace
            // storage — that channel hangs in our setup, so awaiting blocks
            // every downstream side-effect (icon refresh + IAB publish to
            // our content windows) that the user's content actually needs
            // to update. The SDK still flips dock + chrome because those
            // dispatches happen synchronously before the hang.
            void platform.Theme.setSelectedScheme(newScheme);

            // Side effects we own (SDK doesn't know about these):
            //   • Provider window's data-theme attribute (drives our CSS vars)
            //   • body.dataset.agThemeMode (some AG-Grid integrations read it)
            //   • Persist to the canonical `starui:theme` storage key — same
            //     key the `RuntimePort` implementations read/write so a
            //     provider-window write is visible to child windows on next
            //     boot.
            //   • Dock icon variants (we manage {dark, light} per icon)
            //   • IAB notify content child windows. Payload includes both
            //     `theme` (new schema) and `isDark` (legacy) so windows
            //     running pre-runtime-reducer code stay in sync.
            const themeStr = isDark ? "dark" : "light";
            applyTheme({ theme: themeStr, palette: readDockPalette() });
            try { document.body.dataset["agThemeMode"] = themeStr; } catch { /* */ }
            await applyDock3Config();
            console.log(`[Dock3 theme] About to publish IAB '${IAB_THEME_CHANGED}' with { theme: '${themeStr}', isDark: ${isDark} } from uuid='${fin.me?.identity?.uuid}'.`);
            try {
              await fin.InterApplicationBus.publish(IAB_THEME_CHANGED, {
                theme: themeStr,
                isDark,
                palette: readDockPalette(),
              });
              console.log("[Dock3 theme] IAB publish resolved.");
            } catch (iabErr) {
              console.warn("[Dock3 theme] IAB publish failed:", iabErr);
            }
            return;
          }

          if (data?.actionId === ACTION_SET_PALETTE || String(entry?.id ?? "").startsWith("palette-")) {
            const raw = data?.palette ?? String(entry?.id ?? "").replace(/^palette-/, "");
            if (!isStarUIPaletteName(raw)) return;
            const palette = raw;
            const theme = readDockTheme();
            persistDockPaletteSelection(palette);
            await applyDock3Config();
            console.log(`[Dock3 palette] ${palette} (theme=${theme}, submenu checkmarks only)`);
            try {
              await fin.InterApplicationBus.publish(IAB_PALETTE_CHANGED, { palette, theme });
            } catch (iabErr) {
              console.warn("[Dock3 palette] IAB publish failed:", iabErr);
            }
            return;
          }

          // Other actions: route through the registered dispatcher.
          if (!data?.actionId) return;
          if (!actionDispatcher) {
            console.warn(`[Dock3] No action dispatcher for: ${data.actionId}`);
            return;
          }
          await actionDispatcher(data.actionId, data.customData);
        } catch (err) {
          // Critically, do NOT rethrow — that would poison the SDK's
          // channel and cause subsequent clicks to fail with
          // "client disconnected from target provider".
          console.error("[Dock3] launchEntry handler threw (swallowed):", err);
        }
      }

      async bookmarkContentMenuEntry(payload: { entry: any }) {
        try {
          // Bookmark requests come from the content-menu UI when the
          // user pins an item. We don't currently materialise these as
          // separate persisted bookmarks (the dock editor owns the
          // canonical list), so just acknowledge by no-op.
          void payload;
        } catch (err) {
          console.error("[Dock3] bookmarkContentMenuEntry failed (ignored):", err);
        }
      }
    } as any;
  };
}

/**
 * Replace dock buttons with the given editor config.
 * Saves to IndexedDB so the config persists across restarts.
 */
export async function updateDockButtons(config: DockEditorConfig): Promise<void> {
  await saveDockConfig(config);
  lastEditorConfig = config;
  await refreshDockAppearance();
}

/**
 * Build a default DockEditorConfig from the manifest app list.
 */
export function getDefaultEditorConfig(apps: App[], fallbackIcon: string): DockEditorConfig {
  return appsToEditorConfig(apps, fallbackIcon);
}

/**
 * Gracefully shut down the Dock3 provider.
 */
export async function shutdownDock(): Promise<void> {
  // Unsubscribe IAB handlers
  if (iabSubscribed) {
    try {
      if (iabConfigHandler) {
        await fin.InterApplicationBus.unsubscribe(
          IAB_SUBSCRIBE_ANY,
          IAB_DOCK_CONFIG_UPDATE,
          iabConfigHandler,
        );
      }
      if (iabResetHandler) {
        await fin.InterApplicationBus.unsubscribe(
          IAB_SUBSCRIBE_ANY,
          IAB_DOCK_CONFIG_RESET,
          iabResetHandler,
        );
      }
      if (iabReloadHandler) {
        await fin.InterApplicationBus.unsubscribe(
          IAB_SUBSCRIBE_ANY,
          IAB_RELOAD_AFTER_IMPORT,
          iabReloadHandler,
        );
      }
    } catch (iabError) {
      console.error("Error unsubscribing IAB handlers.", iabError);
    }
    iabSubscribed = false;
    iabConfigHandler = null;
    iabReloadHandler = null;
    iabResetHandler = null;
  }

  if (activeDockType === "legacy" || isLegacyDockActive()) {
    await shutdownLegacyDockProvider();
  } else if (dockProvider) {
    try {
      await dockProvider.shutdown();
      console.log("Dock3 provider shut down.");
    } catch (error) {
      console.error("Error shutting down Dock3 provider.", error);
    }
  }
  // Now safe to clear module state — the provider is dead, its
  // channel torn down by the SDK. Clearing here means a subsequent
  // initWorkspace() boot starts from a clean slate.
  resetDockState();
}

/**
 * Reset all module-level state to initial values.
 *
 * Should ONLY be called after `dockProvider.shutdown()` has resolved —
 * otherwise the provider is orphaned (its IAB channel stays bound to
 * the dock window but our reference is gone, and any subsequent
 * dispatch from the dock window arrives at a zombie).
 *
 * The legacy `registerDock` flow used to call this unconditionally at
 * the top of init; that path is replaced by the idempotency guard in
 * `registerDock` itself. The only remaining caller is `shutdownDock`,
 * which calls `dockProvider.shutdown()` immediately before this.
 */
function resetDockState(): void {
  activeDockType = "dock3";
  dockProvider = undefined;
  storedPlatformSettings = undefined;
  storedIcon = undefined;
  lastEditorConfig = undefined;
  iabSubscribed = false;
  iabConfigHandler = null;
  iabReloadHandler = null;
  iabResetHandler = null;
  themeToggleDarkIcon = undefined;
  themeToggleLightIcon = undefined;
  actionDispatcher = undefined;
}

// ─── Content-menu folder icons (OpenFin UI gap) ─────────────────────
//
// @openfin/ui-library ContentMenu renders icons only for `type: "item"`.
// Folder rows (SPG, Color palette, Tools, nested dropdowns) get a chevron
// but no leading icon — see ContentMenuEntry in workspace 23.x shapes and
// ContentMenuItem (`iconUrl` only when `type === "item"`).
//
// We inject per-folder background icons into the dock companion window
// (`#content-menu-item-<id>`) after each config push so top-level rows
// align visually with their submenu items.

const CONTENT_MENU_FOLDER_ICON_STYLE_ID = "starui-content-menu-folder-icons";

function collectContentMenuFolders(
  entries: ContentMenuEntryType[],
): Array<{ id: string; icon?: DockEntryIcon }> {
  const folders: Array<{ id: string; icon?: DockEntryIcon }> = [];
  for (const entry of entries) {
    if (entry.type === "folder") {
      if (entry.icon) folders.push({ id: entry.id, icon: entry.icon });
      folders.push(...collectContentMenuFolders(entry.children));
    }
  }
  return folders;
}

async function injectContentMenuFolderIcons(
  entries: ContentMenuEntryType[],
  theme: "dark" | "light",
): Promise<void> {
  if (!dockProvider?.getWindowSync) return;

  const rules: string[] = [];
  for (const { id, icon } of collectContentMenuFolders(entries)) {
    const url = pickIconVariant(icon, theme);
    if (!url) continue;
    rules.push(
      `#content-menu-item-${id}{background-image:url(${JSON.stringify(url)});background-repeat:no-repeat;background-position:10px center;background-size:16px 16px;padding-left:34px!important}`,
    );
  }

  const css = rules.join("\n");
  try {
    const dockWindow = dockProvider.getWindowSync();
    await dockWindow.executeJavaScript(`(() => {
      let el = document.getElementById(${JSON.stringify(CONTENT_MENU_FOLDER_ICON_STYLE_ID)});
      if (!el) {
        el = document.createElement("style");
        el.id = ${JSON.stringify(CONTENT_MENU_FOLDER_ICON_STYLE_ID)};
        document.head.appendChild(el);
      }
      el.textContent = ${JSON.stringify(css)};
    })()`);
  } catch (err) {
    console.warn("[Dock3] Could not inject content-menu folder icons:", err);
  }
}

// ─── Internal helpers ────────────────────────────────────────────────

/**
 * Push updated config to the Dock3 provider.
 * Rebuilds favorites and content menu with current theme colors.
 */
async function applyDock3Config(): Promise<void> {
  if (!dockProvider || !storedPlatformSettings || !storedIcon) {
    console.error("Cannot update dock: not initialized yet.");
    return;
  }

  const theme = readDockTheme();
  const favorites = flattenFavoritesForV22(buildAllFavorites(lastEditorConfig), theme);
  const menuEntries = buildContentMenuEntries(lastEditorConfig);
  const contentMenu = flattenContentMenuForV22(menuEntries, theme);

  try {
    await dockProvider.updateConfig({
      title: storedPlatformSettings.title,
      icon: storedIcon,
      favorites: favorites as any[],
      contentMenu: contentMenu as any[],
      defaultDockButtons: ["notifications", "switchWorkspace", "contentMenu"],
      uiConfig: {
        hideDragHandle: true,
      },
    });
    await injectContentMenuFolderIcons(menuEntries, theme);
    console.log("Dock3 config updated.");
  } catch (error) {
    console.error("Failed to update Dock3 config.", error);
  }
}
