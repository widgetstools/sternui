import type { LucideIcon } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@starui/ui";

interface DockSystemButtonProps {
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
  /** `data-dock-item` id for tests / styling hooks. */
  dataId: string;
}

/**
 * A fixed icon button for a built-in dock action (S17) — e.g. the default
 * workspace-component buttons Home + Store. Native `title` tooltip (OS-level,
 * not clipped by the frameless window), design-system tokens, dark/light.
 */
export function DockSystemButton({ label, Icon, onClick, dataId }: DockSystemButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          title={label}
          data-dock-item={dataId}
          onClick={onClick}
          className="h-8 w-8 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
