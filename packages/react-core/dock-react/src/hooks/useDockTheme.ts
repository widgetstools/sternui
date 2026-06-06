import { useEffect, useState } from "react";
import type { DockController, DockTheme } from "../types";

/**
 * Track the live platform theme through the injected {@link DockController}.
 *
 * Seeds from `controller.getTheme()` and re-renders whenever the theme
 * changes — whether from this window's own toggle or another window's
 * `IAB_THEME_CHANGED` broadcast (the host wires both into
 * `onThemeChanged`). Re-subscribes if the controller instance changes.
 */
export function useDockTheme(controller: DockController): DockTheme {
  const [theme, setTheme] = useState<DockTheme>(() => controller.getTheme());

  useEffect(() => {
    // Re-sync on (re)subscribe in case the theme moved between render and effect.
    setTheme(controller.getTheme());
    return controller.onThemeChanged(setTheme);
  }, [controller]);

  return theme;
}
