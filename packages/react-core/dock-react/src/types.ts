/**
 * Public types for `@starui/dock-react` — the custom OpenFin dock UI.
 *
 * This package is deliberately free of any `@openfin/*` import. Every
 * runtime side-effect the dock bar needs (dispatching an action to the
 * provider's `dockActionHandlers`, reading/toggling the platform theme)
 * is reached through the injected {@link DockController} interface, which
 * the OpenFin host (the `/dock` window route) implements over an IAB /
 * channel round-trip. That keeps the bar a pure, unit-testable React tree
 * and honours the repo's import-boundary rule (UI packages must not import
 * OpenFin).
 */

import type { DockEntryIcon } from "@starui/openfin-platform/config";

export type DockTheme = "dark" | "light";

/**
 * A pre-resolved, theme-aware icon: a data/CDN URL for each scheme. Either
 * variant may be an empty string when no icon was configured. Built by the
 * view-model mapping from the editor config's `iconId` / `iconUrl` /
 * `iconColor`.
 */
export interface DockIconSpec {
  dark: string;
  light: string;
}

/** A top-level launcher button — clicking it dispatches a single action. */
export interface DockLaunchItem {
  kind: "launch";
  id: string;
  /** Button tooltip / accessible label. */
  label: string;
  icon: DockIconSpec;
  actionId: string;
  customData?: unknown;
}

/**
 * A node inside a dropdown button's menu. A leaf carries an `actionId`;
 * a node with `children` renders as a nested sub-menu.
 */
export interface DockMenuNode {
  id: string;
  label: string;
  icon: DockIconSpec;
  actionId?: string;
  customData?: unknown;
  children?: DockMenuNode[];
}

/** A top-level dropdown button — opens a (possibly nested) menu. */
export interface DockDropdownItem {
  kind: "dropdown";
  id: string;
  label: string;
  icon: DockIconSpec;
  items: DockMenuNode[];
}

export type DockBarItem = DockLaunchItem | DockDropdownItem;

/** Render-ready model for the dock bar, derived from a `DockEditorConfig`. */
export interface DockViewModel {
  items: DockBarItem[];
}

/**
 * The OpenFin boundary the dock bar talks to. Implemented by the `/dock`
 * window host (Phase 0/Phase 2). In tests, a plain object/fake stands in.
 *
 * `dispatchAction` round-trips to the provider window's `dockActionHandlers`
 * (the same 14 `ACTION_*` handlers dock2/dock3 already use) — the dock
 * window is a separate OpenFin window, so this crosses a channel/IAB rather
 * than calling a handler directly.
 */
export interface DockController {
  /** Dispatch an action id (+ optional customData) to the provider handlers. */
  dispatchAction(actionId: string, customData?: unknown): void | Promise<void>;
  /** The live platform theme. */
  getTheme(): DockTheme;
  /** Toggle the platform theme (drives OpenFin scheme + broadcasts IAB). */
  toggleTheme(): void | Promise<void>;
  /**
   * Subscribe to theme changes (local toggle or another window's broadcast).
   * Returns an unsubscribe function.
   */
  onThemeChanged(listener: (theme: DockTheme) => void): () => void;
}

// Re-export the icon union for consumers that build DockIconSpecs by hand.
export type { DockEntryIcon };
