/**
 * Theme subscription — pure TypeScript, no framework dependency.
 *
 * Subscribes to the IAB "theme-changed" topic published by the dock's
 * theme toggle button. Returns the current theme and a cleanup function.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { IAB_THEME_CHANGED } from "@markets/openfin-workspace";

/**
 * Read the current platform theme.
 *
 * Inside OpenFin: queries the platform Theme API.
 * Outside OpenFin: returns the provided default (or 'dark').
 */
export async function getCurrentTheme(
  defaultTheme: "dark" | "light" = "dark",
): Promise<"dark" | "light"> {
  if (typeof fin === "undefined") return defaultTheme;

  try {
    const platform = fin.Platform.getCurrentSync();
    const scheme = await platform.Theme.getSelectedScheme();
    return scheme === "dark" ? "dark" : "light";
  } catch {
    return defaultTheme;
  }
}

/**
 * Subscribe to theme changes via InterApplicationBus.
 *
 * The dock toggle publishes `{ isDark: boolean }` on the
 * "theme-changed" topic whenever the user switches themes.
 *
 * Returns an unsubscribe function for cleanup.
 * Outside OpenFin: returns a no-op unsubscribe.
 */
export async function subscribeToTheme(
  onChange: (theme: "dark" | "light") => void,
): Promise<() => void> {
  if (typeof fin === "undefined") {
    return () => {}; // No-op outside OpenFin
  }

  const handler = (data: { isDark: boolean }) => {
    onChange(data.isDark ? "dark" : "light");
  };

  try {
    await fin.InterApplicationBus.subscribe(
      { uuid: fin.me.identity.uuid },
      IAB_THEME_CHANGED,
      handler,
    );
  } catch (err) {
    console.warn("Failed to subscribe to theme changes:", err);
    return () => {};
  }

  // Return cleanup function
  return () => {
    try {
      fin.InterApplicationBus.unsubscribe(
        { uuid: fin.me.identity.uuid },
        IAB_THEME_CHANGED,
        handler,
      );
    } catch {
      // Ignore cleanup errors — window may already be closing
    }
  };
}
