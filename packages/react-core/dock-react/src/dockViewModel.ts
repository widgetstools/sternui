/**
 * Pure mapping: `DockEditorConfig` → {@link DockViewModel} (Session 4).
 *
 * This is the custom-dock analogue of `toDock2Buttons` / `toDock3Favorites`
 * in `openfin-platform/dockConfigTypes.ts`, but it targets a React render
 * tree instead of OpenFin's `DockButton` / `DockEntry` shapes:
 *
 *   - ActionButton   → DockLaunchItem   (icon + click → one action)
 *   - DropdownButton  → DockDropdownItem (icon + click → nested menu)
 *
 * Icons are resolved up-front to a theme-aware `{ dark, light }` URL pair
 * (via the shared `iconIdToSvgUrl` / `iconIdToThemedUrls` helpers) so the
 * components stay dumb — they just pick the variant for the live theme.
 * No OpenFin import here; the function is exhaustively unit-tested.
 */

import { iconIdToSvgUrl, iconIdToThemedUrls } from "@starui/openfin-platform/dock-editor";
import type {
  DockEditorConfig,
  DockButtonConfig,
  DockMenuItemConfig,
} from "@starui/openfin-platform/config";
import type {
  DockBarItem,
  DockIconSpec,
  DockMenuNode,
  DockViewModel,
} from "./types";

/**
 * Resolve an editor icon source to a theme-aware URL pair.
 *
 * Mirrors `makeDualIcon`'s precedence:
 *   1. `iconColor` + `iconId` → fixed-color icon, same URL for both themes.
 *   2. `iconId` alone → per-theme URLs (light/dark text.primary tokens).
 *   3. `iconUrl` alone → use it verbatim for both themes.
 *   4. nothing → empty (component renders a fallback / nothing).
 */
export function resolveDockIcon(src: {
  iconUrl?: string;
  iconId?: string;
  iconColor?: string;
}): DockIconSpec {
  if (src.iconId && src.iconColor) {
    const url = iconIdToSvgUrl(src.iconId, src.iconColor);
    return { dark: url, light: url };
  }
  if (src.iconId) {
    return iconIdToThemedUrls(src.iconId);
  }
  if (src.iconUrl) {
    return { dark: src.iconUrl, light: src.iconUrl };
  }
  return { dark: "", light: "" };
}

function menuItemToNode(item: DockMenuItemConfig): DockMenuNode {
  const icon = resolveDockIcon(item);
  if (item.options && item.options.length > 0) {
    return {
      id: item.id,
      label: item.tooltip,
      icon,
      children: item.options.map(menuItemToNode),
    };
  }
  return {
    id: item.id,
    label: item.tooltip,
    icon,
    actionId: item.actionId,
    customData: item.customData,
  };
}

function buttonToItem(btn: DockButtonConfig): DockBarItem {
  const icon = resolveDockIcon(btn);
  if (btn.type === "DropdownButton") {
    return {
      kind: "dropdown",
      id: btn.id,
      label: btn.tooltip,
      icon,
      items: btn.options.map(menuItemToNode),
    };
  }
  return {
    kind: "launch",
    id: btn.id,
    label: btn.tooltip,
    icon,
    actionId: btn.actionId,
    customData: btn.customData,
  };
}

/**
 * Build the render model for the dock bar. A `null` / empty config yields an
 * empty item list (the bar still renders its system controls — Tools + theme
 * toggle — which are not part of the editor config).
 */
export function dockConfigToViewModel(config: DockEditorConfig | null | undefined): DockViewModel {
  if (!config || !config.buttons) {
    return { items: [] };
  }
  return { items: config.buttons.map(buttonToItem) };
}
