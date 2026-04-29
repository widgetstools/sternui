import type {
  IdentitySnapshot,
  SurfaceHandle,
  SurfaceSpec,
  Theme,
  Unsubscribe,
} from './types.js';

/**
 * `RuntimePort` — Seam #1 of the architecture (see docs/ARCHITECTURE.md).
 *
 * A `RuntimePort` abstracts every cross-cutting concern that differs
 * between an OpenFin runtime and a plain browser runtime:
 * identity resolution, child-surface opening, theme propagation, and
 * window lifecycle events.
 *
 * Component code never imports `@openfin/core` directly. Instead, the
 * component gets a `RuntimePort` from the surrounding `HostWrapper` /
 * `HostContext` and works through this small surface.
 *
 * Implementations live in:
 *   - `@marketsui/runtime-openfin` — wraps `fin.*`
 *   - `@marketsui/runtime-browser` — uses URL params, prefers-color-scheme,
 *     `window.open` / in-page modal.
 *
 * **Lifecycle.** A `RuntimePort` is constructed once per host (typically
 * by the runtime-aware shell at app start) and disposed when the host
 * tears down.
 */
export interface RuntimePort {
  /** Stable identifier for telemetry/logging. */
  readonly name: 'openfin' | 'browser' | string;

  /**
   * Resolve component identity from the surrounding runtime.
   *
   * Called once when the `HostWrapper` mounts. The result is cached and
   * exposed via `HostContext`. Subsequent identity changes (`customData`
   * updates, etc.) come through `onCustomDataChanged`, not by re-calling
   * this method.
   */
  resolveIdentity(): IdentitySnapshot;

  /**
   * Open a child surface — popout window, modal, or in-page panel.
   *
   * Returns a `SurfaceHandle` the caller MUST eventually `close()` or
   * subscribe to via `onClosed`. The runtime owns the surface; the
   * caller can reach into it only through this handle.
   */
  openSurface(spec: SurfaceSpec): Promise<SurfaceHandle>;

  /** Current theme — synchronous so consumers can render the first frame correctly. */
  getTheme(): Theme;

  /**
   * Subscribe to theme changes.
   * - OpenFin: bridges to the platform-level theme broadcast.
   * - Browser: tracks `prefers-color-scheme` AND any explicit
   *   `[data-theme]` attribute set on `document.documentElement`.
   */
  onThemeChanged(fn: (theme: Theme) => void): Unsubscribe;

  /**
   * "This window/view became visible." Fires for the initial show and
   * subsequent show-from-hidden transitions.
   */
  onWindowShown(fn: () => void): Unsubscribe;

  /**
   * "This window/view is about to close." Fires once per lifetime.
   * Listeners should treat it as a flush-to-disk moment, not a confirm.
   */
  onWindowClosing(fn: () => void): Unsubscribe;

  /**
   * Subscribe to runtime-driven `customData` updates.
   * - OpenFin: bridges to `view.updateOptions({ customData })` etc.
   * - Browser: emits no events (returns a no-op unsubscribe).
   */
  onCustomDataChanged(fn: (customData: Readonly<Record<string, unknown>>) => void): Unsubscribe;

  /**
   * Tear down all listeners and any cached state. After `dispose()`
   * the port is unusable; subsequent calls should be no-ops or throw.
   */
  dispose(): void;
}
