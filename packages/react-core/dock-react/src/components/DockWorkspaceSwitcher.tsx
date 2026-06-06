import type { MouseEvent } from "react";
import { LayoutGrid } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@starui/ui";
import type { DockController, DockTheme, WorkspaceController } from "../types";
import { useSavedWorkspaces } from "../hooks/useSavedWorkspaces";
import {
  workspaceMenuModel,
  WORKSPACE_MENU_APPLY_PREFIX,
  WORKSPACE_MENU_DELETE_PREFIX,
  WORKSPACE_MENU_RENAME_PREFIX,
  WORKSPACE_MENU_RESTORE,
  WORKSPACE_MENU_SAVE,
  WORKSPACE_MENU_SAVE_AS,
} from "../menuModel";

interface DockWorkspaceSwitcherProps {
  /** Workspace data/actions — list / active / apply / save / restore. */
  controller: WorkspaceController;
  /** Menu seam — opens the popout + the Save-As text prompt (S15). */
  menu: DockController;
  theme: DockTheme;
}

/**
 * The workspace switcher (Sessions 12–13; popout since S15) — the custom dock's
 * themed replacement for dock2/dock3's native `switchWorkspace` component.
 *
 * Clicking opens an OpenFin **popup window** (`menu.openMenu`) listing the saved
 * workspaces (active one checked), plus **Save workspace as…** and **Restore
 * last saved**. The chosen row maps back to the workspace controller: apply by
 * id (`skipPrompt`), restore, or — for Save-As — a second text-prompt popup
 * (`menu.promptText`) whose result feeds `saveWorkspaceAs`. Rendering in its own
 * window avoids clipping in the small floating dock.
 */
export function DockWorkspaceSwitcher({ controller, menu, theme }: DockWorkspaceSwitcherProps) {
  const { workspaces, activeId } = useSavedWorkspaces(controller);

  const onClick = async (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const anchor = { x: Math.round(r.left), y: Math.round(r.bottom + 4) };
    const result = await menu.openMenu?.(workspaceMenuModel(workspaces, activeId, theme), anchor);
    if (!result) return;
    const { id } = result;

    if (id.startsWith(WORKSPACE_MENU_APPLY_PREFIX)) {
      void controller.applyWorkspace(id.slice(WORKSPACE_MENU_APPLY_PREFIX.length), { skipPrompt: true });
      return;
    }
    if (id === WORKSPACE_MENU_SAVE) {
      void controller.saveWorkspace();
      return;
    }
    if (id === WORKSPACE_MENU_RESTORE) {
      void controller.restoreLastSavedWorkspace({ skipPrompt: true });
      return;
    }
    if (id.startsWith(WORKSPACE_MENU_DELETE_PREFIX)) {
      // The popup already drilled into a "Confirm delete" step, so just delete.
      void controller.deleteWorkspace(id.slice(WORKSPACE_MENU_DELETE_PREFIX.length));
      return;
    }
    if (id.startsWith(WORKSPACE_MENU_RENAME_PREFIX)) {
      const wsId = id.slice(WORKSPACE_MENU_RENAME_PREFIX.length);
      const current = workspaces.find((w) => w.id === wsId);
      const title = await menu.promptText?.({
        title: "Rename workspace",
        label: "Name",
        placeholder: "Workspace name",
        confirmLabel: "Rename",
        initialValue: current?.title,
        anchor,
      });
      const trimmed = title?.trim();
      if (trimmed) void controller.renameWorkspace(wsId, trimmed);
      return;
    }
    if (id === WORKSPACE_MENU_SAVE_AS) {
      const title = await menu.promptText?.({
        title: "Save workspace as",
        label: "Name",
        placeholder: "My workspace",
        confirmLabel: "Save",
        anchor,
      });
      const trimmed = title?.trim();
      if (trimmed) void controller.saveWorkspaceAs(trimmed);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Workspaces"
          title="Workspaces"
          data-dock-item="workspace-switcher"
          onClick={onClick}
          className="h-8 w-8 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
        >
          <LayoutGrid className="h-[18px] w-[18px]" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Workspaces</TooltipContent>
    </Tooltip>
  );
}
