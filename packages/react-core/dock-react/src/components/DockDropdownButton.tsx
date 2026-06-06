import { Folder } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@starui/ui";
import type { DockDropdownItem, DockMenuNode, DockTheme } from "../types";
import { DockIcon } from "./DockIcon";

interface DockDropdownButtonProps {
  item: DockDropdownItem;
  theme: DockTheme;
  onDispatch: (actionId: string, customData?: unknown) => void;
}

function MenuNodes({
  nodes,
  theme,
  onDispatch,
}: {
  nodes: DockMenuNode[];
  theme: DockTheme;
  onDispatch: (actionId: string, customData?: unknown) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const hasIcon = Boolean(node.icon.dark || node.icon.light);
        const icon = hasIcon ? (
          <DockIcon icon={node.icon} theme={theme} size={16} />
        ) : null;

        if (node.children && node.children.length > 0) {
          return (
            <DropdownMenuSub key={node.id}>
              <DropdownMenuSubTrigger className="gap-2">
                {icon}
                <span>{node.label}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <MenuNodes nodes={node.children} theme={theme} onDispatch={onDispatch} />
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          );
        }

        return (
          <DropdownMenuItem
            key={node.id}
            className="gap-2"
            data-dock-item={node.id}
            onSelect={() => {
              if (node.actionId) onDispatch(node.actionId, node.customData);
            }}
          >
            {icon}
            <span>{node.label}</span>
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

/**
 * A top-level dropdown launcher (Session 5/6). Renders the user's
 * DropdownButton as a shadcn `DropdownMenu` with arbitrarily-nested
 * sub-menus — fully theme-compliant (the win over dock2's dark flyout).
 * Leaf clicks dispatch through the controller (Session 7).
 */
export function DockDropdownButton({ item, theme, onDispatch }: DockDropdownButtonProps) {
  const hasIcon = Boolean(item.icon.dark || item.icon.light);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={item.label}
              data-dock-item={item.id}
              className="h-8 w-8 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
            >
              {hasIcon ? (
                <DockIcon icon={item.icon} theme={theme} />
              ) : (
                <Folder className="h-[18px] w-[18px]" aria-hidden />
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{item.label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="min-w-44">
        <MenuNodes nodes={item.items} theme={theme} onDispatch={onDispatch} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
