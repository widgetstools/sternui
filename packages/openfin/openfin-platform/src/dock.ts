/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;
import { Dock, ColorSchemeOptionType, getCurrentSync } from "@openfin/workspace-platform";
import * as Notifications from "@openfin/workspace/notifications";
import {
  Dock as ClassicDock,
  DockButtonNames,
  type App,
  type DockButton,
  type DockProvider,
  type DockProviderRegistration,
} from "@openfin/workspace";
import {
  loadDockConfig,
  saveDockConfig,
  loadDockWindowBounds,
  saveDockWindowBounds,
  setPlatformDefaultScope,
  getPlatformDefaultScope,
  type DockWindowBounds,
} from './db';
import {
  appsToEditorConfig,
  toDock3Favorites,
  toDock3UserContentMenu,
  toDock2Buttons,
  type DockEditorConfig,
  type Dock3Entry,
  type ContentMenuEntryType,
} from './dockConfigTypes';
import {
  SETTINGS_SVG,
  TOOLS_SVG,
  REFRESH_SVG,
  CODE_SVG,
  DOWNLOAD_SVG,
  UPLOAD_SVG,
  SUN_SVG,
  MOON_SVG,
  EYE_SVG,
  svgToDataUrl,
  marketIconToDataUrl,
} from "./icons/allIcons.js";
import type { PlatformSettings } from './types';

// ─── Theme icon colors ──────────────────────────────────────────────
const ICON_COLOR_DARK_THEME = "#ffffff";
const ICON_COLOR_LIGHT_THEME = "#1a1a2e";

// ─── IAB topics + action IDs ────────────────────────────────────────
// Lifted into ./iabTopics.ts so non-OpenFin consumers (Config Browser
// rendered in a plain browser, dock-editor's import panel, etc.) can
// import just the strings without pulling @openfin/workspace-platform
// through this file. Re-exported here for back-compat.
import {
  IAB_DOCK_CONFIG_UPDATE,
  IAB_RELOAD_AFTER_IMPORT,
  IAB_THEME_CHANGED,
  IAB_REGISTRY_CONFIG_UPDATE,
  CHANNEL_CUSTOM_DOCK,
  CUSTOM_DOCK_DISPATCH_ACTION,
  CUSTOM_DOCK_GET_CONFIG,
  CUSTOM_DOCK_CONFIG_PUSH,
  CUSTOM_DOCK_LIST_WORKSPACES,
  CUSTOM_DOCK_GET_ACTIVE_WORKSPACE,
  CUSTOM_DOCK_APPLY_WORKSPACE,
  CUSTOM_DOCK_WORKSPACE_CHANGED,
  CUSTOM_DOCK_SAVE_WORKSPACE_AS,
  CUSTOM_DOCK_RESTORE_LAST_SAVED,
  CUSTOM_DOCK_GET_NOTIF_COUNT,
  CUSTOM_DOCK_TOGGLE_NOTIF_CENTER,
  CUSTOM_DOCK_NOTIF_COUNT_CHANGED,
  CUSTOM_DOCK_SAVE_WORKSPACE,
  CUSTOM_DOCK_RENAME_WORKSPACE,
  CUSTOM_DOCK_DELETE_WORKSPACE,
  CUSTOM_DOCK_LIST_RUNNING_APPS,
  CUSTOM_DOCK_GET_ACTIVE_APP,
  CUSTOM_DOCK_SWITCH_APP,
  CUSTOM_DOCK_RUNNING_APPS_CHANGED,
  UNTITLED_WORKSPACE_ID,
  ACTION_LAUNCH_APP,
  ACTION_TOGGLE_THEME,
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
  ACTION_SHOW_HOME,
  ACTION_SHOW_STORE,
} from './iabTopics';
export {
  IAB_DOCK_CONFIG_UPDATE,
  IAB_RELOAD_AFTER_IMPORT,
  IAB_THEME_CHANGED,
  IAB_REGISTRY_CONFIG_UPDATE,
  CHANNEL_CUSTOM_DOCK,
  CUSTOM_DOCK_DISPATCH_ACTION,
  CUSTOM_DOCK_GET_CONFIG,
  CUSTOM_DOCK_CONFIG_PUSH,
  CUSTOM_DOCK_LIST_WORKSPACES,
  CUSTOM_DOCK_GET_ACTIVE_WORKSPACE,
  CUSTOM_DOCK_APPLY_WORKSPACE,
  CUSTOM_DOCK_WORKSPACE_CHANGED,
  CUSTOM_DOCK_SAVE_WORKSPACE_AS,
  CUSTOM_DOCK_RESTORE_LAST_SAVED,
  CUSTOM_DOCK_GET_NOTIF_COUNT,
  CUSTOM_DOCK_TOGGLE_NOTIF_CENTER,
  CUSTOM_DOCK_NOTIF_COUNT_CHANGED,
  CUSTOM_DOCK_SAVE_WORKSPACE,
  CUSTOM_DOCK_RENAME_WORKSPACE,
  CUSTOM_DOCK_DELETE_WORKSPACE,
  CUSTOM_DOCK_LIST_RUNNING_APPS,
  CUSTOM_DOCK_GET_ACTIVE_APP,
  CUSTOM_DOCK_SWITCH_APP,
  CUSTOM_DOCK_RUNNING_APPS_CHANGED,
  UNTITLED_WORKSPACE_ID,
  ACTION_LAUNCH_APP,
  ACTION_TOGGLE_THEME,
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
  ACTION_SHOW_HOME,
  ACTION_SHOW_STORE,
};

// ─── Module-level state ──────────────────────────────────────────────

/**
 * Which dock implementation is active for this provider window. Set at
 * `registerDock` time from the manifest's `customSettings.dockVersion`
 * (default `"dock2"`). The shared lifecycle functions (`recolorDockIcons`,
 * `reloadDockFromConfig`, `shutdownDock`, IAB handlers) dispatch on it.
 */
let dockVersion: "dock2" | "dock3" | "custom" = "dock2";

/** The classic `Dock.register()` registration handle (dock2 path). */
let classicReg: DockProviderRegistration | undefined;

/** The Dock3 provider instance returned by Dock.init(). */
let dockProvider: any;

/** Cached copy of platform settings from the manifest. */
let storedPlatformSettings: PlatformSettings | undefined;

/** The configured apps (for the app-switcher's running/title lookup — S19). */
let storedApps: App[] | undefined;

/** `fin.System` running-app event listeners (custom path; for teardown — S19). */
let customDockAppListeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

/** The dock provider icon URL. */
let storedIcon: string | undefined;

/** Last user-configured DockEditorConfig (for re-applying on theme change). */
let lastEditorConfig: DockEditorConfig | undefined;

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

/** The frameless, always-on-top custom-dock window handle (custom path). */
let customDockWindow: any;

/**
 * In-flight launch guard (singleton, one-per-platform). Concurrent or
 * re-entrant `launchCustomDockWindow` calls collapse onto this one promise so
 * exactly one dock window is ever created per platform run — every app/view in
 * the platform shares it via the provider channel. Cleared on teardown so a
 * later run can re-launch.
 */
let customDockLaunch: Promise<any> | undefined;

/** The OpenFin Channel provider the custom dock window dispatches over. */
let customDockChannel: any;

