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

// ─── Popout menus (S15) ──────────────────────────────────────────────
// The dock's dropdowns render as OpenFin popup windows (`showPopupWindow`)
// rather than in-window DOM portals (which clip in the small floating bar).
// These models cross the window boundary as JSON, so they're fully
// serializable — image icons are pre-resolved URLs, system icons are lucide
// names. Builders live in `menuModel.ts`; the popup renders `DockMenuView`.

/** One row in a popout menu. A leaf carries `actionId`/intent; a node has `children`. */
export interface DockMenuItem {
  /** Stable id; echoed back in {@link DockMenuResult} so the opener can map it. */
  id: string;
  label: string;
  /** Pre-resolved theme-aware image icon (launcher dropdowns). */
  icon?: DockIconSpec;
  /** lucide icon export name (system menus) — resolved in the popup by name. */
  iconName?: string;
  /** When defined, renders a leading check column (`true` = active/checked). */
  checked?: boolean;
  disabled?: boolean;
  /** Draw a separator above this item. */
  separatorBefore?: boolean;
  /** Nested submenu — selecting opens a child popup. */
  children?: DockMenuItem[];
  /** Opaque payload echoed back when this leaf is chosen. */
  actionId?: string;
  customData?: unknown;
}

/** A complete popout menu: theme (so the popup paints correctly) + rows. */
export interface DockMenuModel {
  theme: DockTheme;
  title?: string;
  items: DockMenuItem[];
}

/** What the popup returns when a leaf is chosen (or `null` if dismissed). */
export interface DockMenuResult {
  id: string;
  actionId?: string;
  customData?: unknown;
}

/** Anchor for a popup — viewport coords of the trigger (relative to the dock window). */
export interface DockMenuAnchor {
  x: number;
  y: number;
}

/** Options for the text-prompt popup (e.g. workspace Save-As). */
export interface DockPromptOptions {
  title: string;
  label?: string;
  placeholder?: string;
  confirmLabel?: string;
  initialValue?: string;
  anchor?: DockMenuAnchor;
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
  /**
   * Resize the host OpenFin window to fit the bar's measured content (S14).
   * The dock is a floating, content-sized bar: the bar measures itself and
   * calls this so the frameless window grows/shrinks with the buttons. Optional
   * — when absent (e.g. unit tests, non-OpenFin hosts) auto-sizing is a no-op.
   */
  resizeToContent?(width: number, height: number): void;
  /**
   * Open a popout menu as an OpenFin popup window anchored at `anchor` (S15),
   * resolving with the chosen item (or `null` if dismissed). Optional — menu
   * buttons no-op when absent (e.g. unit tests inject a fake).
   */
  openMenu?(model: DockMenuModel, anchor: DockMenuAnchor): Promise<DockMenuResult | null>;
  /**
   * Prompt for a single line of text in a popup window (S15; e.g. workspace
   * Save-As), resolving with the entered text or `null` if cancelled. Optional.
   */
  promptText?(options: DockPromptOptions): Promise<string | null>;
}

// ─── Workspace switcher (Phase 3) ────────────────────────────────────

/** A saved OpenFin workspace, reduced to what the switcher renders. */
export interface SavedWorkspace {
  /** OpenFin `workspaceId` (a GUID for saved workspaces). */
  id: string;
  /** Human-readable title shown in the switcher. */
  title: string;
}

/** Options for {@link WorkspaceController.applyWorkspace} (S12). */
export interface ApplyWorkspaceOptions {
  /**
   * Skip the platform's "switch workspace?" confirmation dialog. The custom
   * dock passes `true` (parity with the provider's existing `skipPrompt`
   * override) so a switcher click applies immediately.
   */
  skipPrompt?: boolean;
}

/**
 * The OpenFin workspace boundary the switcher talks to — implemented by the
 * `/dock` window host over the workspace-platform `Storage` API + the
 * `setActiveWorkspace` reset semantics. Like {@link DockController}, this keeps
 * the switcher a pure, unit-testable tree (a fake stands in for tests).
 *
 * Grows across Phase 3: S11 needs list + active-tracking; S12 adds
 * `applyWorkspace`; S13 adds save-as + restore.
 */
