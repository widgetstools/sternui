import { useCallback, useEffect, useReducer } from "react";
import type { AppSwitcherController, RunningApp } from "../types";
import { initialRunningAppsState, runningAppsReducer } from "../runningApps";

export interface UseRunningAppsResult {
  /** The running apps, as last read from the controller. */
  apps: RunningApp[];
  /** Active app id (whose dock config is shown), or `null`. */
  activeId: string | null;
  /** Force a re-read of the running-app list + active id. */
  refresh: () => Promise<void>;
}

/**
 * Track the running apps + the active one through an {@link AppSwitcherController}
 * (Phase 5 / S18). Seeds on mount, re-reads on every `onRunningAppsChanged` fire
 * (app started / window created / closed), and feeds the pure
 * `runningAppsReducer` so the closed-app active-reset applies consistently.
 * Re-subscribes if the controller instance changes.
 */
export function useRunningApps(controller: AppSwitcherController): UseRunningAppsResult {
  const [state, dispatch] = useReducer(runningAppsReducer, initialRunningAppsState);

  const refresh = useCallback(async () => {
    const [apps, activeId] = await Promise.all([
      controller.listRunningApps(),
      controller.getActiveAppId(),
    ]);
    // Set the list first so `set-active`'s view of membership is current.
    dispatch({ type: "set-apps", apps });
    dispatch({ type: "set-active", activeId });
  }, [controller]);

  useEffect(() => {
    let alive = true;
    const run = () => {
      void refresh().catch((err) => {
        console.error("[dock] useRunningApps refresh failed:", err);
      });
    };
    run();
    const off = controller.onRunningAppsChanged(() => {
      if (alive) run();
    });
    return () => {
      alive = false;
      off();
    };
  }, [controller, refresh]);

  return { apps: state.apps, activeId: state.activeId, refresh };
}
