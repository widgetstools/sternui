/**
 * Background-freeze exemption for live data windows.
 *
 * Chromium freezes hidden/backgrounded pages (Page Lifecycle) — a
 * frozen page runs NO JavaScript: streaming blotters went blank on
 * inactive tabs / minimized windows until re-activated. Measured in
 * OpenFin 43: `backgroundThrottling: false` is inert at every level
 * (manifest defaults, platform-override stamping, runtime
 * `updateOptions` — accepted but never applied), and freeze onset is
 * minutes-fast.
 *
 * Chromium's freeze-eligibility policy exempts pages holding a Web
 * Lock (same blocker list as active IndexedDB transactions / WebRTC).
 * Holding a never-released lock marks this page "do not freeze":
 * timers may still be throttled while hidden (grid flushes stretch —
 * fine; MessagePort delivery is not timer-gated, so data keeps
 * applying), but the page cannot be frozen into a blank shell.
 *
 * Held once per document, forever, by every window that runs the
 * platform bootstrap — a live-data window is precisely a window that
 * must not freeze. No-op where the Web Locks API is unavailable.
 */

let held = false;

export function acquireBackgroundFreezeExemption(): void {
  if (held) return;
  if (typeof navigator === 'undefined' || !navigator.locks?.request) return;
  held = true;
  void navigator.locks
    .request('starui-background-freeze-exemption', () => new Promise<void>(() => {
      /* held for the lifetime of the document — never resolves */
    }))
    .catch(() => {
      held = false; // lock manager unavailable (shutdown) — harmless
    });
}

/** Test-only: reset the held flag. */
export function _resetBackgroundFreezeExemptionForTests(): void {
  held = false;
}
