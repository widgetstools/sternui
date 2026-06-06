/**
 * Pure state core for the custom dock's workspace switcher (Phase 3 / S11).
 *
 * OpenFin-free and side-effect-free, so the checkmark-reset semantics are
 * unit-testable without a runtime. The `useSavedWorkspaces` hook drives this
 * reducer from a {@link WorkspaceController}; the switcher UI (S12) renders
 * `state.workspaces` and checks `isActiveWorkspace`.
 *
 * Two reset rules implement "show no checkmark when nothing saved is active":
 *   1. **Untitled reset** — OpenFin marks `UNTITLED_WORKSPACE_ID` active once
 *      the last Browser window closes (see `resetActiveWorkspaceWhenEmpty` in
 *      `workspace.ts`); `set-active` normalizes that (and `null`) to no active.
 *   2. **Deleted reset** — when the saved list changes and the active id is no
 *      longer in it (the active workspace was deleted), `set-workspaces` drops
 *      the active marker.
 */
import { UNTITLED_WORKSPACE_ID } from "@starui/openfin-platform/config";
import type { SavedWorkspace } from "./types";

export interface WorkspaceSwitcherState {
  workspaces: SavedWorkspace[];
  /** Active saved-workspace id, or `null` when nothing saved is active. */
  activeId: string | null;
}

export type WorkspaceSwitcherAction =
  | { type: "set-workspaces"; workspaces: SavedWorkspace[] }
  | { type: "set-active"; activeId: string | null };

export const initialWorkspaceSwitcherState: WorkspaceSwitcherState = {
  workspaces: [],
  activeId: null,
};

/** The untitled sentinel and `null` both mean "no active saved workspace". */
function isUntitled(id: string | null): boolean {
  return id == null || id === UNTITLED_WORKSPACE_ID;
}

export function workspaceSwitcherReducer(
  state: WorkspaceSwitcherState,
  action: WorkspaceSwitcherAction,
): WorkspaceSwitcherState {
  switch (action.type) {
    case "set-workspaces": {
      // Deleted reset: keep the active marker only if it's still in the list.
      const stillPresent =
        state.activeId != null && action.workspaces.some((w) => w.id === state.activeId);
      return {
        workspaces: action.workspaces,
        activeId: stillPresent ? state.activeId : null,
      };
    }
    case "set-active": {
      // Untitled reset: the sentinel / null → no active saved workspace.
      return { ...state, activeId: isUntitled(action.activeId) ? null : action.activeId };
    }
    default:
      return state;
  }
}

/** Does this workspace own the switcher checkmark? */
export function isActiveWorkspace(state: WorkspaceSwitcherState, id: string): boolean {
  return state.activeId != null && state.activeId === id;
}
