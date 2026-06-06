/**
 * IAB topic names + action ID constants used across the openfin-platform
 * + its consumers (dock-editor, registry-editor, config-browser).
 *
 * Lives in a standalone file (not dock.ts) because dock.ts imports
 * `@openfin/workspace-platform` at the module top level, which throws
 * at module-eval time in plain-browser contexts. Consumers that only
 * need the constant strings (dock-editor's ImportConfig panel, for
 * example) import from this file (directly or via the `/config`
 * subpath) to avoid pulling workspace-platform into their bundle.
 *
 * dock.ts re-exports these for back-compat with consumers that still
 * import via the main barrel.
 */

// ─── IAB topic names ────────────────────────────────────────────────
export const IAB_DOCK_CONFIG_UPDATE = "dock-config-update";
export const IAB_RELOAD_AFTER_IMPORT = "reload-dock-after-import";
export const IAB_THEME_CHANGED = "theme-changed";
export const IAB_REGISTRY_CONFIG_UPDATE = "registry-config-update";

// ─── Custom-dock action-dispatch channel ─────────────────────────────
/**
 * OpenFin Channel the custom dock window connects to. The custom dock is a
 * separate window from the provider, so its `<DockBar>` clicks can't call
 * `dockActionHandlers` directly — they round-trip over this channel instead.
 * The provider creates the channel in `registerDockCustom`; the dock window
 * (`/dock` route) connects as a client. Pure string so the dock window can
 * import it via the side-effect-free `/config` subpath.
 */
export const CHANNEL_CUSTOM_DOCK = "starui-custom-dock-actions";
/**
 * The channel action: dispatch an `{ actionId, customData }` to the provider's
 * `dockActionHandlers`. `ACTION_TOGGLE_THEME` is intercepted provider-side
 * (it must run setSelectedScheme + the theme IAB in the provider window).
 */
export const CUSTOM_DOCK_DISPATCH_ACTION = "dispatch-action";
/**
 * Channel action (dock window → provider): fetch the current
 * `DockEditorConfig`. The provider owns config persistence + scope, so the
 * dock window pulls the initial config through here rather than reading the
 * config store under its own (different) default scope. Returns the config or
 * `null`.
 */
export const CUSTOM_DOCK_GET_CONFIG = "get-config";
/**
 * Channel action (provider → dock window): push a fresh `DockEditorConfig`
 * after the editor saves (`IAB_DOCK_CONFIG_UPDATE`) or a config import
 * (`IAB_RELOAD_AFTER_IMPORT`). The dock window's client registers a handler
 * for this and re-renders `<DockBar>`. Keeping the live-update path on the
 * channel (not a raw IAB the dock window decodes itself) keeps the provider
 * the single source of config + scope.
 */
export const CUSTOM_DOCK_CONFIG_PUSH = "config-push";
/**
 * Channel action (dock window → provider): list the saved workspaces as
 * `{ id, title }[]`. The provider owns the workspace-platform context, so the
 * dock window asks for the list through here rather than calling the Storage
 * API under its own window (same single-source rationale as config).
 */
export const CUSTOM_DOCK_LIST_WORKSPACES = "list-workspaces";
/**
 * Channel action (dock window → provider): get the active workspace id, or
 * `null` when nothing saved is active (the `UNTITLED_WORKSPACE_ID` sentinel /
 * empty desktop both normalize to `null` in the switcher reducer).
 */
export const CUSTOM_DOCK_GET_ACTIVE_WORKSPACE = "get-active-workspace";
/**
 * Channel action (dock window → provider): apply (switch to) a saved workspace
 * by id, with `{ id, skipPrompt }`. The provider runs
 * `applyWorkspace(workspace, { skipPrompt })` and pushes
 * `CUSTOM_DOCK_WORKSPACE_CHANGED` so the switcher moves its checkmark.
 */
