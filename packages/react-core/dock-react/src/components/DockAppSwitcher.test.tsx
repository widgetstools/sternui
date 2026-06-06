import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@starui/ui";
import type { AppSwitcherController, DockController, DockMenuResult, RunningApp } from "../types";
import { APP_SWITCHER_PREFIX } from "../menuModel";
import { DockAppSwitcher } from "./DockAppSwitcher";

const apps: RunningApp[] = [
  { id: "blotter", title: "Blotter" },
  { id: "grid", title: "Grid" },
];

function makeControllers(overrides: { apps?: RunningApp[]; activeId?: string | null } = {}) {
  const appController: AppSwitcherController = {
    listRunningApps: vi.fn(async () => overrides.apps ?? apps),
    getActiveAppId: vi.fn(async () => overrides.activeId ?? null),
    onRunningAppsChanged: () => () => {},
    switchToApp: vi.fn(async () => {}),
  };
  let menuResult: DockMenuResult | null = null;
  const menu: DockController = {
    dispatchAction: vi.fn(),
    getTheme: () => "dark",
    toggleTheme: vi.fn(),
    onThemeChanged: () => () => {},
    openMenu: vi.fn(async () => menuResult),
    promptText: vi.fn(async () => null),
  };
  return { appController, menu, setMenuResult: (r: DockMenuResult | null) => { menuResult = r; } };
}

function renderSwitcher(appController: AppSwitcherController, menu: DockController) {
  return render(
    <TooltipProvider>
      <DockAppSwitcher controller={appController} menu={menu} theme="dark" />
    </TooltipProvider>,
  );
}

describe("DockAppSwitcher", () => {
  let user: ReturnType<typeof userEvent.setup>;
  beforeEach(() => {
    user = userEvent.setup();
  });

  it("opens a popout listing running apps with the active one checked", async () => {
    const { appController, menu } = makeControllers({ activeId: "grid" });
    renderSwitcher(appController, menu);
    await waitFor(() => expect(appController.getActiveAppId).toHaveBeenCalled());

    await user.click(screen.getByLabelText("Apps"));
    expect(menu.openMenu).toHaveBeenCalled();
    const model = (menu.openMenu as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const labels = model.items.map((i: { label: string }) => i.label);
    expect(labels).toEqual(expect.arrayContaining(["Blotter", "Grid"]));
    expect(model.items.find((i: { label: string }) => i.label === "Grid").checked).toBe(true);
  });

  it("switches the dock to the chosen app", async () => {
    const { appController, menu, setMenuResult } = makeControllers({ activeId: "blotter" });
    setMenuResult({ id: `${APP_SWITCHER_PREFIX}grid` });
    renderSwitcher(appController, menu);
    await waitFor(() => expect(appController.getActiveAppId).toHaveBeenCalled());

    await user.click(screen.getByLabelText("Apps"));
    await waitFor(() => expect(appController.switchToApp).toHaveBeenCalledWith("grid"));
  });

  it("does nothing when the menu is dismissed", async () => {
    const { appController, menu, setMenuResult } = makeControllers();
    setMenuResult(null);
    renderSwitcher(appController, menu);
    await waitFor(() => expect(appController.getActiveAppId).toHaveBeenCalled());

    await user.click(screen.getByLabelText("Apps"));
    await waitFor(() => expect(menu.openMenu).toHaveBeenCalled());
    expect(appController.switchToApp).not.toHaveBeenCalled();
  });
});
