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
    wrap: (identity: { uuid: string; name: string }) => OpenFinWindowWrapper;
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
  if (!isOpenFin()) return undefined;
  const fin = (window as WithFin).fin!;
  const callerAlwaysOnTop = opts?.alwaysOnTop ?? false;

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
   * `getInfo()` throws if the window doesn't exist; we use that
   * as the existence probe. If it resolves, the window IS
   * registered — close + settle briefly so the registry unhooks
   * the name before the subsequent create.
   */
  const closeExisting = async (uuid: string, name: string): Promise<void> => {
    try {
      const wrapped = fin.Window.wrap({ uuid, name });
      await wrapped.getInfo();
      try { await wrapped.close(true); } catch { /* already gone */ }
      await new Promise((r) => setTimeout(r, 50));
    } catch {
      // Not registered — nothing to close, proceed.
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

    // Up to 2 attempts: the first clears any stale registration
    // and creates; the second retries with a backoff if we hit a
    // rare race (e.g. StrictMode double-invoke where mount A's
    // `Window.create` is still pending when mount B tries).
    for (let attempt = 0; attempt < 2; attempt++) {
      await closeExisting(appUuid, name);
      try {
        const win = await fin.Window.create(windowOpts);
        return win.getWebWindow();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isNameCollision = msg.includes('already in use');
        if (!isNameCollision || attempt === 1) {
          console.warn('[openFin] Window.create failed — falling back to window.open', err);
          return null;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    return null;
  };
}