export const CUSTOM_DOCK_APPLY_WORKSPACE = "apply-workspace";
/**
 * Channel action (provider → dock window): the saved list or active workspace
 * may have changed (switch / save / delete / empty-desktop reset). The dock
 * window's client registers a handler that re-reads the list + active id.
 */
export const CUSTOM_DOCK_WORKSPACE_CHANGED = "workspace-changed";
/**
 * Channel action (dock window → provider): save the current desktop as a NEW
 * saved workspace with `{ title }`. The provider captures
 * `getCurrentWorkspace()`, persists via `Storage.createWorkspace`, marks it
 * active, then pushes `CUSTOM_DOCK_WORKSPACE_CHANGED`.
 */
export const CUSTOM_DOCK_SAVE_WORKSPACE_AS = "save-workspace-as";
/**
 * Channel action (dock window → provider): re-apply the last saved version of
 * the current workspace via `restoreLastSavedWorkspace({ skipPrompt })`, then
 * push `CUSTOM_DOCK_WORKSPACE_CHANGED`.
 */
export const CUSTOM_DOCK_RESTORE_LAST_SAVED = "restore-last-saved";
/**
 * Channel action (dock window → provider): read the current notification-center
 * count (`@openfin/notifications` `getNotificationsCount()`). The provider owns
 * the notifications client, so the dock window pulls the count through here.
 */
export const CUSTOM_DOCK_GET_NOTIF_COUNT = "get-notif-count";
/**
 * Channel action (dock window → provider): toggle the notification center
 * (`toggleNotificationCenter()`).
 */
export const CUSTOM_DOCK_TOGGLE_NOTIF_CENTER = "toggle-notif-center";
/**
 * Channel action (provider → dock window): the notification count changed
 * (`notifications-count-changed` event); payload `{ count }`. The dock window's
 * client updates the bell badge.
 */
export const CUSTOM_DOCK_NOTIF_COUNT_CHANGED = "notif-count-changed";
/**
 * Channel action (dock window → provider): **save** (update) the active saved
 * workspace from the current desktop — `getCurrentWorkspace()` →
 * `Storage.saveWorkspace`. No-op when nothing saved is active. Pushes
 * `CUSTOM_DOCK_WORKSPACE_CHANGED`.
 */
export const CUSTOM_DOCK_SAVE_WORKSPACE = "save-workspace";
/**
 * Channel action (dock window → provider): rename a saved workspace with
 * `{ id, title }` (`Storage.updateWorkspace`). Pushes `CUSTOM_DOCK_WORKSPACE_CHANGED`.
 */
export const CUSTOM_DOCK_RENAME_WORKSPACE = "rename-workspace";
/**
 * Channel action (dock window → provider): delete a saved workspace by `{ id }`
 * (`Storage.deleteWorkspace`). Pushes `CUSTOM_DOCK_WORKSPACE_CHANGED`.
 */
export const CUSTOM_DOCK_DELETE_WORKSPACE = "delete-workspace";
/**
 * Channel action (dock window → provider): list the running apps as
 * `{ id, title }[]` for the app-switcher (S19). The provider derives this from
 * `fin.System` against the configured app set.
 */
export const CUSTOM_DOCK_LIST_RUNNING_APPS = "list-running-apps";
/**
 * Channel action (dock window → provider): the active app id — the app whose
 * per-app dock config scope is currently shown (`getPlatformDefaultScope().appId`),
 * or `null`.
 */
export const CUSTOM_DOCK_GET_ACTIVE_APP = "get-active-app";
/**
 * Channel action (dock window → provider): switch the dock to an app by
 * `{ id }` — `setPlatformDefaultScope(appId)` + reload the bar from that scope's
 * `DockEditorConfig`. Pushes `CUSTOM_DOCK_RUNNING_APPS_CHANGED`.
 */
export const CUSTOM_DOCK_SWITCH_APP = "switch-app";
/**
 * Channel action (provider → dock window): the running-app list or active app
 * may have changed (`application-started` / `window-created` / `*-closed`, or a
 * scope switch). The dock window re-reads both.
 */
