import { DockButtonNames, type DockButton } from "@openfin/workspace";

// ─── Serializable types (safe for IndexedDB / JSON) ─────────────────

export interface DockActionButtonConfig {
  type: "ActionButton";
  id: string;
  tooltip: string;
  iconUrl: string;
  /** Iconify icon ID (e.g. "lucide:file-text"). Stored so we can regenerate iconUrl for any theme. */
  iconId?: string;
  /**
   * User-chosen icon color (hex, e.g. "#0A76D3").
   * When set, the icon keeps this color regardless of dark/light theme.
   * When not set, the icon is recolored to match the current theme.
   */
  iconColor?: string;
  actionId: string;
  customData?: unknown;
}

export interface DockMenuItemConfig {
  id: string;
  tooltip: string;
  iconUrl?: string;
  /** Iconify icon ID (e.g. "lucide:file-text"). Stored so we can regenerate iconUrl for any theme. */
  iconId?: string;
  /**
   * User-chosen icon color (hex, e.g. "#0A76D3").
   * When set, the icon keeps this color regardless of dark/light theme.
   * When not set, the icon is recolored to match the current theme.
   */
  iconColor?: string;
  actionId?: string;
  customData?: unknown;
  /** Nested sub-menu items */
  options?: DockMenuItemConfig[];
}

export interface DockDropdownButtonConfig {
  type: "DropdownButton";
  id: string;
  tooltip: string;
  iconUrl: string;
  /** Iconify icon ID (e.g. "lucide:file-text"). Stored so we can regenerate iconUrl for any theme. */
  iconId?: string;
  /**
   * User-chosen icon color (hex, e.g. "#0A76D3").
   * When set, the icon keeps this color regardless of dark/light theme.
   * When not set, the icon is recolored to match the current theme.
   */
  iconColor?: string;
  options: DockMenuItemConfig[];
}

export type DockButtonConfig = DockActionButtonConfig | DockDropdownButtonConfig;

export interface DockEditorConfig {
  version: 1;
  buttons: DockButtonConfig[];
  updatedAt: string;
}

// ─── Dock3 entry types ────────────────────────────────────────────
// These match the shapes from @openfin/workspace-platform's Dock3 API.
// We define them here to avoid coupling the rest of the codebase to the
// OpenFin package types directly.

export type DockEntryIcon = string | { dark: string; light: string };

export interface Dock3ItemEntry {
  type: "item";
  id: string;
  label: string;
  icon: DockEntryIcon;
  itemData?: any;
}

export interface Dock3FolderEntry {
  type: "folder";
  id: string;
  label: string;
  icon?: DockEntryIcon;
  children: Dock3Entry[];
}

export type Dock3Entry = Dock3ItemEntry | Dock3FolderEntry;

// ─── ContentMenuEntry types (for dropdown menus) ──────────────────

export interface ContentMenuItemEntry {
  type: "item";
  id: string;
  label: string;
  icon: DockEntryIcon;
  itemData: any;
  bookmarked?: boolean;
}

export interface ContentMenuFolderEntry {
  type: "folder";
  id: string;
  label: string;
  /** Theme-aware icon — injected into the dock companion UI (OpenFin folder rows omit icons natively). */
  icon?: DockEntryIcon;
  children: ContentMenuEntryType[];
  bookmarked?: boolean;
}

export type ContentMenuEntryType = ContentMenuItemEntry | ContentMenuFolderEntry;

// ─── Converter: serializable config → legacy Dock.register buttons ──

function resolveIconUrlForTheme(
  icon: DockEntryIcon,
  theme: "dark" | "light",
): string {
  if (typeof icon === "string") return icon;
  return icon[theme] ?? icon.dark ?? icon.light ?? "";
}

function menuItemToLegacyDockOption(
  item: DockMenuItemConfig,
  generateIcon: (iconId: string, color: string) => string,
  recolorUrl: (url: string, color: string) => string,
  darkColor: string,
  lightColor: string,
  theme: "dark" | "light",
): DockButton {
  const icon = makeDualIcon(item, generateIcon, recolorUrl, darkColor, lightColor);
  const iconUrl = resolveIconUrlForTheme(icon, theme);

  if (item.options && item.options.length > 0) {
    return {
      type: DockButtonNames.DropdownButton,
      id: item.id,
      tooltip: item.tooltip,
      iconUrl,
      options: item.options.map((child) =>
        menuItemToLegacyDockOption(child, generateIcon, recolorUrl, darkColor, lightColor, theme),
      ),
    };
  }

  return {
    id: item.id,
    tooltip: item.tooltip,
    iconUrl,
    action: {
      id: item.actionId ?? item.id,
      customData: item.customData,
    },
  };
}

