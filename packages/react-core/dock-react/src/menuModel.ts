/**
 * Serializable menu model for the custom dock's **popout menus** (Session 15).
 *
 * The dock is a small floating window; its dropdowns/submenus would be clipped
 * if rendered as in-window DOM portals. Instead each menu opens as an OpenFin
 * **popup window** (`showPopupWindow`) that renders {@link DockMenuView} from
 * one of these models. Because the popup is a separate JS realm, the model is
 * passed as JSON (`customData`) — so it must be fully serializable: image icons
 * are pre-resolved `{dark,light}` URLs and system icons are lucide **names**
 * (resolved back to components in the popup), never React components.
 *
 * Pure + OpenFin-free: builders here just shape data; the OpenFin host
 * (`openMenu`) ferries the model to the popup and the result back.
 */
import type {
  DockDropdownItem,
  DockIconSpec,
  DockMenuItem,
  DockMenuModel,
  DockMenuNode,
  DockTheme,
} from "./types";
import { SYSTEM_TOOLS } from "./systemTools";

const hasIcon = (icon?: DockIconSpec): boolean => Boolean(icon && (icon.dark || icon.light));

/** The fixed "Tools" menu (9 system actions) as a popout model. */
export function toolsMenuModel(theme: DockTheme): DockMenuModel {
  return {
    theme,
    title: "Tools",
    items: SYSTEM_TOOLS.map((t) => ({
      id: t.id,
      label: t.label,
      iconName: t.iconName,
      actionId: t.actionId,
    })),
  };
}

function dropdownNodes(nodes: DockMenuNode[]): DockMenuItem[] {
  return nodes.map((node) => ({
    id: node.id,
    label: node.label,
    icon: hasIcon(node.icon) ? node.icon : undefined,
    actionId: node.actionId,
    customData: node.customData,
    children: node.children && node.children.length > 0 ? dropdownNodes(node.children) : undefined,
  }));
}

/** A user launcher DropdownButton (possibly nested) as a popout model. */
export function dropdownMenuModel(item: DockDropdownItem, theme: DockTheme): DockMenuModel {
  return { theme, title: item.label, items: dropdownNodes(item.items) };
}

/** Item-id helpers for the workspace switcher menu (the opener maps these back). */
export const WORKSPACE_MENU_SAVE = "workspace:save";
export const WORKSPACE_MENU_SAVE_AS = "workspace:save-as";
export const WORKSPACE_MENU_RESTORE = "workspace:restore";
/** Prefix for "apply this saved workspace" rows — strip to get the workspace id. */
export const WORKSPACE_MENU_APPLY_PREFIX = "workspace:apply:";
/** Prefix for "rename this workspace" leaves — strip to get the workspace id. */
export const WORKSPACE_MENU_RENAME_PREFIX = "workspace:rename:";
/** Prefix for "delete this workspace" (confirm) leaves — strip to get the id. */
export const WORKSPACE_MENU_DELETE_PREFIX = "workspace:delete:";

/**
 * The workspace switcher menu — parity with the native `switchWorkspace`
 * dropdown's workspace-management actions (Switch / Save / Save As / Rename /
 * Delete / Restore):
 *   - saved list (1-click switch, active checked)
 *   - **Save** (update active) — only when a saved workspace is active
 *   - **Save workspace as…**
 *   - **Manage workspaces ▸** — per workspace: Rename…, Delete ▸ Confirm delete
 *     (Delete nests a confirm step so a mis-click can't drop a workspace)
 *   - **Restore last saved**
 * Rename/Delete live under "Manage" so the common Switch path stays one click.
 */
export function workspaceMenuModel(
  workspaces: { id: string; title: string }[],
  activeId: string | null,
  theme: DockTheme,
): DockMenuModel {
  const items: DockMenuItem[] = workspaces.length
    ? workspaces.map((w) => ({
        id: `${WORKSPACE_MENU_APPLY_PREFIX}${w.id}`,
        label: w.title,
        // `checked` renders the leading check column (shown only when active).
        checked: activeId != null && activeId === w.id,
      }))
    : [{ id: "workspace:empty", label: "No saved workspaces", disabled: true }];

  if (activeId != null) {
    items.push({ id: WORKSPACE_MENU_SAVE, label: "Save workspace", iconName: "Save", separatorBefore: true });
  }
  items.push({
    id: WORKSPACE_MENU_SAVE_AS,
    label: "Save workspace as…",
    iconName: "Plus",
    separatorBefore: activeId == null,
  });

  if (workspaces.length) {
    items.push({
      id: "workspace:manage",
      label: "Manage workspaces",
      iconName: "Settings2",
      children: workspaces.flatMap((w) => [
        { id: `${WORKSPACE_MENU_RENAME_PREFIX}${w.id}`, label: `Rename “${w.title}”…`, iconName: "Pencil" },
        {
          id: `${w.id}-delete`,
          label: `Delete “${w.title}”`,
          iconName: "Trash2",
          children: [
            { id: `${WORKSPACE_MENU_DELETE_PREFIX}${w.id}`, label: `Confirm delete “${w.title}”`, iconName: "Trash2" },
          ],
        },
      ]),
    });
  }

  items.push({ id: WORKSPACE_MENU_RESTORE, label: "Restore last saved", iconName: "RotateCcw" });
  return { theme, title: "Workspaces", items };
}

/** Prefix for "switch the dock to this app" rows — strip to get the app id. */
export const APP_SWITCHER_PREFIX = "app:switch:";

/**
 * The app-switcher menu (Phase 5 / S19) — the running apps, with the active app
 * (whose dock config is currently shown) checked. Selecting a row switches the
 * dock's config scope to that app. Empty state when nothing is running.
 */
export function appSwitcherMenuModel(
  apps: { id: string; title: string }[],
  activeId: string | null,
  theme: DockTheme,
): DockMenuModel {
  const items: DockMenuItem[] = apps.length
    ? apps.map((a) => ({
        id: `${APP_SWITCHER_PREFIX}${a.id}`,
        label: a.title,
        checked: activeId != null && activeId === a.id,
      }))
    : [{ id: "app:empty", label: "No running apps", disabled: true }];
  return { theme, title: "Apps", items };
}
