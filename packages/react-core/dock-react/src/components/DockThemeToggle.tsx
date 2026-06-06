import { Moon, Sun } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@starui/ui";
import type { DockTheme } from "../types";

interface DockThemeToggleProps {
  theme: DockTheme;
  onToggle: () => void;
}

/**
 * Theme toggle button (Session 8). Shows the icon for the scheme the click
 * will switch *to* — a sun while dark, a moon while light — mirroring the
 * dock2/dock3 toggle. The actual scheme flip + IAB broadcast is the host's
 * responsibility, reached via `controller.toggleTheme()`.
 */
export function DockThemeToggle({ theme, onToggle }: DockThemeToggleProps) {
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          data-dock-item="theme-toggle"
          onClick={onToggle}
          className="h-8 w-8 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
        >
          {isDark ? (
            <Sun className="h-[18px] w-[18px]" aria-hidden />
          ) : (
            <Moon className="h-[18px] w-[18px]" aria-hidden />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