/** Bar action buttons only (Dock3 "favorites" equivalent). */
export function toLegacyDockActionButtons(
  config: DockEditorConfig,
  generateIcon: (iconId: string, color: string) => string,
  recolorUrl: (url: string, color: string) => string,
  darkColor: string,
  lightColor: string,
  theme: "dark" | "light",
): DockButton[] {
  return config.buttons
    .filter((btn): btn is DockActionButtonConfig => btn.type === "ActionButton")
    .map((btn) => {
      const icon = makeDualIcon(btn, generateIcon, recolorUrl, darkColor, lightColor);
      return {
        id: btn.id,
        tooltip: btn.tooltip,
        iconUrl: resolveIconUrlForTheme(icon, theme),
        action: {
          id: btn.actionId,
          customData: btn.customData,
        },
      };
    });
}

function contentMenuEntryToLegacyOption(
  entry: ContentMenuEntryType,
  generateIcon: (iconId: string, color: string) => string,
  recolorUrl: (url: string, color: string) => string,
  darkColor: string,
  lightColor: string,
  theme: "dark" | "light",
): DockButton {
  if (entry.type === "folder") {
    const iconUrl = entry.icon
      ? resolveIconUrlForTheme(entry.icon, theme)
      : undefined;
    return {
      type: DockButtonNames.DropdownButton,
      id: entry.id,
      tooltip: entry.label,
      ...(iconUrl ? { iconUrl } : {}),
      options: entry.children.map((child) =>
        contentMenuEntryToLegacyOption(child, generateIcon, recolorUrl, darkColor, lightColor, theme),
      ),
    };
  }

  const iconUrl = resolveIconUrlForTheme(entry.icon, theme);
  const actionId = entry.itemData?.actionId ?? entry.id;
  return {
    id: entry.id,
    tooltip: entry.label,
    iconUrl,
    action: {
      id: actionId,
      customData: entry.itemData,
    },
  };
}

/**
 * Convert Dock3 content-menu folders (e.g. SPG) to legacy bar dropdowns.
 * Uses the same tree as `toDock3UserContentMenu()` so dock3/legacy stay aligned.
 */
export function contentMenuFoldersToLegacyDropdowns(
  entries: ContentMenuEntryType[],
  generateIcon: (iconId: string, color: string) => string,
  recolorUrl: (url: string, color: string) => string,
  darkColor: string,
  lightColor: string,
  theme: "dark" | "light",
): DockButton[] {
  return entries
    .filter((entry): entry is ContentMenuFolderEntry => entry.type === "folder")
    .map((folder) =>
      contentMenuEntryToLegacyOption(
        folder,
        generateIcon,
        recolorUrl,
        darkColor,
        lightColor,
        theme,
      ) as DockButton,
    );
}

/** @deprecated Use toLegacyDockActionButtons + contentMenuFoldersToLegacyDropdowns */
export function toLegacyDockButtons(
  config: DockEditorConfig,
  generateIcon: (iconId: string, color: string) => string,
  recolorUrl: (url: string, color: string) => string,
  darkColor: string,
  lightColor: string,
  theme: "dark" | "light",
): DockButton[] {
  const folders: ContentMenuFolderEntry[] = config.buttons
    .filter((btn): btn is DockDropdownButtonConfig => btn.type === "DropdownButton")
    .map((btn) => {
      const icon = makeDualIcon(btn, generateIcon, recolorUrl, darkColor, lightColor);
      return {
        type: "folder" as const,
        id: btn.id,
        label: btn.tooltip,
        icon,
        children: btn.options.map((item) =>
          menuItemToContentMenuEntry(item, generateIcon, recolorUrl, darkColor, lightColor),
        ),
      };
    });
  return [
    ...toLegacyDockActionButtons(config, generateIcon, recolorUrl, darkColor, lightColor, theme),
    ...contentMenuFoldersToLegacyDropdowns(
      folders,
      generateIcon,
      recolorUrl,
      darkColor,
      lightColor,
      theme,
    ),
  ];
}

// ─── Converter: serializable config → Dock3 DockEntry[] ─────────────

/**
 * Generate a dual-theme icon object for a button config.
 * If the button has a fixed iconColor, both dark and light use that color.
 * Otherwise, generates separate URLs for dark and light themes.
 */
function makeDualIcon(
  btn: { iconUrl?: string; iconId?: string; iconColor?: string },
  generateIcon: (iconId: string, color: string) => string,
  recolorUrl: (url: string, color: string) => string,
  darkColor: string,
  lightColor: string,
): DockEntryIcon {
  if (btn.iconColor) {
    // User chose a fixed color — same URL for both themes
    const url = btn.iconId
      ? generateIcon(btn.iconId, btn.iconColor)
      : btn.iconUrl ?? "";
    return url;
  }

  if (btn.iconId) {
    return {
      dark: generateIcon(btn.iconId, darkColor),
      light: generateIcon(btn.iconId, lightColor),
    };
  }

  if (btn.iconUrl) {
    const darkUrl = recolorUrl(btn.iconUrl, darkColor);
    const lightUrl = recolorUrl(btn.iconUrl, lightColor);
    return darkUrl === lightUrl ? darkUrl : { dark: darkUrl, light: lightUrl };
  }

  return "";
}