/** Debounce handle for persisting the custom dock window's dragged position. */
let customDockBoundsSaveTimer: ReturnType<typeof setTimeout> | undefined;

/** The `notifications-count-changed` listener (custom path; for teardown). */
let customDockNotifListener: ((evt: { count?: number }) => void) | undefined;

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
  try {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
  } catch { /* non-browser */ }
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "light") return "light";
  } catch { /* storage unavailable */ }
  return "dark";
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
      // The OpenFin DockEntry (favorites) folder shape supports `icon?` as
      // `string | { dark, light }`. Resolve to a single string for the live
      // theme — v22/v23 `CustomIcon` calls `.startsWith()` directly, so an
      // object form would crash the dock UI. Children are NOT carried on the
      // favorites folder (the DockEntry folder shape has no `children` field);
      // OpenFin addresses the matching content-menu folder by id when a
      // dock-bar folder is clicked.
      const folderIcon = pickIconVariant(entry.icon, theme) ?? "";
      return {
        type: "folder" as const,
        id: entry.id,
        label: entry.label,
        ...(folderIcon ? { icon: folderIcon } : {}),
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
      // v22 ContentMenuEntry folder has no icon field — children only.
      return {
        type: "folder" as const,
        id: entry.id,
        label: entry.label,
        children: flattenContentMenuForV22(entry.children, theme),
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

  // System "Tools" group — a dock-bar folder carrying the wrench icon,
  // linked by id ("system-tools") to the content-menu folder that holds
  // the actual tool entries (see buildContentMenuEntries). Same id-link
  // pattern as user DropdownButtons; the favorites folder is just the
  // icon-bearing entry point.
  const toolsFolder: Dock3Entry = {
    type: "folder",
    id: "system-tools",
    label: "Tools",
    icon: contentMenuIcon(TOOLS_SVG),
    children: [],
  };

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

  return [...userFavorites, toolsFolder, themeToggle];
}

// ─── Classic dock (dock2) builders ───────────────────────────────────
//
// The classic `Dock.register` API renders DropdownButtons directly on the
// dock bar as icon dropdowns whose options carry their own icons — no
// two-column content menu. Button clicks dispatch to the platform custom
// actions registered via `buildCustomActions` (the same CustomButton /
// CustomDropdownItem callers those handlers already guard for), so the
// action wiring (including ACTION_TOGGLE_THEME → recolorDockIcons) is
// shared with the dock3 path. Classic icons are single strings (no
// {dark,light}), so we resolve per theme and re-push on every toggle.

/** Resolve an SVG constant to a theme-appropriate data-URL string. */
function toolIconStr(svg: string, theme: "dark" | "light"): string {
  return pickIconVariant(contentMenuIcon(svg), theme) ?? "";
}

/** Convert the user's editor buttons to classic dock buttons for the theme. */
function userClassicButtons(config: DockEditorConfig, theme: "dark" | "light"): DockButton[] {
  return toDock2Buttons(
    config, generateIconFromId, recolorIconifyUrl,
    ICON_COLOR_DARK_THEME, ICON_COLOR_LIGHT_THEME, theme,
  ) as unknown as DockButton[];
}

/** Classic "Tools" dropdown — same system entries as the dock3 content menu. */
function buildClassicSystemTools(theme: "dark" | "light"): DockButton {
  // Option icons resolve against the dark scheme (white glyphs): the classic
  // dock's dropdown flyout is always dark, so theme-following glyphs would
  // vanish on it in light mode. The Tools button icon below still follows the
  // live theme — it sits on the theme-following dock bar.
  const opt = (tooltip: string, actionId: string, svg: string) => ({
    tooltip,
    iconUrl: toolIconStr(svg, "dark"),
    action: { id: actionId },
  });
  return {
    type: DockButtonNames.DropdownButton,
    tooltip: "Tools",
    iconUrl: toolIconStr(TOOLS_SVG, theme),
    options: [
      opt("Workspace Setup (new)", ACTION_OPEN_WORKSPACE_SETUP, SETTINGS_SVG),
      opt("Data Providers", ACTION_OPEN_DATA_PROVIDERS, SETTINGS_SVG),
      opt("Config Browser", ACTION_OPEN_CONFIG_BROWSER, SETTINGS_SVG),
      opt("Reload Dock", ACTION_RELOAD_DOCK, REFRESH_SVG),
      opt("Developer Tools", ACTION_SHOW_DEVTOOLS, CODE_SVG),
      opt("Inspect Shared Worker", ACTION_INSPECT_SHARED_WORKER, CODE_SVG),
      opt("Export Config", ACTION_EXPORT_CONFIG, DOWNLOAD_SVG),
      opt("Import Config", ACTION_IMPORT_CONFIG, UPLOAD_SVG),
      opt("Show/Hide Provider", ACTION_TOGGLE_PROVIDER, EYE_SVG),
    ],
  } as DockButton;
}

/** Classic theme-toggle action button — mirrors the dock3 favorites toggle. */
function buildClassicThemeToggle(theme: "dark" | "light"): DockButton {
  const icon = theme === "dark"
    ? (themeToggleDarkIcon ?? DEFAULT_DARK_THEME_ICON)
    : (themeToggleLightIcon ?? DEFAULT_LIGHT_THEME_ICON);
  return {
    type: DockButtonNames.ActionButton,
    tooltip: "Toggle Theme",
    iconUrl: icon,
    action: { id: ACTION_TOGGLE_THEME },
  } as DockButton;
}

/** Full classic dock button list: user buttons + Tools dropdown + theme toggle. */
function buildAllClassicButtons(
  editorConfig: DockEditorConfig | undefined,
  theme: "dark" | "light",
): DockButton[] {
  const userButtons = editorConfig ? userClassicButtons(editorConfig, theme) : [];
  return [...userButtons, buildClassicSystemTools(theme), buildClassicThemeToggle(theme)];
}

// ─── Classic dock (dock2) lifecycle ──────────────────────────────────

/** Dispatch a config push to whichever dock implementation is active. */
async function applyDockConfig(): Promise<void> {
  if (dockVersion === "dock2") {
    await applyDockClassicConfig();
    return;
  }
  if (dockVersion === "custom") {
    // The custom dock window re-renders its own icons on the theme IAB —
    // there's no provider-side config to push (the live `<DockBar config=…>`
    // re-render lands in Phase 2). No-op here.
    return;
  }
  await applyDock3Config();
}

/**
 * Subscribe the shared dock IAB handlers (config-update + reload-after-
 * import). Used by the classic path; the dock3 path has its own inline
 * block. `applyFn` is the version-specific config push.
 */
function subscribeDockIab(applyFn: () => Promise<void>): void {
  if (iabSubscribed) return;
  iabSubscribed = true;
  try {
    iabConfigHandler = async (config: DockEditorConfig) => {
      console.log("Received dock config update via IAB.");
      await saveDockConfig(config);
      lastEditorConfig = config;
      await applyFn();
    };
    void fin.InterApplicationBus.subscribe(
      { uuid: fin.me.identity.uuid }, IAB_DOCK_CONFIG_UPDATE, iabConfigHandler,
    );
  } catch (iabError) {
    console.error("Could not subscribe to dock-config-update IAB topic.", iabError);
  }
  try {
    iabReloadHandler = async () => {
      console.log("Reloading dock after config import.");
      const saved = await loadDockConfig();
      if (saved) lastEditorConfig = saved;
      await applyFn();
    };
    void fin.InterApplicationBus.subscribe(
      { uuid: fin.me.identity.uuid }, IAB_RELOAD_AFTER_IMPORT, iabReloadHandler,
    );
  } catch (iabError) {
    console.error("Could not subscribe to reload-dock-after-import IAB topic.", iabError);
  }
}

/**
 * Register the classic (dock2) provider via `Dock.register`. Self-contained:
 * caches the same shared settings/state the dock3 path uses, so the shared
 * lifecycle functions (recolorDockIcons / reloadDockFromConfig / shutdownDock)
 * dispatch correctly via `dockVersion`. Button clicks route through the
 * platform custom actions registered at init (buildCustomActions).
 */
async function registerDockClassic(
  platformSettings: PlatformSettings,
  apps?: App[],
  dockIcon?: string,
  darkIcon?: string,
  lightIcon?: string,
  onAction?: (actionId: string, customData?: any) => Promise<void>,
): Promise<any> {
  // Idempotency — refresh config in place if already registered.
  if (classicReg) {
    console.log("Classic dock already registered — refreshing config in place.");
    storedPlatformSettings = platformSettings;
    storedIcon = dockIcon ?? platformSettings.icon;
    themeToggleDarkIcon = darkIcon ?? DEFAULT_DARK_THEME_ICON;
    themeToggleLightIcon = lightIcon ?? DEFAULT_LIGHT_THEME_ICON;
    actionDispatcher = onAction;
    if (!lastEditorConfig) {
      const saved = await loadDockConfig();
      lastEditorConfig = saved ?? appsToEditorConfig(apps ?? [], platformSettings.icon);
    }
    await applyDockClassicConfig();
    return classicReg;
  }

  console.log("Registering the classic (dock2) provider.");
  storedPlatformSettings = platformSettings;
  storedIcon = dockIcon ?? platformSettings.icon;
  themeToggleDarkIcon = darkIcon ?? DEFAULT_DARK_THEME_ICON;
  themeToggleLightIcon = lightIcon ?? DEFAULT_LIGHT_THEME_ICON;
  actionDispatcher = onAction;

  const savedConfig = await loadDockConfig();
  lastEditorConfig = savedConfig ?? appsToEditorConfig(apps ?? [], platformSettings.icon);

  const theme = readDockTheme();
  const buttons = buildAllClassicButtons(lastEditorConfig, theme);

  try {
    classicReg = await ClassicDock.register({
      id: platformSettings.id,
      title: platformSettings.title,
      icon: storedIcon,
      buttons,
      // Mirror the dock3 defaultDockButtons (minus contentMenu — classic
      // has no content menu; dropdowns render directly on the bar).
      workspaceComponents: ["switchWorkspace", "notifications"],
    } as DockProvider);
    // Unlike Dock3's `Dock.init` (which auto-shows), classic `Dock.register`
    // only registers the provider — the dock stays hidden until `Dock.show()`.
    await ClassicDock.show();
    console.log("Classic dock provider registered and shown.");
    subscribeDockIab(applyDockClassicConfig);
    return classicReg;
  } catch (error) {
    console.error("Failed to register the classic dock provider.", error);
    return undefined;
  }
}

/** Push the latest editor config to the classic provider (rebuilds button icons for the theme). */
async function applyDockClassicConfig(): Promise<void> {
  if (!classicReg || !storedPlatformSettings || !storedIcon) {
    console.error("Cannot update classic dock: not registered yet.");
    return;
  }
  const theme = readDockTheme();
  const buttons = buildAllClassicButtons(lastEditorConfig, theme);
  try {
    await classicReg.updateDockProviderConfig({
      title: storedPlatformSettings.title,
      icon: storedIcon,
      buttons,
      workspaceComponents: ["switchWorkspace", "notifications"],
    } as any);
    console.log("Classic dock config updated.");
  } catch (error) {
    console.error("Failed to update classic dock config.", error);
  }
}

/** Deregister the classic provider and clear its state. */
async function shutdownDockClassic(): Promise<void> {
  if (classicReg) {
    try {
      await ClassicDock.deregister();
      console.log("Classic dock provider deregistered.");
    } catch (error) {
      console.error("Error deregistering classic dock provider.", error);
    }
  }
  classicReg = undefined;
}

// ─── Custom dock lifecycle ───────────────────────────────────────────
//
// The "custom" dock is a frameless, always-on-top OpenFin window we
// render ourselves (React + @starui/design-system tokens + shadcn
// primitives — the `@starui/dock-react` package's <DockBar>). It exists
// to escape dock2's un-themeable dark flyout and dock3's non-hideable
// content menu. dock2/dock3 stay fully intact as fallbacks.
//
// Phase 0 is staged across three sessions:
//   • S1 — no-op stub: thread `dockVersion: "custom"` through the type +
//     `registerDock` branch so the manifest flag is selectable.
//   • S2 (here) — launch the frameless, always-on-top `/dock` window with
//     monitor-geometry edge placement; the route renders a themed
//     placeholder ("hello dock"). <DockBar> + the real DockController land
//     in S3.
//   • S3 (here) — provider↔dock action-dispatch channel + theme IAB. The
//     provider creates an OpenFin Channel (`registerCustomDockChannel`); the
//     dock window's `OpenFinDockController` connects as a client and round-
//     trips every `ACTION_*` through `dockActionHandlers`. Theme toggle is
//     intercepted provider-side (`toggleCustomDockTheme`) — only the provider
//     window can flip the platform scheme + broadcast the theme IAB.

/** Named, manifest-origin route + geometry for the custom dock window. */
const CUSTOM_DOCK_WINDOW_NAME = "starui-custom-dock";
const CUSTOM_DOCK_ROUTE = "/dock";
/** Dock bar height in DIP px — matches <DockBar>'s h-11 (2.75rem @ 16px). */
const CUSTOM_DOCK_HEIGHT = 44;
/**
 * Minimum / initial window width. The bar is a **floating** object that grows
 * with its content: the dock window opens at this min width and the React bar
 * measures itself (ResizeObserver) and calls back over the
 * `DockController.resizeToContent` seam to fit. Keep in sync with `<DockBar>`'s
 * `min-w-*`.
 */
const CUSTOM_DOCK_MIN_WIDTH = 220;
/** Default float offset (DIP px) from the primary monitor's top edge. */
const CUSTOM_DOCK_TOP_OFFSET = 24;

/**
 * Resolve the web-app origin for the dock window from the manifest's
 * `platform.providerUrl` (not `window.location`, which inside the provider
 * View may not match the Vite origin). Mirrors openChildToolWindow's
 * resolver — kept local so this OpenFin-only file stays self-contained.
 */
async function resolveProviderOrigin(): Promise<string | undefined> {
  try {
    const app = await fin.Application.getCurrent();
    const manifest: Record<string, any> = await app.getManifest();
    const providerUrl = manifest?.platform?.providerUrl ?? "";
    return new URL(providerUrl).origin;
  } catch (err) {
    console.error("[customDock] Could not resolve provider origin.", err);
    return undefined;
  }
}

/**
 * Default **floating** placement: a compact, content-sized bar centred near the
 * top of the primary monitor (not pinned/spanning the top edge — it's a movable
 * floating object the user can drag). Opens at the min width; the React bar
 * grows the window to fit via `resizeToContent`. `availableRect` excludes the OS
 * taskbar. Falls back to 40,40 if monitor info is unavailable.
 */
async function computeCustomDockBounds(): Promise<{
  left: number; top: number; width: number; height: number;
}> {
  const width = CUSTOM_DOCK_MIN_WIDTH;
  let left = 40;
  let top = 40;
  try {
    const info = await fin.System.getMonitorInfo();
    const rect = info?.primaryMonitor?.availableRect;
    if (rect && typeof rect.left === "number" && typeof rect.right === "number") {
      top = rect.top + CUSTOM_DOCK_TOP_OFFSET;
      left = Math.round(rect.left + ((rect.right - rect.left) - width) / 2);
    }
  } catch (err) {
    console.warn("[customDock] getMonitorInfo failed; using fallback bounds.", err);
  }
  return { left, top, width, height: CUSTOM_DOCK_HEIGHT };
}

/**
 * Is a saved position still visible on a currently-connected monitor? Guards
 * against restoring the bar off-screen after a monitor is unplugged or the
 * layout changes. A few px of slack lets an edge-flush bar still count.
 */
async function boundsAreOnScreen(b: DockWindowBounds): Promise<boolean> {
  try {
    const info = await fin.System.getMonitorInfo();
    const monitors: any[] = [info?.primaryMonitor, ...(info?.nonPrimaryMonitors ?? [])].filter(Boolean);
    return monitors.some((m) => {
      const r = m?.monitorRect ?? m?.availableRect;
      return r
        && b.left >= r.left - 8 && b.left <= r.right - 8
        && b.top >= r.top - 8 && b.top <= r.bottom - 8;
    });
  } catch {
    return false;
  }
}

/**
 * Where to open the dock: the user's last-saved position if it's still
 * on-screen, otherwise the default floating placement. (Session 10; floating
 * default since the S14 UX rework.)
 */
async function resolveCustomDockBounds(): Promise<{
  left: number; top: number; width: number; height: number;
}> {
  try {
    const saved = await loadDockWindowBounds();
    if (saved && (await boundsAreOnScreen(saved))) {
      console.log("[customDock] Restoring saved window position.");
      return saved;
    }
  } catch (err) {
    console.warn("[customDock] Could not restore saved bounds; using edge placement.", err);
  }
  return computeCustomDockBounds();
}

/** Persist the dock window's current position (called debounced on drag). */
async function persistCustomDockBounds(win: any): Promise<void> {
  try {
    const b = await win.getBounds();
    await saveDockWindowBounds({ left: b.left, top: b.top, width: b.width, height: b.height });
  } catch (err) {
    console.warn("[customDock] Failed to persist window bounds.", err);
  }
}

/**
 * Re-apply `alwaysOnTop`. A peer window going maximized/always-on-top can steal
 * the top z-order and OpenFin fires no event for it, so we re-assert on the
 * dock's own focus/shown events. Best-effort (see the plan's risk list #1).
 */
async function reassertCustomDockAlwaysOnTop(win: any): Promise<void> {
  try {
    await win.updateOptions({ alwaysOnTop: true });
  } catch (err) {
    console.debug("[customDock] always-on-top re-assert failed.", err);
  }
}

/**
 * Wire the dock window's geometry side-effects: debounced position persistence
 * on drag, and always-on-top re-assert on focus/shown. Attached once, right
 * after the window is created.
 */
function attachCustomDockGeometryListeners(win: any): void {
  try {
    win.on("bounds-changed", () => {
      if (customDockBoundsSaveTimer) clearTimeout(customDockBoundsSaveTimer);
      customDockBoundsSaveTimer = setTimeout(() => { void persistCustomDockBounds(win); }, 400);
    });
  } catch (err) {
    console.warn("[customDock] Could not wire bounds-changed persistence.", err);
  }
  const reassert = () => { void reassertCustomDockAlwaysOnTop(win); };
  try { win.on("focused", reassert); } catch { /* non-fatal */ }
  try { win.on("shown", reassert); } catch { /* non-fatal */ }
}

/**
 * Open (or focus) the frameless, always-on-top dock window at `/dock`.
 *
 * `fin.Window.create` (not `Platform.createWindow`) is deliberate: the dock
 * is a chrome utility, NOT a workspace-managed window — it must not be
 * snapshot-saved, dockable, or restored as a platform view. `saveWindowState:
 * false` + `showTaskbarIcon: false` + `smallWindow: true` keep it a
 * lightweight always-on-top bar.
 *
 * NOTE (carried from the plan's risk list): always-on-top ≠ appbar — the bar
 * does not reserve screen space, so maximized/snapped windows can overlap it.
 * Accepted; no standard OpenFin reserve-space API.
 */
function launchCustomDockWindow(): Promise<any> {
  // Singleton guard: collapse concurrent/re-entrant launches onto one promise so
  // a race (two callers before the window exists) can't create two docks, which
  // would otherwise throw on the duplicate window name. Stays resolved for the
  // platform's lifetime; cleared on teardown.
  if (customDockLaunch) return customDockLaunch;
  customDockLaunch = doLaunchCustomDockWindow().catch((err) => {
    customDockLaunch = undefined; // a failed launch may be retried
    throw err;
  });
  return customDockLaunch;
}

async function doLaunchCustomDockWindow(): Promise<any> {
  const origin = await resolveProviderOrigin();
  if (!origin) return undefined;
  const url = `${origin}${CUSTOM_DOCK_ROUTE}`;

  // Idempotency — focus the existing dock window rather than spawning a
  // second one (registerDock can be re-entered on config refresh).
  try {
    const existing = fin.Window.wrapSync({
      uuid: fin.me.identity.uuid,
      name: CUSTOM_DOCK_WINDOW_NAME,
    });
    await existing.getInfo();        // throws if the window doesn't exist
    await existing.setAsForeground();
    customDockWindow = existing;
    console.log("[customDock] Dock window already open — brought to front.");
    return existing;
  } catch {
    console.debug("[customDock] Dock window not open; creating.");
  }

  const { left, top, width, height } = await resolveCustomDockBounds();
  try {
    customDockWindow = await fin.Window.create({
      name: CUSTOM_DOCK_WINDOW_NAME,
      url,
      defaultLeft: left,
      defaultTop: top,
      defaultWidth: width,
      defaultHeight: height,
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      alwaysOnTop: true,
      autoShow: true,
      showTaskbarIcon: false,
      saveWindowState: false,
      smallWindow: true,
      backgroundThrottling: false,
    });
    // Persist drags + keep the bar on top (Session 10).
    attachCustomDockGeometryListeners(customDockWindow);
    console.log(
      `[customDock] Launched frameless always-on-top dock window at ${url} ` +
        `(${width}×${height} @ ${left},${top}).`,
    );
    return customDockWindow;
  } catch (err) {
    console.error("[customDock] Failed to create dock window.", err);
    return undefined;
  }
}

/**
 * Show or hide the custom dock window. No-op under dock2/dock3 (no custom
 * window exists). On show, re-asserts always-on-top and brings the bar to the
 * foreground. Wired to the "Show/Hide Provider" action so the dock follows the
 * provider window's visibility.
 */
export async function setCustomDockShown(show: boolean): Promise<void> {
  if (!customDockWindow) return;
  try {
    if (show) {
      await customDockWindow.show();
      await reassertCustomDockAlwaysOnTop(customDockWindow);
      await customDockWindow.setAsForeground();
      console.log("[customDock] Dock window shown.");
    } else {
      await customDockWindow.hide();
      console.log("[customDock] Dock window hidden.");
    }
  } catch (err) {
    console.warn(`[customDock] setCustomDockShown(${show}) failed.`, err);
  }
}

/**
 * Flip the platform color scheme from the provider window and broadcast the
 * theme IAB. The custom dock's theme toggle dispatches `ACTION_TOGGLE_THEME`
 * over the channel; that action lands here (not in `dockActionHandlers`) for
 * the same reason dock3 handles it inline — the toggle must run in the
 * provider window, and `setSelectedScheme` must NOT be awaited.
 *
 * `setSelectedScheme` connects to `__of_workspace_protocol__` to persist the
 * choice; that channel hangs in our setup, so awaiting it would block the IAB
 * broadcast (which is what tells the dock + content windows to re-render).
 * The SDK still flips the workspace chrome synchronously before the hang.
 */
async function toggleCustomDockTheme(): Promise<void> {
  try {
    const platform = getCurrentSync();
    const currentScheme = await platform.Theme.getSelectedScheme();
    const newScheme = currentScheme === ColorSchemeOptionType.Light
      ? ColorSchemeOptionType.Dark
      : ColorSchemeOptionType.Light;
    const isDark = newScheme === ColorSchemeOptionType.Dark;
    const themeStr = isDark ? "dark" : "light";
    console.log(`[customDock theme] ${currentScheme} → ${newScheme}`);

    // Fire-and-forget (see doc comment) — do NOT await.
    void platform.Theme.setSelectedScheme(newScheme);

    // Side effects we own: provider-window data-theme (drives our CSS vars),
    // the AG-Grid theme hint, the canonical `starui:theme` storage key, and
    // the IAB broadcast the dock window + content views listen on.
    try { document.documentElement.setAttribute("data-theme", themeStr); } catch { /* */ }
    try { document.body.dataset["agThemeMode"] = themeStr; } catch { /* */ }
    try { localStorage.setItem("starui:theme", themeStr); } catch { /* */ }
    try {
      await fin.InterApplicationBus.publish(IAB_THEME_CHANGED, { theme: themeStr, isDark });
    } catch (iabErr) {
      console.warn("[customDock theme] IAB publish failed:", iabErr);
    }
  } catch (err) {
    console.error("[customDock theme] toggle failed:", err);
  }
}

/**
 * Create the provider-side OpenFin Channel the dock window dispatches over.
 *
 * The dock window is a separate OpenFin window, so its `<DockBar>` clicks
 * can't call `dockActionHandlers` directly. They `client.dispatch(
 * CUSTOM_DOCK_DISPATCH_ACTION, { actionId, customData })` to this provider,
 * which routes through the same `actionDispatcher` dock2/dock3 use — except
 * `ACTION_TOGGLE_THEME`, handled inline (see `toggleCustomDockTheme`).
 *
 * Idempotent: a second `registerDockCustom` (config refresh) reuses the
 * existing channel rather than recreating it.
 */
async function registerCustomDockChannel(): Promise<void> {
  if (customDockChannel) {
    console.log("[customDock] Action channel already registered.");
    return;
  }
  try {
    const channel = await fin.InterApplicationBus.Channel.create(CHANNEL_CUSTOM_DOCK);
    customDockChannel = channel;
    channel.register(CUSTOM_DOCK_DISPATCH_ACTION, async (payload: any) => {
      const actionId: string | undefined = payload?.actionId;
      const customData = payload?.customData;
      if (!actionId) {
        console.warn("[customDock] dispatch-action called without an actionId.");
        return;
      }
      // Theme toggle runs in THIS (provider) window — the dock window can't
      // flip the platform scheme. Intercept before the generic dispatcher.
      if (actionId === ACTION_TOGGLE_THEME) {
        await toggleCustomDockTheme();
        return;
      }
      if (!actionDispatcher) {
        console.warn(`[customDock] No action dispatcher for: ${actionId}`);
        return;
      }
      await actionDispatcher(actionId, customData);
    });
    // Initial config pull — the provider owns config persistence + scope, so
    // the dock window asks for the current `DockEditorConfig` here rather than
    // reading the store under its own default scope. Live updates arrive via
    // `pushCustomDockConfig` (CUSTOM_DOCK_CONFIG_PUSH).
    channel.register(CUSTOM_DOCK_GET_CONFIG, async () => lastEditorConfig ?? null);

    // Workspace switcher (Phase 3 / S12). The provider owns the workspace-
    // platform context, so the dock window lists / reads-active / applies
    // workspaces through here rather than calling the Storage API itself.
    channel.register(CUSTOM_DOCK_LIST_WORKSPACES, async () => listCustomDockWorkspaces());
    channel.register(CUSTOM_DOCK_GET_ACTIVE_WORKSPACE, async () =>
      getCustomDockActiveWorkspaceId(),
    );
    channel.register(CUSTOM_DOCK_APPLY_WORKSPACE, async (payload: any) =>
      applyCustomDockWorkspace(payload?.id, payload?.skipPrompt),
    );
    channel.register(CUSTOM_DOCK_SAVE_WORKSPACE_AS, async (payload: any) =>
      saveCustomDockWorkspaceAs(payload?.title),
    );
    channel.register(CUSTOM_DOCK_RESTORE_LAST_SAVED, async (payload: any) =>
      restoreCustomDockLastSaved(payload?.skipPrompt),
    );
    channel.register(CUSTOM_DOCK_SAVE_WORKSPACE, async () => saveCustomDockWorkspace());
    channel.register(CUSTOM_DOCK_RENAME_WORKSPACE, async (payload: any) =>
      renameCustomDockWorkspace(payload?.id, payload?.title),
    );
    channel.register(CUSTOM_DOCK_DELETE_WORKSPACE, async (payload: any) =>
      deleteCustomDockWorkspace(payload?.id),
    );
    // Notifications (Phase 4 / S16) — the provider owns the notifications client.
    channel.register(CUSTOM_DOCK_GET_NOTIF_COUNT, async () => getCustomDockNotifCount());
    channel.register(CUSTOM_DOCK_TOGGLE_NOTIF_CENTER, async () =>
      toggleCustomDockNotificationCenter(),
    );
    // App-switcher (Phase 5 / S19) — the provider owns fin.System + the scope.
    channel.register(CUSTOM_DOCK_LIST_RUNNING_APPS, async () => listCustomDockRunningApps());
    channel.register(CUSTOM_DOCK_GET_ACTIVE_APP, async () => getCustomDockActiveAppId());
    channel.register(CUSTOM_DOCK_SWITCH_APP, async (payload: any) =>
      switchCustomDockApp(payload?.id),
    );
    console.log(`[customDock] Action-dispatch channel '${CHANNEL_CUSTOM_DOCK}' registered.`);
  } catch (err) {
    console.error("[customDock] Failed to register the action-dispatch channel.", err);
  }
}

/**
 * Push the current `DockEditorConfig` to the connected dock window(s) over the
 * channel. Wired as `subscribeDockIab`'s `applyFn` for the custom path, so it
 * fires after the editor saves (`IAB_DOCK_CONFIG_UPDATE` — which already
 * refreshed `lastEditorConfig`) or a config import (`IAB_RELOAD_AFTER_IMPORT`
 * — which reloaded it from the store). No-op when no dock window is connected.
 */
async function pushCustomDockConfig(): Promise<void> {
  if (!customDockChannel) return;
  try {
    await customDockChannel.publish(CUSTOM_DOCK_CONFIG_PUSH, lastEditorConfig ?? null);
    console.log("[customDock] Pushed live config to dock window.");
  } catch (err) {
    console.warn("[customDock] Config push failed.", err);
  }
}

// ─── Workspace switcher (Phase 3 / S12) ──────────────────────────────
// The custom dock replaces dock2/dock3's native `switchWorkspace` component
// with its own themed dropdown. These provider-side helpers back the channel
// handlers above, talking to the workspace-platform Storage API the same way
// the native component would. The dock window's `WorkspaceController` is a thin
// channel client over them.

/** List saved workspaces as `{ id, title }` (Storage metadata only). */
async function listCustomDockWorkspaces(): Promise<{ id: string; title: string }[]> {
  try {
    const platform = getCurrentSync();
    const metadata = await platform.Storage.getWorkspacesMetadata();
    return metadata.map((w) => ({ id: w.workspaceId, title: w.title }));
  } catch (err) {
    console.warn("[customDock] listWorkspaces failed.", err);
    return [];
  }
}

/**
 * The active workspace id, or `null` when nothing saved is active. Reads
 * `getCurrentWorkspace({ skipSnapshotUpdate: true })` (the active pointer, no
 * snapshot recompute); the `UNTITLED_WORKSPACE_ID` sentinel maps to `null`
 * (the switcher reducer normalizes it too).
 */
async function getCustomDockActiveWorkspaceId(): Promise<string | null> {
  try {
    const platform = getCurrentSync();
    const current = await platform.getCurrentWorkspace({ skipSnapshotUpdate: true });
    const id = current?.workspaceId ?? null;
    return id && id !== UNTITLED_WORKSPACE_ID ? id : null;
  } catch (err) {
    console.warn("[customDock] getActiveWorkspaceId failed.", err);
    return null;
  }
}

/**
 * Apply (switch to) a saved workspace by id, then push
 * `CUSTOM_DOCK_WORKSPACE_CHANGED` so the switcher moves its checkmark. The dock
 * window passes `skipPrompt: true` to bypass the platform's confirmation dialog
 * (parity with our existing `applyWorkspace({ skipPrompt })` override).
 */
async function applyCustomDockWorkspace(id?: string, skipPrompt = true): Promise<void> {
  if (!id) {
    console.warn("[customDock] applyWorkspace called without an id.");
    return;
  }
  try {
    const platform = getCurrentSync();
    const workspace = await platform.Storage.getWorkspace(id);
    if (!workspace) {
      console.warn(`[customDock] applyWorkspace: no workspace '${id}'.`);
      return;
    }
    await platform.applyWorkspace(workspace, { skipPrompt });
  } catch (err) {
    console.warn(`[customDock] applyWorkspace('${id}') failed.`, err);
  } finally {
    await publishCustomDockWorkspaceChanged();
  }
}

/**
 * Tell the connected dock window(s) the saved list / active workspace may have
 * changed (switch, save/delete, or the empty-desktop reset in `workspace.ts`).
 * The dock window re-reads both. No-op when no dock window is connected.
 */
export async function publishCustomDockWorkspaceChanged(): Promise<void> {
  if (!customDockChannel) return;
  try {
    await customDockChannel.publish(CUSTOM_DOCK_WORKSPACE_CHANGED, {});
  } catch (err) {
    console.warn("[customDock] Workspace-changed push failed.", err);
  }
}

/** Fresh workspace id (GUID where available; collision-resistant fallback). */
function newCustomDockWorkspaceId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch { /* fall through */ }
  return `ws-${Date.now()}-${Math.round(Math.random() * 1e9).toString(36)}`;
}

