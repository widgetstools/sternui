import { Box } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@starui/ui";
import type { DockLaunchItem, DockTheme } from "../types";
import { DockIcon } from "./DockIcon";

interface DockLauncherButtonProps {
  item: DockLaunchItem;
  theme: DockTheme;
  onDispatch: (actionId: string, customData?: unknown) => void;
}

/**
 * A single top-level launcher button (Session 5). Clicking it dispatches the
 * item's action through the controller (Session 7). Falls back to a generic
 * box glyph when the editor config has no icon yet.
 */
export function DockLauncherButton({ item, theme, onDispatch }: DockLauncherButtonProps) {
  const hasIcon = Boolean(item.icon.dark || item.icon.light);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={item.label}
          data-dock-item={item.id}
          onClick={() => onDispatch(item.actionId, item.customData)}
          className="h-8 w-8 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
        >
          {hasIcon ? (
            <DockIcon icon={item.icon} theme={theme} />
          ) : (
            <Box className="h-[18px] w-[18px]" aria-hidden />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{item.label}</TooltipContent>
    </Tooltip>
  );
}
