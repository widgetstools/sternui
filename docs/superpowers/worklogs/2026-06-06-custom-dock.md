# Worklog — Custom OpenFin Dock

**Branch:** `feat/custom-dock`
**Plan (external):** `C:\Users\develop\.claude\plans\how-much-effort-is-starry-snowflake.md`
**Memory:** `custom-dock-plan` (auto-memory index)

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
| 1 | 0 | `dockVersion: "custom"` type + thread through `workspace.ts`/`dock.ts` with a no-op `registerDockCustom()` stub; typecheck green | pending | |
| 2 | 0 | `registerDockCustom()` launches a frameless, always-on-top `/dock` window; monitor-geometry edge placement; placeholder React route renders a themed "hello dock". Manual OpenFin verify | pending | |
| 3 | 0 | Cross-window **action dispatch channel** — provider registers a channel/IAB endpoint over `dockActionHandlers`; dock window round-trips one `ACTION_*`. Spike-validate focus/blur + dispatch | pending | |
| **Phase 1 — Core dock UI** *(complete — `@starui/dock-react`, 15 tests green)* |||||
| 4 | 1 | UI home = **`@starui/dock-react`** (scaffolded); **pure** `dockConfigToViewModel()` + `resolveDockIcon()` mapping; unit tests | **done** | 2026-06-06 |
| 5 | 1 | `DockBar` shell — renders launcher buttons + dropdowns from the view model, design-system tokens, dark+light | **done** | 2026-06-06 |
| 6 | 1 | **Tools dropdown** — theme-compliant shadcn `DropdownMenu`, 9 system tools (lucide icons; parity with `buildClassicSystemTools`) | **done** | 2026-06-06 |
| 7 | 1 | Click wiring → `DockController.dispatchAction` (the injected seam; real OpenFin channel binds in Phase 0/S3) | **done** | 2026-06-06 |
| 8 | 1 | **Theme toggle** + `useDockTheme` hook via `DockController.toggleTheme`/`onThemeChanged` (real `data-theme`/IAB lives behind the controller, bound in Phase 0) | **done** | 2026-06-06 |
| **Phase 2 — Config/editor loop** |||||
| 9 | 2 | Dock window subscribes to `IAB_DOCK_CONFIG_UPDATE` + `IAB_RELOAD_AFTER_IMPORT`; live-rebuild bar. Confirm the **existing dock editor drives the custom dock unchanged** | pending | |
| 10 | 2 | Positioning polish — `useDockBounds` (monitor info → edge placement), save/restore position to ConfigService, show/hide, always-on-top re-assert | pending | |
| **Phase 3 — Workspace switcher** |||||
| 11 | 3 | Data layer — `useSavedWorkspaces` (list), active-workspace tracking + the `UNTITLED_WORKSPACE_ID` checkmark-reset semantics. Pure reducer unit-tested | pending | |
| 12 | 3 | Switcher dropdown UI — list + switch via `applyWorkspace({ skipPrompt })`; active checkmark | pending | |
| 13 | 3 | Save-As (`getCurrentWorkspace` + `createSavedWorkspace`) + Restore-last-saved (`restoreLastSavedWorkspace`) | pending | |
| **Phase 4 — Notifications + Home/Store** |||||
| 14 | 4 | Notifications button — unread badge (`getNotificationsCount` + `NotificationsCountChanged`) + `toggleNotificationCenter()` | pending | |
| 15 | 4 | Home (`Home.show()`) + Store (Storefront) buttons | pending | |
| **Phase 5 — App-switcher (new requirement)** |||||
| 16 | 5 | Running-app **reducer** (pure, unit-tested) + `fin.System` event wiring (`application-started` / `window-created` / `*-closed`) | pending | |
| 17 | 5 | App-switcher dropdown UI + per-app **scoped config swap** (`setPlatformDefaultScope` + reload bar from that scope's `DockEditorConfig`) | pending | |
| **Phase 6 — Integration & hardening** |||||
| 18 | 6 | Theme-parity sweep (both schemes, every dropdown/icon) + multi-window/monitor edge cases + always-on-top under maximized windows | pending | |
| 19 | 6 | Tests (view-model, scope resolution, running-app reducer), `docs/current-features.md` update, final `turbo typecheck build test` | pending | |

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