/**
 * Save the current desktop as a NEW saved workspace (Phase 3 / S13). Captures
 * the live snapshot via `getCurrentWorkspace()`, persists it under a fresh id +
 * the user's title through `Storage.createWorkspace` (the ConfigService-backed
 * override), marks it active so the switcher checks it, then pushes a change.
 */
async function saveCustomDockWorkspaceAs(title?: string): Promise<void> {
  const name = (title ?? "").trim();
  if (!name) {
    console.warn("[customDock] saveWorkspaceAs called without a title.");
    return;
  }
  try {
    const platform = getCurrentSync();
    const current = await platform.getCurrentWorkspace();
    const workspace = {
      workspaceId: newCustomDockWorkspaceId(),
      title: name,
      snapshot: current.snapshot,
      metadata: current.metadata,
    } as any;
    await platform.Storage.createWorkspace({ workspace });
    await platform.setActiveWorkspace(workspace);
  } catch (err) {
    console.warn(`[customDock] saveWorkspaceAs('${name}') failed.`, err);
  } finally {
    await publishCustomDockWorkspaceChanged();
  }
}

/**
 * Re-apply the last saved version of the current workspace (Phase 3 / S13),
 * skipping the platform's confirmation prompt, then push a change so the
 * switcher refreshes. Logs the platform's outcome
 * ('success' | 'not-saved-workspace' | 'user-declined').
 */
