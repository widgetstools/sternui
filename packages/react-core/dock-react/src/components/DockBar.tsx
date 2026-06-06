import { useCallback, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import { GripVertical, House, Store } from "lucide-react";
import { cn, TooltipProvider } from "@starui/ui";
import { ACTION_SHOW_HOME, ACTION_SHOW_STORE, type DockEditorConfig } from "@starui/openfin-platform/config";
import type {
  AppSwitcherController,
  DockController,
  NotificationController,
  WorkspaceController,
} from "../types";
import { dockConfigToViewModel } from "../dockViewModel";
import { useDockTheme } from "../hooks/useDockTheme";
import { useDockAutoSize } from "../hooks/useDockAutoSize";
import { DockLauncherButton } from "./DockLauncherButton";
import { DockDropdownButton } from "./DockDropdownButton";
import { DockToolsMenu } from "./DockToolsMenu";
import { DockThemeToggle } from "./DockThemeToggle";
import { DockWorkspaceSwitcher } from "./DockWorkspaceSwitcher";
import { DockNotificationsButton } from "./DockNotificationsButton";
import { DockSystemButton } from "./DockSystemButton";
import { DockAppSwitcher } from "./DockAppSwitcher";

// OpenFin frameless-window drag regions (CSS `-webkit-app-region`). Applied as
// inline styles (not Tailwind arbitrary classes — `WebkitAppRegion` isn't in
// csstype, so the utility never generates), matching the repo pattern in the
// grid's frameless popouts. `-webkit-app-region` is NOT inherited, so every
// draggable child (grip, separator) is marked explicitly; interactive groups
// opt out with `no-drag` so clicks land instead of starting a window drag.
const DRAG_REGION = { WebkitAppRegion: "drag" } as CSSProperties;
const NO_DRAG_REGION = { WebkitAppRegion: "no-drag" } as CSSProperties;

export interface DockBarProps {
  /**
   * The active dock config (from ConfigService for the live `(appId,userId)`
   * scope). `null` while loading or when unconfigured — the bar still renders
   * its system controls (Tools + theme toggle). Live config updates land in
   * Phase 2 (the host re-renders with a fresh prop).
   */
  config: DockEditorConfig | null;
  /** OpenFin boundary — action dispatch + theme. See {@link DockController}. */
  controller: DockController;
  /**
   * OpenFin workspace boundary — list / active / apply (S12). When provided,
   * the bar renders the workspace switcher dropdown; omit it (e.g. in isolated
   * tests) and the switcher is simply absent.
   */
  workspaceController?: WorkspaceController;
  /**
   * OpenFin notifications boundary (S16). When provided, the bar renders the
   * bell + unread badge; omit it and the bell is simply absent.
   */
  notificationController?: NotificationController;
  /**
   * OpenFin app-switcher boundary (S19). When provided, the bar renders the
   * running-app switcher (per-app dock config scope); omit it and it's absent.
   */
  appSwitcherController?: AppSwitcherController;
  className?: string;
}

/**
 * The custom dock bar (Sessions 5–8). A horizontal, always-on-top-window
 * toolbar that renders:
 *   - the user's launcher buttons + dropdowns (from `config`)
 *   - a fixed "Tools" menu (the nine system actions)
 *   - a theme toggle
 *
 * Pure React + `@starui/ui` (shadcn) + design-system tokens — no `@openfin/*`
 * import. Every side-effect crosses the injected {@link DockController}, so
 * the whole tree mounts and is exercised under jsdom with a fake controller.
 */
export function DockBar({
  config,
  controller,
  workspaceController,
  notificationController,
  appSwitcherController,
  className,
}: DockBarProps) {
  const theme = useDockTheme(controller);
  const barRef = useRef<HTMLDivElement>(null);
  useDockAutoSize(barRef, controller);
  const vm = useMemo(() => dockConfigToViewModel(config), [config]);

  const dispatch = useCallback(
    (actionId: string, customData?: unknown) => {
      void controller.dispatchAction(actionId, customData);
    },
    [controller],
  );

  const toggleTheme = useCallback(() => {
    void controller.toggleTheme();
  }, [controller]);

  return (
    <TooltipProvider delayDuration={300}>
      <div
        ref={barRef}
        role="toolbar"
        aria-label="Dock"
        data-theme-scope={theme}
        // The bar is a floating, draggable, content-sized object (S14): the bar
        // surface + grip + separator are OpenFin drag regions, the interactive
        // groups opt out so clicks land. Width hugs content with a min-width
        // floor; the window follows via `useDockAutoSize` → `resizeToContent`.
        style={DRAG_REGION}
        className={cn(
          "inline-flex h-11 w-fit min-w-[220px] items-center gap-1 px-1.5",
          "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-primary)]",
          "rounded-md border border-[var(--ds-border-primary)] font-[var(--ds-font-sans)]",
          "select-none",
          className,
        )}
      >
        {/* Drag affordance — explicitly draggable (app-region isn't inherited). */}
        <span
          aria-hidden
          style={DRAG_REGION}
          className="flex cursor-grab items-center px-0.5 text-[var(--ds-text-secondary)]"
        >
          <GripVertical className="h-4 w-4" />
        </span>

        {/* User launcher buttons + dropdowns */}
        {vm.items.length > 0 ? (
          <div style={NO_DRAG_REGION} className="flex items-center gap-1">
            {vm.items.map((item) =>
              item.kind === "launch" ? (
                <DockLauncherButton key={item.id} item={item} theme={theme} onDispatch={dispatch} />
              ) : (
                <DockDropdownButton
                  key={item.id}
                  item={item}
                  theme={theme}
                  controller={controller}
                  onDispatch={dispatch}
                />
              ),
            )}
          </div>
        ) : null}

        {/* Draggable separator between the user + system groups. */}
        <span
          aria-hidden
          style={DRAG_REGION}
          className="mx-0.5 h-5 w-px bg-[var(--ds-border-primary)]"
        />

        {/* System controls — the default workspace-component buttons (Home,
            Workspaces, Notifications, Store; parity with the native dock) plus
            our Tools + theme extras. */}
        <div style={NO_DRAG_REGION} className="flex items-center gap-1">
          <DockSystemButton
            label="Home"
            Icon={House}
            dataId="home"
            onClick={() => dispatch(ACTION_SHOW_HOME)}
          />
          {workspaceController ? (
            <DockWorkspaceSwitcher
              controller={workspaceController}
              menu={controller}
              theme={theme}
            />
          ) : null}
          {appSwitcherController ? (
            <DockAppSwitcher controller={appSwitcherController} menu={controller} theme={theme} />
          ) : null}
          {notificationController ? (
            <DockNotificationsButton controller={notificationController} theme={theme} />
          ) : null}
          <DockSystemButton
            label="Store"
            Icon={Store}
            dataId="store"
            onClick={() => dispatch(ACTION_SHOW_STORE)}
          />
          <DockToolsMenu theme={theme} controller={controller} onDispatch={dispatch} />
          <DockThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </div>
    </TooltipProvider>
  );
}
