import type { MouseEvent } from "react";
import { LayoutDashboard } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@starui/ui";
import type { AppSwitcherController, DockController, DockTheme } from "../types";
import { useRunningApps } from "../hooks/useRunningApps";
import { appSwitcherMenuModel, APP_SWITCHER_PREFIX } from "../menuModel";

interface DockAppSwitcherProps {
  /** Running-app data/actions — list / active / switch. */
  controller: AppSwitcherController;
  /** Menu seam — opens the popout (S15/S19). */
  menu: DockController;
  theme: DockTheme;
}

/**
 * The app-switcher (Session 19) — a popout listing the running apps with the
 * **active** app (whose per-app dock config is currently shown) checked.
 * Selecting a row calls `controller.switchToApp(id)`, which swaps the dock's
 * config scope to that app. Like the workspace switcher, the menu renders as an
 * OpenFin popup window so it isn't clipped by the small floating dock.
 */
export function DockAppSwitcher({ controller, menu, theme }: DockAppSwitcherProps) {
  const { apps, activeId } = useRunningApps(controller);

  const onClick = async (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const result = await menu.openMenu?.(appSwitcherMenuModel(apps, activeId, theme), {
      x: Math.round(r.left),
      y: Math.round(r.bottom + 4),
    });
    if (result?.id.startsWith(APP_SWITCHER_PREFIX)) {
      void controller.switchToApp(result.id.slice(APP_SWITCHER_PREFIX.length));
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Apps"
          title="Apps"
          data-dock-item="app-switcher"
          onClick={onClick}
          className="h-8 w-8 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
        >
          <LayoutDashboard className="h-[18px] w-[18px]" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Apps</TooltipContent>
    </Tooltip>
  );
}