async function restoreCustomDockLastSaved(skipPrompt = true): Promise<void> {
  try {
    const platform = getCurrentSync();
    const result = await platform.restoreLastSavedWorkspace({ skipPrompt });
    console.log(`[customDock] restoreLastSavedWorkspace → ${result}`);
  } catch (err) {
    console.warn("[customDock] restoreLastSavedWorkspace failed.", err);
  } finally {
    await publishCustomDockWorkspaceChanged();
  }
}

/**
 * Save (update) the active saved workspace from the current desktop — parity
 * with the native `SaveWorkspace` menu action. `Storage.saveWorkspace` upserts
 * by `workspaceId`; no-op when nothing saved is active (untitled), since that
 * would create a stray "Untitled" workspace (use Save-As for that).
 */
async function saveCustomDockWorkspace(): Promise<void> {
  try {
    const platform = getCurrentSync();
    const current = await platform.getCurrentWorkspace();
    if (!current?.workspaceId || current.workspaceId === UNTITLED_WORKSPACE_ID) {
      console.warn("[customDock] saveWorkspace: no active saved workspace (use Save-As).");
      return;
    }
    await platform.Storage.saveWorkspace(current);
  } catch (err) {
    console.warn("[customDock] saveWorkspace failed.", err);
  } finally {
    await publishCustomDockWorkspaceChanged();
  }
}

