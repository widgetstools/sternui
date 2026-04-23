/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;
import { Dock } from "@openfin/workspace-platform";
import type { App } from "@openfin/workspace";
import { loadDockConfig, saveDockConfig } from './db';
import {
  appsToEditorConfig,
  toDock3Favorites,
  toDock3UserContentMenu,
  type DockEditorConfig,
  type Dock3Entry,
  type ContentMenuEntryType,
} from './dock-config-types';
import {
  TOOLS_SVG,
  SETTINGS_SVG,
  REFRESH_SVG,
  CODE_SVG,
  DOWNLOAD_SVG,
  UPLOAD_SVG,
  SUN_SVG,
  MOON_SVG,
  EYE_SVG,
  svgToDataUrl,
  marketIconToDataUrl,
} from "@markets/icons-svg/all-icons";
import type { PlatformSettings } from './types';

// ─── Theme icon colors ──────────────────────────────────────────────
const ICON_COLOR_DARK_THEME = "#ffffff";
const ICON_COLOR_LIGHT_THEME = "#1a1a2e";

// ─── IAB topic names ────────────────────────────────────────────────
export const IAB_DOCK_CONFIG_UPDATE = "dock-config-update";
export const IAB_RELOAD_AFTER_IMPORT = "reload-dock-after-import";
export const IAB_THEME_CHANGED = "theme-changed";
export const IAB_REGISTRY_CONFIG_UPDATE = "registry-config-update";

// ─── Action ID constants ─────────────────────────────────────────────
export const ACTION_LAUNCH_APP        = "launch-app";
export const ACTION_TOGGLE_THEME      = "toggle-theme";
export const ACTION_OPEN_DOCK_EDITOR  = "open-dock-editor";
export const ACTION_RELOAD_DOCK       = "reload-dock";
export const ACTION_SHOW_DEVTOOLS     = "show-devtools";
export const ACTION_EXPORT_CONFIG     = "export-config";
export const ACTION_IMPORT_CONFIG     = "import-config";
export const ACTION_TOGGLE_PROVIDER   = "toggle-provider-window";
export const ACTION_OPEN_REGISTRY_EDITOR = "open-registry-editor";

// ─── Module-level state ──────────────────────────────────────────────

/** The Dock3 provider instance returned by Dock.init(). */
let dockProvider: any;

/** Cached copy of platform settings from the manifest. */
let storedPlatformSettings: PlatformSettings | undefined;

/** The dock provider icon URL. */
let storedIcon: string | undefined;

/** Last user-configured DockEditorConfig (for re-applying on theme change). */
let lastEditorConfig: DockEditorConfig | undefined;

/** Current icon color, updated when the theme is toggled. */
let currentIconColor = ICON_COLOR_DARK_THEME;

/** Tracks whether IAB subscriptions have been set up. */
let iabSubscribed = false;

/** Stored IAB subscription handlers for cleanup. */
let iabConfigHandler: ((config: any) => void) | null = null;
let iabReloadHandler: (() => void) | null = null;

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

// ─── Content menu builder (Tools) ────────────────────────────────────

/**
 * Create a theme-aware icon for the content menu.
 *
 * Dock3 ContentMenuEntry.icon supports { dark, light } — the platform
 * automatically picks the correct variant based on the active theme.
 * White icons for dark mode, dark navy icons for light mode.
 */
