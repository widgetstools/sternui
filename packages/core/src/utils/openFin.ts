/**
 * OpenFin integration utilities for the PopoutPortal.
 *
 * OpenFin is an enterprise desktop-container runtime common in
 * financial trading terminals. When the app is running inside
 * OpenFin, `window.fin` is defined and exposes
 * `fin.Window.create(...)` for native OS windows with a richer
 * feature set than `window.open` (fixed position, title-bar
 * customisation, frame styling, etc.).
 *
 * Outside OpenFin (regular browser) these helpers are no-ops or
 * return undefined — the PopoutPortal then falls back to its
 * default `window.open` path.
 */

/**
 * Shape of the `window.fin` namespace we care about. OpenFin's own
 * type package is large and not worth depending on just for the two
 * APIs we touch; this structural type is enough to get type-safety
 * inside this module.
 */
interface OpenFinWindowWrapper {
  getInfo: () => Promise<unknown>;
  close: (force?: boolean) => Promise<void>;
  getWebWindow: () => Window;
}

interface OpenFinWindow {
  Window: {
    create: (opts: {
      name: string;
      url: string;
      defaultWidth?: number;
      defaultHeight?: number;
      autoShow?: boolean;
      frame?: boolean;
      resizable?: boolean;
      /**
       * Pin the window above all other windows. OpenFin-specific —
       * `window.open` has no web-platform equivalent.
       */
      alwaysOnTop?: boolean;
      /**
       * Groups windows into the same renderer process. Critical for
       * our React-portal pattern: `createPortal(children,
       * popoutWindow.document.body)` only works when main + popout
       * share a process + are same-origin. Default (undefined) puts
       * each new window in its own process → main's React VM can't
       * manipulate the popout's DOM and the portal silently no-ops.
       */
      processAffinity?: string;
    }) => Promise<OpenFinWindowWrapper>;
    /**
     * ASYNC in @openfin/core v2+ — returns a Promise<WindowWrapper>,
     * NOT a synchronous wrapper. Callers MUST await the result before
     * calling methods on it. See `wrapSync` for the synchronous
     * variant available in the same API.
     */
    wrap: (identity: { uuid: string; name: string }) => Promise<OpenFinWindowWrapper>;
    /** Synchronous wrapper factory — prefer this when you need the
     *  wrapper in a synchronous code path. */
    wrapSync?: (identity: { uuid: string; name: string }) => OpenFinWindowWrapper;
  };
  me?: {
    identity?: { uuid?: string };
  };
}

interface WithFin {
  fin?: OpenFinWindow;
}

/**
 * Stable process-affinity string for every popout this app creates.
 * Derived from the app uuid when available (so multiple OpenFin apps
 * on the same machine don't accidentally share a process); falls
 * back to a constant when `fin.me.identity` isn't populated.
 */
function popoutProcessAffinity(fin: OpenFinWindow): string {
  const appUuid = fin.me?.identity?.uuid;
  return appUuid ? `gc-popout:${appUuid}` : 'gc-popout';
}

/** True when running inside an OpenFin container. Safe in SSR. */
export function isOpenFin(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as WithFin).fin?.Window?.create === 'function';
}

/**
 * Diagnostic: dumps what we see of `window.fin`. Exposed for
 * console-debugging popout issues under OpenFin — run
 * `debugOpenFin()` in the main window's devtools to confirm the
 * runtime has populated the fin namespace and our type structure
 * matches reality.
 */
export function debugOpenFin(): Record<string, unknown> {
  if (typeof window === 'undefined') return { reason: 'no window (SSR)' };
  const fin = (window as WithFin).fin;
  return {
    hasFin: !!fin,
    hasWindow: !!fin?.Window,
    hasWindowCreate: typeof fin?.Window?.create,
    hasWindowWrap: typeof fin?.Window?.wrap,
    hasWindowWrapSync: typeof fin?.Window?.wrapSync,
    hasMe: !!fin?.me,
    meIdentityUuid: fin?.me?.identity?.uuid,
    locationHref: window.location?.href,
    locationOrigin: window.location?.origin,
  };
}
if (typeof window !== 'undefined') {
  (window as unknown as { __debugOpenFin?: typeof debugOpenFin }).__debugOpenFin = debugOpenFin;
}

/**
 * Returns a `PopoutPortal`-compatible `openWindow` callback that
 * creates OpenFin windows instead of plain browser windows. Returns
 * undefined when not running inside OpenFin — the caller should pass
 * `undefined` straight through to `PopoutPortal`, which will then
 * use its default `window.open` path.
 *
 * `alwaysOnTop`: optional hint to pin the popout above other
 * windows. OpenFin-only; the browser fallback silently ignores
 * it. Pass it via the caller-time options OR via the openWindow
 * call-site arg — the latter wins if both are set.
 *
 * Usage:
 * ```tsx
 * <PopoutPortal
 *   name="gc-popout-demo"
 *   onClose={() => setPopped(false)}
 *   openWindow={openFinWindowOpener({ alwaysOnTop: true })}
 * >
 *   <FormattingToolbar ... />
 * </PopoutPortal>
 * ```
 */