/** Rename a saved workspace (parity with the native `RenameWorkspace` action). */
async function renameCustomDockWorkspace(id?: string, title?: string): Promise<void> {
  const name = (title ?? "").trim();
  if (!id || !name) {
    console.warn("[customDock] renameWorkspace: missing id/title.");
    return;
  }
  try {
    const platform = getCurrentSync();
    const workspace = await platform.Storage.getWorkspace(id);
    if (!workspace) {
      console.warn(`[customDock] renameWorkspace: no workspace '${id}'.`);
      return;
    }
    await platform.Storage.updateWorkspace({
      workspaceId: id,
      workspace: { ...workspace, title: name },
    } as any);
  } catch (err) {
    console.warn(`[customDock] renameWorkspace('${id}') failed.`, err);
  } finally {
    await publishCustomDockWorkspaceChanged();
  }
}

/** Delete a saved workspace (parity with the native `DeleteWorkspace` action). */
async function deleteCustomDockWorkspace(id?: string): Promise<void> {
  if (!id) {
    console.warn("[customDock] deleteWorkspace: missing id.");
    return;
  }
  try {
    const platform = getCurrentSync();
    await platform.Storage.deleteWorkspace(id);
  } catch (err) {
    console.warn(`[customDock] deleteWorkspace('${id}') failed.`, err);
  } finally {
    await publishCustomDockWorkspaceChanged();
  }
}

