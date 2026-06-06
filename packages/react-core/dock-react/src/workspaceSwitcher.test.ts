import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { UNTITLED_WORKSPACE_ID } from "@starui/openfin-platform/config";
import {
  initialWorkspaceSwitcherState,
  workspaceSwitcherReducer,
  isActiveWorkspace,
  type WorkspaceSwitcherState,
} from "./workspaceSwitcher";
import { useSavedWorkspaces } from "./hooks/useSavedWorkspaces";
import type { SavedWorkspace, WorkspaceController } from "./types";

const ws = (id: string, title = id): SavedWorkspace => ({ id, title });
const list: SavedWorkspace[] = [ws("a", "Alpha"), ws("b", "Beta")];

describe("workspaceSwitcherReducer", () => {
  it("set-workspaces stores the list and leaves active null when none was set", () => {
    const next = workspaceSwitcherReducer(initialWorkspaceSwitcherState, {
      type: "set-workspaces",
      workspaces: list,
    });
    expect(next.workspaces).toEqual(list);
    expect(next.activeId).toBeNull();
  });

  it("set-active marks a real workspace active", () => {
    const seeded: WorkspaceSwitcherState = { workspaces: list, activeId: null };
    const next = workspaceSwitcherReducer(seeded, { type: "set-active", activeId: "b" });
    expect(next.activeId).toBe("b");
    expect(isActiveWorkspace(next, "b")).toBe(true);
    expect(isActiveWorkspace(next, "a")).toBe(false);
  });

  it("set-active resets the checkmark for the untitled sentinel", () => {
    const seeded: WorkspaceSwitcherState = { workspaces: list, activeId: "a" };
    const next = workspaceSwitcherReducer(seeded, {
      type: "set-active",
      activeId: UNTITLED_WORKSPACE_ID,
    });
    expect(next.activeId).toBeNull();
  });

  it("set-active resets the checkmark for null (empty desktop)", () => {
    const seeded: WorkspaceSwitcherState = { workspaces: list, activeId: "a" };
    const next = workspaceSwitcherReducer(seeded, { type: "set-active", activeId: null });
    expect(next.activeId).toBeNull();
  });

  it("set-workspaces drops the active marker when the active workspace was deleted", () => {
    const seeded: WorkspaceSwitcherState = { workspaces: list, activeId: "b" };
    const next = workspaceSwitcherReducer(seeded, {
      type: "set-workspaces",
      workspaces: [ws("a", "Alpha")], // 'b' deleted
    });
    expect(next.activeId).toBeNull();
  });

  it("set-workspaces keeps the active marker when the active workspace survives", () => {
    const seeded: WorkspaceSwitcherState = { workspaces: list, activeId: "a" };
    const next = workspaceSwitcherReducer(seeded, {
      type: "set-workspaces",
      workspaces: [ws("a", "Alpha renamed"), ws("c")],
    });
    expect(next.activeId).toBe("a");
  });

  it("is a pure function (does not mutate the input state)", () => {
    const seeded: WorkspaceSwitcherState = { workspaces: list, activeId: "a" };
    const frozen = Object.freeze(seeded);
    expect(() =>
      workspaceSwitcherReducer(frozen, { type: "set-active", activeId: "b" }),
    ).not.toThrow();
    expect(seeded.activeId).toBe("a");
  });
});

describe("useSavedWorkspaces", () => {
  function fakeController(
    overrides: Partial<WorkspaceController> & {
      workspaces?: SavedWorkspace[];
      activeId?: string | null;
    } = {},
  ): WorkspaceController & { fire: () => void } {
    let fire = () => {};
    return {
      fire: () => fire(),
      listWorkspaces: vi.fn(async () => overrides.workspaces ?? list),
      getActiveWorkspaceId: vi.fn(async () => overrides.activeId ?? null),
      applyWorkspace: vi.fn(async () => {}),
      saveWorkspaceAs: vi.fn(async () => {}),
      restoreLastSavedWorkspace: vi.fn(async () => {}),
      saveWorkspace: vi.fn(async () => {}),
      renameWorkspace: vi.fn(async () => {}),
      deleteWorkspace: vi.fn(async () => {}),
      onWorkspaceChanged: (listener: () => void) => {
        fire = listener;
        return () => { fire = () => {}; };
      },
    };
  }

  it("seeds workspaces + active id from the controller", async () => {
    const controller = fakeController({ activeId: "a" });
    const { result } = renderHook(() => useSavedWorkspaces(controller));
    await waitFor(() => expect(result.current.workspaces).toHaveLength(2));
    expect(result.current.activeId).toBe("a");
  });

  it("re-reads when the controller signals a change", async () => {
    let active: string | null = "a";
    const controller = fakeController();
    (controller.getActiveWorkspaceId as ReturnType<typeof vi.fn>).mockImplementation(
      async () => active,
    );
    const { result } = renderHook(() => useSavedWorkspaces(controller));
    await waitFor(() => expect(result.current.activeId).toBe("a"));

    active = UNTITLED_WORKSPACE_ID; // e.g. last window closed
    act(() => controller.fire());
    await waitFor(() => expect(result.current.activeId).toBeNull());
  });
});
