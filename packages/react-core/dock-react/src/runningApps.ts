/**
 * Pure state core for the custom dock's app-switcher (Phase 5 / S18).
 *
 * OpenFin-free and side-effect-free, so the running-app tracking + active-app
 * reset semantics are unit-testable without a runtime. The `useRunningApps`
 * hook drives this reducer from an {@link AppSwitcherController}; the switcher
 * UI (S19) renders `state.apps` and checks `isActiveApp`.
 *
 * Mirrors the workspace-switcher reducer's shape: a full `set-apps` (the hook
 * re-reads the list on each controller event) plus `set-active`, with a
 * **closed reset** — if the active app is no longer running, its active marker
 * is dropped so the switcher doesn't point at a dead scope.
 */
import type { RunningApp } from "./types";

export interface RunningAppsState {
  apps: RunningApp[];
  /** Active app id (whose dock config is shown), or `null` when none. */
  activeId: string | null;
}

export type RunningAppsAction =
  | { type: "set-apps"; apps: RunningApp[] }
  | { type: "set-active"; activeId: string | null };

export const initialRunningAppsState: RunningAppsState = {
  apps: [],
  activeId: null,
};

export function runningAppsReducer(
  state: RunningAppsState,
  action: RunningAppsAction,
): RunningAppsState {
  switch (action.type) {
    case "set-apps": {
      // Closed reset: keep the active marker only if it's still running.
      const stillRunning =
        state.activeId != null && action.apps.some((a) => a.id === state.activeId);
      return {
        apps: action.apps,
        activeId: stillRunning ? state.activeId : null,
      };
    }
    case "set-active": {
      // Invariant: active is always null or a currently-running app. Guards the
      // case where the host still reports a just-closed app as active.
      const present =
        action.activeId != null && state.apps.some((a) => a.id === action.activeId);
      return { ...state, activeId: present ? action.activeId : null };
    }
    default:
      return state;
  }
}

/** Does this app own the switcher's active marker? */
export function isActiveApp(state: RunningAppsState, id: string): boolean {
  return state.activeId != null && state.activeId === id;
}
