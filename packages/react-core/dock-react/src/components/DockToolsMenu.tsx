import { Wrench } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@starui/ui";
import type { DockTheme } from "../types";
import { SYSTEM_TOOLS } from "../systemTools";

interface DockToolsMenuProps {
  /** Reserved for future per-theme styling; the menu itself is token-driven. */
  theme?: DockTheme;
  onDispatch: (actionId: string, customData?: unknown) => void;
}

/**
 * The fixed "Tools" dropdown (Session 6) — the nine system actions, parity
 * with the dock2/dock3 Tools menu but rendered as a fully theme-compliant
 * shadcn `DropdownMenu` with native lucide icons. This is the core theming
 * win: unlike dock2's always-dark flyout, this menu resolves design-system
 * tokens under both `[data-theme]` schemes.
 */
export function DockToolsMenu({ onDispatch }: DockToolsMenuProps) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Tools"
              data-dock-item="system-tools"
              className="h-8 w-8 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
            >
              <Wrench className="h-[18px] w-[18px]" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Tools</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel>Tools</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SYSTEM_TOOLS.map(({ id, label, actionId, Icon }) => (
          <DropdownMenuItem
            key={id}
            className="gap-2"
            data-dock-item={id}
            onSelect={() => onDispatch(actionId)}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span>{label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
