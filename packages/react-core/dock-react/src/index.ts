// @starui/dock-react — the custom OpenFin dock UI (a frameless, always-on-top
// window we render ourselves). Phase 1 ships the self-contained, OpenFin-free
// React surface; the `/dock` window host + action-dispatch channel wire the
// DockController to it in Phase 0 / Phase 2.

export { DockBar, type DockBarProps } from "./components/DockBar";
export { DockToolsMenu } from "./components/DockToolsMenu";
export { DockThemeToggle } from "./components/DockThemeToggle";
export { DockLauncherButton } from "./components/DockLauncherButton";
export { DockDropdownButton } from "./components/DockDropdownButton";
export { DockIcon } from "./components/DockIcon";

export { useDockTheme } from "./hooks/useDockTheme";

export { dockConfigToViewModel, resolveDockIcon } from "./dockViewModel";
export { SYSTEM_TOOLS, type SystemToolItem } from "./systemTools";

export type {
  DockController,
  DockTheme,
  DockIconSpec,
  DockViewModel,
  DockBarItem,
  DockLaunchItem,
  DockDropdownItem,
  DockMenuNode,
} from "./types";