export function openFinWindowOpener(opts?: { alwaysOnTop?: boolean }):
  | ((opts: { name: string; width: number; height: number; alwaysOnTop?: boolean }) => Promise<Window | null>)
  | undefined {
  if (!isOpenFin()) {
    // Diagnostic: tell the dev WHY the OpenFin path isn't taken
    // even though the user expects it. Common causes: running in a
    // plain browser (expected), running in OpenFin but `window.fin`
    // hasn't been injected yet at the call site (unexpected — the
    // caller should invoke this at pop-out time, not at module
    // import time).
    if (typeof window !== 'undefined') {
      console.info('[openFin] not running inside OpenFin — window.open fallback will be used', debugOpenFin());
    }
    return undefined;
  }
  const fin = (window as WithFin).fin!;
  const callerAlwaysOnTop = opts?.alwaysOnTop ?? false;
  console.info('[openFin] opener built — appUuid:', fin.me?.identity?.uuid);

  /**
   * Best-effort close of any pre-existing window registered under
   * `(uuid, name)`. OpenFin rejects `Window.create` with
   * "name-uuid combination already in use" if one already lives
   * under that key. Sources of a pre-existing registration:
   *   - React StrictMode's double-invoke of the open effect in
   *     dev leaves the first mount's window around while the
   *     second tries to create.
   *   - A previous popout that was programmatically closed but
   *     whose registry entry hasn't fully cleared yet.
   *   - User rapid-clicking the popout button.
   *
   * Contract nuances that matter:
   *   - `fin.Window.wrap` is ASYNC in @openfin/core v2+ — callers
   *     MUST await it before using the wrapper. An earlier version
   *     of this code treated it as synchronous, so `wrapped.getInfo`
   *     was undefined, the "is not a function" error was silently
   *     caught as "not registered", and we skipped the close — the
   *     collision surfaced immediately at `Window.create`.
   *   - `wrapSync` is guaranteed synchronous. We prefer it when
   *     available (older runtimes may not expose it).
   *   - `getInfo()` throws if the window doesn't exist; we use that
   *     as the existence probe. If it resolves, the window IS
   *     registered — close + settle briefly so the registry unhooks
   *     the name before the subsequent create.
   */
  const closeExisting = async (uuid: string, name: string): Promise<void> => {
    try {
      const wrapped = fin.Window.wrapSync
        ? fin.Window.wrapSync({ uuid, name })
        : await fin.Window.wrap({ uuid, name });
      if (!wrapped || typeof wrapped.getInfo !== 'function') {
        // Guard: if the runtime returns something non-conforming,
        // don't pretend to probe — just bail and let create attempt.
        console.warn('[openFin] closeExisting: wrapped window has no getInfo');
        return;
      }
      await wrapped.getInfo();
      // Window exists — close it and wait for registry to release
      // the name. 150ms empirically avoids the rare follow-up
      // "still in use" on fast machines; tweak if needed.
      try { await wrapped.close(true); } catch { /* already gone */ }
      await new Promise((r) => setTimeout(r, 150));
    } catch {
      // getInfo rejected → window isn't registered → proceed.
    }
  };

  return async ({ name, width, height, alwaysOnTop }) => {
    const appUuid = fin.me?.identity?.uuid ?? 'gc-popout-host';
    const windowOpts = {
      name,
      url: 'about:blank',
      defaultWidth: width,
      defaultHeight: height,
      autoShow: true,
      frame: true,
      resizable: true,
      alwaysOnTop: alwaysOnTop ?? callerAlwaysOnTop,
      // REQUIRED for the React-portal pattern: without a shared
      // processAffinity, OpenFin puts each Window in its own
      // renderer process, and our main-window React VM can't write
      // into `popout.document.body`. Pinning all popouts to the
      // same affinity as the main app puts them in a shared
      // renderer so same-origin DOM access works.
      processAffinity: popoutProcessAffinity(fin),
    };

    // Up to 3 attempts: the first clears any stale registration
    // and creates; subsequent attempts retry with a growing
    // backoff if we hit a collision race (e.g. StrictMode double-
    // invoke where mount A's `Window.create` is still pending when
    // mount B tries, or close-and-reopen races where the OpenFin
    // registry hasn't fully unhooked the previous name yet).
    for (let attempt = 0; attempt < 3; attempt++) {
      await closeExisting(appUuid, name);
      try {
        const win = await fin.Window.create(windowOpts);
        return win.getWebWindow();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isNameCollision = msg.includes('already in use');
        if (!isNameCollision || attempt === 2) {
          console.warn(
            `[openFin] Window.create failed after ${attempt + 1} attempt(s) — falling back to window.open`,
            err,
          );
          return null;
        }
        // Grow the backoff on each retry. OpenFin's registry
        // sometimes needs an extra tick after close() for the
        // name to fully release.
        const backoff = 200 * (attempt + 1);
        console.info(`[openFin] name-collision on attempt ${attempt + 1}, retrying in ${backoff}ms`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    return null;
  };
}
