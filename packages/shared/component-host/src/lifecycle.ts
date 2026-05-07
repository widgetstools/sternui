/**
 * OpenFin lifecycle events — pure TypeScript, no framework dependency.
 *
 * Provides a simple way for components to hook into the "close-requested"
 * event, which fires before a view or window is closed. Components use
 * this to flush any pending config saves before shutdown.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

/**
 * Register a callback for the OpenFin "close-requested" event.
 *
 * The callback should flush any pending saves and perform cleanup.
 * Returns an unsubscribe function.
 * Outside OpenFin: returns a no-op.
 */
export async function onCloseRequested(
  callback: () => Promise<void>,
): Promise<() => void> {
  if (typeof fin === "undefined") {
    return () => {}; // No-op outside OpenFin
  }

  try {
    // Views use fin.me, windows use fin.Window.getCurrentSync()
    const target = fin.me;
    await target.on("close-requested", callback);

    return () => {
      try {
        target.removeListener("close-requested", callback);
      } catch {
        // Ignore — view may already be destroyed
      }
    };
  } catch (err) {
    console.warn("Failed to register close-requested handler:", err);
    return () => {};
  }
}