export interface WorkspaceController {
  /** List the saved workspaces (order as returned by the platform). */
  listWorkspaces(): Promise<SavedWorkspace[]>;
  /**
   * The active workspace id, or `null` when nothing saved is active. The host
   * maps the untitled sentinel / empty-desktop state to `null`; the reducer
   * also normalizes it (see `workspaceSwitcherReducer`).
   */
  getActiveWorkspaceId(): Promise<string | null>;
  /**
   * Subscribe to "the saved list or the active workspace may have changed"
   * (save / delete / switch / empty-desktop reset). Returns an unsubscribe
   * function. The hook re-reads on every fire.
   */
  onWorkspaceChanged(listener: () => void): () => void;
  /**
   * Apply (switch to) a saved workspace by id (S12). The host runs the
   * platform's `applyWorkspace` and broadcasts a change so the switcher moves
   * its checkmark.
   */
  applyWorkspace(id: string, options?: ApplyWorkspaceOptions): void | Promise<void>;
  /**
   * Save the current desktop as a NEW saved workspace under `title` (S13). The
   * host captures the live snapshot, persists it, marks it active, and
   * broadcasts a change so the switcher lists + checks it.
   */
  saveWorkspaceAs(title: string): void | Promise<void>;
  /**
   * Re-apply the last saved version of the current workspace (S13), skipping
   * the platform's confirmation prompt. The host broadcasts a change afterward.
   */
  restoreLastSavedWorkspace(options?: ApplyWorkspaceOptions): void | Promise<void>;
  /**
   * **Save** (update) the active saved workspace from the current desktop —
   * parity with the native `SaveWorkspace` menu action. No-op when nothing
   * saved is active.
   */
  saveWorkspace(): void | Promise<void>;
  /** Rename a saved workspace (native `RenameWorkspace`). */
  renameWorkspace(id: string, title: string): void | Promise<void>;
  /** Delete a saved workspace (native `DeleteWorkspace`). */
  deleteWorkspace(id: string): void | Promise<void>;
}

// ─── Notifications (Phase 4 / S16) ───────────────────────────────────

/**
 * The OpenFin notifications boundary the dock's bell talks to — implemented by
 * the `/dock` window host over the provider channel (the provider owns the
 * `@openfin/notifications` client). Like the other controllers, this keeps the
 * bell a pure, unit-testable tree (a fake stands in for tests).
 */
export interface NotificationController {
  /** Current notification-center count (unread/total as the service reports). */
  getNotificationsCount(): Promise<number>;
  /**
   * Subscribe to count changes (`notifications-count-changed`). Returns an
   * unsubscribe function; the hook re-reads/updates the badge on each fire.
   */
  onCountChanged(listener: (count: number) => void): () => void;
  /** Toggle the notification center open/closed. */
  toggleNotificationCenter(): void | Promise<void>;
}

// ─── App switcher (Phase 5 / S18) ────────────────────────────────────

/** A running app the switcher can show / switch the dock to. */
export interface RunningApp {
  /** Stable app id (the platform `appId`, used as the per-app config scope). */
  id: string;
  /** Human-readable title shown in the switcher. */
  title: string;
}

/**
 * The OpenFin boundary the app-switcher talks to — implemented by the `/dock`
 * window host (S19) over `fin.System` running-app events + the per-app config
 * scope swap. Like the other controllers, this keeps the switcher a pure,
 * unit-testable tree (a fake stands in for tests).
 *
 * Grows across Phase 5: S18 needs list + active-tracking; S19 adds `switchToApp`
 * (swap `setPlatformDefaultScope` + reload the bar from that scope's config).
 */
export interface AppSwitcherController {
  /** List the currently-running apps (order as the host reports). */
  listRunningApps(): Promise<RunningApp[]>;
  /** The active app id (whose dock config is shown), or `null` if none. */
  getActiveAppId(): Promise<string | null>;
  /**
   * Subscribe to "the running-app list or the active app may have changed"
   * (app started / window created / closed). Returns an unsubscribe function;
   * the hook re-reads on every fire.
   */
  onRunningAppsChanged(listener: () => void): () => void;
  /**
   * Switch the dock to an app (S19): the host swaps the platform config scope to
   * `appId` (`setPlatformDefaultScope`) and reloads the bar from that scope's
   * `DockEditorConfig`, then broadcasts a change so the active marker moves.
   */
  switchToApp(id: string): void | Promise<void>;
}

// Re-export the icon union for consumers that build DockIconSpecs by hand.
export type { DockEntryIcon };
