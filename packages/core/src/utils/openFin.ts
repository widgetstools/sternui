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
    }) => Promise<{
      getWebWindow: () => Window;
    }>;
  };
}

interface WithFin {
  fin?: OpenFinWindow;
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
 * Usage:
 * ```tsx
 * <PopoutPortal
 *   name="gc-popout-demo"
 *   onClose={() => setPopped(false)}
 *   openWindow={openFinWindowOpener()}
 * >
 *   <SettingsSheet ... />
 * </PopoutPortal>
 * ```
 */
export function openFinWindowOpener():
  | ((opts: { name: string; width: number; height: number }) => Promise<Window | null>)
  | undefined {
  if (!isOpenFin()) return undefined;
  const fin = (window as WithFin).fin!;
  return async ({ name, width, height }) => {
    try {
      const openFinWin = await fin.Window.create({
        name,
        url: 'about:blank',
        defaultWidth: width,
        defaultHeight: height,
        autoShow: true,
        frame: true,
        resizable: true,
      });
      return openFinWin.getWebWindow();
    } catch (err) {
      console.warn('[openFin] Window.create failed — falling back to window.open', err);
      return null;
    }
  };
}
