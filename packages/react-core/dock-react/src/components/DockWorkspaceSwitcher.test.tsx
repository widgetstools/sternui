import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@starui/ui";
import type {
  DockController,
  DockMenuResult,
  SavedWorkspace,
  WorkspaceController,
} from "../types";
import {
  WORKSPACE_MENU_APPLY_PREFIX,
  WORKSPACE_MENU_DELETE_PREFIX,
  WORKSPACE_MENU_RENAME_PREFIX,
  WORKSPACE_MENU_RESTORE,
  WORKSPACE_MENU_SAVE,
  WORKSPACE_MENU_SAVE_AS,
} from "../menuModel";
import { DockWorkspaceSwitcher } from "./DockWorkspaceSwitcher";

const list: SavedWorkspace[] = [
  { id: "a", title: "Alpha" },
  { id: "b", title: "Beta" },
];

function makeControllers(
  overrides: { workspaces?: SavedWorkspace[]; activeId?: string | null } = {},
) {
  const wsController: WorkspaceController = {
    listWorkspaces: vi.fn(async () => overrides.workspaces ?? list),
    getActiveWorkspaceId: vi.fn(async () => overrides.activeId ?? null),
    applyWorkspace: vi.fn(async () => {}),
    saveWorkspaceAs: vi.fn(async () => {}),
    restoreLastSavedWorkspace: vi.fn(async () => {}),
    saveWorkspace: vi.fn(async () => {}),
    renameWorkspace: vi.fn(async () => {}),
    deleteWorkspace: vi.fn(async () => {}),
    onWorkspaceChanged: () => () => {},
  };
  let menuResult: DockMenuResult | null = null;
  let promptResult: string | null = null;
  const menu: DockController = {
    dispatchAction: vi.fn(),
    getTheme: () => "dark",
    toggleTheme: vi.fn(),
    onThemeChanged: () => () => {},
    openMenu: vi.fn(async () => menuResult),
    promptText: vi.fn(async () => promptResult),
  };
  return {
    wsController,
    menu,
    setMenuResult: (r: DockMenuResult | null) => {
      menuResult = r;
    },
    setPromptResult: (t: string | null) => {
      promptResult = t;
    },
  };
}

function renderSwitcher(wsController: WorkspaceController, menu: DockController) {
  return render(
    <TooltipProvider>
      <DockWorkspaceSwitcher controller={wsController} menu={menu} theme="dark" />
    </TooltipProvider>,
  );
}