export const CUSTOM_DOCK_RUNNING_APPS_CHANGED = "running-apps-changed";

// ─── Workspace switcher ──────────────────────────────────────────────
/**
 * Sentinel id for the "untitled" (nothing-saved-open) active workspace.
 * OpenFin assigns GUIDs to saved workspaces, so this constant never collides.
 * While it's the active workspace, the switcher shows no checkmark — the
 * platform sets it active once the last Browser window closes (see
 * `resetActiveWorkspaceWhenEmpty` in `workspace.ts`). Shared with the custom
 * dock's workspace-switcher reducer (`@starui/dock-react`) so both halves
 * agree on the "no active saved workspace" marker.
 */
export const UNTITLED_WORKSPACE_ID = "untitled-workspace";

// ─── Action ID constants ─────────────────────────────────────────────
export const ACTION_LAUNCH_APP           = "launch-app";
export const ACTION_TOGGLE_THEME         = "toggle-theme";
export const ACTION_OPEN_DOCK_EDITOR     = "open-dock-editor";
export const ACTION_RELOAD_DOCK          = "reload-dock";
export const ACTION_SHOW_DEVTOOLS        = "show-devtools";
/**
 * Dock action to open Chromium DevTools scoped to the data-services
 * SharedWorker. Iterates through Application.getViews() and calls
 * `view.inspectSharedWorker()` on the first one that has a worker
 * attached — useful because the standalone `chrome://inspect`
 * "Other → inspect" path 404s in OpenFin runtimes whose Chromium
 * revision isn't cached at chrome-devtools-frontend.appspot.com.
 */
export const ACTION_INSPECT_SHARED_WORKER = "inspect-shared-worker";
export const ACTION_EXPORT_CONFIG        = "export-config";
export const ACTION_IMPORT_CONFIG        = "import-config";
export const ACTION_TOGGLE_PROVIDER      = "toggle-provider-window";
export const ACTION_OPEN_REGISTRY_EDITOR = "open-registry-editor";
export const ACTION_OPEN_CONFIG_BROWSER  = "open-config-browser";
/**
 * Dock action to open the unified Workspace Setup editor — Phase 6
 * supersedes the standalone Dock Editor + Registry Editor with one
 * three-pane editor (Components / Dock / Inspector). The standalone
 * editors remain available for now; both surfaces edit the same
 * underlying ConfigService rows.
 */
export const ACTION_OPEN_WORKSPACE_SETUP = "open-workspace-setup";
/**
 * Dock action to open the DataProvider editor — the authoring surface
 * for STOMP / REST / Mock / AppData providers that any blotter in the
 * platform can later bind to via <DataProviderSelector>. Same scope
 * + customData plumbing as the other admin tools.
 */
export const ACTION_OPEN_DATA_PROVIDERS  = "open-data-providers";
/**
 * Dock button / menu item action: launch a component registered in
 * the Component Registry. `customData` shape:
 *   { registryEntryId: string, asWindow?: boolean }
 *
 * The handler (registered in workspace.ts) resolves the live registry
 * entry by id at click-time, so updates to the registry (hostUrl /
 * configId / appId / etc.) propagate immediately to every dock item
 * that references the id. Missing ids are handled gracefully — a
 * user-visible notification, no hard failure.
 */
export const ACTION_LAUNCH_COMPONENT     = "launch-component";
/**
 * Dock action: show the Workspace **Home** search UI (`Home.show()`). One of the
 * default workspace-component buttons every OpenFin dock has (the custom dock
 * dispatches this through the normal action channel). No-op if Home isn't registered.
 */
export const ACTION_SHOW_HOME            = "show-home";
/**
 * Dock action: show the Workspace **Store** / Storefront (`Storefront.show()`).
 * Default workspace-component button. No-op if the store isn't registered.
 */
export const ACTION_SHOW_STORE           = "show-store";
