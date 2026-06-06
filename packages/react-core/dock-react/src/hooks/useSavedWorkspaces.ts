import { useCallback, useEffect, useReducer } from "react";
import type { SavedWorkspace, WorkspaceController } from "../types";
import {
  initialWorkspaceSwitcherState,
  workspaceSwitcherReducer,
} from "../workspaceSwitcher";

export interface UseSavedWorkspacesResult {
  /** The saved workspaces, as last read from the controller. */
  workspaces: SavedWorkspace[];
  /** Active saved-workspace id, or `null` when nothing saved is active. */
  activeId: string | null;
  /** Force a re-read of the list + active id. */
  refresh: () => Promise<void>;
}

/**
 * Track the saved workspaces + the active one through a {@link WorkspaceController}
 * (Phase 3 / S11). Seeds on mount, re-reads on every `onWorkspaceChanged` fire
 * (save / delete / switch / empty-desktop reset), and feeds the pure
 * `workspaceSwitcherReducer` so the untitled / deleted checkmark-reset rules
 * apply consistently. Re-subscribes if the controller instance changes.
 */
export function useSavedWorkspaces(controller: WorkspaceController): UseSavedWorkspacesResult {
  const [state, dispatch] = useReducer(workspaceSwitcherReducer, initialWorkspaceSwitcherState);

  const refresh = useCallback(async () => {
    const [workspaces, activeId] = await Promise.all([
      controller.listWorkspaces(),
      controller.getActiveWorkspaceId(),
    ]);
    // Set the list first so `set-active`'s view of membership is current.
    dispatch({ type: "set-workspaces", workspaces });
    dispatch({ type: "set-active", activeId });
  }, [controller]);

  useEffect(() => {
    let alive = true;
    const run = () => {
      void refresh().catch((err) => {
        console.error("[dock] useSavedWorkspaces refresh failed:", err);
      });
    };
    run();
    const off = controller.onWorkspaceChanged(() => {
      if (alive) run();
    });
    return () => {
      alive = false;
      off();
    };
  }, [controller, refresh]);

  return { workspaces: state.workspaces, activeId: state.activeId, refresh };
}
