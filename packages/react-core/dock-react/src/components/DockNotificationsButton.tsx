import { Bell } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@starui/ui";
import type { DockTheme, NotificationController } from "../types";
import { useNotificationsCount } from "../hooks/useNotificationsCount";

interface DockNotificationsButtonProps {
  controller: NotificationController;
  /** Reserved for future per-theme styling; the button is token-driven. */
  theme?: DockTheme;
}

/**
 * The notifications bell (Session 16). Shows an unread **badge** with the live
 * notification-center count (via {@link useNotificationsCount}) and toggles the
 * center on click (`controller.toggleNotificationCenter`). The count badge is
 * hidden at zero; large counts clamp to `99+`. Design-system tokens, dark/light.
 */
export function DockNotificationsButton({ controller }: DockNotificationsButtonProps) {
  const count = useNotificationsCount(controller);
  const label = count > 0 ? `Notifications (${count})` : "Notifications";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          title={label}
          data-dock-item="notifications"
          onClick={() => void controller.toggleNotificationCenter()}
          className="relative h-8 w-8 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
        >
          <Bell className="h-[18px] w-[18px]" aria-hidden />
          {count > 0 ? (
            <span
              data-dock-item="notifications-badge"
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--ds-status-danger,#e5484d)] px-1 text-[10px] font-semibold leading-none text-white"
            >
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
