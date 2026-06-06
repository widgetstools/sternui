import { useCallback, useMemo } from "react";
import { cn, TooltipProvider } from "@starui/ui";
import type { DockEditorConfig } from "@starui/openfin-platform/config";
import type { DockController } from "../types";
import { dockConfigToViewModel } from "../dockViewModel";
import { useDockTheme } from "../hooks/useDockTheme";
import { DockLauncherButton } from "./DockLauncherButton";
import { DockDropdownButton } from "./DockDropdownButton";
import { DockToolsMenu } from "./DockToolsMenu";
import { DockThemeToggle } from "./DockThemeToggle";

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
export function DockBar({ config, controller, className }: DockBarProps) {
  const theme = useDockTheme(controller);
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
        role="toolbar"
        aria-label="Dock"
        data-theme-scope={theme}
        className={cn(
          "flex h-11 w-full items-center gap-1 px-2",
          "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-primary)]",
          "border-b border-[var(--ds-border-primary)] font-[var(--ds-font-sans)]",
          "select-none",
          className,
        )}
      >
        {/* User launcher buttons + dropdowns */}
        {vm.items.map((item) =>
          item.kind === "launch" ? (
            <DockLauncherButton key={item.id} item={item} theme={theme} onDispatch={dispatch} />
          ) : (
            <DockDropdownButton key={item.id} item={item} theme={theme} onDispatch={dispatch} />
          ),
        )}

        {/* System controls — pinned to the trailing edge */}
        <div className="ml-auto flex items-center gap-1">
          <DockToolsMenu theme={theme} onDispatch={dispatch} />
          <DockThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </div>
    </TooltipProvider>
  );
}
