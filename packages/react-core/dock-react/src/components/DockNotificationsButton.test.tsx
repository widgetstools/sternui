import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@starui/ui";
import type { NotificationController } from "../types";
import { DockNotificationsButton } from "./DockNotificationsButton";

function makeController(initial = 0) {
  let fire: (n: number) => void = () => {};
  const controller: NotificationController = {
    getNotificationsCount: vi.fn(async () => initial),
    toggleNotificationCenter: vi.fn(),
    onCountChanged: (listener) => {
      fire = listener;
      return () => {
        fire = () => {};
      };
    },
  };
  return { controller, push: (n: number) => fire(n) };
}

function renderButton(controller: NotificationController) {
  return render(
    <TooltipProvider>
      <DockNotificationsButton controller={controller} />
    </TooltipProvider>,
  );
}

describe("DockNotificationsButton", () => {
  let user: ReturnType<typeof userEvent.setup>;
  beforeEach(() => {
    user = userEvent.setup();
  });

  it("shows no badge at zero", async () => {
    const { controller } = makeController(0);
    renderButton(controller);
    await waitFor(() => expect(controller.getNotificationsCount).toHaveBeenCalled());
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
  });

  it("shows the seeded unread count as a badge", async () => {
    const { controller } = makeController(3);
    renderButton(controller);
    await waitFor(() => expect(screen.getByText("3")).toBeTruthy());
    expect(screen.getByLabelText("Notifications (3)")).toBeTruthy();
  });

  it("clamps large counts to 99+", async () => {
    const { controller } = makeController(150);
    renderButton(controller);
    await waitFor(() => expect(screen.getByText("99+")).toBeTruthy());
  });

  it("toggles the notification center on click", async () => {
    const { controller } = makeController(0);
    renderButton(controller);
    await user.click(screen.getByLabelText("Notifications"));
    expect(controller.toggleNotificationCenter).toHaveBeenCalledOnce();
  });

  it("updates the badge when the count changes", async () => {
    const { controller, push } = makeController(0);
    renderButton(controller);
    await waitFor(() => expect(controller.getNotificationsCount).toHaveBeenCalled());
    act(() => push(5));
    expect(screen.getByText("5")).toBeTruthy();
  });
});
