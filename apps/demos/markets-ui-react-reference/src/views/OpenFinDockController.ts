/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

/**
 * OpenFinDockController — the `/dock` window's implementation of the
 * `@starui/dock-react` `DockController` seam (Phase 0 / Session 3).
 *
 * The dock bar is a pure React tree that reaches every OpenFin side-effect
 * through this controller (the repo's import-boundary rule keeps `@openfin/*`
 * out of the UI package). Here, in the app's `/dock` window host, we bind:
 *
 *   • `dispatchAction` — round-trips `{ actionId, customData }` to the
 *     provider window over the `CHANNEL_CUSTOM_DOCK` OpenFin Channel, where
 *     `dockActionHandlers` runs the real handler.
 *   • `getTheme` / `onThemeChanged` — track the live theme from this window's
 *     `[data-theme]` plus the provider's `IAB_THEME_CHANGED` broadcast.
 *   • `toggleTheme` — dispatches `ACTION_TOGGLE_THEME` over the channel; the
 *     provider flips the platform scheme (it can't be done from here) and
 *     broadcasts the theme IAB, which lands back in `onThemeChanged`.
 *
 * `attach()` / `detach()` are idempotent so the host can wire them to a React
 * effect (survives StrictMode's mount→unmount→mount in dev). The channel
 * client connects lazily on first dispatch and reconnects after `detach()`.
 */
import {
  CHANNEL_CUSTOM_DOCK,
  CUSTOM_DOCK_DISPATCH_ACTION,
  CUSTOM_DOCK_GET_CONFIG,
  CUSTOM_DOCK_CONFIG_PUSH,
  CUSTOM_DOCK_LIST_WORKSPACES,
  CUSTOM_DOCK_GET_ACTIVE_WORKSPACE,
  CUSTOM_DOCK_APPLY_WORKSPACE,
  CUSTOM_DOCK_WORKSPACE_CHANGED,
  CUSTOM_DOCK_SAVE_WORKSPACE_AS,
  CUSTOM_DOCK_RESTORE_LAST_SAVED,
  CUSTOM_DOCK_GET_NOTIF_COUNT,
  CUSTOM_DOCK_TOGGLE_NOTIF_CENTER,
  CUSTOM_DOCK_NOTIF_COUNT_CHANGED,
  CUSTOM_DOCK_SAVE_WORKSPACE,
  CUSTOM_DOCK_RENAME_WORKSPACE,
  CUSTOM_DOCK_DELETE_WORKSPACE,
  CUSTOM_DOCK_LIST_RUNNING_APPS,
  CUSTOM_DOCK_GET_ACTIVE_APP,
  CUSTOM_DOCK_SWITCH_APP,
  CUSTOM_DOCK_RUNNING_APPS_CHANGED,
  ACTION_TOGGLE_THEME,
  IAB_THEME_CHANGED,
  type DockEditorConfig,
} from "@starui/openfin-platform/config";
import type {
  AppSwitcherController,
  ApplyWorkspaceOptions,
  DockController,
  DockMenuAnchor,
  DockMenuModel,
  DockMenuResult,
  DockPromptOptions,
  DockTheme,
  NotificationController,
  RunningApp,
  SavedWorkspace,
  WorkspaceController,
} from "@starui/dock-react";

/** Shared `initialOptions` for the dock's reusable popup windows (S15/S16). */
const POPUP_INITIAL_OPTIONS = {
  frame: false,
  alwaysOnTop: true,
  saveWindowState: false,
  showTaskbarIcon: false,
  smallWindow: true,
  backgroundThrottling: false,
};
/** Stable names so popups are REUSED (hidden on close), not rebuilt per open. */
const MENU_POPUP_NAME = "starui-dock-menu";
const PROMPT_POPUP_NAME = "starui-dock-prompt";

/** Floating-dock min width (DIP px) — mirrors `<DockBar>` + `CUSTOM_DOCK_MIN_WIDTH`. */
const DOCK_MIN_WIDTH = 220;

