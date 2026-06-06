# Worklog — Custom OpenFin Dock

**Branch:** `feat/custom-dock`
**Plan (external):** `C:\Users\develop\.claude\plans\how-much-effort-is-starry-snowflake.md`
**Memory:** `custom-dock-plan` (auto-memory index)

> ## ⛔ PARKED — 2026-06-06 (needs multiple iterations + fine-tuning)
> Set aside after runtime testing surfaced fundamental gaps. **Working at park:**
> only the **theme toggle** and **notifications** buttons function. **Broken /
> missing:**
> 1. **Popout-menu buttons don't work** — Tools, Workspaces, Apps, and launcher
>    dropdowns open a popup but clicking items does nothing. The
>    `showPopupWindow` → `dispatchPopupResult` round-trip isn't delivering the
>    result back to the caller in the runtime (removing the prewarm was not
>    enough). **Next iteration: get a single working popup baseline first** — try
>    the canonical single-use popup (drop `name`/`hideOnClose` in
>    `openMenu`/`promptText`), and if `dispatchPopupResult` still doesn't resolve,
>    reconsider the popout architecture entirely (the earlier auto-resize-the-bar
>    option, or rendering menus in the dock window itself).
> 2. **Home / Store buttons don't work** — direct `dispatchAction(ACTION_SHOW_HOME/
>    STORE)`; verify the action reaches `dockActionHandlers` and that Home/Store
>    are registered in the test manifest (`Home.show()`/`Storefront.show()`).
> 3. **Missing the dock's intrinsic Quit/exit control** — there is no
>    brand/menu button with **Quit / exit the dock** (the native dock's core
>    affordance). Add a dock menu button (likely the leftmost brand icon) whose
>    menu includes Quit (+ maybe Lock/Settings).
>
> **Diagnostic clue:** the two buttons that work (theme, notifications) are
> *direct controller calls*; everything that's broken either goes through the
> **popout** (`openMenu`) or through `actionDispatcher`→`dockActionHandlers`. So
> the popout result-channel + the generic action-dispatch path are the prime
> suspects — not the dock-react UI (which is unit-green). All package code is
> typecheck/build/test green; the failures are OpenFin-runtime integration.

> **Goal.** Build a third dock implementation, `dockVersion: "custom"` — an
> always-on-top **frameless OpenFin window we render ourselves** (React +
> `@starui/design-system` tokens + shadcn primitives) — to escape dock2's
> un-themeable dark flyout and dock3's non-hideable content menu. Keep dock2
> and dock3 fully intact as fallbacks behind the existing flag.

---

## How to use this log

1. **One session = one row** in the session index. Sessions are sized to fit a
   single context window and end on a green, ideally committable, unit.
2. At **session start**: set the row to `in_progress`, note the date, re-read
   the linked source files for that task, and skim the previous session's
   handoff entry.
3. At **session end**: run the verification commands, update status, fill in a
   session-log entry from the template, and write the **Next** + **Blockers**
   lines so the next session can start cold.
4. **Respect phase order** — Phase N's foundation (channel dispatch, view-model
   mapping) is assumed by later phases. Within a phase, sessions are mostly
   independent.
5. Commit at end of session when the unit is green (**user-requested commits
   only** — do not auto-commit).
6. **Consult OpenFin docs / installed `@openfin/*` types first** for every
   OpenFin API touched (see memory `consult-openfin-docs-first`). The plan's
   "OpenFin documentation references" section maps each net-new piece to a
   supported API.

### Verification commands

```bash
# Narrow (preferred during iteration)
npx turbo typecheck --filter=@starui/openfin-platform
npx turbo typecheck test --filter=@starui/openfin-platform

# When the dock UI package exists (Phase 1+)
npx turbo typecheck test --filter=@starui/dock-react

# Before closing a phase
npx turbo typecheck build test --filter=@starui/openfin-platform --filter=@starui/dock-react

# Manual OpenFin run (sessions that change runtime behavior)
#   apps/demos/markets-ui-react-reference, manifest.fin.json,
#   customSettings.dockVersion = "custom"
```

### Session handoff template

```markdown
### Session N — YYYY-MM-DD
**Scope:** Task X.Y — <one line>
**Done:** …
**Files:** path/one.ts, path/two.tsx
**Verify:** <command output summary — green/red>
**Next:** Session N+1 — …
**Blockers:** none | …
```

---

## Key reuse map (do not rebuild these)

| Reused as-is | File |
|---|---|
| `DockEditorConfig` / `DockButtonConfig` / `DockMenuItemConfig` types + icon utils (`makeDualIcon`, `toDock2Buttons`, `appsToEditorConfig`) | `packages/openfin/openfin-platform/src/dockConfigTypes.ts` |
| `saveDockConfig` / `loadDockConfig` (already `(appId,userId)`-scoped) + `get/setPlatformDefaultScope` | `packages/openfin/openfin-platform/src/db.ts` |
| Action ids (`ACTION_*`) + IAB topics (`IAB_DOCK_CONFIG_UPDATE`, `IAB_RELOAD_AFTER_IMPORT`, `IAB_THEME_CHANGED`) | `packages/openfin/openfin-platform/src/iabTopics.ts` |
| `dockActionHandlers` (the action→handler map Dock3 already dispatches to) | `packages/openfin/openfin-platform/src/workspace.ts` (~L532) |
| Dock registration entrypoint + version branch | `packages/openfin/openfin-platform/src/dock.ts` (`registerDock`, L649) |
| Child-window spawn (manifest-origin, named, scoped `customData`) | `packages/openfin/openfin-platform/src/openChildToolWindow.ts` |
| Dock editor UI (`DockPane`, `IconPicker`, `InspectorPane`, `useDockEditor`) | `packages/react-core/workspace-setup-react/...` |
| Reference app routing + provider bootstrap | `apps/demos/markets-ui-react-reference/src/main.tsx`, `Provider.tsx`, `manifest.fin.json` |

**Net-new** = the dock window UI + positioning + cross-window action dispatch +
re-implemented workspace buttons + app-switcher. Everything else is reuse.

### Proposed home for net-new UI (confirm in Session 4)

- New package **`packages/react-core/dock-react`** → `@starui/dock-react`,
  sibling to `workspace-setup-react`. Holds the `DockBar` window UI, its hooks,
  and the pure view-model mapping. Consumed by the reference app's new `/dock`
  route. (Alternative: fold into `workspace-setup-react`. Decide at S4.)
- `dockVersion: "custom"` registration logic stays in
  `openfin-platform/src/dock.ts` (a `registerDockCustom()` parallel to
  `registerDockClassic()`), since it touches `@openfin/*` and the launcher.

---

## Session index

| # | Phase | Scope (1 session) | Status | Date |
|---|-------|---------------------|--------|------|
| 0 | — | Branch + worklog (this file) | **done** | 2026-06-06 |
| **Phase 0 — Spike & wiring** |||||
| 1 | 0 | `dockVersion: "custom"` type + thread through `workspace.ts`/`dock.ts` with a no-op `registerDockCustom()` stub; typecheck green | **done** | 2026-06-06 |
| 2 | 0 | `registerDockCustom()` launches a frameless, always-on-top `/dock` window; monitor-geometry edge placement; placeholder React route renders a themed "hello dock". Manual OpenFin verify | **done** | 2026-06-06 |
| 3 | 0 | Cross-window **action dispatch channel** — provider registers a channel/IAB endpoint over `dockActionHandlers`; dock window round-trips one `ACTION_*`. Spike-validate focus/blur + dispatch | **done** | 2026-06-06 |
| **Phase 1 — Core dock UI** *(complete — `@starui/dock-react`, 15 tests green)* |||||
| 4 | 1 | UI home = **`@starui/dock-react`** (scaffolded); **pure** `dockConfigToViewModel()` + `resolveDockIcon()` mapping; unit tests | **done** | 2026-06-06 |
| 5 | 1 | `DockBar` shell — renders launcher buttons + dropdowns from the view model, design-system tokens, dark+light | **done** | 2026-06-06 |
| 6 | 1 | **Tools dropdown** — theme-compliant shadcn `DropdownMenu`, 9 system tools (lucide icons; parity with `buildClassicSystemTools`) | **done** | 2026-06-06 |
| 7 | 1 | Click wiring → `DockController.dispatchAction` (the injected seam; real OpenFin channel binds in Phase 0/S3) | **done** | 2026-06-06 |
| 8 | 1 | **Theme toggle** + `useDockTheme` hook via `DockController.toggleTheme`/`onThemeChanged` (real `data-theme`/IAB lives behind the controller, bound in Phase 0) | **done** | 2026-06-06 |
| **Phase 2 — Config/editor loop** |||||
| 9 | 2 | Dock window subscribes to `IAB_DOCK_CONFIG_UPDATE` + `IAB_RELOAD_AFTER_IMPORT`; live-rebuild bar. Confirm the **existing dock editor drives the custom dock unchanged** | **done** | 2026-06-06 |
| 10 | 2 | Positioning polish — `useDockBounds` (monitor info → edge placement), save/restore position to ConfigService, show/hide, always-on-top re-assert | **done** | 2026-06-06 |
| **Phase 3 — Workspace switcher** |||||
| 11 | 3 | Data layer — `useSavedWorkspaces` (list), active-workspace tracking + the `UNTITLED_WORKSPACE_ID` checkmark-reset semantics. Pure reducer unit-tested | **done** | 2026-06-06 |
| 12 | 3 | Switcher dropdown UI — list + switch via `applyWorkspace({ skipPrompt })`; active checkmark | **done** | 2026-06-06 |
| 13 | 3 | Save-As (`getCurrentWorkspace` + `createSavedWorkspace`) + Restore-last-saved (`restoreLastSavedWorkspace`) | **done** | 2026-06-06 |
| **Phase 3.5 — Floating dock UX** *(user feedback 2026-06-06; takes priority over Phase 4)* |||||
| 14 | 3.5 | **Floating + draggable + auto-width** — replace top-edge spanning with a floating, content-sized bar (min-width floor) that grows via `resizeToContent`; `-webkit-app-region` drag region + grip handle | **done** | 2026-06-06 |
| 15 | 3.5 | **Popout menus via `showPopupWindow`** — render Tools / launcher dropdowns / workspace switcher / Save-As as OpenFin popup windows (no clipping in the small floating window). `openMenu` seam → `fin.me.showPopupWindow` | **done** | 2026-06-06 |
| **Phase 4 — Notifications + Home/Store** |||||
| 16 | 4 | Notifications button — unread badge (`getNotificationsCount` + `NotificationsCountChanged`) + `toggleNotificationCenter()` | **done** | 2026-06-06 |
| 17 | 4 | Home (`Home.show()`) + Store (Storefront) buttons **+ workspace-management parity** (Save / Rename / Delete) — docs-grounded native parity | **done** | 2026-06-06 |
| **Phase 5 — App-switcher (new requirement)** |||||
| 18 | 5 | Running-app **reducer** (pure, unit-tested) + `fin.System` event wiring (`application-started` / `window-created` / `*-closed`) | **done** | 2026-06-06 |
| 19 | 5 | App-switcher dropdown UI + per-app **scoped config swap** (`setPlatformDefaultScope` + reload bar from that scope's `DockEditorConfig`) | **done** | 2026-06-06 |
| **Phase 6 — Integration & hardening** |||||
| 20 | 6 | Theme-parity sweep (both schemes, every dropdown/icon) + multi-window/monitor edge cases + always-on-top under maximized windows | pending | |
| 21 | 6 | Tests (view-model, scope resolution, running-app reducer), `docs/current-features.md` update, final `turbo typecheck build test` | pending | |

**Status values:** `pending` | `in_progress` | `done` | `blocked` | `skipped`

---

## Risks / open decisions (carry forward)

1. **Always-on-top ≠ appbar.** The floating bar will not reserve screen space;
   maximized/snapped windows can overlap it (accepted). No standard OpenFin
   reserve-space API.
2. **Workspace-switcher parity** (S11–S13) is the biggest single risk —
   dirty-state prompts, restore semantics, active-workspace tracking. We already
   own the `skipPrompt` override + `UNTITLED_WORKSPACE_ID` checkmark-reset
   (`workspace.ts`), which de-risks it.
3. **App-switcher event model** (S16) — decide which event marks "app started"
   and exactly what "switch the dock for an app" does (swap scope + reload).
   Write a short design note at the top of S16 before coding.
4. **Cross-window dispatch** (S3) is pervasive — the dock window is separate
   from the provider, so all 14 actions round-trip via a channel/IAB rather
   than a direct callback. Get this solid in Phase 0.
5. **UI home** (S4) — `@starui/dock-react` vs folding into
   `workspace-setup-react`. Confirm before scaffolding.

---

## Milestones

- **Themed MVP** = Sessions 0–10 (Phases 0–2). A custom dock with launcher +
  Tools + theme toggle, fully theme-compliant, reusing all config/editor/action
  infra. This alone solves the original flyout-theming problem. Workspace
  switcher / notifications via the *existing* dock2/dock3 fallback or dropped
  temporarily.
- **Feature-complete parity + app-switcher** = through Session 19.

---

## Session log

### Fix — popout menu items not functional — 2026-06-06  *(user feedback)*
**Symptom:** the popout menus render but clicking items does nothing.
**Root cause:** the S16 **prewarm** pre-created the popup windows with
`fin.Window.create` (plain windows), then `showPopupWindow({name})` *adopted*
them. An adopted plain window is shown but isn't a true popup, so
`fin.me.dispatchPopupResult(...)` inside it silently no-ops → the caller's
`showPopupWindow` promise never resolves with a result → no action runs. (Menu
shows because the prewarmed window is shown; clicks are dead because the result
channel was never established.)
**Fix:** removed `prewarmPopups` + its `DockHost` call. `showPopupWindow` now
creates and **owns** the popup (proper popup ⇒ `dispatchPopupResult` resolves).
Kept the named + `hideOnClose` reuse (the documented fast path) so 2nd+ opens are
still instant; only the first open boots the popup bundle (Suspense fallback is
`null`, so no "Loading" text — just a brief blank).
**Files:** `apps/demos/markets-ui-react-reference/src/views/{OpenFinDockController.ts,DockHost.tsx}`
(app source only — **no package change, no re-propagate**; just relaunch).
**Verify:** app `tsc` → zero app-src errors.
**If still not functional at runtime:** drop the `name` + `hideOnClose` from
`openMenu`/`promptText` → a canonical single-use popup per open (guaranteed
`dispatchPopupResult` resolution, at the cost of a bundle boot every open).

### Session 19 — 2026-06-06  *(Phase 5 — App-switcher)*  **closes Phase 5**
**Scope:** Task 5.2 — the app-switcher **dropdown UI** + the real
`AppSwitcherController` (over `fin.System` running-app events) + per-app
**scoped config swap** (`setPlatformDefaultScope` + reload the bar from that
scope's `DockEditorConfig`).
**Consulted first** (per `consult-openfin-docs-first`): installed types —
`fin.System.getAllApplications()` + `addListener('application-started' |
'application-closed' | 'window-created' | 'window-closed')`; `db.ts`
`setPlatformDefaultScope` / `getPlatformDefaultScope` + `loadDockConfig(scope?)`.
**Decisions / caveats:**
- **Running-app detection is best-effort** (risk #3): "running apps" = the
  configured apps (`storedApps`) intersected with `getAllApplications()` uuids,
  plus the active-scope app. Apps launched as platform **views/snapshots** aren't
  separate OpenFin applications, so they may not appear — flagged for runtime
  refinement (could also enumerate platform Browser windows/views).
- **Switch = platform-wide scope swap** (as the plan specified):
  `setPlatformDefaultScope({appId})` + reload `lastEditorConfig` from that scope
  + push. This changes the default scope for *all* config (registry, profiles),
  not just the dock — per-app-config by design; documented as a known behavior.
**Done:**
- `@starui/dock-react`: `AppSwitcherController.switchToApp`; `appSwitcherMenuModel`
  + `APP_SWITCHER_PREFIX`; `DockAppSwitcher` (popout via `openMenu`, active check,
  switch on select) wired into `DockBar` behind an optional `appSwitcherController`
  prop; exports; tests (`DockAppSwitcher.test.tsx` + `appSwitcherMenuModel` in
  `menuModel.test.ts`; fixed the S18 fake controller for the new method).
- `openfin-platform`: channel topics `CUSTOM_DOCK_LIST_RUNNING_APPS` /
  `CUSTOM_DOCK_GET_ACTIVE_APP` / `CUSTOM_DOCK_SWITCH_APP` /
  `CUSTOM_DOCK_RUNNING_APPS_CHANGED`; provider handlers
  (`listCustomDockRunningApps` / `getCustomDockActiveAppId` /
  `switchCustomDockApp`) + `attachCustomDockAppListeners` (debounced `fin.System`
  events → push), torn down in `shutdownDockCustom` + `resetDockState`; stores
  `storedApps`.
- Reference app: `OpenFinDockController` implements `AppSwitcherController` over
  the channel (+ `running-apps-changed` push handler on connect); `DockHost`
  passes `appSwitcherController={controller}`.
**Files:** `packages/openfin/openfin-platform/src/{iabTopics.ts,configOnly.ts,dock.ts}`,
`packages/react-core/dock-react/src/{types.ts,index.ts,menuModel.ts,menuModel.test.ts,runningApps.test.ts,components/{DockAppSwitcher.tsx,DockAppSwitcher.test.tsx,DockBar.tsx}}`,
`apps/demos/markets-ui-react-reference/src/views/{OpenFinDockController.ts,DockHost.tsx}`
(+ re-packed `libs/starui-{react-core,openfin}.tgz`).
**Verify:** `npx turbo typecheck build test --filter=@starui/openfin-platform
--filter=@starui/dock-react` → **green (openfin-platform 80; dock-react now 63,
was 58)**. App `tsc` → zero app-src errors. Re-propagated both buckets.
**Manual OpenFin verify (NOT yet run):** the **Apps** button lists running apps
with the active one checked; selecting one swaps the dock config scope and the
bar reloads that app's buttons. **Watch:** running-app detection for
view/snapshot apps + the platform-wide scope-swap side effects.
**Next:** Phase 6 / **Session 20** — theme-parity sweep + multi-window/monitor
edge cases + always-on-top under maximized windows.
**Blockers:** none.

### Session 18 — 2026-06-06  *(Phase 5 — App-switcher)*
**Scope:** Task 5.1 — the app-switcher **data layer**: a pure running-app reducer
(list + active-tracking + closed-app active-reset) + the `useRunningApps` hook
over an injected `AppSwitcherController` seam. Unit-tested. UI + real `fin.System`
wiring + per-app scope swap are S19 (mirrors S11 — data layer verifiable in
isolation, no app wiring this session).
**Event-model design note (risk #3).** The data layer is kept **event-source
agnostic**: the controller's `listRunningApps` / `getActiveAppId` /
`onRunningAppsChanged` abstract whatever `fin.System` events the host wires
(`application-started` / `window-created` / `application-closed` / `window-closed`).
S19 decides the concrete mapping (likely: re-read the running set on any of those
events; an "app" = a launched platform app keyed by `appId`) and what
**switch-to-app** does — `setPlatformDefaultScope(appId)` + reload the bar from
that scope's `DockEditorConfig` (the per-app dock config). The reducer enforces
the invariant **active ∈ running ∪ {null}** in both `set-apps` and `set-active`,
so a host that briefly reports a just-closed app as active still clears it.
**Done:**
- `@starui/dock-react`:
  - `types.ts` — `RunningApp {id,title}` + `AppSwitcherController` seam
    (`listRunningApps` / `getActiveAppId` / `onRunningAppsChanged`; grows in S19
    with `switchToApp`).
  - `runningApps.ts` — pure `runningAppsReducer` (`set-apps` with closed-reset,
    `set-active` with membership guard) + `initialRunningAppsState` +
    `isActiveApp` selector.
  - `hooks/useRunningApps.ts` — seeds on mount, re-reads on every
    `onRunningAppsChanged` fire (list before active so membership is current).
  - `runningApps.test.ts` — 8 tests (reducer rules + purity; hook seed +
    change-driven re-read with a fake controller).
  - Exported the new symbols from `index.ts`.
**Files:** `packages/react-core/dock-react/src/{types.ts,runningApps.ts,runningApps.test.ts,index.ts,hooks/useRunningApps.ts}`
(+ re-packed `libs/starui-react-core.tgz`).
**Verify:** `npx turbo typecheck build test --filter=@starui/dock-react` →
**green (dock-react now 58, was 50)**. App `tsc` → zero app-src errors.
Re-propagated `react-core`. No app changes → no OpenFin wiring yet (S19).
**Next:** Phase 5 / **Session 19** — app-switcher dropdown UI + the real
`AppSwitcherController` (over `fin.System` events) + per-app scoped config swap
(`setPlatformDefaultScope` + reload bar from that scope's `DockEditorConfig`).
**Blockers:** none. The `AppSwitcherController` has no OpenFin implementation yet
(S19) — the data layer is exercised today only through the fake in tests.

### Session 17 — 2026-06-06  *(Phase 4 — Home/Store + native parity)*
**Scope:** User asked to ground the dock against OpenFin's workspace docs — the
**default buttons every dock has** and the **workspace-management menu items**.
Added the missing default buttons (Home, Store) and the missing workspace
actions (Save, Rename, Delete) for full native parity.
**Consulted first** (per `consult-openfin-docs-first`; user-directed): OpenFin
Workspace docs + installed types —
  - **Default dock buttons** (`WorkspaceButton`, `DockProviderConfig.workspaceComponents`,
    default `['switchWorkspace','home','notifications','store']`): every dock has
    **Home / Workspaces / Notifications / Store**. We had Workspaces (S12) +
    Notifications (S16); **Home + Store** were the gap.
  - **Workspace-management menu** (`WorkspaceManagementActions`:
    SwitchWorkspace / SaveWorkspace / SaveWorkspaceAs / RenameWorkspace /
    DeleteWorkspace + RestoreChanges): we had Switch (S12), Save-As + Restore
    (S13); **Save / Rename / Delete** were the gap. Storage APIs used:
    `Storage.saveWorkspace` (upsert), `updateWorkspace` (rename),
    `deleteWorkspace`.
**Done:**
- **Default buttons (Home/Store):** new actions `ACTION_SHOW_HOME` /
  `ACTION_SHOW_STORE` (dispatched over the existing action channel — no new
  plumbing), handled in `workspace.ts` `dockActionHandlers` via `Home.show()` /
  `Storefront.show()`. dock-react: new `DockSystemButton` + Home/Store buttons in
  `DockBar`'s system group, ordered to match native (Home, Workspaces,
  Notifications, Store, then our Tools + theme extras).
- **Workspace management (Save/Rename/Delete):** channel topics
  `CUSTOM_DOCK_SAVE_WORKSPACE` / `_RENAME_WORKSPACE` / `_DELETE_WORKSPACE` +
  provider handlers (`saveCustomDockWorkspace` upserts the active workspace,
  `rename…`/`delete…` via Storage); `WorkspaceController` grew
  `saveWorkspace` / `renameWorkspace` / `deleteWorkspace`. `workspaceMenuModel`
  now mirrors the native dropdown: list (1-click switch) + **Save** (when active)
  + **Save as…** + **Manage workspaces ▸** (per workspace: Rename…, Delete ▸
  Confirm delete) + **Restore last saved**. The switcher maps each result;
  rename uses the `promptText` popup, delete is gated behind a confirm
  drill-down. App `OpenFinDockController` implements the three over the channel.
**Files:** `packages/openfin/openfin-platform/src/{iabTopics.ts,configOnly.ts,dock.ts,workspace.ts}`,
`packages/react-core/dock-react/src/{types.ts,index.ts,menuModel.ts,menuModel.test.ts,components/{DockSystemButton.tsx,DockMenuView.tsx,DockBar.tsx,DockWorkspaceSwitcher.tsx,DockWorkspaceSwitcher.test.tsx},workspaceSwitcher.test.ts}`,
`apps/demos/markets-ui-react-reference/src/views/OpenFinDockController.ts`
(+ re-packed `libs/starui-{react-core,openfin}.tgz`).
**Verify:** `npx turbo typecheck build test --filter=@starui/openfin-platform
--filter=@starui/dock-react` → **green (openfin-platform 80; dock-react now 50,
was 45)**. App `tsc` → zero app-src errors. Re-propagated both buckets.
**Manual OpenFin verify (NOT yet run):** Home/Store buttons open the workspace
Home/Storefront; Workspaces menu now offers Save (updates active), Save as…,
Manage ▸ Rename/Delete (with confirm), Restore.
**Dock feature parity now:** default buttons Home ✓ / Workspaces ✓ /
Notifications ✓ / Store ✓; workspace actions Switch ✓ / Save ✓ / Save As ✓ /
Rename ✓ / Delete ✓ / Restore ✓ — plus custom Tools menu + theme toggle.
**Next:** Phase 5 / **Session 18** — running-app reducer + `fin.System` event
wiring (app-switcher).
**Blockers:** none.

### Fix — per-platform dock singleton — 2026-06-06  *(user feedback)*
**Scope:** "The dock must be a singleton; other apps use the same dock" —
confirmed scope = **one per platform** (shared by every app/view in the platform
via the provider channel; not cross-application/cross-UUID).
**Done:** `launchCustomDockWindow` now collapses concurrent/re-entrant launches
onto one in-flight promise (`customDockLaunch`) on top of the existing
focus-by-name idempotency, so a race can't create two dock windows (which would
throw on the duplicate window name). Guard cleared in `shutdownDockCustom` +
`resetDockState`. The other registration side-effects were already idempotent
(`registerCustomDockChannel` ↔ `customDockChannel`, `subscribeDockIab` ↔
`iabSubscribed`, `attachCustomDockNotifListener` ↔ `customDockNotifListener`).
**Files:** `packages/openfin/openfin-platform/src/dock.ts` (+ re-packed
`libs/starui-openfin.tgz`).
**Verify:** openfin-platform `typecheck build test` → green (80). Re-propagated
`openfin`.
**Note (carry forward):** true cross-application sharing (separate OpenFin apps
attaching to one dock) is NOT in scope — would need the dock as a standalone
shared service with discovery + ownership handoff.

### Fixes (post-S16) — 2026-06-06  *(runtime UX/perf from user feedback)*
**Scope:** First real-runtime feedback on the floating dock + popout menus.
Issues: (1) dock buttons took seconds to appear; (2) submenu showed a "Loading…"
message before items; (3) menu font too large; (4) buttons had no tooltips;
(5) menu/submenu open was slow.
**Root causes:** the popout menus opened a **fresh** window per open that booted
the whole app bundle (→ slow + the route's `Suspense fallback` "Loading…" flash);
the dock bar fetched config over the channel after boot (empty-then-populate);
Radix tooltips were portal-rendered and **clipped** by the tiny frameless window.
**Done:**
- **Tooltips (4):** native `title` on every dock button (launcher / dropdown /
  Tools / theme / workspaces / notifications) — OS tooltips aren't clipped like
  the portaled Radix ones.
- **Menu font (3):** `DockMenuView` rows `text-[13px]` (was `text-sm`), tighter.
- **No "Loading" (2):** `/dock/menu` + `/dock/prompt` routes use
  `Suspense fallback={null}`.
- **Popup perf (5):** popups are now **reused** — named (`starui-dock-menu` /
  `-prompt`) + `hideOnClose: true`, so the bundle loads once and later opens just
  re-show + update `customData`. The popup re-reads its model on the window's
  `shown` event (it doesn't remount on reuse). `OpenFinDockController.prewarmPopups()`
  (called from `DockHost` mount) pre-creates both popups hidden so even the FIRST
  open is instant.
- **Dock-bar perf (1):** `DockHost` caches the last `DockEditorConfig` in
  `localStorage` (`starui:dock-config-cache`) and seeds state from it on mount, so
  launcher buttons render immediately on relaunch; the channel fetch refreshes +
  re-caches.
**Files:** `packages/react-core/dock-react/src/components/{DockLauncherButton,DockDropdownButton,DockToolsMenu,DockThemeToggle,DockWorkspaceSwitcher,DockNotificationsButton,DockMenuView}.tsx`,
`apps/demos/markets-ui-react-reference/src/{main.tsx,views/{OpenFinDockController.ts,DockHost.tsx,DockMenuWindow.tsx,DockPromptWindow.tsx}}`
(+ re-packed `libs/starui-react-core.tgz`).
**Verify:** `npx turbo typecheck build test --filter=@starui/dock-react` → green
(45 tests). App `tsc` → zero app-src errors. Re-propagated `react-core`.
**Manual OpenFin verify (NOT yet run):** menus open instantly with no "Loading",
smaller text, button hover shows tooltips, dock buttons appear immediately on
relaunch (cached). **Watch:** popup reuse via `name` + `hideOnClose` + `shown`
re-read is the riskiest bit — if a reused popup shows a stale menu, the `shown`
listener isn't firing; fall back to fresh windows (drop `name`) if so.

### Session 16 — 2026-06-06  *(Phase 4 — Notifications + Home/Store)*
**Scope:** Task 4.1 — the custom dock's **notifications bell** with a live unread
badge + toggle the notification center.
**Consulted first** (per `consult-openfin-docs-first`): `@openfin/notifications`
(re-exported via `@openfin/workspace/notifications`) — `getNotificationsCount():
Promise<number>`, `toggleNotificationCenter(): Promise<void>`, and
`addEventListener('notifications-count-changed', (e:{type,count})=>void)` /
`removeEventListener`.
**Architecture (continues S12/S16 channel pattern):** the provider owns the
`@openfin/notifications` client (import-boundary: only `openfin-platform` may
touch `@openfin/*`), so the bell pulls the count / toggles the center over the
provider channel and the provider pushes count changes. dock-react stays
OpenFin-free behind a new `NotificationController` seam.
**Done:**
- `iabTopics.ts` — `CUSTOM_DOCK_GET_NOTIF_COUNT` / `CUSTOM_DOCK_TOGGLE_NOTIF_CENTER`
  (dock→provider) + `CUSTOM_DOCK_NOTIF_COUNT_CHANGED` (provider→dock push);
  re-exported via `dock.ts` + `configOnly.ts` (`/config`).
- `dock.ts` (custom path only) — imports `@openfin/workspace/notifications`;
  channel handlers backed by `getCustomDockNotifCount` /
  `toggleCustomDockNotificationCenter`; `attachCustomDockNotifListener`
  subscribes to `notifications-count-changed` → `publishCustomDockNotifCount`
  (wired in `registerDockCustom`, torn down in `shutdownDockCustom` +
  `resetDockState`).
- `@starui/dock-react`:
  - `types.ts` — `NotificationController` (`getNotificationsCount` /
    `onCountChanged` / `toggleNotificationCenter`).
  - `hooks/useNotificationsCount.ts` — seed + live count.
  - `components/DockNotificationsButton.tsx` — `Bell` + unread badge
    (hidden at 0, clamps `99+`), click → `toggleNotificationCenter`.
  - `DockBar` — optional `notificationController` prop; renders the bell first in
    the system-control group. Exports + `DockNotificationsButton.test.tsx`
    (5 tests: zero/seed/clamp/toggle/live-update).
- Reference app — `OpenFinDockController` now also implements
  `NotificationController` (channel dispatch + `notif-count-changed` push
  handler on connect); `DockHost` passes `notificationController={controller}`.
**Files:** `packages/openfin/openfin-platform/src/{iabTopics.ts,configOnly.ts,dock.ts}`,
`packages/react-core/dock-react/src/{types.ts,index.ts,hooks/useNotificationsCount.ts,components/{DockNotificationsButton.tsx,DockNotificationsButton.test.tsx,DockBar.tsx}}`,
`apps/demos/markets-ui-react-reference/src/views/{OpenFinDockController.ts,DockHost.tsx}`
(+ re-packed `libs/starui-{react-core,openfin}.tgz`).
**Verify:** `npx turbo typecheck build test --filter=@starui/openfin-platform
--filter=@starui/dock-react` → **green (openfin-platform 80; dock-react now 45,
was 40)**. App `tsc -p tsconfig.app.json` → zero app-src errors. Re-propagated
`react-core` + `openfin` (integrity-patch dance).
**Manual OpenFin verify (NOT yet run — needs a human + runtime):** with
`dockVersion: "custom"` and notifications enabled — the bell shows the current
center count as a badge; raising/clearing notifications updates it live; clicking
toggles the notification center.
**Next:** Phase 4 / **Session 17** — Home (`Home.show()`) + Store (Storefront)
buttons.
**Blockers:** none.

### Session 15 — 2026-06-06  *(Phase 3.5 — Floating dock UX)*
**Scope:** User feedback — dock submenus were clipped by the small floating
window. Render Tools / launcher dropdowns / workspace switcher / Save-As as
OpenFin **popup windows** (user chose popouts over auto-resizing the bar).
**Closes Phase 3.5.**
**Consulted first** (per `consult-openfin-docs-first`; user pointed to the docs):
`fin.me.showPopupWindow(options): Promise<PopupResult>` + the `View` variant —
`x`/`y` relative to the caller window, `blurBehavior:'close'` (dismiss on outside
click), popup `dispatchPopupResult({result,data})` + `resultDispatchBehavior:'close'`
(self-close + resolve caller), model passed via `additionalOptions.customData`,
read with `fin.me.getOptions()`. Captured in memory
`dock-popout-uses-showpopupwindow`.
**Architecture:** dock-react stays OpenFin-free behind two new optional
`DockController` seams — `openMenu(model, anchor)` / `promptText(options)`. The
menu **model is serializable** (image icons = pre-resolved URLs, system icons =
lucide **names** resolved in the popup) so it can cross the window boundary as
JSON. Menu buttons became plain triggers that call `openMenu` and map the
returned `DockMenuResult`. Submenus **drill down in place** in the popup (a model
stack + Back row), not nested child popups — a nested popup would blur-close its
parent.
**Done:**
- `@starui/dock-react`:
  - `menuModel.ts` — `toolsMenuModel` / `dropdownMenuModel` / `workspaceMenuModel`
    builders + `WORKSPACE_MENU_{SAVE_AS,RESTORE,APPLY_PREFIX}` ids; menu types
    (`DockMenuItem/Model/Result/Anchor`, `DockPromptOptions`) added to `types.ts`.
  - `DockMenuView.tsx` — plain themed menu list for the popup (lucide-by-name +
    image icons, checks, separators, submenu chevrons); `openMenu`/`promptText`
    added to `DockController`.
  - `systemTools.ts` — added serializable `iconName` to each tool.
  - `DockToolsMenu` / `DockDropdownButton` / `DockWorkspaceSwitcher` reworked off
    Radix `DropdownMenu`/`Dialog` to plain buttons that build a model + call
    `controller.openMenu` (switcher also `promptText` for Save-As); exports +
    new tests (`menuModel.test.ts`, `DockMenuView.test.tsx`; rewrote
    `DockBar`/switcher tests for the popout flow).
- Reference app:
  - `OpenFinDockController.openMenu/promptText` → `fin.me.showPopupWindow` (popups
    `starui-dock-menu` / `starui-dock-prompt`), reading the result.
  - `DockMenuWindow` (`/dock/menu`) — renders `DockMenuView` from `customData`,
    drill-down stack, self-resizes, `dispatchPopupResult` on select.
  - `DockPromptWindow` (`/dock/prompt`) — themed shadcn Save-As form,
    `dispatchPopupResult` the text/`null`.
  - Routes registered in `main.tsx`.
**Files:** `packages/react-core/dock-react/src/{types.ts,index.ts,systemTools.ts,menuModel.ts,menuModel.test.ts,components/{DockMenuView.tsx,DockMenuView.test.tsx,DockToolsMenu.tsx,DockDropdownButton.tsx,DockWorkspaceSwitcher.tsx,DockWorkspaceSwitcher.test.tsx,DockBar.tsx,DockBar.test.tsx}}`,
`apps/demos/markets-ui-react-reference/src/{main.tsx,views/{OpenFinDockController.ts,DockMenuWindow.tsx,DockPromptWindow.tsx}}`
(+ re-packed `libs/starui-react-core.tgz`).
**Verify:** `npx turbo typecheck build test --filter=@starui/dock-react` →
**green (dock-react now 40, was 34)**. App `tsc -p tsconfig.app.json` → zero
app-src errors. Re-propagated `react-core` (integrity-patch dance). openfin-platform
unchanged this session.
**Manual OpenFin verify (NOT yet run — needs a human + runtime):** with
`dockVersion: "custom"` — click **Tools** / a launcher dropdown / **Workspaces**:
each opens a themed popup under the button that is NOT clipped by the dock; click
elsewhere dismisses it; choosing an item runs the action / switches workspace;
**Save workspace as…** opens the text-prompt popup → typing + Save creates the
workspace. Nested launcher dropdowns drill down in place with a Back row.
**Perf caveat (follow-up):** each popup opens a **fresh** window (no fixed
`name`) so its React mount-effect re-reads the new `customData` model — a reused
window wouldn't remount. That means a full app boot per menu open. If menus feel
sluggish in the runtime, optimize by reusing a named popup + re-reading
`customData` on its `shown` event (or a lightweight popup entry bundle).
**Next:** Phase 4 / **Session 16** — Notifications button (unread badge via
`getNotificationsCount` + `NotificationsCountChanged`, `toggleNotificationCenter()`).
**Blockers:** none.

### Session 14 — 2026-06-06  *(Phase 3.5 — Floating dock UX)*
**Scope:** User feedback — the dock must be a **floating, draggable** object (not
pinned/spanning the top edge), with a **minimum width that grows with its
buttons**. (Submenu visibility is S15.)
**Consulted first** (per `consult-openfin-docs-first`): installed `@openfin/core`
— `Window.resizeTo(width, height, anchor)` (anchor `"top-left"` holds the
position while resizing) and the frameless-window drag mechanism
(`-webkit-app-region: drag` / `no-drag`, the OpenFin/Chromium way to drag a
frameless window). Also read **`Window.showPopupWindow`** + the View variant
ahead of S15 (see new memory `dock-popout-uses-showpopupwindow`).
**Done:**
- `dock.ts` — `computeCustomDockBounds()` now returns a **floating** default
  (compact, `CUSTOM_DOCK_MIN_WIDTH = 220`, centred near the primary monitor top
  with a `CUSTOM_DOCK_TOP_OFFSET`) instead of top-edge-spanning the available
  width. Restore-saved-position (S10) unchanged; only the fallback + initial
  width changed. (No appbar reservation — still a floating always-on-top window.)
- `@starui/dock-react`:
  - `types.ts` — optional `resizeToContent(width, height)` on `DockController`
    (the OpenFin window-resize seam; no-op when absent).
  - `hooks/useDockAutoSize.ts` — observes the bar element (ResizeObserver,
    guarded for jsdom) and reports `offsetWidth/Height` to `resizeToContent`.
  - `DockBar` — `inline-flex w-fit min-w-[220px]` (was `w-full`), `rounded-md
    border` floating styling, a `GripVertical` drag affordance, and the bar +
    grip + separator marked as OpenFin drag regions with the launcher +
    system-control groups opting out (`no-drag`) so clicks/dropdowns still work;
    wires `useDockAutoSize`.
    **Drag fix (post-feedback):** the drag region uses **inline styles**
    (`{ WebkitAppRegion: "drag" } as CSSProperties`, the repo's grid-widget
    pattern) — the Tailwind arbitrary class `[-webkit-app-region:drag]` never
    generated (`WebkitAppRegion` isn't in csstype). And because
    `-webkit-app-region` is **not inherited**, the grip/separator (children of
    the drag root) defaulted to `no-drag`, leaving almost no draggable surface —
    so each is now marked `drag` explicitly.
  - exported `useDockAutoSize`; +1 DockBar test (reports size to the host).
- Reference app:
  - `OpenFinDockController.resizeToContent()` → `fin.Window.getCurrentSync()
    .resizeTo(w, h, "top-left")` with a `DOCK_MIN_WIDTH = 220` floor + a
    skip-if-unchanged guard (ResizeObserver fires repeatedly).
  - `DockHost` wrapper `fixed left-0 top-0` (was `inset-0`) so the bar
    shrink-wraps and drives the window size.
**Files:** `packages/openfin/openfin-platform/src/dock.ts`,
`packages/react-core/dock-react/src/{types.ts,index.ts,hooks/useDockAutoSize.ts,components/DockBar.tsx,components/DockBar.test.tsx}`,
`apps/demos/markets-ui-react-reference/src/views/{OpenFinDockController.ts,DockHost.tsx}`
(+ re-packed `libs/starui-{react-core,openfin}.tgz`).
**Verify:** `npx turbo typecheck build test --filter=@starui/openfin-platform
--filter=@starui/dock-react` → **green (openfin-platform 80; dock-react now 34,
was 33)**. App `tsc -p tsconfig.app.json` → zero app-src errors. Re-propagated
`react-core` + `openfin` with the integrity-patch dance (S3).
**Manual OpenFin verify (NOT yet run — needs a human + runtime):** with
`dockVersion: "custom"` — the bar opens floating near the top (not edge-pinned);
**drag** it anywhere by the grip/background; it stays the width of its content
(min 220) and **grows** as launcher buttons are added via the editor.
**Known caveat (→ S15):** dropdowns/dialogs still render via DOM portals and
**clip** inside the small floating window — fixed in S15 by rendering them as
OpenFin popup windows.
**Next:** Phase 3.5 / **Session 15** — popout menus via `fin.me.showPopupWindow`
(see plan below + memory `dock-popout-uses-showpopupwindow`).
**Blockers:** none.

#### S15 design note (popout menus via `showPopupWindow`)
- **Primitive:** `fin.me.showPopupWindow(options): Promise<PopupResult>` (works
  from the dock Window; resolves correctly from a View too). `x`/`y` are
  **relative to the caller window** → pass the dock button's
  `getBoundingClientRect()`. `blurBehavior:'close'` auto-dismisses on outside
  click; popup calls `fin.me.dispatchPopupResult({result:'clicked', data})` and
  with `resultDispatchBehavior:'close'` self-closes + resolves the caller.
  Menu model passed via `additionalOptions.customData`, read with
  `fin.me.getOptions()`. Nested submenus = the popup calls `showPopupWindow`
  again. (Do **not** hand-roll `fin.Window.create` + blur/result IPC.)
- **Seam:** add `openMenu(model, anchorRect): Promise<MenuResult | null>` to a
  dock-react controller interface (keeps dock-react OpenFin-free). New popup
  route (e.g. `/dock/menu`) renders a plain themed `DockMenuView` (no Radix
  needed — its own window). Migrate `DockToolsMenu`, `DockDropdownButton`,
  `DockWorkspaceSwitcher` (incl. Save-As form) off Radix `DropdownMenu`/`Dialog`
  to the popout seam.

### Session 13 — 2026-06-06  *(Phase 3 — Workspace switcher)*
**Scope:** Task 3.3 — **Save-As** (capture the current desktop as a new saved
workspace) + **Restore-last-saved**, extending the `WorkspaceController` seam +
the switcher menu. **Closes Phase 3.**
**Consulted first** (per `consult-openfin-docs-first`): installed
`@openfin/workspace-platform` types — `getCurrentWorkspace(options?)` →
`Workspace {workspaceId,title,metadata?,snapshot}`,
`Storage.createWorkspace(CreateSavedWorkspaceRequest)`, `setActiveWorkspace`, and
`restoreLastSavedWorkspace({skipPrompt})` →
`'success' | 'not-saved-workspace' | 'user-declined'`. Also re-read
`workspacePersistence.ts` — the platform's `Storage` CRUD is overridden to
persist to ConfigService (`createSavedWorkspace`/`getSavedWorkspaces`/…), so
`Storage.createWorkspace` from the provider correctly writes a `WS_<id>` row and
the switcher's `getWorkspacesMetadata` lists it; the override's `fireChange`
already refreshes the dock.
**Architecture (continues S12).** Both ops route over the provider channel; the
dock window's `OpenFinDockController` stays a thin client (bare `fin` only). The
title is captured in a **themed shadcn `Dialog`** in the dock window (not the
native dark save modal we're escaping), keeping the whole switcher
design-system-compliant.
**Done:**
- `iabTopics.ts` — `CUSTOM_DOCK_SAVE_WORKSPACE_AS` (`{title}`) +
  `CUSTOM_DOCK_RESTORE_LAST_SAVED` (`{skipPrompt}`); re-exported via `dock.ts` +
  `configOnly.ts` (`/config`).
- `dock.ts` (custom path only) — registered both channel handlers backed by
  `saveCustomDockWorkspaceAs` (`getCurrentWorkspace()` → new `Workspace`
  {fresh-GUID, title, snapshot, metadata} → `Storage.createWorkspace` →
  `setActiveWorkspace` → push change) and `restoreCustomDockLastSaved`
  (`restoreLastSavedWorkspace({skipPrompt})` → push change). Added
  `newCustomDockWorkspaceId()` (prefers `crypto.randomUUID`).
- `@starui/dock-react`:
  - `types.ts` — `saveWorkspaceAs(title)` + `restoreLastSavedWorkspace(options?)`
    on `WorkspaceController`.
  - `DockWorkspaceSwitcher.tsx` — below the list: **Save workspace as…** opens a
    controlled shadcn `Dialog` (`Input` + `Label`, Save disabled until non-empty,
    submit → `saveWorkspaceAs`) and **Restore last saved** →
    `restoreLastSavedWorkspace({skipPrompt:true})`.
  - `DockWorkspaceSwitcher.test.tsx` — +3 tests (dialog save flow, Save disabled
    when empty, restore). Updated both fake controllers (S11 + switcher) with the
    two new methods.
- Reference app — `OpenFinDockController` adds `saveWorkspaceAs` /
  `restoreLastSavedWorkspace` over the channel (no `DockBar`/`DockHost` change —
  they already pass `workspaceController={controller}`).
**Files:** `packages/openfin/openfin-platform/src/{iabTopics.ts,configOnly.ts,dock.ts}`,
`packages/react-core/dock-react/src/{types.ts,components/DockWorkspaceSwitcher.tsx,components/DockWorkspaceSwitcher.test.tsx,workspaceSwitcher.test.ts}`,
`apps/demos/markets-ui-react-reference/src/views/OpenFinDockController.ts`
(+ re-packed `libs/starui-{react-core,openfin}.tgz`).
**Verify:** `npx turbo typecheck build test --filter=@starui/openfin-platform
--filter=@starui/dock-react` → **green (openfin-platform 80; dock-react now 33,
was 30)**. App `tsc -p tsconfig.app.json` → zero app-src errors (only the
pre-existing `ExpressionEditor` dual-`@types/react` noise). Re-propagated
`react-core` + `openfin` with the stable-filename integrity-patch dance (S3).
**Manual OpenFin verify (NOT yet run — needs a human + runtime):** with
`dockVersion: "custom"`, arrange some windows → **Workspaces ▸ Save workspace
as…** → enter a name → Save → it appears in the list, checked active; switch
away then back; **Restore last saved** re-applies the last saved layout.
**Caveat to watch:** the switcher dropdown + Save-As dialog render via portals;
in the 44px frameless dock window overlay clipping is an open integration concern
for Phase 6 (S18) — affects every dock dropdown, not new to S13.
**Next:** Phase 3 complete. Phase 4 / **Session 14** — Notifications button
(unread badge via `getNotificationsCount` + `NotificationsCountChanged`,
`toggleNotificationCenter()`).
**Blockers:** none.

### Session 12 — 2026-06-06  *(Phase 3 — Workspace switcher)*
**Scope:** Task 3.2 — the switcher **dropdown UI**: list saved workspaces with an
active checkmark + switch via `applyWorkspace({ skipPrompt })`; implement the
`WorkspaceController` on the app's dock controller (over the workspace-platform
`Storage` API + `applyWorkspace`/`getCurrentWorkspace`), wire into `<DockBar>`,
re-propagate.
**Consulted first** (per `consult-openfin-docs-first`): the installed
`@openfin/workspace-platform` types — `Storage.getWorkspacesMetadata()` →
`Pick<Workspace,'workspaceId'|'title'>[]`, `Storage.getWorkspace(id)` →
`Workspace|undefined`, `getCurrentWorkspace({skipSnapshotUpdate:true})` (active
pointer, no snapshot recompute), and `applyWorkspace(workspace, {skipPrompt})` →
`Promise<boolean>`.
**Architecture decision (consistent with S9/S10).** Workspace operations route
over the **provider channel**, not by the dock window calling the workspace-
platform API itself. Reason: the dock window is a separate JS realm, and only the
provider lives in `openfin-platform` (the sole package allowed to import
`@openfin/*`) and already holds `getCurrentSync()`. The dock window's
`OpenFinDockController` is a thin channel client (using only the bare `fin`
global, no `@openfin/*` import) — same single-source pattern as config (S9) and
geometry (S10).
**Done:**
- `iabTopics.ts` — four channel actions: `CUSTOM_DOCK_LIST_WORKSPACES`,
  `CUSTOM_DOCK_GET_ACTIVE_WORKSPACE`, `CUSTOM_DOCK_APPLY_WORKSPACE` (dock →
  provider), `CUSTOM_DOCK_WORKSPACE_CHANGED` (provider → dock push). Re-exported
  via `dock.ts` + `configOnly.ts` (`/config`).
- `dock.ts` (custom path only) — `registerCustomDockChannel` registers the three
  request handlers backed by `listCustomDockWorkspaces` /
  `getCustomDockActiveWorkspaceId` (maps `UNTITLED_WORKSPACE_ID` → `null`) /
  `applyCustomDockWorkspace` (loads via `Storage.getWorkspace`, applies with
  `{skipPrompt}`, then pushes change). Added exported
  `publishCustomDockWorkspaceChanged()`.
- `workspace.ts` — `resetActiveWorkspaceWhenEmpty` now also calls
  `publishCustomDockWorkspaceChanged()` so the custom switcher clears its
  checkmark when the last Browser window closes (parity with dock2/dock3's
  native component reacting to `setActiveWorkspace`).
- `@starui/dock-react`:
  - `types.ts` — `applyWorkspace(id, options?)` added to `WorkspaceController`;
    new `ApplyWorkspaceOptions {skipPrompt?}`.
  - `components/DockWorkspaceSwitcher.tsx` — shadcn `DropdownMenu` driven by
    `useSavedWorkspaces`; active check via `isActiveWorkspace`; empty state;
    select → `applyWorkspace(id, {skipPrompt:true})`.
  - `DockBar` — new optional `workspaceController` prop; renders the switcher in
    the trailing system-controls group when supplied.
  - `index.ts` — export `DockWorkspaceSwitcher` + `ApplyWorkspaceOptions`.
  - `DockWorkspaceSwitcher.test.tsx` — 6 tests (list, apply-with-skipPrompt,
    active-check rendering, empty state, change-driven re-read, checkmark-moves-
    after-switch). Fixed the S11 fake controller to add `applyWorkspace`.
- Reference app:
  - `OpenFinDockController` now `implements DockController, WorkspaceController` —
    `listWorkspaces`/`getActiveWorkspaceId`/`applyWorkspace` over the channel +
    `onWorkspaceChanged` (client registers the `workspace-changed` handler on
    connect).
  - `DockHost` passes `workspaceController={controller}` to `<DockBar>`.
**Files:** `packages/openfin/openfin-platform/src/{iabTopics.ts,configOnly.ts,dock.ts,workspace.ts}`,
`packages/react-core/dock-react/src/{types.ts,index.ts,components/DockWorkspaceSwitcher.tsx,components/DockWorkspaceSwitcher.test.tsx,components/DockBar.tsx,workspaceSwitcher.test.ts}`,
`apps/demos/markets-ui-react-reference/src/views/{OpenFinDockController.ts,DockHost.tsx}`
(+ re-packed `libs/starui-{react-core,openfin}.tgz`).
**Verify:** `npx turbo typecheck build test --filter=@starui/openfin-platform
--filter=@starui/dock-react` → **green (openfin-platform 80; dock-react now 30,
was 24)**. App `tsc -p tsconfig.app.json` → zero app-src errors (only the
pre-existing `ExpressionEditor` dual-`@types/react` noise). Re-propagated
`react-core` + `openfin` with the stable-filename integrity-patch dance (see S3).
**Manual OpenFin verify (NOT yet run — needs a human + runtime):** with
`dockVersion: "custom"`, save two workspaces (via the native Home/Store or
existing save flow), then open the dock's **Workspaces** dropdown → both list;
the active one shows a check; click the other → it switches without a prompt and
the check moves; close the last Browser window → the check clears.
**Next:** Phase 3 / **Session 13** — Save-As (`getCurrentWorkspace` +
`createSavedWorkspace`) + Restore-last-saved (`restoreLastSavedWorkspace`),
extending `WorkspaceController` + the switcher menu.
**Blockers:** none.

### Session 11 — 2026-06-06  *(Phase 3 — Workspace switcher)*
**Scope:** Task 3.1 — the switcher **data layer**: pure reducer (saved list +
active-workspace tracking + `UNTITLED_WORKSPACE_ID` checkmark-reset) + the
`useSavedWorkspaces` hook over an injected `WorkspaceController` seam. Unit-tested.
UI is S12; no app wiring this session (mirrors S4–S8 — verifiable in isolation).
**Consulted first** (per `consult-openfin-docs-first`): the workspace-platform
`Storage` API the host will implement against (`getWorkspaces` → `Workspace
{workspaceId,title,snapshot}`, `getWorkspace`/`deleteWorkspace` — already used by
`testBridge/install.ts`) and `setActiveWorkspace`/the `UNTITLED_WORKSPACE_ID`
empty-desktop reset in `workspace.ts`.
**Done:**
- Shared the **`UNTITLED_WORKSPACE_ID`** sentinel: moved it from a local const in
  `workspace.ts` to `iabTopics.ts` (re-exported via `dock.ts` + the `/config`
  subpath), so the provider's reset logic and the dock-react reducer agree on
  the "no active saved workspace" marker. `workspace.ts` now imports it.
- `@starui/dock-react`:
  - `types.ts` — `SavedWorkspace {id,title}` + `WorkspaceController` seam
    (`listWorkspaces` / `getActiveWorkspaceId` / `onWorkspaceChanged`; grows in
    S12/S13 with apply/save/restore).
  - `workspaceSwitcher.ts` — **pure** `workspaceSwitcherReducer` with two reset
    rules: *untitled reset* (`set-active` of the sentinel / `null` → no active)
    and *deleted reset* (`set-workspaces` drops the active marker if the active
    id left the list). Plus `isActiveWorkspace` selector.
  - `hooks/useSavedWorkspaces.ts` — seeds on mount, re-reads on every
    `onWorkspaceChanged` fire, feeds the reducer (list before active so
    membership is current).
  - `workspaceSwitcher.test.ts` — 9 tests (reducer reset rules + purity; hook
    seed + change-driven re-read with a fake controller).
  - Exported the new symbols from `index.ts`.
**Files:** `packages/openfin/openfin-platform/src/{iabTopics.ts,configOnly.ts,dock.ts,workspace.ts}`,
`packages/react-core/dock-react/src/{types.ts,workspaceSwitcher.ts,workspaceSwitcher.test.ts,index.ts,hooks/useSavedWorkspaces.ts}`.
**Verify:** `npx turbo typecheck build test --filter=@starui/openfin-platform
--filter=@starui/dock-react` → **green (openfin-platform 80; dock-react now 24,
was 15)**. No app changes → no re-propagate (S12 wires the UI + propagates).
**Next:** Phase 3 / **Session 12** — switcher dropdown UI (list + active
checkmark via `isActiveWorkspace`) + switch via `applyWorkspace({ skipPrompt })`;
implement `WorkspaceController` on the app's dock controller (over the
workspace-platform `Storage` API + `setActiveWorkspace`), wire into `<DockBar>`,
re-propagate.
**Blockers:** none. The `WorkspaceController` has no OpenFin implementation yet
(S12) — the data layer is exercised today only through the fake in tests.

### Session 10 — 2026-06-06  *(Phase 2 — Config/editor loop)*
**Scope:** Task 2.2 — positioning polish: save/restore window position to
ConfigService, on-screen validation, show/hide, always-on-top re-assert.
**Closes the Themed-MVP milestone (Sessions 0–10).**
**Consulted first** (per `consult-openfin-docs-first`): installed `@openfin/core`
types — `Window.getBounds()` → `WindowBounds {left,top,width,height,…}`,
`Window.updateOptions({ alwaysOnTop })`, `Window.setAsForeground()`, the
`bounds-changed` window event, and `System.getMonitorInfo()`
(`primaryMonitor` + `nonPrimaryMonitors`, each with `monitorRect`/`availableRect`).
**Architecture decision (deviation from the worklog's `useDockBounds` naming).**
The plan sketched a dock-window React `useDockBounds` hook. I consolidated all
geometry into the **provider** instead, because the dock window is
*provider-created* and the correct ConfigService scope lives in the provider
(the dock window's `db.ts` `currentPlatformScope` defaults to `system/system` —
same reason S9 routes config through the provider). A dock-window hook would
have to round-trip every concern back over the channel for no benefit. The dock
window therefore needs **no** new code this session. (Documented here as a
conscious divergence, like S9's "config over the channel".)
**Done:**
- `db.ts` — `DockWindowBounds` type + `saveDockWindowBounds`/`loadDockWindowBounds`
  (own row: `configId: dock-window-bounds`, `componentType: dock-config`,
  `componentSubType: window-bounds` — distinct from the dock-button config row
  in the Config Browser; scoped like every other db row).
- `dock.ts` (custom path only):
  - `resolveCustomDockBounds()` — restores the saved position if
    `boundsAreOnScreen()` (validates the top-left sits within a currently-
    connected monitor, ±8px slack — guards against an unplugged monitor),
    else falls back to `computeCustomDockBounds()` edge placement.
  - `attachCustomDockGeometryListeners(win)` (wired right after
    `fin.Window.create`) — debounced (400ms) `bounds-changed` →
    `persistCustomDockBounds` (`getBounds` → `saveDockWindowBounds`); plus
    `reassertCustomDockAlwaysOnTop` (`updateOptions({alwaysOnTop:true})`) on the
    bar's `focused`/`shown` events (best-effort; no OpenFin event fires when a
    peer steals top z-order — plan risk #1).
  - `setCustomDockShown(show)` (exported) — show → `show()` + AOT re-assert +
    `setAsForeground()`; hide → `hide()`. No-op for dock2/dock3.
  - Debounce timer cleared in `shutdownDockCustom` + `resetDockState`.
- `workspace.ts` — the **Show/Hide Provider** action (`ACTION_TOGGLE_PROVIDER`)
  now also `setCustomDockShown(visible)` so the custom dock follows the provider
  window's visibility (a real trigger for show/hide; no-op under dock2/dock3).
**Files:** `packages/openfin/openfin-platform/src/{db.ts,dock.ts,workspace.ts}`
(+ re-packed `libs/starui-openfin.tgz`). No app / dock-react changes.
**Verify:** `npx turbo typecheck build test --filter=@starui/openfin-platform
--filter=@starui/dock-react` → **green (80 + 15 tests)**. App
`tsc -p tsconfig.app.json` → zero app-src errors. Re-propagated `openfin` with
the stable-filename integrity-patch dance (see S3).
**Manual OpenFin verify (NOT yet run — needs a human + runtime):** with
`dockVersion: "custom"` — (1) **drag** the bar elsewhere, quit + relaunch → it
reopens where you left it (restore); (2) Tools → **Show/Hide Provider** → the
dock hides/shows with the provider and comes back on top; (3) maximize another
window over the bar, click the bar → it re-asserts to the top.
**Next:** Themed MVP (Phases 0–2) is complete. Phase 3 / **Session 11** — the
workspace switcher data layer (`useSavedWorkspaces`, active-workspace tracking +
the `UNTITLED_WORKSPACE_ID` checkmark-reset, pure reducer unit-tested). Flagged
in the risk list as the biggest single risk.
**Blockers:** none.

### Session 9 — 2026-06-06  *(Phase 2 — Config/editor loop)*
**Scope:** Task 2.1 — feed live config into the custom dock so the **existing
dock editor drives it unchanged**: editor save (`IAB_DOCK_CONFIG_UPDATE`) +
import (`IAB_RELOAD_AFTER_IMPORT`) re-render `<DockBar>`.
**Architecture decision (the load-bearing one).** Config is delivered over the
**S3 channel**, not by the dock window reading the config store itself. Reason:
the dock window is a separate JS realm whose `db.ts` `currentPlatformScope`
defaults to `system/system` (the provider sets `TestApp/dev1`), so a direct
`loadDockConfig()` there would read the wrong scope. The **provider** stays the
single source of config + scope; the dock window pulls/receives via the channel:
- Initial: dock window `client.dispatch(CUSTOM_DOCK_GET_CONFIG)` → provider
  returns its already-scoped `lastEditorConfig`.
- Live: provider `channel.publish(CUSTOM_DOCK_CONFIG_PUSH, lastEditorConfig)`;
  the dock window's client registered a `config-push` handler on connect.
This keeps the dock window free of scope/ConfigManager concerns and reuses the
exact IAB handlers dock2 uses (`subscribeDockIab`) — zero editor changes.
**Done:**
- `iabTopics.ts` — `CUSTOM_DOCK_GET_CONFIG` (`"get-config"`) +
  `CUSTOM_DOCK_CONFIG_PUSH` (`"config-push"`); re-exported via `dock.ts` +
  `configOnly.ts` (`/config`).
- `dock.ts` (custom path only):
  - `registerCustomDockChannel` now also registers `get-config` →
    `lastEditorConfig ?? null`.
  - `pushCustomDockConfig()` — `channel.publish(CUSTOM_DOCK_CONFIG_PUSH, …)`;
    no-op when no dock window is connected.
  - `registerDockCustom` calls `subscribeDockIab(pushCustomDockConfig)` — the
    shared handlers refresh `lastEditorConfig` on save (`saveDockConfig` +
    cache) / import (`loadDockConfig` + cache), then push. (Same handlers +
    cleanup `shutdownDock` already tears down.)
  - `reloadDockFromConfig` custom branch now pushes the reloaded config (was a
    Phase-2 no-op); `applyDockConfig` custom branch stays a no-op (theme-only
    re-renders happen in the dock window via `useDockTheme`).
- Reference app:
  - `OpenFinDockController` — added `getConfig()` (channel `get-config`) +
    `onConfigChanged()` (host-only, not on the `DockController` interface; the
    DockBar takes `config` as a prop). The client registers the `config-push`
    handler on connect.
  - `DockHost` — holds `config` state, seeds via `getConfig()`, live-updates via
    `onConfigChanged`, renders `<DockBar config={config} …>`.
- `@starui/dock-react` unchanged — the `DockController` contract is untouched
  (config flows through the prop + the concrete controller's extra methods).
**Files:** `packages/openfin/openfin-platform/src/{iabTopics.ts,configOnly.ts,dock.ts}`,
`apps/demos/markets-ui-react-reference/src/views/{OpenFinDockController.ts,DockHost.tsx}`
(+ re-packed `libs/starui-openfin.tgz`).
**Verify:** `npx turbo typecheck build test --filter=@starui/openfin-platform
--filter=@starui/dock-react` → **green (80 + 15 tests)**. App
`tsc -p tsconfig.app.json` → zero app-src errors (only pre-existing
`ExpressionEditor` dual-`@types/react` noise). Re-propagated `openfin` (carries
the new constants) with the stable-filename integrity-patch dance (see S3).
**Manual OpenFin verify (NOT yet run — needs a human + runtime):** with
`dockVersion: "custom"`, launch the manifest, open the dock editor (Tools →
*Workspace Setup* or *Dock Editor*), add/rename a launcher button, **Save** →
the custom bar rebuilds live (new button appears) without relaunching. Import a
config bundle → bar rebuilds. Confirms the existing editor drives the custom
dock unchanged.
**Next:** Phase 2 / **Session 10** — positioning polish (`useDockBounds`,
save/restore position to ConfigService, show/hide, always-on-top re-assert).
**Blockers:** none.

### Session 3 — 2026-06-06  *(Phase 0 — Spike & wiring)*
**Scope:** Task 0.3 — provider↔dock cross-window **action-dispatch channel** +
theme IAB; swap `DockHost`'s placeholder for `<DockBar config controller>` from
`@starui/dock-react` wired to a real `DockController`. dock2/dock3 untouched.
**Consulted first** (per `consult-openfin-docs-first`): the OpenFin Channel API
(`fin.InterApplicationBus.Channel.create`/`.connect`, `provider.register`,
`client.dispatch`) via the existing `useOpenFinChannel` wrapper's typed shape;
the theme-IAB pattern from `OpenFinRuntime` (`theme-changed`, `{theme,isDark}`
payload, `{uuid:'*'}` subscribe) and dock3's inline-toggle deadlock note.
**Done:**
- `iabTopics.ts` — added `CHANNEL_CUSTOM_DOCK` (`"starui-custom-dock-actions"`)
  + `CUSTOM_DOCK_DISPATCH_ACTION` (`"dispatch-action"`); re-exported from
  `dock.ts` and the side-effect-free `configOnly.ts` (`/config`) subpath so the
  dock window can import them without dragging in workspace-platform.
- `dock.ts` (custom path only — dock2/dock3 bodies untouched):
  - `registerCustomDockChannel()` — `Channel.create(CHANNEL_CUSTOM_DOCK)` +
    `register("dispatch-action", …)`. Routes `{actionId,customData}` through the
    same `actionDispatcher` (→ `dockActionHandlers`) dock2/dock3 use.
  - `toggleCustomDockTheme()` — intercepts `ACTION_TOGGLE_THEME` provider-side
    (the dock window can't flip the platform scheme): `getSelectedScheme` →
    flip → **fire-and-forget** `setSelectedScheme` (awaiting hangs on
    `__of_workspace_protocol__`, same as dock3) → set provider `data-theme` +
    `starui:theme` → publish `IAB_THEME_CHANGED {theme,isDark}`.
  - Channel opened in `registerDockCustom` **before** the window launch (so the
    client `connect()` resolves immediately); destroyed in `shutdownDockCustom`;
    `customDockChannel` cleared in `resetDockState`.
- Reference app — new `src/views/OpenFinDockController.ts` implementing the
  `@starui/dock-react` `DockController`: lazy channel-client `connect` +
  `dispatch` (retries on failure), `getTheme`/`onThemeChanged` tracking via
  `IAB_THEME_CHANGED` (`{uuid:'*'}`) + a `[data-theme]` MutationObserver,
  `toggleTheme` → dispatch `ACTION_TOGGLE_THEME`. Idempotent `attach()/detach()`
  so the host effect survives StrictMode mount→unmount→mount.
  `DockHost.tsx` now renders `<DockBar config={null} controller={…}>`
  (`config` null until Phase 2 — Tools menu + theme toggle exercise the full
  controller surface today).
- Wired `@starui/dock-react` into the app: it's now a discovered member of the
  `react-core` bucket (`libs/manifest.json` + bundle `exports["./dock-react"]`);
  re-propagated `react-core` **and** `openfin` (the latter carries the new
  channel constants).
**Files:** `packages/openfin/openfin-platform/src/{iabTopics.ts,configOnly.ts,dock.ts}`,
`apps/demos/markets-ui-react-reference/src/views/{OpenFinDockController.ts,DockHost.tsx}`,
`libs/manifest.json` (+ re-packed `libs/starui-{react-core,openfin}.tgz`).
**Verify:** `npx turbo typecheck build test --filter=@starui/openfin-platform
--filter=@starui/dock-react` → **green (openfin-platform 80 tests, dock-react
15 tests)**. App `tsc -p tsconfig.app.json` → zero errors in app source (only
the pre-existing `ExpressionEditor` dual-`@types/react` noise in
`packages/react-grid` remains, unchanged from S2).
**Gotcha (carry forward):** the bucket tarballs use **stable filenames**, so
`npm install` sees "up to date" and does NOT re-extract after a re-pack — the
`apps/package-lock.json` integrity stays pinned to the old content and npm
restores the stale cached blob. Fix applied: patch the bucket's `integrity` in
`apps/package-lock.json` to the new tarball's sha512, `rm -rf` the installed
`apps/node_modules/@starui/<bucket>`, then `npm install --prefix apps`. Needed
for **any** session that re-propagates a bucket the app consumes.
**Manual OpenFin verify (NOT yet run — needs a human + running runtime):** set
`customSettings.dockVersion = "custom"` in
`apps/demos/markets-ui-react-reference/public/platform/manifest.fin.json`,
`npm run dev`, launch the manifest. Expect: the frameless top-edge bar now shows
the **Tools** dropdown + **theme toggle** (real `<DockBar>`, themed shadcn, not
the placeholder). Click a Tools item (e.g. *Developer Tools* / *Reload Dock*) →
the provider window performs it (proves the channel round-trip). Click the theme
toggle → dock + all windows flip dark↔light together (proves the theme IAB).
Revert the manifest edit after verifying.
**Next:** Phase 1 is already complete (S4–S8). Next is **Phase 2 / Session 9** —
subscribe the dock window to `IAB_DOCK_CONFIG_UPDATE` + `IAB_RELOAD_AFTER_IMPORT`
and feed live config by re-rendering `<DockBar config=…>` (load the scoped
`DockEditorConfig` so the user's launcher buttons appear), confirming the
existing dock editor drives the custom dock unchanged.
**Blockers:** none.

### Session 2 — 2026-06-06  *(Phase 0 — Spike & wiring)*
**Scope:** Task 0.2 — `registerDockCustom()` launches a frameless, always-on-top
`/dock` window with monitor-edge placement; the route renders a themed
placeholder ("hello dock"). dock2/dock3 untouched.
**Consulted first** (per `consult-openfin-docs-first`): installed `@openfin/core`
types — `MonitorInfo.primaryMonitor.availableRect` (`{top,left,bottom,right}`,
taskbar-excluded), `fin.Window.create(WindowCreationOptions)` with
`frame`/`alwaysOnTop`/`showTaskbarIcon`/`saveWindowState`/`smallWindow`/
`backgroundThrottling`/`defaultLeft|Top|Width|Height`. Reused the
`openChildToolWindow` manifest-origin resolver pattern (`providerUrl` origin,
not `window.location`).
**Done:**
- `dock.ts` — replaced the S1 no-op stub: `registerDockCustom` now caches
  settings + loads `lastEditorConfig`, then `launchCustomDockWindow()`.
  - `launchCustomDockWindow()` — idempotent (focus existing by name), else
    `fin.Window.create` a frameless, always-on-top, non-taskbar,
    non-saved (`saveWindowState:false`), `smallWindow` bar at `/dock`.
    Deliberately `fin.Window.create` (not `Platform.createWindow`) — the dock
    is chrome, not a snapshot-saved/dockable workspace view.
  - `computeCustomDockBounds()` — top-edge placement spanning
    `primaryMonitor.availableRect` width; 1280@0,0 fallback if monitor info
    unavailable.
  - `resolveProviderOrigin()` — local manifest-`providerUrl`-origin resolver.
  - `shutdownDockCustom()` (close window) wired into `shutdownDock`;
    `applyDockConfig`/`reloadDockFromConfig` got `"custom"` no-op branches
    (live config push is Phase 2); `resetDockState` clears `customDockWindow`.
- Reference app — new `src/views/DockHost.tsx` (themed `--ds-*` placeholder,
  `fixed inset-0` to fill the frameless window past the global `body` padding);
  lazy-imported + routed at `/dock` in `main.tsx` (alongside the other popout
  routes, outside the StarGridShell layout).
**Files:** `packages/openfin/openfin-platform/src/dock.ts`,
`apps/demos/markets-ui-react-reference/src/{main.tsx,views/DockHost.tsx}`
**Verify:** `npx turbo typecheck build test --filter=@starui/openfin-platform`
→ **green, 80 tests pass**. App tsc: zero errors in app source (the residual
`packages/react-grid/.../ExpressionEditor` ref-type errors are pre-existing
dual-`@types/react` noise from running raw `tsc` against `packages/` source —
unrelated to this change; the Vite consumer build dedupes React via aliases).
**Manual OpenFin verify (NOT yet run — needs a human + running runtime):**
in `apps/demos/markets-ui-react-reference/public/platform/manifest.fin.json`,
add `"dockVersion": "custom"` to `customSettings` (temporarily), `npm run dev`
the app, launch the manifest. Expect: a frameless bar pinned to the top screen
edge showing "⭑ Custom Dock — hello dock", correctly themed, flipping with the
OS/workspace theme. Revert the manifest edit after verifying.
**Next:** Session 3 — implement a real `DockController` over a provider↔dock
action-dispatch channel (round-trip one `ACTION_*` through `dockActionHandlers`)
+ theme IAB; swap `DockHost`'s placeholder for `<DockBar config controller>`
from `@starui/dock-react` (and wire that package into the app's
resolution/manifest members at that point). Spike-validate focus/blur + dispatch.
**Blockers:** none. The placeholder deliberately does NOT yet pull in
`@starui/dock-react` (it isn't in the react-core bucket `members` of
`libs/manifest.json` — add it + re-propagate when S3 mounts `<DockBar>`).

### Session 1 — 2026-06-06  *(Phase 0 — Spike & wiring)*
**Scope:** Task 0.1 — make `dockVersion: "custom"` a selectable, typecheck-green
manifest flag with a no-op `registerDockCustom()` stub; dock2/dock3 untouched.
**Done:**
- Widened `CustomSettings.dockVersion` to `"dock2" | "dock3" | "custom"` (+ doc
  note explaining the frameless always-on-top rationale) in `types.ts`.
- Widened the module-level `dockVersion` state var and `registerDock`'s
  `dockVersionArg` param to include `"custom"` in `dock.ts`.
- Added a `"custom"` branch at the top of `registerDock` → `registerDockCustom`,
  mirroring the self-contained `registerDockClassic` branch (dock2/dock3 bodies
  untouched).
- Added the `registerDockCustom()` stub under a new "Custom dock lifecycle"
  section: caches `storedPlatformSettings`/`storedIcon`/theme icons/
  `actionDispatcher` + loads `lastEditorConfig` (so S2's window launch can read
  them), but creates no window / IAB / provider yet — returns `undefined`.
- `workspace.ts` call site needed no change (already passes
  `customSettings?.dockVersion ?? "dock2"`, now within the widened union).
**Files:** `packages/openfin/openfin-platform/src/types.ts`,
`packages/openfin/openfin-platform/src/dock.ts`
**Verify:** `npx turbo typecheck --filter=@starui/openfin-platform` → green;
`npx turbo test --filter=@starui/openfin-platform` → **80 passed (9 files)**.
**Next:** Session 2 — `registerDockCustom()` launches a frameless, always-on-top
`/dock` window with monitor-geometry edge placement, rendering a placeholder
themed route. Consult OpenFin window/monitor APIs first (`fin.Window.create`,
`fin.System.getMonitorInfo`). Manual OpenFin verify required.
**Blockers:** none. `reloadDockFromConfig`/`shutdownDock` still treat non-dock2
as dock3 (harmless for the stub — no provider exists; revisit when S2/S3 give
the custom dock a real teardown path).

### Session 0 — 2026-06-06
**Scope:** Setup — branch + this worklog.
**Done:** Confirmed `feat/custom-dock` is checked out; mapped reuse surfaces
(`dock.ts`, `workspace.ts`, `dockConfigTypes.ts`, `db.ts`, `iabTopics.ts`,
`openChildToolWindow.ts`); authored this session-by-session worklog.
**Files:** `docs/superpowers/worklogs/2026-06-06-custom-dock.md`
**Verify:** n/a (docs only).
**Next:** Session 1 — add `dockVersion: "custom"` to `CustomSettings`, branch in
`registerDock`, add a no-op `registerDockCustom()` stub; `npx turbo typecheck
--filter=@starui/openfin-platform` green.
**Blockers:** none.

### Sessions 4–8 — 2026-06-06  *(Phase 1 — Core dock UI, done in one pass)*
**Scope:** Build the entire custom-dock React surface as a self-contained,
OpenFin-free package so it's verifiable now (no running runtime needed).

**Architecture decision (the load-bearing one).** Per the repo's import-boundary
rule (UI packages must not import `@openfin/*`), every OpenFin side-effect sits
behind an injected **`DockController`** interface
(`dispatchAction` / `getTheme` / `toggleTheme` / `onThemeChanged`). The bar is a
pure React tree; Phase 0 (the `/dock` window host) implements `DockController`
over the real IAB/channel + theme plumbing. This turned S7's "wire to dispatch
channel" and S8's "data-theme/IAB" into "wire to the controller seam" — the
runtime binding is now a Phase 0 task, and the UI is fully unit-tested today.

**Done:**
- New package **`@starui/dock-react`** (`packages/react-core/dock-react/`),
  sibling to `workspace-setup-react`, consumed-as-source (`main: src/index.ts`).
- **S4** — `dockConfigToViewModel()` + `resolveDockIcon()`: pure mapping of
  `DockEditorConfig` → render model with theme-aware `{dark,light}` icon URLs
  (reuses `iconIdToSvgUrl`/`iconIdToThemedUrls`). 9 unit tests.
- **S5** — `DockBar` shell + `DockLauncherButton` + `DockDropdownButton`
  (arbitrary nesting via `DropdownMenuSub`), design-system `--ds-*` tokens,
  ghost/icon shadcn buttons, tooltips.
- **S6** — `DockToolsMenu` + `SYSTEM_TOOLS` (the 9 actions, lucide icons,
  shadcn `DropdownMenu` — the theming win over dock2's always-dark flyout).
- **S7** — all clicks route through `DockController.dispatchAction`.
- **S8** — `DockThemeToggle` + `useDockTheme` hook (sun-while-dark / moon-while-
  light, re-renders on external theme broadcasts via `onThemeChanged`).
- Added 3 missing action ids (`ACTION_OPEN_WORKSPACE_SETUP`,
  `ACTION_OPEN_DATA_PROVIDERS`, `ACTION_INSPECT_SHARED_WORKER`) to the
  side-effect-free `openfin-platform/config` (`configOnly.ts`) subpath.

**Files:** `packages/react-core/dock-react/{package.json,tsconfig.json,vitest.config.ts}`,
`src/{index,types,dockViewModel,systemTools,test-setup}.ts`,
`src/dockViewModel.test.ts`, `src/hooks/useDockTheme.ts`,
`src/components/{DockBar,DockLauncherButton,DockDropdownButton,DockToolsMenu,DockThemeToggle,DockIcon}.tsx`,
`src/components/DockBar.test.tsx`; edited `packages/openfin/openfin-platform/src/configOnly.ts`.

**Verify:** `npx turbo typecheck --filter=@starui/dock-react` → green;
`npx turbo test --filter=@starui/dock-react` → **15 passed (2 files)**.
Not yet wired into the app or an OpenFin window (that's Phase 0).

**Next:** Phase 0 — Session 1 (`dockVersion: "custom"` type + `registerDockCustom()`
stub), then S2 (launch the frameless `/dock` window rendering `<DockBar>`), then
S3 (implement a real `DockController` over the provider↔dock channel + theme IAB,
replacing the injected seam). Phase 2/S9 then feeds live config updates by
re-rendering `<DockBar config=…>`.
**Blockers:** none. Phase 1 has no runtime verification until the Phase 0 window
exists — by design (the `DockController` seam makes the UI testable in isolation).
