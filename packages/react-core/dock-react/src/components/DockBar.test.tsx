import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DockEditorConfig } from "@starui/openfin-platform/config";
import type { DockController, DockTheme } from "../types";
import { SYSTEM_TOOLS } from "../systemTools";
import { DockBar } from "./DockBar";

/** A fake controller that records dispatches and drives theme manually. */
function makeController(initialTheme: DockTheme = "dark") {
  const listeners = new Set<(t: DockTheme) => void>();
  let theme = initialTheme;
  const controller: DockController = {
    dispatchAction: vi.fn(),
    getTheme: () => theme,
    toggleTheme: vi.fn(() => {
      theme = theme === "dark" ? "light" : "dark";
      listeners.forEach((l) => l(theme));
    }),
    onThemeChanged: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  return {
    controller,
    /** Simulate an external (other-window) theme broadcast. */
    pushTheme(next: DockTheme) {
      theme = next;
      listeners.forEach((l) => l(next));
    },
  };
}

const config: DockEditorConfig = {
  version: 1,
  updatedAt: "2026-06-06T00:00:00.000Z",
  buttons: [
    {
      type: "ActionButton",
      id: "app-blotter",
      tooltip: "Blotter",
      iconUrl: "",
      iconId: "lucide:table",
      actionId: "launch-app",
      customData: { appId: "blotter" },
    },
    {
      type: "DropdownButton",
      id: "my-tools",
      tooltip: "My Tools",
      iconUrl: "",
      iconId: "lucide:wrench",
      options: [
        { id: "opt-1", tooltip: "Option One", iconId: "lucide:file", actionId: "do-one" },
      ],
    },
  ],
};

describe("DockBar", () => {
  let user: ReturnType<typeof userEvent.setup>;
  beforeEach(() => {
    user = userEvent.setup();
  });

  it("renders launcher buttons from config plus the system controls", () => {
    const { controller } = makeController();
    render(<DockBar config={config} controller={controller} />);

    expect(screen.getByRole("toolbar", { name: "Dock" })).toBeTruthy();
    expect(screen.getByLabelText("Blotter")).toBeTruthy();
    expect(screen.getByLabelText("My Tools")).toBeTruthy();
    expect(screen.getByLabelText("Tools")).toBeTruthy();
    // Dark theme → toggle offers "switch to light".
    expect(screen.getByLabelText("Switch to light theme")).toBeTruthy();
  });

  it("still renders system controls when config is null", () => {
    const { controller } = makeController();
    render(<DockBar config={null} controller={controller} />);
    expect(screen.getByLabelText("Tools")).toBeTruthy();
    expect(screen.getByLabelText("Switch to light theme")).toBeTruthy();
  });

  it("dispatches a launcher button's action with its customData (S7)", async () => {
    const { controller } = makeController();
    render(<DockBar config={config} controller={controller} />);

    await user.click(screen.getByLabelText("Blotter"));
    expect(controller.dispatchAction).toHaveBeenCalledWith("launch-app", { appId: "blotter" });
  });

  it("opens the Tools menu and dispatches a system action (S6/S7)", async () => {
    const { controller } = makeController();
    render(<DockBar config={config} controller={controller} />);

    await user.click(screen.getByLabelText("Tools"));
    // All nine tools render.
    for (const tool of SYSTEM_TOOLS) {
      expect(screen.getByText(tool.label)).toBeTruthy();
    }
    await user.click(screen.getByText("Reload Dock"));
    expect(controller.dispatchAction).toHaveBeenCalledWith("reload-dock", undefined);
  });

  it("opens a user dropdown and dispatches a leaf option (S6/S7)", async () => {
    const { controller } = makeController();
    render(<DockBar config={config} controller={controller} />);

    await user.click(screen.getByLabelText("My Tools"));
    await user.click(screen.getByText("Option One"));
    expect(controller.dispatchAction).toHaveBeenCalledWith("do-one", undefined);
  });

  it("toggles the theme via the controller (S8)", async () => {
    const { controller } = makeController("dark");
    render(<DockBar config={config} controller={controller} />);

    await user.click(screen.getByLabelText("Switch to light theme"));
    expect(controller.toggleTheme).toHaveBeenCalledOnce();
    // The toggle re-rendered to offer the opposite direction.
    expect(screen.getByLabelText("Switch to dark theme")).toBeTruthy();
  });

  it("re-renders the toggle on an external theme broadcast (S8)", () => {
    const { controller, pushTheme } = makeController("dark");
    render(<DockBar config={config} controller={controller} />);
    expect(screen.getByLabelText("Switch to light theme")).toBeTruthy();

    act(() => pushTheme("light"));
    expect(screen.getByLabelText("Switch to dark theme")).toBeTruthy();
  });
});