/**
 * Convert ActionButtons from a DockEditorConfig into Dock3 favorites.
 * DropdownButtons are NOT included here — they go into contentMenu via
 * `toDock3UserContentMenu()`.
 */
export function toDock3Favorites(
  config: DockEditorConfig,
  generateIcon: (iconId: string, color: string) => string,
  recolorUrl: (url: string, color: string) => string,
  darkColor: string,
  lightColor: string,
): Dock3Entry[] {
  return config.buttons
    .filter((btn): btn is DockActionButtonConfig => btn.type === "ActionButton")
    .map((btn): Dock3Entry => {
      const icon = makeDualIcon(btn, generateIcon, recolorUrl, darkColor, lightColor);
      return {
        type: "item",
        id: btn.id,
        label: btn.tooltip,
        icon,
        itemData: {
          actionId: btn.actionId,
          customData: btn.customData,
        },
      };
    });
}

/**
 * Convert a single DockMenuItemConfig (which can have nested children)
 * into a ContentMenuEntry. Handles arbitrary nesting depth.
 */
function menuItemToContentMenuEntry(
  item: DockMenuItemConfig,
  generateIcon: (iconId: string, color: string) => string,
  recolorUrl: (url: string, color: string) => string,
  darkColor: string,
  lightColor: string,
): ContentMenuEntryType {
  const icon = makeDualIcon(item, generateIcon, recolorUrl, darkColor, lightColor);

  // If this item has nested children, it's a folder
  if (item.options && item.options.length > 0) {
    return {
      type: "folder",
      id: item.id,
      label: item.tooltip,
      icon,
      children: item.options.map((child) =>
        menuItemToContentMenuEntry(child, generateIcon, recolorUrl, darkColor, lightColor),
      ),
    };
  }

  // Leaf item
  return {
    type: "item",
    id: item.id,
    label: item.tooltip,
    icon: icon || "",
    itemData: {
      actionId: item.actionId,
      customData: item.customData,
    },
  };
}

/**
 * Convert DropdownButtons from a DockEditorConfig into Dock3 ContentMenuEntry[].
 * Each DropdownButton becomes a "folder" with its menu items as children.
 * Each ActionButton is skipped (those go into favorites).
 */
export function toDock3UserContentMenu(
  config: DockEditorConfig,
  generateIcon: (iconId: string, color: string) => string,
  recolorUrl: (url: string, color: string) => string,
  darkColor: string,
  lightColor: string,
): ContentMenuEntryType[] {
  return config.buttons
    .filter((btn): btn is DockDropdownButtonConfig => btn.type === "DropdownButton")
    .map((btn): ContentMenuEntryType => {
      const children = btn.options.map((item) =>
        menuItemToContentMenuEntry(item, generateIcon, recolorUrl, darkColor, lightColor),
      );
      const icon = makeDualIcon(btn, generateIcon, recolorUrl, darkColor, lightColor);
      return {
        type: "folder",
        id: btn.id,
        label: btn.tooltip,
        icon,
        children,
      };
    });
}

/**
 * Convert the current manifest-based apps into a DockEditorConfig
 * so the editor can show them as the "default" state.
 *
 * In Dock3, ActionButtons appear directly on the dock bar (as favorites),
 * while DropdownButtons appear in the content menu dropdown.
 *
 * - ≤6 apps → individual ActionButtons (visible on dock bar)
 * - >6 apps → single DropdownButton "Apps" (in content menu to avoid overcrowding)
 */
const MAX_DOCK_BAR_APPS = 6;

export function appsToEditorConfig(
  apps: { appId: string; title: string; icons?: { src: string }[]; manifest?: string }[],
  fallbackIcon: string,
): DockEditorConfig {
  if (apps.length <= MAX_DOCK_BAR_APPS) {
    // Few apps — show each as a direct dock bar button
    const buttons: DockButtonConfig[] = apps.map((app) => ({
      type: "ActionButton" as const,
      id: `app-${app.appId}`,
      tooltip: app.title,
      iconUrl: app.icons?.length ? app.icons[0].src : fallbackIcon,
      actionId: "launch-app",
      customData: app,
    }));

    return {
      version: 1,
      buttons,
      updatedAt: new Date().toISOString(),
    };
  }

  // Many apps — group into a dropdown (appears in content menu)
  const options: DockMenuItemConfig[] = apps.map((app) => ({
    id: `app-${app.appId}`,
    tooltip: app.title,
    iconUrl: app.icons?.length ? app.icons[0].src : fallbackIcon,
    actionId: "launch-app",
    customData: app,
  }));

  return {
    version: 1,
    buttons: [
      {
        type: "DropdownButton",
        id: "apps",
        tooltip: "Apps",
        iconUrl: fallbackIcon,
        options,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}