// ─── Notifications (Phase 4 / S16) ───────────────────────────────────
// The custom dock's bell + unread badge. The provider owns the
// `@openfin/notifications` client, so the dock window pulls the count / toggles
// the center over the channel, and the provider pushes count changes.

/** Current notification-center count (0 on any error / before the service is up). */
async function getCustomDockNotifCount(): Promise<number> {
  try {
    return await Notifications.getNotificationsCount();
  } catch (err) {
    console.warn("[customDock] getNotificationsCount failed.", err);
    return 0;
  }
}

/** Toggle the notification center open/closed. */
async function toggleCustomDockNotificationCenter(): Promise<void> {
  try {
    await Notifications.toggleNotificationCenter();
  } catch (err) {
    console.warn("[customDock] toggleNotificationCenter failed.", err);
  }
}

/** Push a new count to the connected dock window(s). No-op when none connected. */
async function publishCustomDockNotifCount(count: number): Promise<void> {
  if (!customDockChannel) return;
  try {
    await customDockChannel.publish(CUSTOM_DOCK_NOTIF_COUNT_CHANGED, { count });
  } catch (err) {
    console.warn("[customDock] Notif-count push failed.", err);
  }
}

/**
 * Subscribe to `notifications-count-changed` and push each new count to the dock
 * window. Best-effort + idempotent; the listener is torn down in
 * `shutdownDockCustom`. Stored so `removeEventListener` gets the same reference.
 */
