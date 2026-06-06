import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import {
  initialRunningAppsState,
  runningAppsReducer,
  isActiveApp,
  type RunningAppsState,
} from "./runningApps";
import { useRunningApps } from "./hooks/useRunningApps";
import type { AppSwitcherController, RunningApp } from "./types";

const app = (id: string, title = id): RunningApp => ({ id, title });
const list: RunningApp[] = [app("blotter", "Blotter"), app("grid", "Grid")];

describe("runningAppsReducer", () => {
  it("set-apps stores the list and leaves active null when none was set", () => {
    const next = runningAppsReducer(initialRunningAppsState, { type: "set-apps", apps: list });
    expect(next.apps).toEqual(list);
    expect(next.activeId).toBeNull();
  });

  it("set-active marks a running app active", () => {
    const seeded: RunningAppsState = { apps: list, activeId: null };
    const next = runningAppsReducer(seeded, { type: "set-active", activeId: "grid" });
    expect(next.activeId).toBe("grid");
    expect(isActiveApp(next, "grid")).toBe(true);
    expect(isActiveApp(next, "blotter")).toBe(false);
  });

  it("set-active accepts null (no active app)", () => {
    const seeded: RunningAppsState = { apps: list, activeId: "grid" };
    const next = runningAppsReducer(seeded, { type: "set-active", activeId: null });
    expect(next.activeId).toBeNull();
  });

  it("set-apps drops the active marker when the active app is no longer running", () => {
    const seeded: RunningAppsState = { apps: list, activeId: "grid" };
    const next = runningAppsReducer(seeded, { type: "set-apps", apps: [app("blotter", "Blotter")] });
    expect(next.activeId).toBeNull();
  });

  it("set-apps keeps the active marker when the active app survives", () => {
    const seeded: RunningAppsState = { apps: list, activeId: "blotter" };
    const next = runningAppsReducer(seeded, {
      type: "set-apps",
      apps: [app("blotter", "Blotter renamed"), app("new")],
    });
    expect(next.activeId).toBe("blotter");
  });

  it("is a pure function (does not mutate the input state)", () => {
    const seeded: RunningAppsState = { apps: list, activeId: "blotter" };
    const frozen = Object.freeze(seeded);
    expect(() =>
      runningAppsReducer(frozen, { type: "set-active", activeId: "grid" }),
    ).not.toThrow();
    expect(seeded.activeId).toBe("blotter");
  });
});

describe("useRunningApps", () => {
  function fakeController(
    overrides: Partial<AppSwitcherController> & { apps?: RunningApp[]; activeId?: string | null } = {},
  ): AppSwitcherController & { fire: () => void } {
    let fire = () => {};
    return {
      fire: () => fire(),
      listRunningApps: vi.fn(async () => overrides.apps ?? list),
      getActiveAppId: vi.fn(async () => overrides.activeId ?? null),
      switchToApp: vi.fn(async () => {}),
      onRunningAppsChanged: (listener: () => void) => {
        fire = listener;
        return () => { fire = () => {}; };
      },
    };
  }

  it("seeds apps + active id from the controller", async () => {
    const controller = fakeController({ activeId: "blotter" });
    const { result } = renderHook(() => useRunningApps(controller));
    await waitFor(() => expect(result.current.apps).toHaveLength(2));
    expect(result.current.activeId).toBe("blotter");
  });

  it("re-reads when the controller signals a change (closed app clears active)", async () => {
    let apps = list;
    let active: string | null = "grid";
    const controller = fakeController();
    (controller.listRunningApps as ReturnType<typeof vi.fn>).mockImplementation(async () => apps);
    (controller.getActiveAppId as ReturnType<typeof vi.fn>).mockImplementation(async () => active);
    const { result } = renderHook(() => useRunningApps(controller));
    await waitFor(() => expect(result.current.activeId).toBe("grid"));

    apps = [app("blotter", "Blotter")]; // 'grid' closed
    active = "grid"; // host may still briefly report it; reducer drops it (not in list)
    act(() => controller.fire());
    await waitFor(() => expect(result.current.activeId).toBeNull());
    expect(result.current.apps).toHaveLength(1);
  });
});