export class OpenFinDockController
  implements DockController, WorkspaceController, NotificationController, AppSwitcherController
{
  private clientPromise: Promise<any> | null = null;
  private theme: DockTheme;
  private readonly listeners = new Set<(theme: DockTheme) => void>();
  private readonly configListeners = new Set<(config: DockEditorConfig | null) => void>();
  private readonly workspaceListeners = new Set<() => void>();
  private readonly notifListeners = new Set<(count: number) => void>();
  private readonly appListeners = new Set<() => void>();
  private iabHandler: ((msg: unknown) => void) | null = null;
  private observer: MutationObserver | null = null;
  private lastWidth = 0;
  private lastHeight = 0;

  constructor() {
    this.theme = this.readTheme();
  }

  // ─── DockController ──────────────────────────────────────────────────

  async dispatchAction(actionId: string, customData?: unknown): Promise<void> {
    try {
      const client = await this.client();
      await client.dispatch(CUSTOM_DOCK_DISPATCH_ACTION, { actionId, customData });
    } catch (err) {
      console.error(`[dock] dispatchAction(${actionId}) failed:`, err);
    }
  }

  getTheme(): DockTheme {
    return this.theme;
  }

  /**
   * Resize the floating dock window to the bar's measured content (S14). `x`/`y`
   * (top-left) are held; only width/height change. Min-width floor mirrors
   * `<DockBar>`'s `min-w-*` + the provider's `CUSTOM_DOCK_MIN_WIDTH`. Skips
   * redundant calls (ResizeObserver can fire repeatedly with the same metrics).
   */
  resizeToContent(width: number, height: number): void {
    const w = Math.max(Math.ceil(width), DOCK_MIN_WIDTH);
    const h = Math.max(Math.ceil(height), 1);
    if (w === this.lastWidth && h === this.lastHeight) return;
    this.lastWidth = w;
    this.lastHeight = h;
    try {
      void fin.Window.getCurrentSync().resizeTo(w, h, "top-left");
    } catch (err) {
      console.warn("[dock] resizeToContent failed:", err);
    }
  }

  async toggleTheme(): Promise<void> {
    // The platform scheme can only be flipped in the provider window — send
    // the toggle over the channel and let the provider broadcast the result.
    await this.dispatchAction(ACTION_TOGGLE_THEME);
  }

  onThemeChanged(listener: (theme: DockTheme) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ─── Popout menus (S15) ──────────────────────────────────────────────
  // The dock is a small floating window, so menus/dialogs render as OpenFin
  // **popup windows** (`showPopupWindow`) anchored under the trigger rather than
  // in-window DOM portals (which clip). `x`/`y` are relative to this (caller)
  // window — i.e. the button's `getBoundingClientRect()`. `blurBehavior:'close'`
  // dismisses on outside click; the popup `dispatchPopupResult`s the selection
  // and self-closes (`resultDispatchBehavior:'close'`). The model crosses as
  // `customData` (serializable). See memory `dock-popout-uses-showpopupwindow`.

  async openMenu(model: DockMenuModel, anchor: DockMenuAnchor): Promise<DockMenuResult | null> {
    try {
      const rows = model.items.length || 1;
      // Reuse a named, hide-on-close popup so the app bundle loads ONCE (S16
      // perf): subsequent opens just re-show + update `customData`. The popup
      // re-reads its model on the `shown` event (it doesn't remount on reuse).
      const result = await fin.me.showPopupWindow({
        name: MENU_POPUP_NAME,
        url: `${window.location.origin}/dock/menu`,
        x: Math.round(anchor.x),
        y: Math.round(anchor.y),
        width: 240,
        height: Math.min(rows * 32 + 16, 560),
        blurBehavior: "close",
        resultDispatchBehavior: "close",
        hideOnClose: true,
        additionalOptions: { customData: { model } },
        initialOptions: POPUP_INITIAL_OPTIONS,
      });
      if (result?.result === "clicked" && result.data) {
        return result.data as DockMenuResult;
      }
      return null;
    } catch (err) {
      console.error("[dock] openMenu failed:", err);
      return null;
    }
  }

  async promptText(options: DockPromptOptions): Promise<string | null> {
    try {
      const result = await fin.me.showPopupWindow({
        name: PROMPT_POPUP_NAME,
        url: `${window.location.origin}/dock/prompt`,
        x: Math.round(options.anchor?.x ?? 96),
        y: Math.round(options.anchor?.y ?? 96),
        width: 300,
        height: 178,
        blurBehavior: "close",
        resultDispatchBehavior: "close",
        hideOnClose: true,
        additionalOptions: { customData: { options, theme: this.theme } },
        initialOptions: POPUP_INITIAL_OPTIONS,
      });
      if (result?.result === "clicked" && typeof result.data === "string") {
        return result.data;
      }
      return null;
    } catch (err) {
      console.error("[dock] promptText failed:", err);
      return null;
    }
  }

  // ─── Config delivery (host-only, not part of DockController) ──────────
  // The DockBar receives config as a prop; the host (DockHost) owns fetching
  // it. The provider owns config persistence + scope, so we pull the initial
  // config over the channel and receive live updates via the `config-push`
  // action the client registers on connect.

  /** Fetch the current `DockEditorConfig` from the provider (or `null`). */
  async getConfig(): Promise<DockEditorConfig | null> {
    try {
      const client = await this.client();
      const config = await client.dispatch(CUSTOM_DOCK_GET_CONFIG, {});
      return (config ?? null) as DockEditorConfig | null;
    } catch (err) {
      console.error("[dock] getConfig failed:", err);
      return null;
    }
  }

  /** Subscribe to provider config pushes (editor save / import). */
  onConfigChanged(listener: (config: DockEditorConfig | null) => void): () => void {
    this.configListeners.add(listener);
    // Ensure the client is connected so its `config-push` handler is live.
    void this.client().catch(() => { /* dispatch/getConfig will retry */ });
    return () => {
      this.configListeners.delete(listener);
    };
  }

  // ─── WorkspaceController (Phase 3 / S12) ─────────────────────────────
  // The provider owns the workspace-platform context (Storage + applyWorkspace),
  // so the switcher lists / reads-active / applies over the channel rather than
  // touching `@openfin/*` here — same single-source pattern as config delivery.

  async listWorkspaces(): Promise<SavedWorkspace[]> {
    try {
      const client = await this.client();
      const list = await client.dispatch(CUSTOM_DOCK_LIST_WORKSPACES, {});
      return Array.isArray(list) ? (list as SavedWorkspace[]) : [];
    } catch (err) {
      console.error("[dock] listWorkspaces failed:", err);
      return [];
    }
  }

  async getActiveWorkspaceId(): Promise<string | null> {
    try {
      const client = await this.client();
      const id = await client.dispatch(CUSTOM_DOCK_GET_ACTIVE_WORKSPACE, {});
      return typeof id === "string" ? id : null;
    } catch (err) {
      console.error("[dock] getActiveWorkspaceId failed:", err);
      return null;
    }
  }

  async applyWorkspace(id: string, options?: ApplyWorkspaceOptions): Promise<void> {
    try {
      const client = await this.client();
      await client.dispatch(CUSTOM_DOCK_APPLY_WORKSPACE, {
        id,
        skipPrompt: options?.skipPrompt ?? true,
      });
    } catch (err) {
      console.error(`[dock] applyWorkspace(${id}) failed:`, err);
    }
  }

  onWorkspaceChanged(listener: () => void): () => void {
    this.workspaceListeners.add(listener);
    // Ensure the client is connected so its `workspace-changed` handler is live.
    void this.client().catch(() => { /* dispatch will retry */ });
    return () => {
      this.workspaceListeners.delete(listener);
    };
  }

  async saveWorkspace(): Promise<void> {
    try {
      const client = await this.client();
      await client.dispatch(CUSTOM_DOCK_SAVE_WORKSPACE, {});
    } catch (err) {
      console.error("[dock] saveWorkspace failed:", err);
    }
  }

  async renameWorkspace(id: string, title: string): Promise<void> {
    try {
      const client = await this.client();
      await client.dispatch(CUSTOM_DOCK_RENAME_WORKSPACE, { id, title });
    } catch (err) {
      console.error(`[dock] renameWorkspace(${id}) failed:`, err);
    }
  }

  async deleteWorkspace(id: string): Promise<void> {
    try {
      const client = await this.client();
      await client.dispatch(CUSTOM_DOCK_DELETE_WORKSPACE, { id });
    } catch (err) {
      console.error(`[dock] deleteWorkspace(${id}) failed:`, err);
    }
  }

  async saveWorkspaceAs(title: string): Promise<void> {
    try {
      const client = await this.client();
      await client.dispatch(CUSTOM_DOCK_SAVE_WORKSPACE_AS, { title });
    } catch (err) {
      console.error(`[dock] saveWorkspaceAs(${title}) failed:`, err);
    }
  }

  async restoreLastSavedWorkspace(options?: ApplyWorkspaceOptions): Promise<void> {
    try {
      const client = await this.client();
      await client.dispatch(CUSTOM_DOCK_RESTORE_LAST_SAVED, {
        skipPrompt: options?.skipPrompt ?? true,
      });
    } catch (err) {
      console.error("[dock] restoreLastSavedWorkspace failed:", err);
    }
  }

  // ─── NotificationController (Phase 4 / S16) ──────────────────────────
  // The provider owns the `@openfin/notifications` client, so the bell pulls the
  // count / toggles the center over the channel and receives count pushes.

  async getNotificationsCount(): Promise<number> {
    try {
      const client = await this.client();
      const n = await client.dispatch(CUSTOM_DOCK_GET_NOTIF_COUNT, {});
      return typeof n === "number" ? n : 0;
    } catch (err) {
      console.error("[dock] getNotificationsCount failed:", err);
      return 0;
    }
  }

  onCountChanged(listener: (count: number) => void): () => void {
    this.notifListeners.add(listener);
    // Ensure the client is connected so its `notif-count-changed` handler is live.
    void this.client().catch(() => { /* dispatch will retry */ });
    return () => {
      this.notifListeners.delete(listener);
    };
  }

  async toggleNotificationCenter(): Promise<void> {
    try {
      const client = await this.client();
      await client.dispatch(CUSTOM_DOCK_TOGGLE_NOTIF_CENTER, {});
    } catch (err) {
      console.error("[dock] toggleNotificationCenter failed:", err);
    }
  }

  // ─── AppSwitcherController (Phase 5 / S19) ───────────────────────────
  // The provider owns fin.System + the config scope, so the switcher lists /
  // reads-active / switches over the channel + receives running-app pushes.

  async listRunningApps(): Promise<RunningApp[]> {
    try {
      const client = await this.client();
      const list = await client.dispatch(CUSTOM_DOCK_LIST_RUNNING_APPS, {});
      return Array.isArray(list) ? (list as RunningApp[]) : [];
    } catch (err) {
      console.error("[dock] listRunningApps failed:", err);
      return [];
    }
  }

  async getActiveAppId(): Promise<string | null> {
    try {
      const client = await this.client();
      const id = await client.dispatch(CUSTOM_DOCK_GET_ACTIVE_APP, {});
      return typeof id === "string" ? id : null;
    } catch (err) {
      console.error("[dock] getActiveAppId failed:", err);
      return null;
    }
  }

  async switchToApp(id: string): Promise<void> {
    try {
      const client = await this.client();
      await client.dispatch(CUSTOM_DOCK_SWITCH_APP, { id });
    } catch (err) {
      console.error(`[dock] switchToApp(${id}) failed:`, err);
    }
  }

  onRunningAppsChanged(listener: () => void): () => void {
    this.appListeners.add(listener);
    void this.client().catch(() => { /* dispatch will retry */ });
    return () => {
      this.appListeners.delete(listener);
    };
  }

  // ─── Lifecycle (wired to the host's React effect) ────────────────────

  /** Subscribe to the theme IAB + watch local `[data-theme]`. Idempotent. */
  attach(): void {
    if (!this.iabHandler) {
      try {
        this.iabHandler = (msg: unknown) => {
          const next = readThemePayload(msg);
          if (next) this.setTheme(next);
        };
        void fin.InterApplicationBus.subscribe({ uuid: "*" }, IAB_THEME_CHANGED, this.iabHandler);
      } catch (err) {
        console.warn("[dock] theme IAB subscribe failed:", err);
        this.iabHandler = null;
      }
    }
    if (!this.observer && typeof MutationObserver !== "undefined") {
      this.observer = new MutationObserver(() => this.setTheme(this.readTheme()));
      this.observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
    }
    // Re-sync in case the theme moved between construction and attach.
    this.setTheme(this.readTheme());
  }

  /** Tear down watchers + the channel client. Idempotent; re-attachable. */
  detach(): void {
    if (this.iabHandler) {
      try {
        void fin.InterApplicationBus.unsubscribe({ uuid: "*" }, IAB_THEME_CHANGED, this.iabHandler);
      } catch { /* swallow — best-effort */ }
      this.iabHandler = null;
    }
    try { this.observer?.disconnect(); } catch { /* swallow */ }
    this.observer = null;
    if (this.clientPromise) {
      void this.clientPromise.then((c) => c?.disconnect?.()).catch(() => { /* swallow */ });
      this.clientPromise = null;
    }
  }

  // ─── internals ───────────────────────────────────────────────────────

  private client(): Promise<any> {
    const existing = this.clientPromise;
    if (existing) return existing;
    const pending: Promise<any> = fin.InterApplicationBus.Channel.connect(CHANNEL_CUSTOM_DOCK)
      .then((c: any) => {
        // Provider → dock window live config pushes land here.
        try {
          c.register(CUSTOM_DOCK_CONFIG_PUSH, (payload: unknown) => {
            this.notifyConfig((payload ?? null) as DockEditorConfig | null);
          });
        } catch (err) {
          console.warn("[dock] config-push register failed:", err);
        }
        // Provider → dock window "workspace list/active may have changed".
        try {
          c.register(CUSTOM_DOCK_WORKSPACE_CHANGED, () => {
            this.notifyWorkspaceChanged();
          });
        } catch (err) {
          console.warn("[dock] workspace-changed register failed:", err);
        }
        // Provider → dock window notification-count pushes land here.
        try {
          c.register(CUSTOM_DOCK_NOTIF_COUNT_CHANGED, (payload: unknown) => {
            const count = (payload as { count?: number })?.count;
            this.notifyCount(typeof count === "number" ? count : 0);
          });
        } catch (err) {
          console.warn("[dock] notif-count-changed register failed:", err);
        }
        // Provider → dock window "running apps / active app may have changed".
        try {
          c.register(CUSTOM_DOCK_RUNNING_APPS_CHANGED, () => {
            this.notifyAppsChanged();
          });
        } catch (err) {
          console.warn("[dock] running-apps-changed register failed:", err);
        }
        return c;
      })
      .catch((err: unknown) => {
        // Allow a later dispatch to retry the connect.
        if (this.clientPromise === pending) this.clientPromise = null;
        throw err;
      });
    this.clientPromise = pending;
    return pending;
  }

  private notifyConfig(config: DockEditorConfig | null): void {
    for (const fn of this.configListeners) {
      try { fn(config); } catch { /* swallow */ }
    }
  }

  private notifyWorkspaceChanged(): void {
    for (const fn of this.workspaceListeners) {
      try { fn(); } catch { /* swallow */ }
    }
  }

  private notifyCount(count: number): void {
    for (const fn of this.notifListeners) {
      try { fn(count); } catch { /* swallow */ }
    }
  }

  private notifyAppsChanged(): void {
    for (const fn of this.appListeners) {
      try { fn(); } catch { /* swallow */ }
    }
  }

  private readTheme(): DockTheme {
    try {
      const attr = document.documentElement.getAttribute("data-theme");
      if (attr === "dark" || attr === "light") return attr;
    } catch { /* non-browser */ }
    return "dark";
  }

  private setTheme(next: DockTheme): void {
    if (next === this.theme) return;
    this.theme = next;
    try { document.documentElement.setAttribute("data-theme", next); } catch { /* */ }
    for (const fn of this.listeners) {
      try { fn(next); } catch { /* swallow */ }
    }
  }
}

/** Extract a `DockTheme` from a `theme-changed` IAB payload (new + legacy shapes). */
function readThemePayload(msg: unknown): DockTheme | null {
  if (!msg || typeof msg !== "object") return null;
  const m = msg as { theme?: unknown; isDark?: unknown };
  if (m.theme === "dark" || m.theme === "light") return m.theme;
  if (m.isDark === true) return "dark";
  if (m.isDark === false) return "light";
  return null;
}
