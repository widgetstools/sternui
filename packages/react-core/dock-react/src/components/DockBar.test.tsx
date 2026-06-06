import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DockEditorConfig } from "@starui/openfin-platform/config";
import type { DockController, DockMenuResult, DockTheme } from "../types";
import { DockBar } from "./DockBar";

/**
 * A fake controller: records dispatches, drives theme manually, and stands in
 * for the popout-menu seam (S15) — `openMenu` resolves with a configurable
 * result so we can assert the bar maps it to the right dispatch.
 */
function makeController(initialTheme: DockTheme = "dark") {
  const listeners = new Set<(t: DockTheme) => void>();
  let theme = initialTheme;
  let menuResult: DockMenuResult | null = null;
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
    openMenu: vi.fn(async () => menuResult),
    promptText: vi.fn(async () => null),
  };
  return {
    controller,
    /** Set what the next `openMenu` resolves with. */
    setMenuResult(r: DockMenuResult | null) {
      menuResult = r;
    },
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

  it("opens the Tools menu as a popout and dispatches the chosen action (S6/S15)", async () => {
    const { controller, setMenuResult } = makeController();
    setMenuResult({ id: "tool-reload-dock", actionId: "reload-dock" });
    render(<DockBar config={config} controller={controller} />);

    await user.click(screen.getByLabelText("Tools"));
    expect(controller.openMenu).toHaveBeenCalled();
    // The model handed to the popup is the Tools model (carries the system actions).
    const model = (controller.openMenu as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(model.items.some((i: { actionId?: string }) => i.actionId === "reload-dock")).toBe(true);
    await waitFor(() =>
      expect(controller.dispatchAction).toHaveBeenCalledWith("reload-dock", undefined),
    );
  });

  it("opens a launcher dropdown as a popout and dispatches the chosen leaf (S6/S15)", async () => {
    const { controller, setMenuResult } = makeController();
    setMenuResult({ id: "opt-1", actionId: "do-one" });
    render(<DockBar config={config} controller={controller} />);

    await user.click(screen.getByLabelText("My Tools"));
    expect(controller.openMenu).toHaveBeenCalled();
    await waitFor(() => expect(controller.dispatchAction).toHaveBeenCalledWith("do-one", undefined));
  });

  it("toggles the theme via the controller (S8)", async () => {
    const { controller } = makeController("dark");
    render(<DockBar config={config} controller={controller} />);

    await user.click(screen.getByLabelText("Switch to light theme"));
    expect(controller.toggleTheme).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Switch to dark theme")).toBeTruthy();
  });

  it("re-renders the toggle on an external theme broadcast (S8)", () => {
    const { controller, pushTheme } = makeController("dark");
    render(<DockBar config={config} controller={controller} />);
    expect(screen.getByLabelText("Switch to light theme")).toBeTruthy();

    act(() => pushTheme("light"));
    expect(screen.getByLabelText("Switch to dark theme")).toBeTruthy();
  });

  it("reports its content size to the host for window auto-sizing (S14)", () => {
    const { controller } = makeController();
    const resizeToContent = vi.fn();
    render(<DockBar config={config} controller={{ ...controller, resizeToContent }} />);
    expect(resizeToContent).toHaveBeenCalled();
  });
});