describe("DockWorkspaceSwitcher", () => {
  let user: ReturnType<typeof userEvent.setup>;
  beforeEach(() => {
    user = userEvent.setup();
  });

  it("opens a popout listing saved workspaces (active checked) + Save-As/Restore", async () => {
    const { wsController, menu } = makeControllers({ activeId: "b" });
    renderSwitcher(wsController, menu);
    await waitFor(() => expect(wsController.getActiveWorkspaceId).toHaveBeenCalled());

    await user.click(screen.getByLabelText("Workspaces"));
    expect(menu.openMenu).toHaveBeenCalled();
    const model = (menu.openMenu as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const labels = model.items.map((i: { label: string }) => i.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Alpha", "Beta", "Save workspace as…", "Restore last saved"]),
    );
    expect(model.items.find((i: { label: string }) => i.label === "Beta").checked).toBe(true);
  });

  it("applies the chosen workspace with skipPrompt", async () => {
    const { wsController, menu, setMenuResult } = makeControllers({ activeId: "a" });
    setMenuResult({ id: `${WORKSPACE_MENU_APPLY_PREFIX}b` });
    renderSwitcher(wsController, menu);
    await waitFor(() => expect(wsController.getActiveWorkspaceId).toHaveBeenCalled());

    await user.click(screen.getByLabelText("Workspaces"));
    await waitFor(() =>
      expect(wsController.applyWorkspace).toHaveBeenCalledWith("b", { skipPrompt: true }),
    );
  });

  it("Save-As opens a text prompt and then saves the returned title", async () => {
    const { wsController, menu, setMenuResult, setPromptResult } = makeControllers();
    setMenuResult({ id: WORKSPACE_MENU_SAVE_AS });
    setPromptResult("End of Day");
    renderSwitcher(wsController, menu);
    await waitFor(() => expect(wsController.getActiveWorkspaceId).toHaveBeenCalled());

    await user.click(screen.getByLabelText("Workspaces"));
    await waitFor(() => expect(menu.promptText).toHaveBeenCalled());
    await waitFor(() => expect(wsController.saveWorkspaceAs).toHaveBeenCalledWith("End of Day"));
  });

  it("does not save when the Save-As prompt is cancelled", async () => {
    const { wsController, menu, setMenuResult, setPromptResult } = makeControllers();
    setMenuResult({ id: WORKSPACE_MENU_SAVE_AS });
    setPromptResult(null);
    renderSwitcher(wsController, menu);
    await waitFor(() => expect(wsController.getActiveWorkspaceId).toHaveBeenCalled());

    await user.click(screen.getByLabelText("Workspaces"));
    await waitFor(() => expect(menu.promptText).toHaveBeenCalled());
    expect(wsController.saveWorkspaceAs).not.toHaveBeenCalled();
  });

  it("saves (updates) the active workspace", async () => {
    const { wsController, menu, setMenuResult } = makeControllers({ activeId: "a" });
    setMenuResult({ id: WORKSPACE_MENU_SAVE });
    renderSwitcher(wsController, menu);
    await waitFor(() => expect(wsController.getActiveWorkspaceId).toHaveBeenCalled());

    await user.click(screen.getByLabelText("Workspaces"));
    await waitFor(() => expect(wsController.saveWorkspace).toHaveBeenCalled());
  });

  it("renames a workspace via the prompt", async () => {
    const { wsController, menu, setMenuResult, setPromptResult } = makeControllers({ activeId: "a" });
    setMenuResult({ id: `${WORKSPACE_MENU_RENAME_PREFIX}b` });
    setPromptResult("Beta Renamed");
    renderSwitcher(wsController, menu);
    await waitFor(() => expect(wsController.getActiveWorkspaceId).toHaveBeenCalled());

    await user.click(screen.getByLabelText("Workspaces"));
    await waitFor(() => expect(menu.promptText).toHaveBeenCalled());
    await waitFor(() =>
      expect(wsController.renameWorkspace).toHaveBeenCalledWith("b", "Beta Renamed"),
    );
  });

  it("deletes a workspace after the confirm drill-down", async () => {
    const { wsController, menu, setMenuResult } = makeControllers({ activeId: "a" });
    setMenuResult({ id: `${WORKSPACE_MENU_DELETE_PREFIX}b` });
    renderSwitcher(wsController, menu);
    await waitFor(() => expect(wsController.getActiveWorkspaceId).toHaveBeenCalled());

    await user.click(screen.getByLabelText("Workspaces"));
    await waitFor(() => expect(wsController.deleteWorkspace).toHaveBeenCalledWith("b"));
  });

  it("restores the last saved workspace", async () => {
    const { wsController, menu, setMenuResult } = makeControllers();
    setMenuResult({ id: WORKSPACE_MENU_RESTORE });
    renderSwitcher(wsController, menu);
    await waitFor(() => expect(wsController.getActiveWorkspaceId).toHaveBeenCalled());

    await user.click(screen.getByLabelText("Workspaces"));
    await waitFor(() =>
      expect(wsController.restoreLastSavedWorkspace).toHaveBeenCalledWith({ skipPrompt: true }),
    );
  });

  it("does nothing when the menu is dismissed", async () => {
    const { wsController, menu, setMenuResult } = makeControllers();
    setMenuResult(null);
    renderSwitcher(wsController, menu);
    await waitFor(() => expect(wsController.getActiveWorkspaceId).toHaveBeenCalled());

    await user.click(screen.getByLabelText("Workspaces"));
    await waitFor(() => expect(menu.openMenu).toHaveBeenCalled());
    expect(wsController.applyWorkspace).not.toHaveBeenCalled();
    expect(wsController.saveWorkspaceAs).not.toHaveBeenCalled();
    expect(wsController.restoreLastSavedWorkspace).not.toHaveBeenCalled();
  });
});
