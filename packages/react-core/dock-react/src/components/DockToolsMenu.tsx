import type { MouseEvent } from "react";
import { Wrench } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@starui/ui";
import type { DockController, DockTheme } from "../types";
import { toolsMenuModel } from "../menuModel";

interface DockToolsMenuProps {
  theme: DockTheme;
  /** Menu seam — opens the popout (S15). */
  controller: DockController;
  onDispatch: (actionId: string, customData?: unknown) => void;
}

/**
 * The fixed "Tools" button (Session 6; popout since S15). Opens the nine system
 * actions as an OpenFin **popup window** (`controller.openMenu`) anchored under
 * the button, then dispatches the chosen action. Rendering the menu in its own
 * window (not an in-window portal) is what lets it escape the small floating
 * dock — and it stays fully theme-compliant (the win over dock2's dark flyout).
 */
export function DockToolsMenu({ theme, controller, onDispatch }: DockToolsMenuProps) {
  const onClick = async (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const result = await controller.openMenu?.(toolsMenuModel(theme), {
      x: Math.round(r.left),
      y: Math.round(r.bottom + 4),
    });
    if (result?.actionId) onDispatch(result.actionId, result.customData);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Tools"
          title="Tools"
          data-dock-item="system-tools"
          onClick={onClick}
          className="h-8 w-8 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
        >
          <Wrench className="h-[18px] w-[18px]" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Tools</TooltipContent>
    </Tooltip>
  );
}