function contentMenuIcon(svgString: string): { dark: string; light: string } {
  return {
    dark: svgToDataUrl(svgString, ICON_COLOR_DARK_THEME),   // white on dark background
    light: svgToDataUrl(svgString, ICON_COLOR_LIGHT_THEME), // navy on light background
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
      id: "tool-dock-editor",
      label: "Dock Editor",
      icon: contentMenuIcon(SETTINGS_SVG),
      itemData: { actionId: ACTION_OPEN_DOCK_EDITOR },
    },
    {
      type: "item",
      id: "tool-registry-editor",
      label: "Component Registry",
      icon: contentMenuIcon(SETTINGS_SVG),
      itemData: { actionId: ACTION_OPEN_REGISTRY_EDITOR },
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
  const userMenus = editorConfig
    ? toDock3UserContentMenu(
        editorConfig,
        generateIconFromId,
        recolorIconifyUrl,
        ICON_COLOR_DARK_THEME,
        ICON_COLOR_LIGHT_THEME,
      )
    : [];

  // System tools folder
  const toolsFolder: ContentMenuEntryType = {
    type: "folder",
    id: "system-tools",
    label: "Tools",
    children: buildSystemContentMenuEntries(),
  };

  return [...userMenus, toolsFolder];
}

// ─── Build favorites from editor config ──────────────────────────────

/**
 * Convert the saved DockEditorConfig to Dock3 favorites, including
 * system entries (theme toggle).
 */
function buildAllFavorites(editorConfig?: DockEditorConfig): Dock3Entry[] {
  // User-configured favorites
  const userFavorites = editorConfig
    ? toDock3Favorites(
        editorConfig,
        generateIconFromId,
        recolorIconifyUrl,
        ICON_COLOR_DARK_THEME,
        ICON_COLOR_LIGHT_THEME,
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
export async function registerDock(
  platformSettings: PlatformSettings,
  apps?: App[],
  dockIcon?: string,
  darkIcon?: string,
  lightIcon?: string,
  _roles?: string[],
  onAction?: (actionId: string, customData?: any) => Promise<void>,
): Promise<any> {
  console.log("Initializing the Dock3 provider.");

  // Reset module-level state before re-initializing
  resetDockState();

  // Cache settings
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
  const favorites = buildAllFavorites(lastEditorConfig);
  const contentMenu = buildContentMenuEntries(lastEditorConfig);

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
      override: (Base: any) => {
        return class MarketsUIDock3 extends Base {
          async loadConfig() {
            // Load from IndexedDB on startup
            const saved = await loadDockConfig();
            if (saved) {
              lastEditorConfig = saved;
              const favs = buildAllFavorites(saved);
              const menu = buildContentMenuEntries(saved);
              this['config'] = {
                ...this['config'],
                favorites: favs as any[],
                contentMenu: menu as any[],
              };
            }
            return this['config'];
          }

          async saveConfig({ config }: { config: any }) {
            // Dock3 calls this when user reorders favorites (drag).
            // We don't persist Dock3-level saves — persistence is via dock editor.
            // Just update the internal config.
            this['config'] = config;
          }

          async launchEntry({ entry }: { entry: any }) {
            // Dispatch to our action handlers
            const data = entry.itemData;
            if (data?.actionId && actionDispatcher) {
              await actionDispatcher(data.actionId, data.customData);
            } else if (data?.actionId) {
              console.warn(`No action dispatcher for: ${data.actionId}`);
            }
          }
        } as any;
      },
    });

    console.log("Dock3 provider initialized.");

    // IAB subscriptions — set up once only
    if (!iabSubscribed) {
      iabSubscribed = true;

      try {
        iabConfigHandler = async (config: DockEditorConfig) => {
          console.log("Received dock config update via IAB.");
          await saveDockConfig(config);
          lastEditorConfig = config;
          await applyDock3Config();
        };
        await fin.InterApplicationBus.subscribe(
          { uuid: fin.me.identity.uuid },
          IAB_DOCK_CONFIG_UPDATE,
          iabConfigHandler,
        );
      } catch (iabError) {
        console.error("Could not subscribe to dock-config-update IAB topic.", iabError);
      }

      try {
        iabReloadHandler = async () => {
          console.log("Reloading dock after config import.");
          const saved = await loadDockConfig();
          if (saved) {
            lastEditorConfig = saved;
          }
          await applyDock3Config();
        };
        await fin.InterApplicationBus.subscribe(
          { uuid: fin.me.identity.uuid },
          IAB_RELOAD_AFTER_IMPORT,
          iabReloadHandler,
        );
      } catch (iabError) {
        console.error("Could not subscribe to reload-dock-after-import IAB topic.", iabError);
      }
    }

    return dockProvider;
  } catch (error) {
    console.error("Failed to initialize the Dock3 provider.", error);
    return undefined;
  }
}

/**
 * Recolor all dock icons to match the current theme.
 * Called from the toggle-theme action in workspace.ts.
 */
export async function recolorDockIcons(isDark: boolean): Promise<void> {
  currentIconColor = isDark ? ICON_COLOR_DARK_THEME : ICON_COLOR_LIGHT_THEME;
  console.log(`Recoloring dock icons for ${isDark ? "dark" : "light"} theme`);
  await applyDock3Config();
}

/**
 * Reload dock from saved config in IndexedDB.
 */
export async function reloadDockFromConfig(): Promise<void> {
  const saved = await loadDockConfig();
  if (saved) {
    lastEditorConfig = saved;
  }
  await applyDock3Config();
  console.log("Dock reloaded from config.");
}

/**
 * Replace dock buttons with the given editor config.
 * Saves to IndexedDB so the config persists across restarts.
 */
export async function updateDockButtons(config: DockEditorConfig): Promise<void> {
  await saveDockConfig(config);
  lastEditorConfig = config;
  await applyDock3Config();
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
          { uuid: fin.me.identity.uuid },
          IAB_DOCK_CONFIG_UPDATE,
          iabConfigHandler,
        );
      }
      if (iabReloadHandler) {
        await fin.InterApplicationBus.unsubscribe(
          { uuid: fin.me.identity.uuid },
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
  }

  if (dockProvider) {
    try {
      await dockProvider.shutdown();
      console.log("Dock3 provider shut down.");
    } catch (error) {
      console.error("Error shutting down Dock3 provider.", error);
    }
  }
}

/**
 * Reset all module-level state to initial values.
 * Called at the top of registerDock() to ensure a clean slate.
 */
function resetDockState(): void {
  dockProvider = undefined;
  storedPlatformSettings = undefined;
  storedIcon = undefined;
  lastEditorConfig = undefined;
  currentIconColor = ICON_COLOR_DARK_THEME;
  iabSubscribed = false;
  iabConfigHandler = null;
  iabReloadHandler = null;
  themeToggleDarkIcon = undefined;
  themeToggleLightIcon = undefined;
  actionDispatcher = undefined;
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

  const favorites = buildAllFavorites(lastEditorConfig);
  const contentMenu = buildContentMenuEntries(lastEditorConfig);

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
    console.log("Dock3 config updated.");
  } catch (error) {
    console.error("Failed to update Dock3 config.", error);
  }
}
