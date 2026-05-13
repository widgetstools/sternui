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
 *   - `@starui/runtime-openfin` — wraps `fin.*`
 *   - `@starui/runtime-browser` — uses URL params, prefers-color-scheme,
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
   * Set the active theme. The runtime is the single writer:
   *
   *   1. Updates `[data-theme]` on `document.documentElement`.
   *   2. Persists to the canonical `THEME_STORAGE_KEY` localStorage key.
   *   3. Broadcasts to peer windows:
   *      - Browser: a `BroadcastChannel` named `THEME_BROADCAST_CHANNEL`.
   *      - OpenFin: the `theme-changed` IAB topic.
   *   4. Notifies local `onThemeChanged` subscribers.
   *
   * Idempotent — setting the same theme twice is a no-op (no events
   * re-fire, no peer notifications).
   *
   * No-op when called after `dispose()`.
   */
  setTheme(theme: Theme): void;

  /**
   * Subscribe to theme changes from ANY source — local `setTheme()`,
   * peer-window broadcasts, external `[data-theme]` mutations, or
   * OS `prefers-color-scheme` flips (browser only, when no
   * persisted preference exists).
   *
   * The runtime arbitrates these inputs through one internal state
   * value; subscribers see one consistent stream of changes.
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
   * "The OpenFin platform's workspace just saved." Hosted components
   * use this as a flush-to-disk hook: persist any in-memory state
   * the user expects to survive a workspace reload.
   *
   * - OpenFin: bridges to the platform's `'workspace-saved'` event
   *   (fired by `WorkspacePlatform` when `Storage.saveWorkspace()`
   *   resolves, or when an auto-save triggers).
   * - Browser: emits no events (returns a no-op unsubscribe). Plain
   *   browsers don't have a workspace concept; per-component
   *   persistence happens through `configManager` directly.
   *
   * Handlers may be async; the runtime fires them in parallel and
   * does NOT await individual handlers (workspace-saved is a
   * notification, not a coordination primitive).
   */
  onWorkspaceSave(fn: () => void | Promise<void>): Unsubscribe;

  /**
   * Tear down all listeners and any cached state. After `dispose()`
   * the port is unusable; subsequent calls should be no-ops or throw.
   */
  dispose(): void;
}
