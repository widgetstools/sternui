import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DockMenuModel } from "../types";
import { DockMenuView } from "./DockMenuView";

const model: DockMenuModel = {
  theme: "dark",
  title: "Tools",
  items: [
    { id: "a", label: "Alpha", iconName: "Settings", actionId: "do-a" },
    { id: "b", label: "Beta", checked: true },
    { id: "c", label: "Submenu", children: [{ id: "c1", label: "Child", actionId: "do-c1" }] },
    { id: "d", label: "Disabled", disabled: true, separatorBefore: true },
  ],
};

describe("DockMenuView", () => {
  let user: ReturnType<typeof userEvent.setup>;
  beforeEach(() => {
    user = userEvent.setup();
  });

  it("renders every row with its label", () => {
    render(<DockMenuView model={model} onSelect={() => {}} />);
    for (const label of ["Alpha", "Beta", "Submenu", "Disabled"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("calls onSelect with the leaf item", async () => {
    const onSelect = vi.fn();
    render(<DockMenuView model={model} onSelect={onSelect} />);
    await user.click(screen.getByText("Alpha"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "a", actionId: "do-a" }));
  });

  it("opens a submenu (not select) for a node with children", async () => {
    const onSelect = vi.fn();
    const onOpenSubmenu = vi.fn();
    render(<DockMenuView model={model} onSelect={onSelect} onOpenSubmenu={onOpenSubmenu} />);
    await user.click(screen.getByText("Submenu"));
    expect(onOpenSubmenu).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c" }),
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not select a disabled row", async () => {
    const onSelect = vi.fn();
    render(<DockMenuView model={model} onSelect={onSelect} />);
    await user.click(screen.getByText("Disabled"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders the active check on a checked row", () => {
    render(<DockMenuView model={model} onSelect={() => {}} />);
    const beta = screen.getByText("Beta").closest("[data-dock-item]");
    expect(beta?.querySelector("svg")?.getAttribute("class")).toContain("opacity-100");
  });
});
