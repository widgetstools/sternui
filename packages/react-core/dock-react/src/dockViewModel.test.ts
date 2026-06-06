import { describe, it, expect } from "vitest";
import type { DockEditorConfig } from "@starui/openfin-platform/config";
import { dockConfigToViewModel, resolveDockIcon } from "./dockViewModel";
import type { DockDropdownItem, DockLaunchItem } from "./types";

const cfg = (buttons: DockEditorConfig["buttons"]): DockEditorConfig => ({
  version: 1,
  buttons,
  updatedAt: "2026-06-06T00:00:00.000Z",
});

describe("resolveDockIcon", () => {
  it("returns empty URLs when nothing is configured", () => {
    expect(resolveDockIcon({})).toEqual({ dark: "", light: "" });
  });

  it("uses a fixed color for both themes when iconColor + iconId are set", () => {
    const spec = resolveDockIcon({ iconId: "lucide:home", iconColor: "#0A76D3" });
    expect(spec.dark).toBe(spec.light);
    expect(spec.dark).toContain("api.iconify.design/lucide/home");
    expect(spec.dark).toContain(encodeURIComponent("#0A76D3"));
  });

  it("produces distinct per-theme URLs from an iconId alone", () => {
    const spec = resolveDockIcon({ iconId: "lucide:home" });
    expect(spec.dark).toContain("api.iconify.design/lucide/home");
    expect(spec.light).toContain("api.iconify.design/lucide/home");
    // The two themes resolve to different text.primary colors.
    expect(spec.dark).not.toBe(spec.light);
  });

  it("passes a raw iconUrl through unchanged for both themes", () => {
    const spec = resolveDockIcon({ iconUrl: "https://cdn.example/icon.png" });
    expect(spec).toEqual({
      dark: "https://cdn.example/icon.png",
      light: "https://cdn.example/icon.png",
    });
  });
});

describe("dockConfigToViewModel", () => {
  it("returns an empty item list for null/empty config", () => {
    expect(dockConfigToViewModel(null).items).toEqual([]);
    expect(dockConfigToViewModel(undefined).items).toEqual([]);
    expect(dockConfigToViewModel(cfg([])).items).toEqual([]);
  });

  it("maps an ActionButton to a launch item", () => {
    const vm = dockConfigToViewModel(
      cfg([
        {
          type: "ActionButton",
          id: "app-blotter",
          tooltip: "Blotter",
          iconUrl: "",
          iconId: "lucide:table",
          actionId: "launch-app",
          customData: { appId: "blotter" },
        },
      ]),
    );
    expect(vm.items).toHaveLength(1);
    const item = vm.items[0] as DockLaunchItem;
    expect(item.kind).toBe("launch");
    expect(item.id).toBe("app-blotter");
    expect(item.label).toBe("Blotter");
    expect(item.actionId).toBe("launch-app");
    expect(item.customData).toEqual({ appId: "blotter" });
    expect(item.icon.dark).toContain("lucide/table");
  });

  it("maps a DropdownButton with nested options to a dropdown item tree", () => {
    const vm = dockConfigToViewModel(
      cfg([
        {
          type: "DropdownButton",
          id: "tools",
          tooltip: "My Tools",
          iconUrl: "",
          iconId: "lucide:wrench",
          options: [
            {
              id: "leaf",
              tooltip: "Leaf",
              iconId: "lucide:file",
              actionId: "launch-component",
              customData: { registryEntryId: "x" },
            },
            {
              id: "sub",
              tooltip: "Sub",
              iconId: "lucide:folder",
              options: [
                { id: "nested", tooltip: "Nested", actionId: "do-nested" },
              ],
            },
          ],
        },
      ]),
    );
    const item = vm.items[0] as DockDropdownItem;
    expect(item.kind).toBe("dropdown");
    expect(item.items).toHaveLength(2);

    const leaf = item.items[0];
    expect(leaf.children).toBeUndefined();
    expect(leaf.actionId).toBe("launch-component");
    expect(leaf.customData).toEqual({ registryEntryId: "x" });

    const sub = item.items[1];
    expect(sub.children).toHaveLength(1);
    expect(sub.children?.[0].id).toBe("nested");
    expect(sub.children?.[0].actionId).toBe("do-nested");
  });

  it("preserves button order", () => {
    const vm = dockConfigToViewModel(
      cfg([
        { type: "ActionButton", id: "a", tooltip: "A", iconUrl: "", actionId: "x" },
        { type: "ActionButton", id: "b", tooltip: "B", iconUrl: "", actionId: "y" },
        { type: "ActionButton", id: "c", tooltip: "C", iconUrl: "", actionId: "z" },
      ]),
    );
    expect(vm.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});