function attachCustomDockNotifListener(): void {
  if (customDockNotifListener) return;
  try {
    customDockNotifListener = (evt: { count?: number }) => {
      void publishCustomDockNotifCount(typeof evt?.count === "number" ? evt.count : 0);
    };
    void Notifications.addEventListener("notifications-count-changed", customDockNotifListener);
  } catch (err) {
    console.warn("[customDock] Could not attach notifications-count listener.", err);
    customDockNotifListener = undefined;
  }
}

/** Remove the count listener (teardown). */
function detachCustomDockNotifListener(): void {
  if (!customDockNotifListener) return;
  try {
    void Notifications.removeEventListener("notifications-count-changed", customDockNotifListener);
  } catch { /* best-effort */ }
  customDockNotifListener = undefined;
}

// ─── App switcher (Phase 5 / S19) ────────────────────────────────────
// The custom dock's per-app config switcher. "Running apps" = the configured
// apps (`storedApps`) that are currently running, derived from
// `fin.System.getAllApplications()` (best-effort — apps launched as platform
// views/snapshots aren't separate applications, so detection may need refining
// at runtime). "Switch to app" swaps the **platform default config scope**
// (`setPlatformDefaultScope`) to that appId and reloads the bar from that
// scope's `DockEditorConfig` — note this is platform-wide by design (per-app
// config), so other scoped config (registry, profiles) follows too.

/** Running configured apps as `{ id, title }` (active scope app always included). */
async function listCustomDockRunningApps(): Promise<{ id: string; title: string }[]> {
  try {
    const configured = storedApps ?? [];
    if (configured.length === 0) return [];
    const running = new Set<string>();
    try {
      const apps = await fin.System.getAllApplications();
      for (const a of apps ?? []) if (a?.uuid) running.add(a.uuid);
    } catch (err) {
      console.debug("[customDock] getAllApplications failed (app-switcher).", err);
    }
    const activeAppId = getPlatformDefaultScope().appId;
    return configured
      .filter((app) => running.has(app.appId) || app.appId === activeAppId)
      .map((app) => ({ id: app.appId, title: app.title ?? app.appId }));
  } catch (err) {
    console.warn("[customDock] listRunningApps failed.", err);
    return [];
  }
}

/** The active app id — the app whose config scope the dock currently shows. */
async function getCustomDockActiveAppId(): Promise<string | null> {
  try {
    return getPlatformDefaultScope().appId ?? null;
  } catch {
    return null;
  }
}

/**
 * Switch the dock to an app: swap the platform default config scope to `appId`
 * and reload the bar from that scope's `DockEditorConfig`, then push so the
 * switcher's active marker + the bar update. Platform-wide scope swap by design.
 */
async function switchCustomDockApp(appId?: string): Promise<void> {
  if (!appId) {
    console.warn("[customDock] switchToApp: missing id.");
    return;
  }
  try {
    setPlatformDefaultScope({ appId, userId: getPlatformDefaultScope().userId });
    const saved = await loadDockConfig();
    lastEditorConfig =
      saved ?? appsToEditorConfig(storedApps ?? [], storedPlatformSettings?.icon ?? "");
    await pushCustomDockConfig();
  } catch (err) {
    console.warn(`[customDock] switchToApp('${appId}') failed.`, err);
  } finally {
    await publishCustomDockRunningAppsChanged();
  }
}

/** Push "running-app list / active app may have changed" to the dock window. */
async function publishCustomDockRunningAppsChanged(): Promise<void> {
  if (!customDockChannel) return;
  try {
    await customDockChannel.publish(CUSTOM_DOCK_RUNNING_APPS_CHANGED, {});
  } catch (err) {
    console.warn("[customDock] Running-apps push failed.", err);
  }
}

/**
 * Wire `fin.System` running-app events to push the switcher refresh. Best-effort
 * + idempotent; listeners stored for teardown. Debounced so a burst of
 * window-created/closed events coalesces into one push.
 */
function attachCustomDockAppListeners(): void {
  if (customDockAppListeners.length > 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void publishCustomDockRunningAppsChanged(); }, 250);
  };
  const events = ["application-started", "application-closed", "window-created", "window-closed"];
  for (const event of events) {
    try {
      fin.System.addListener(event, fire);
      customDockAppListeners.push({ event, handler: fire });
    } catch (err) {
      console.debug(`[customDock] Could not wire fin.System '${event}'.`, err);
    }
  }
}

/** Remove the running-app event listeners (teardown). */
function detachCustomDockAppListeners(): void {
  for (const { event, handler } of customDockAppListeners) {
    try { fin.System.removeListener(event, handler); } catch { /* best-effort */ }
  }
  customDockAppListeners = [];
}

/**
 * Register the custom dock — caches the shared settings/state (so the
 * shared lifecycle functions can read them), opens the provider↔dock
 * action-dispatch channel, then launches the frameless `/dock` window
 * (whose `OpenFinDockController` connects to the channel as a client).
 */
