import { describe, it, expect } from "vitest";
import {
  toolsMenuModel,
  dropdownMenuModel,
  workspaceMenuModel,
  appSwitcherMenuModel,
  APP_SWITCHER_PREFIX,
  WORKSPACE_MENU_APPLY_PREFIX,
  WORKSPACE_MENU_DELETE_PREFIX,
  WORKSPACE_MENU_RENAME_PREFIX,
  WORKSPACE_MENU_RESTORE,
  WORKSPACE_MENU_SAVE,
  WORKSPACE_MENU_SAVE_AS,
} from "./menuModel";
import type { DockMenuItem } from "./types";
import { SYSTEM_TOOLS } from "./systemTools";
import type { DockDropdownItem } from "./types";

/** A model is safe to send over `customData` only if it's pure JSON. */
function isSerializable(value: unknown): boolean {
  try {
    return JSON.parse(JSON.stringify(value)) !== undefined;
  } catch {
    return false;
  }
}

describe("toolsMenuModel", () => {
  it("maps every system tool to a serializable row (lucide name, no component)", () => {
    const model = toolsMenuModel("dark");
    expect(model.theme).toBe("dark");
    expect(model.items).toHaveLength(SYSTEM_TOOLS.length);
    const first = model.items[0];
    expect(first.id).toBe(SYSTEM_TOOLS[0].id);
    expect(first.actionId).toBe(SYSTEM_TOOLS[0].actionId);
    expect(first.iconName).toBe(SYSTEM_TOOLS[0].iconName);
    // No React component leaked in.
    expect(first).not.toHaveProperty("Icon");
    expect(isSerializable(model)).toBe(true);
  });
});

describe("dropdownMenuModel", () => {
  const item: DockDropdownItem = {
    kind: "dropdown",
    id: "my-tools",
    label: "My Tools",
    icon: { dark: "", light: "" },
    items: [
      { id: "opt-1", label: "One", icon: { dark: "d.png", light: "l.png" }, actionId: "do-one", customData: { a: 1 } },
      {
        id: "grp",
        label: "Group",
        icon: { dark: "", light: "" },
        children: [{ id: "opt-2", label: "Two", icon: { dark: "", light: "" }, actionId: "do-two" }],
      },
    ],
  };

  it("maps nodes, keeps actionId/customData, and nests children", () => {
    const model = dropdownMenuModel(item, "light");
    expect(model.title).toBe("My Tools");
    expect(model.items[0]).toMatchObject({ id: "opt-1", label: "One", actionId: "do-one", customData: { a: 1 } });
    // Icon with a URL is kept; empty icon is dropped.
    expect(model.items[0].icon).toEqual({ dark: "d.png", light: "l.png" });
    expect(model.items[1].icon).toBeUndefined();
    expect(model.items[1].children?.[0]).toMatchObject({ id: "opt-2", actionId: "do-two" });
    expect(isSerializable(model)).toBe(true);
  });
});

describe("workspaceMenuModel", () => {
  const list = [
    { id: "a", title: "Alpha" },
    { id: "b", title: "Beta" },
  ];

  it("lists workspaces, checks the active one, and appends Save-As + Restore", () => {
    const model = workspaceMenuModel(list, "b", "dark");
    expect(model.items[0]).toMatchObject({ id: `${WORKSPACE_MENU_APPLY_PREFIX}a`, label: "Alpha", checked: false });
    expect(model.items[1]).toMatchObject({ id: `${WORKSPACE_MENU_APPLY_PREFIX}b`, label: "Beta", checked: true });
    const ids = model.items.map((i) => i.id);
    expect(ids).toContain(WORKSPACE_MENU_SAVE_AS);
    expect(ids).toContain(WORKSPACE_MENU_RESTORE);
    expect(isSerializable(model)).toBe(true);
  });

  it("shows a disabled empty row when there are no saved workspaces", () => {
    const model = workspaceMenuModel([], null, "light");
    expect(model.items[0]).toMatchObject({ id: "workspace:empty", disabled: true });
    // Save-As + Restore still present; no Save (nothing active) / Manage (no list).
    expect(model.items.map((i) => i.id)).toEqual(
      expect.arrayContaining([WORKSPACE_MENU_SAVE_AS, WORKSPACE_MENU_RESTORE]),
    );
    expect(model.items.map((i) => i.id)).not.toContain(WORKSPACE_MENU_SAVE);
  });

  it("includes Save only when a workspace is active", () => {
    expect(workspaceMenuModel(list, null, "dark").items.map((i) => i.id)).not.toContain(
      WORKSPACE_MENU_SAVE,
    );
    expect(workspaceMenuModel(list, "a", "dark").items.map((i) => i.id)).toContain(
      WORKSPACE_MENU_SAVE,
    );
  });

  it("nests Rename + Delete (with a confirm step) under Manage workspaces", () => {
    const model = workspaceMenuModel(list, "a", "dark");
    const manage = model.items.find((i) => i.id === "workspace:manage");
    expect(manage?.children).toBeTruthy();
    const childIds = (manage?.children ?? []).map((c) => c.id);
    expect(childIds).toContain(`${WORKSPACE_MENU_RENAME_PREFIX}a`);
    // Delete is a submenu whose child is the actual confirm-delete leaf.
    const del = (manage?.children ?? []).find((c: DockMenuItem) => c.id === "a-delete");
    expect(del?.children?.[0]?.id).toBe(`${WORKSPACE_MENU_DELETE_PREFIX}a`);
  });
});

describe("appSwitcherMenuModel", () => {
  const apps = [
    { id: "blotter", title: "Blotter" },
    { id: "grid", title: "Grid" },
  ];

  it("lists running apps with the active one checked", () => {
    const model = appSwitcherMenuModel(apps, "grid", "dark");
    expect(model.items[0]).toMatchObject({ id: `${APP_SWITCHER_PREFIX}blotter`, checked: false });
    expect(model.items[1]).toMatchObject({ id: `${APP_SWITCHER_PREFIX}grid`, checked: true });
  });

  it("shows a disabled empty row when nothing is running", () => {
    const model = appSwitcherMenuModel([], null, "light");
    expect(model.items[0]).toMatchObject({ id: "app:empty", disabled: true });
  });
});
