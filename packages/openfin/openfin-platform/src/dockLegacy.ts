/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;
import {
  Dock,
  DockButtonNames,
  type DockButton,
  type DockProviderRegistration,
  type WorkspaceButtonsConfig,
} from "@openfin/workspace";
import {
  isStarUIPaletteName,
  STARUI_PALETTE_NAMES,
  type StarUIPaletteName,
} from "@starui/design-system";
import {
  CODE_SVG,
  DOWNLOAD_SVG,
  EYE_SVG,
  REFRESH_SVG,
  SETTINGS_SVG,
  TOOLS_SVG,
  UPLOAD_SVG,
  svgToDataUrl,
} from "./icons/allIcons.js";
import {
  ACTION_EXPORT_CONFIG,
  ACTION_IMPORT_CONFIG,
  ACTION_INSPECT_SHARED_WORKER,
  ACTION_OPEN_CONFIG_BROWSER,
  ACTION_OPEN_DATA_PROVIDERS,
  ACTION_OPEN_DOCK_EDITOR,
  ACTION_OPEN_WORKSPACE_SETUP,
  ACTION_RELOAD_DOCK,
  ACTION_SET_PALETTE,
  ACTION_SHOW_DEVTOOLS,
  ACTION_TOGGLE_PROVIDER,
  ACTION_TOGGLE_THEME,
} from "./iabTopics";
import { dockMenuIconStrokeColors, readDockPalette } from "./staruiOpenFinPalette";
import {
  contentMenuFoldersToLegacyDropdowns,
  toDock3UserContentMenu,
  toLegacyDockActionButtons,
  type DockEditorConfig,
  type DockMenuItemConfig,
} from "./dockConfigTypes";

let legacyRegistration: DockProviderRegistration | undefined;

export function isLegacyDockActive(): boolean {
  return legacyRegistration != null;
}

export function getLegacyDockRegistration(): DockProviderRegistration | undefined {
  return legacyRegistration;
}

function paletteMenuLabel(name: StarUIPaletteName, active: boolean): string {
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  return active ? `✓ ${label}` : label;
}

function buildSystemToolsOptions(theme: "dark" | "light"): DockButton[] {
  const strokes = dockMenuIconStrokeColors();
  const stroke = theme === "dark" ? strokes.dark : strokes.light;
  const icon = (svg: string) => svgToDataUrl(svg, stroke);

  const tools: DockMenuItemConfig[] = [
    { id: "tool-workspace-setup", tooltip: "Workspace Setup (new)", iconId: "lucide:settings", actionId: ACTION_OPEN_WORKSPACE_SETUP },
    { id: "tool-data-providers", tooltip: "Data Providers", iconId: "lucide:settings", actionId: ACTION_OPEN_DATA_PROVIDERS },
    { id: "tool-config-browser", tooltip: "Config Browser", iconId: "lucide:settings", actionId: ACTION_OPEN_CONFIG_BROWSER },
    { id: "tool-reload-dock", tooltip: "Reload Dock", iconId: "lucide:refresh-cw", actionId: ACTION_RELOAD_DOCK },
    { id: "tool-devtools", tooltip: "Developer Tools", iconId: "lucide:code", actionId: ACTION_SHOW_DEVTOOLS },
    { id: "tool-inspect-shared-worker", tooltip: "Inspect Shared Worker", iconId: "lucide:code", actionId: ACTION_INSPECT_SHARED_WORKER },
    { id: "tool-export-config", tooltip: "Export Config", iconId: "lucide:download", actionId: ACTION_EXPORT_CONFIG },
    { id: "tool-import-config", tooltip: "Import Config", iconId: "lucide:upload", actionId: ACTION_IMPORT_CONFIG },
    { id: "tool-toggle-provider", tooltip: "Show/Hide Provider", iconId: "lucide:eye", actionId: ACTION_TOGGLE_PROVIDER },
  ];

  return tools.map((t) => {
    const svgMap: Record<string, string> = {
      "tool-reload-dock": REFRESH_SVG,
      "tool-devtools": CODE_SVG,
      "tool-inspect-shared-worker": CODE_SVG,
      "tool-export-config": DOWNLOAD_SVG,
      "tool-import-config": UPLOAD_SVG,
      "tool-toggle-provider": EYE_SVG,
    };
    const svg = svgMap[t.id] ?? SETTINGS_SVG;
    return {
      id: t.id,
      tooltip: t.tooltip,
      iconUrl: icon(svg),
      action: { id: t.actionId!, customData: t.customData },
    };
  });
}