async function registerDockCustom(
  platformSettings: PlatformSettings,
  apps?: App[],
  dockIcon?: string,
  darkIcon?: string,
  lightIcon?: string,
  onAction?: (actionId: string, customData?: any) => Promise<void>,
): Promise<any> {
  console.log("Registering the custom dock.");
  storedPlatformSettings = platformSettings;
  storedApps = apps;
  storedIcon = dockIcon ?? platformSettings.icon;
  themeToggleDarkIcon = darkIcon ?? DEFAULT_DARK_THEME_ICON;
  themeToggleLightIcon = lightIcon ?? DEFAULT_LIGHT_THEME_ICON;
  actionDispatcher = onAction;

  if (!lastEditorConfig) {
    const saved = await loadDockConfig();
    lastEditorConfig = saved ?? appsToEditorConfig(apps ?? [], platformSettings.icon);
  }

  // Open the action channel BEFORE the window so the dock window's client
  // `connect()` resolves immediately rather than waiting/retrying.
  await registerCustomDockChannel();
  // Live config loop (Phase 2): the shared dock IAB handlers refresh
  // `lastEditorConfig` on editor-save / import; `pushCustomDockConfig` then
  // ships it to the dock window over the channel. Reuses the exact handlers
  // dock2 uses — the existing dock editor drives the custom dock unchanged.
  subscribeDockIab(pushCustomDockConfig);
  // Bell badge (S16): push notification-count changes to the dock window.
  attachCustomDockNotifListener();
  // App-switcher (S19): push running-app changes to the dock window.
  attachCustomDockAppListeners();
  return launchCustomDockWindow();
}

/** Close the custom dock window + tear down the action channel. */
async function shutdownDockCustom(): Promise<void> {
  if (customDockBoundsSaveTimer) {
    clearTimeout(customDockBoundsSaveTimer);
    customDockBoundsSaveTimer = undefined;
  }
  detachCustomDockNotifListener();
  detachCustomDockAppListeners();
  if (customDockChannel) {
    try {
      await customDockChannel.destroy();
      console.log("[customDock] Action channel destroyed.");
    } catch (err) {
      console.error("[customDock] Error destroying action channel.", err);
    }
  }
  customDockChannel = undefined;
  if (customDockWindow) {
    try {
      await customDockWindow.close();
      console.log("[customDock] Dock window closed.");
    } catch (err) {
      console.error("[customDock] Error closing dock window.", err);
    }
  }
  customDockWindow = undefined;
  customDockLaunch = undefined;
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
  dockVersionArg?: "dock2" | "dock3" | "custom",
): Promise<any> {
  dockVersion = dockVersionArg ?? dockVersion;

  // custom (frameless, always-on-top React window we render ourselves)
  // path — fully self-contained so the dock2/dock3 bodies stay untouched.
  // See registerDockCustom. Phase 0/S1 ships a no-op stub; S2 launches the
  // window, S3 wires the action-dispatch channel.
  if (dockVersion === "custom") {
    return registerDockCustom(platformSettings, apps, dockIcon, darkIcon, lightIcon, onAction);
  }

  // dock2 (classic Dock.register) path — fully self-contained so the
  // dock3 body below stays untouched. See registerDockClassic.
  if (dockVersion === "dock2") {
    return registerDockClassic(platformSettings, apps, dockIcon, darkIcon, lightIcon, onAction);
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
  const contentMenu = flattenContentMenuForV22(buildContentMenuEntries(lastEditorConfig), theme);

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
 *
 * Soft path only: re-flattens icons for the current theme and pushes
 * via `dockProvider.updateConfig()`. State-preserving — open menus,
 * highlighted items, drag positions all survive the toggle. The dock
 * chrome theme propagation is handled by the workspace platform's
 * own scheme dispatch when running on a properly-configured runtime.
 */
export async function recolorDockIcons(isDark: boolean): Promise<void> {
  console.log(`Recoloring dock icons for ${isDark ? "dark" : "light"} theme.`);
  await applyDockConfig();
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
  // Classic dock has no two-window content-menu chrome to re-bootstrap —
  // updateDockProviderConfig refreshes the bar in place. No hard reload.
  if (dockVersion === "dock2") {
    await applyDockClassicConfig();
    console.log("Classic dock reloaded from config.");
    return;
  }
  // The custom dock has no two-window content-menu chrome to re-bootstrap —
  // `lastEditorConfig` was just reloaded from the store above; ship it to the
  // dock window over the channel and it re-renders <DockBar config=…>.
  if (dockVersion === "custom") {
    await pushCustomDockConfig();
    console.log("[customDock] Reloaded dock from config (pushed to window).");
    return;
  }
  // For the user-initiated "Reload Dock" action we want a guaranteed
  // visual refresh — the soft `updateConfig()` path (used for IAB
  // background updates) sometimes propagates config without re-rendering
  // favorites/content-menu in v22.
  //
  // The supported v22 API for forcing a full Dock3 re-bootstrap is
  // `dockProvider.shutdown()` + a fresh `Dock.init()` (NOT a window URL
  // reload — that desynchronises the IAB channel client from the
  // provider and produces "client disconnected from target provider"
  // on subsequent clicks).
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
  if (!dockProvider || !storedPlatformSettings) {
    console.warn("[hardReloadDock] Provider not initialised — using soft updateConfig.");
    await applyDock3Config();
    return;
  }

  // Snapshot every cached setting before resetDockState() wipes them.
  const snapshot = {
    settings: storedPlatformSettings,
    icon: storedIcon,
    darkIcon: themeToggleDarkIcon,
    lightIcon: themeToggleLightIcon,
    dispatcher: actionDispatcher,
  };

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
            const menu = flattenContentMenuForV22(buildContentMenuEntries(saved), theme);
            this['config'] = {
              ...this['config'],
              favorites: favs as any[],
              contentMenu: menu as any[],
            };
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
            try { document.documentElement.setAttribute("data-theme", themeStr); } catch { /* */ }
            try { document.body.dataset["agThemeMode"] = themeStr; } catch { /* */ }
            try { localStorage.setItem("starui:theme", themeStr); } catch { /* */ }
            await applyDock3Config();
            console.log(`[Dock3 theme] About to publish IAB '${IAB_THEME_CHANGED}' with { theme: '${themeStr}', isDark: ${isDark} } from uuid='${fin.me?.identity?.uuid}'.`);
            try {
              await fin.InterApplicationBus.publish(IAB_THEME_CHANGED, { theme: themeStr, isDark });
              console.log("[Dock3 theme] IAB publish resolved.");
            } catch (iabErr) {
              console.warn("[Dock3 theme] IAB publish failed:", iabErr);
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

  if (dockVersion === "dock2") {
    await shutdownDockClassic();
  } else if (dockVersion === "custom") {
    await shutdownDockCustom();
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
  dockProvider = undefined;
  classicReg = undefined;
  customDockWindow = undefined;
  customDockLaunch = undefined;
  customDockChannel = undefined;
  customDockNotifListener = undefined;
  customDockAppListeners = [];
  storedApps = undefined;
  if (customDockBoundsSaveTimer) {
    clearTimeout(customDockBoundsSaveTimer);
    customDockBoundsSaveTimer = undefined;
  }
  storedPlatformSettings = undefined;
  storedIcon = undefined;
  lastEditorConfig = undefined;
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

  const theme = readDockTheme();
  const favorites = flattenFavoritesForV22(buildAllFavorites(lastEditorConfig), theme);
  const contentMenu = flattenContentMenuForV22(buildContentMenuEntries(lastEditorConfig), theme);

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
