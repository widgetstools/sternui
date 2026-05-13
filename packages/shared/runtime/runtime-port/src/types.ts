/**
 * Runtime-agnostic types. Foundation layer — no runtime imports.
 */

/**
 * Canonical logged-in user identifier.
 *
 * The codebase intentionally does NOT auto-generate user ids (no
 * `dev-user-001` style randoms, no env-driven overrides) — every
 * runtime/identity path resolves `userId` to this single value so
 * persisted rows always land under the same `(appId, userId)` scope
 * regardless of platform, view, or launch context. Replace the literal
 * with the result of a real auth lookup the day SSO is wired in; until
 * then this constant is the single source of truth.
 */
export const LOGGED_IN_USER_ID = 'dev1';

export type Theme = 'light' | 'dark';

/**
 * Canonical localStorage key for the persisted theme.
 *
 * Single source of truth: every runtime + the design-system's
 * `applyTheme()` / `getTheme()` read and write to this one key.
 * Previously apps used divergent keys (`gc-theme`, `theme`,
 * `@starui/theme`); a window persisting one key wouldn't see the
 * preference set by another, so theme would silently reset on a
 * cross-window navigation.
 */
export const THEME_STORAGE_KEY = 'starui:theme';

/**
 * BroadcastChannel name used by `BrowserRuntime` to keep multiple
 * tabs / popouts in lockstep. The receiving runtime applies the
 * payload without re-broadcasting (the channel itself fans-out to
 * peers; echoing back would loop). OpenFin uses its own IAB topic
 * and ignores this channel.
 */
export const THEME_BROADCAST_CHANNEL = 'starui:theme';

export type Unsubscribe = () => void;

/**
 * Identity resolved from the surrounding runtime context.
 *
 * - In OpenFin: from `view.getOptions().customData` first, falling back
 *   to `window.location.search` and finally to constructor mount props.
 * - In a browser: from `window.location.search`, falling back to mount
 *   props, with stable `instanceId` minted from `crypto.randomUUID()`.
 *
 * Identity is captured ONCE at host mount and treated as immutable for
 * the lifetime of the host. Updates to customData propagate via
 * `onCustomDataChanged`, not by re-issuing an `IdentitySnapshot`.
 */
export interface IdentitySnapshot {
  /** Stable per-instance identifier (window name on OpenFin; UUID on browser). */
  readonly instanceId: string;
  /** Logical app this instance belongs to (shared across components inside one app). */
  readonly appId: string;
  /** End user identifier — persistence keys derive from this. */
  readonly userId: string;
  /** Registry component type (e.g. `'MarketsGrid'`, `'OrderBook'`). */
  readonly componentType: string;
  /** Optional registry component subtype (e.g. `'positions'` for a positions blotter). */
  readonly componentSubType: string;
  /** True when this instance is editing the registry template, not a live instance. */
  readonly isTemplate: boolean;
  /** True when only one instance of this component may exist per app. */
  readonly singleton: boolean;
  /** Role names asserted at launch. Authoritative source is the config service. */
  readonly roles: readonly string[];
  /** Permission names asserted at launch. Authoritative source is the config service. */
  readonly permissions: readonly string[];
  /** Raw launch payload — kept opaque so component code can read framework-specific keys. */
  readonly customData: Readonly<Record<string, unknown>>;
}

/** Where a child surface should appear. */
export type SurfaceKind = 'popout' | 'modal' | 'inpage';

/** Description of a child surface to open. */
export interface SurfaceSpec {
  /** Where the surface should appear. */
  readonly kind: SurfaceKind;
  /** URL to load. */
  readonly url: string;
  /** Window/dialog dimensions in CSS pixels. */
  readonly width?: number;
  /** Window/dialog dimensions in CSS pixels. */
  readonly height?: number;
  /** Window/modal title (display text). */
  readonly title?: string;
  /**
   * Stable window name used for de-duplication. A second openSurface()
   * call with the same `windowName` focuses the existing window (and
   * navigates it if the URL has changed) instead of spawning a duplicate.
   *
   * - OpenFin: passed as the window `name` on `fin.Window.create({...})`.
   * - Browser: passed as the second arg to `window.open(url, name, ...)`.
   *
   * Falls back to `title` when omitted; falls back to `'_blank'` when
   * both are absent (every call spawns a new window).
   */
  readonly windowName?: string;
  /** Forwarded payload — appears as `customData` on OpenFin views; query string on browser. */
  readonly customData?: Readonly<Record<string, unknown>>;
}

/** Handle to an opened child surface. Clean up by calling `close()` or returning the unsubscribe. */
export interface SurfaceHandle {
  /** Surface kind that was opened. */
  readonly kind: SurfaceKind;
  /** Implementation-specific identity (window name, modal id, etc.). */
  readonly id: string;
  /** Close the opened surface. */
  close(): void;
  /** Bring the surface to the foreground. Optional because in-page surfaces don't focus. */
  focus?(): void;
  /** Subscribe to the surface's close event — fires once. Returned unsubscribe is idempotent. */
  onClosed(fn: () => void): Unsubscribe;
}
