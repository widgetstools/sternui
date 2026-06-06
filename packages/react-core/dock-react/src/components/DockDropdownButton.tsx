import type { MouseEvent } from "react";
import { Folder } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@starui/ui";
import type { DockController, DockDropdownItem, DockTheme } from "../types";
import { dropdownMenuModel } from "../menuModel";
import { DockIcon } from "./DockIcon";

interface DockDropdownButtonProps {
  item: DockDropdownItem;
  theme: DockTheme;
  /** Menu seam — opens the popout (S15). */
  controller: DockController;
  onDispatch: (actionId: string, customData?: unknown) => void;
}

/**
 * A top-level launcher dropdown (Session 5/6; popout since S15). Opens the
 * user's (possibly nested) menu as an OpenFin **popup window**
 * (`controller.openMenu`) anchored under the button, so it isn't clipped by the
 * small floating dock window. Nested submenus open as child popups (handled by
 * the popup host); a chosen leaf dispatches through the controller.
 */
export function DockDropdownButton({ item, theme, controller, onDispatch }: DockDropdownButtonProps) {
  const hasIcon = Boolean(item.icon.dark || item.icon.light);

  const onClick = async (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const result = await controller.openMenu?.(dropdownMenuModel(item, theme), {
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
          aria-label={item.label}
          title={item.label}
          data-dock-item={item.id}
          onClick={onClick}
          className="h-8 w-8 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
        >
          {hasIcon ? (
            <DockIcon icon={item.icon} theme={theme} />
          ) : (
            <Folder className="h-[18px] w-[18px]" aria-hidden />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{item.label}</TooltipContent>
    </Tooltip>
  );
}
