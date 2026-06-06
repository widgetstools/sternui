// @starui/dock-react — the custom OpenFin dock UI (a frameless, always-on-top
// window we render ourselves). Phase 1 ships the self-contained, OpenFin-free
// React surface; the `/dock` window host + action-dispatch channel wire the
// DockController to it in Phase 0 / Phase 2.

export { DockBar, type DockBarProps } from "./components/DockBar";
export { DockToolsMenu } from "./components/DockToolsMenu";
export { DockThemeToggle } from "./components/DockThemeToggle";
export { DockLauncherButton } from "./components/DockLauncherButton";
export { DockDropdownButton } from "./components/DockDropdownButton";
export { DockWorkspaceSwitcher } from "./components/DockWorkspaceSwitcher";
export { DockNotificationsButton } from "./components/DockNotificationsButton";
export { DockSystemButton } from "./components/DockSystemButton";
export { DockAppSwitcher } from "./components/DockAppSwitcher";
export { DockMenuView } from "./components/DockMenuView";
export { DockIcon } from "./components/DockIcon";

export { useDockTheme } from "./hooks/useDockTheme";
export { useDockAutoSize } from "./hooks/useDockAutoSize";
export { useSavedWorkspaces, type UseSavedWorkspacesResult } from "./hooks/useSavedWorkspaces";
export { useNotificationsCount } from "./hooks/useNotificationsCount";
export { useRunningApps, type UseRunningAppsResult } from "./hooks/useRunningApps";

export { dockConfigToViewModel, resolveDockIcon } from "./dockViewModel";
export { SYSTEM_TOOLS, type SystemToolItem } from "./systemTools";

export {
  toolsMenuModel,
  dropdownMenuModel,
  workspaceMenuModel,
  WORKSPACE_MENU_SAVE,
  WORKSPACE_MENU_SAVE_AS,
  WORKSPACE_MENU_RESTORE,
  WORKSPACE_MENU_APPLY_PREFIX,
  WORKSPACE_MENU_RENAME_PREFIX,
  WORKSPACE_MENU_DELETE_PREFIX,
  appSwitcherMenuModel,
  APP_SWITCHER_PREFIX,
} from "./menuModel";

export {
  workspaceSwitcherReducer,
  initialWorkspaceSwitcherState,
  isActiveWorkspace,
  type WorkspaceSwitcherState,
  type WorkspaceSwitcherAction,
} from "./workspaceSwitcher";

export {
  runningAppsReducer,
  initialRunningAppsState,
  isActiveApp,
  type RunningAppsState,
  type RunningAppsAction,
} from "./runningApps";

export type {
  DockController,
  DockTheme,
  DockIconSpec,
  DockViewModel,
  DockBarItem,
  DockLaunchItem,
  DockDropdownItem,
  DockMenuNode,
  SavedWorkspace,
  WorkspaceController,
  ApplyWorkspaceOptions,
  NotificationController,
  RunningApp,
  AppSwitcherController,
  DockMenuItem,
  DockMenuModel,
  DockMenuResult,
  DockMenuAnchor,
  DockPromptOptions,
} from "./types";
