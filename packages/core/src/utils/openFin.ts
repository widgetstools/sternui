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
    }) => Promise<{
      getWebWindow: () => Window;
    }>;
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
  return async ({ name, width, height, alwaysOnTop }) => {
    try {
      const openFinWin = await fin.Window.create({
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
        // renderer process, and our main-window React VM can't
        // write into `popout.document.body`. Result: the window
        // opens, the portal effectively no-ops, and our close-
        // detection poll ends up tearing the window down. Pinning
        // all popouts to the same affinity as the main app puts
        // them in a shared renderer so same-origin DOM access
        // works.
        processAffinity: popoutProcessAffinity(fin),
      });
      return openFinWin.getWebWindow();
    } catch (err) {
      console.warn('[openFin] Window.create failed — falling back to window.open', err);
      return null;
    }
  };
}