/**
 * Build the full legacy dock button list: user editor config + system dropdowns.
 */
export function buildFullLegacyDockButtons(
  editorConfig: DockEditorConfig | undefined,
  theme: "dark" | "light",
  themeToggleIconUrl: string,
  generateIcon: (iconId: string, color: string) => string,
  recolorUrl: (url: string, color: string) => string,
): DockButton[] {
  const strokes = dockMenuIconStrokeColors();
  const stroke = theme === "dark" ? strokes.dark : strokes.light;
  const accentIcon = (svg: string) => svgToDataUrl(svg, stroke);

  const userBarActions = editorConfig
    ? toLegacyDockActionButtons(
        editorConfig,
        generateIcon,
        recolorUrl,
        strokes.dark,
        strokes.light,
        theme,
      )
    : [];

  // Same folder tree as Dock3 content menu (SPG + user dropdowns)
  const userBarDropdowns = editorConfig
    ? contentMenuFoldersToLegacyDropdowns(
        toDock3UserContentMenu(
          editorConfig,
          generateIcon,
          recolorUrl,
          strokes.dark,
          strokes.light,
        ),
        generateIcon,
        recolorUrl,
        strokes.dark,
        strokes.light,
        theme,
      )
    : [];

  const activePalette = readDockPalette();
  const paletteDropdown: DockButton = {
    type: DockButtonNames.DropdownButton,
    id: "palette-menu",
    tooltip: "Color palette",
    iconUrl: accentIcon(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/></svg>',
    ),
    options: STARUI_PALETTE_NAMES.map((name) => ({
      id: `palette-${name}`,
      tooltip: paletteMenuLabel(name, activePalette === name),
      action: {
        id: ACTION_SET_PALETTE,
        customData: { palette: name, actionId: ACTION_SET_PALETTE },
      },
    })),
  };

  const toolsDropdown: DockButton = {
    type: DockButtonNames.DropdownButton,
    id: "system-tools",
    tooltip: "Tools",
    iconUrl: accentIcon(TOOLS_SVG),
    options: buildSystemToolsOptions(theme),
  };

  const themeToggle: DockButton = {
    id: "theme-toggle",
    tooltip: "Toggle Theme",
    iconUrl: themeToggleIconUrl,
    action: { id: ACTION_TOGGLE_THEME },
  };

  return [...userBarActions, ...userBarDropdowns, paletteDropdown, toolsDropdown, themeToggle];
}

export async function registerLegacyDockProvider(params: {
  id: string;
  title: string;
  icon: string;
  buttons: DockButton[];
}): Promise<DockProviderRegistration | undefined> {
  const config = {
    id: params.id,
    title: params.title,
    icon: params.icon,
    workspaceComponents: ["notifications", "switchWorkspace"] satisfies WorkspaceButtonsConfig,
    disableUserRearrangement: false,
    skipSavedDockProviderConfig: true,
    buttons: params.buttons,
  };

  try {
    if (legacyRegistration) {
      await legacyRegistration.updateDockProviderConfig(config);
      return legacyRegistration;
    }

    legacyRegistration = await Dock.register(config);
    await Dock.show();
    console.log("Legacy dock provider initialized.");
    return legacyRegistration;
  } catch (err) {
    console.error("Failed to initialize legacy dock provider.", err);
    return undefined;
  }
}

export async function updateLegacyDockProvider(params: {
  title: string;
  icon: string;
  buttons: DockButton[];
}): Promise<void> {
  if (!legacyRegistration) {
    console.error("Cannot update legacy dock: not initialized yet.");
    return;
  }
  await legacyRegistration.updateDockProviderConfig({
    title: params.title,
    icon: params.icon,
    buttons: params.buttons,
  });
  console.log("Legacy dock config updated.");
}

/** Ensure the legacy dock window is visible after config updates. */
export async function showLegacyDock(): Promise<void> {
  try {
    await Dock.show();
  } catch (err) {
    console.warn("Dock.show failed (legacy dock may not be registered yet).", err);
  }
}

export async function shutdownLegacyDockProvider(): Promise<void> {
  if (!legacyRegistration) return;
  try {
    await Dock.deregister();
    console.log("Legacy dock provider deregistered.");
  } catch (err) {
    console.error("Error deregistering legacy dock provider.", err);
  }
  legacyRegistration = undefined;
}
