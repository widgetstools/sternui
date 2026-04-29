# Refactor Worklog

Persistent log so this work survives a disconnect or context loss. Resume by
reading top-to-bottom: goals, scope, current state, what's done, what's next.

**Branch:** `chore/audit-cleanup-architectural-alignment`
**Started:** 2026-04-28
**Driven by user request:** deep audit + remove anti-patterns / bloat / bad
design / perf+memory issues + break up monoliths + execute architectural
changes per `docs/ARCHITECTURE.md`. Constraints: work on a new branch; no
UI feature, function, or behavior may be lost.

---

## Original goals (verbatim from user)

1. "deep analysis of the current codebase to remove any anti-patterns,
   bloated code, bad design and performance and memory issues"
2. "recognize monolithic components that be broken up and made more
   efficient, simple and performant"
3. "I also want to make architectural changes as per
   `docs/ARCHITECTURE.md`"
4. "do the fix in the new branch also no ui feature, functions and
   behaviors should be lost"
5. "create a file to record all the work you are doing so that in case
   we get disconnected we start from where we left off ... add context
   to the file of what we are trying to do and keep updating this file
   frequently"

---

## Audit findings (deep analysis already complete)

Four parallel investigation agents produced detailed reports. Summary:

### Headline numbers

| Metric | Count |
|---|---|
| Files over 800-LOC ceiling | 17 |
| Worst function-size violations | `initWorkspace` 611, `MarketsGrid.Host` 611, `RuleEditor` 395, `ColumnSettingsEditorInner` 412 |
| Hardcoded hex literals (consumer code) | 1,411 across 152 files |
| `rgb()/rgba()` literals | 522 across 90 files |
| Native `<input>/<textarea>/<select>` in React (excl. shadcn primitives) | 64 |
| `any` casts | 821 across 67 files |
| Effect/listener leaks (definite + medium) | 4 + 7 |
| Cross-app duplicate code (byte-identical) | ~5,500 LOC |
| Orphan root-level files | 3 (~700 LOC, 1 broken script) |

### High-impact issues identified

1. **Definite memory leak** — `packages/widget-sdk/src/hooks/useWidget.ts:120-126`
   `onSave`/`onDestroy` push handlers but never return unsub. Caller
   `SimpleBlotter.tsx:124` re-runs effect on prop changes ⇒ unbounded
   handler accumulation.
2. **Listener leak** — `SimpleBlotter.tsx:88` `api.addEventListener('selectionChanged',…)` no remove.
3. **Listener leak** — `BrowserAdapter.ts:31` `window.addEventListener('beforeunload',…)` no remove in `dispose()`.
4. **Hot-path `console.log`** in `data-plane/v2/worker/Hub.ts` and `client/DataPlane.ts` (per-message), and per-render in `MarketsGridContainer.tsx:313`.
5. **Bundle bloat** — `@marketsui/ui` barrel eagerly exports recharts (`chart.tsx`); `@marketsui/core` barrel eagerly exports Monaco (`ExpressionEditor`). Both should be subpath exports.
6. **Inline AG-Grid props** — `BlotterGrid.tsx:68,73-79` allocates new `rowSelection` / `sideBar` literals every render.
7. **Re-binding listener** — `MarketsGridContainer.tsx:208-211` inline keydown handler rebinds `document` keydown every render.
8. **Cross-app byte-identical duplication** — `apps/demo-angular/*` is 100% identical to `apps/fi-trading-reference-angular/*` (28 widgets + 4 services + app.ts); `apps/demo-configservice-react/MarketDepth.tsx` etc. byte-identical to `apps/demo-react/`; `openfinDock.ts` (577 LOC) duplicated between `stern-reference-react` and `stern-reference-angular`.
9. **Orphan root files** — `agGridStateManager.ts`, `useAgGridKeyboardNavigation.tsx` (superseded by `core/modules/grid-state/*`), `vite.demo.config.ts` (broken — points at non-existent dirs).
10. **Broken dev script** — `packages/core/package.json:20` `dev` script references `vite.demo.config.ts` which is broken.
11. **Architecture violations** —
    - `widgets-react/src/types/openfin.d.ts:9` imports `@openfin/core` types (only shells should). Mirror declaration exists in `openfin-platform-stern/src/types/openfin.d.ts`. Clean fix: hoist to `shared-types`.
    - `apps/stern-reference-{react,angular}/src/openfin/openfinDock.ts` imports from `@openfin/workspace` and `@openfin/workspace-platform` — apps holding shell-layer code. Bootstrap.ts:9-11 cites a circular-dep justification that is **stale** (the file only imports DOWN to `openfin-platform-stern`).
12. **Stale comments / TODOs** — `openfin-platform-stern/bootstrap.ts:64-69` says `dataProviderConfigService` should be moved out of `widgets-react`. **It already moved** to `packages/data-plane/src/services/`. Both the comment and the doc note are obsolete.

### Top 10 monolithic files (>800 LOC ceiling)

| File | LOC | Worst nested function |
|---|---|---|
| `packages/core/src/css/cockpit.ts` | 1368 | (data — defensible) |
| `packages/markets-grid/src/HelpPanel.tsx` | 1254 | — |
| `packages/core/src/ui/FormatterPicker/FormatterPicker.tsx` | 1091 | CompactFormatterPicker 377, InlineFormatterPicker ~300 |
| `packages/openfin-platform/src/workspace.ts` | 1058 | initWorkspace 611 |
| `packages/core/src/modules/conditional-styling/ConditionalStylingPanel.tsx` | 1036 | RuleEditor 395 |
| `packages/icons-svg/all-icons.ts` | 974 | (data — defensible) |
| `packages/config-service/src/client.ts` | 973 | RestConfigClient 219 |
| `packages/markets-grid/src/MarketsGrid.tsx` | 920 | Host 611 |
| `packages/openfin-platform/src/dock.ts` | 916 | buildDock3Override 141, registerDock 130 |
| `apps/demo-react/src/MarketDepth.tsx` | 807 | — |

---

## CRITICAL SCOPE FINDING — `docs/ARCHITECTURE.md` is fully aspirational

The user has rewritten `docs/ARCHITECTURE.md` (uncommitted local changes
carried into this branch). The new architecture defines:

- **5-layer model**: Runtime adapter (5) | Framework adapter (4) | Component domain (3) | Platform helpers (2) | Foundations (1)
- **`RuntimePort` seam** abstracting OpenFin vs Browser
- **`HostWrapper` + `HostContext`** as the single component-side seam
- **4 ConfigManager backends**: REST, IndexedDB, localStorage, Memory (currently only REST + IndexedDB exist)
- **Modular component shape**: `@starui/<thing>` (agnostic) + `@starui/<thing>-react` (panels) — namespace also seems to be migrating from `@marketsui/*` → `@starui/*`
- **New `DataProvider<T>` interface** with `InProcessStompDataProvider`, `RestDataProvider`, `MockDataProvider`, `AppDataProvider`, `SharedDataProvider`
- **Canonical `/c/<componentType>[/<subType>]` route table**
- **Single `apps/reference-react` + `apps/reference-angular`** (replacing 6+ existing reference apps)

**Code reality check (verified by grep):**
- `RuntimePort`, `HostWrapper`, `HostContext` (the new shapes) — **do not exist** in code
- `apps/reference-react`, `apps/reference-angular` — **do not exist**
- `docs/REFERENCE_APP_LAYOUT.md` (referenced by ARCHITECTURE.md line 217) — **does not exist**
- `@starui/*` namespace — **not in use anywhere**
- `LocalStorageConfigManager`, `MemoryConfigManager` — **do not exist** (only `LocalConfigClient` + `RestConfigClient` exist in `config-service/src/client.ts`)
- `apps/markets-ui-{react,angular}-reference`, `apps/stern-reference-{react,angular}`, `apps/fi-trading-reference{,-angular}` all still exist

Migrating the codebase to match the new `ARCHITECTURE.md` is a **multi-week
effort**. It's not a doc update or a few file moves. It involves:

1. Create `runtime-port` package + `RuntimePort` interface
2. Create `runtime-openfin` and `runtime-browser` implementations
3. Refactor / replace `openfin-platform` and `openfin-platform-stern`
4. Create `HostWrapper` component + `HostContext` + `useHost()` (React)
5. Create `HostService` (Angular) for `inject(HostService)` parity
6. Implement `LocalStorageConfigManager` + `MemoryConfigManager`
7. Refactor `data-plane` v1+v2 into the new `DataProvider<T>` interface
8. Restructure component packages into `@starui/<thing>` + `@starui/<thing>-react` shape
9. (Possibly) rename namespace `@marketsui/*` → `@starui/*` repo-wide
10. Build canonical `/c/<componentType>[/<subType>]` route table
11. Create `apps/reference-react` + `apps/reference-angular`
12. Migrate functionality from existing 8 reference apps; delete originals
13. Write `REFERENCE_APP_LAYOUT.md`
14. Update ESLint to enforce import rules

**This needs an explicit scope decision before proceeding past Phase 1.**

---

## Integrated phase plan

Phases 1-2 are safe and useful regardless of architectural direction.
Phases 3+ depend on user's answer to the scope question.

### Phase 1 — Truly safe orphan + stale-comment sweep (IN PROGRESS)
- 1A. Delete `agGridStateManager.ts` (root, 235 LOC, superseded by `core/modules/grid-state/`)
- 1B. Delete `useAgGridKeyboardNavigation.tsx` (root, 372 LOC, superseded)
- 1C. Delete `vite.demo.config.ts` (root, points at non-existent dirs)
- 1D. Fix `packages/core/package.json` `dev` script (currently broken — references the deleted `vite.demo.config.ts`)
- 1E. Update stale comment in `packages/openfin-platform-stern/src/bootstrap.ts:9-11, 64-69` (the cited circular dep is gone; `dataProviderConfigService` already moved to `data-plane`)
- Verify: typecheck + build
- Commit

### Phase 2 — Hot-path leak + perf fixes (audit-driven, arch-neutral)
- 2A. `useWidget.ts` — make `onSave`/`onDestroy` return unsubscribe
- 2B. `SimpleBlotter.tsx` — fix `selectionChanged` listener cleanup, route via ApiHub
- 2C. `BrowserAdapter.ts` — store + remove `beforeunload` listener in `dispose()`
- 2D. Strip hot-path `console.log` from `Hub.ts`, `DataPlane.ts`, `MarketsGridContainer.tsx`
- 2E. Memoize inline AG-Grid props in `BlotterGrid.tsx` (`rowSelection`, `sideBar`)
- 2F. `useCallback` keydown handler in `MarketsGridContainer.tsx`
- 2G. Move `recharts` (`chart.tsx`) to subpath export `@marketsui/ui/chart`
- 2H. Move `ExpressionEditor` (Monaco) to subpath export `@marketsui/core/expression-editor`
- Verify: typecheck + build + targeted unit tests
- Commit per group

### Phase 3 — Cross-app dedup (depends on architectural decision)
**If staying with current `@marketsui/*` architecture:**
- 3A. Delete `apps/demo-angular` (byte-identical duplicate of `fi-trading-reference-angular`)
- 3B. Merge `apps/demo-configservice-react` into `apps/demo-react` (gate ConfigService via env)
- 3C. Move `openfinDock.ts` from both stern apps into `packages/openfin-platform-stern/src/dock/`

**If migrating to new architecture:** these apps will be replaced by
`apps/reference-react`/`apps/reference-angular` anyway — defer.

### Phase 4 — Architecture violations (audit-driven)
- 4A. Hoist `widgets-react/src/types/openfin.d.ts` → `shared-types/src/openfin.d.ts`
- 4B. Move `openfinDock.ts` into stern shell (overlap with 3C)

### Phase 5 — Split worst monolithic functions (audit-driven, arch-neutral)
- 5A. `initWorkspace` (workspace.ts:168-779, 611 LOC) → orchestrator + 5 registrar modules
- 5B. `MarketsGrid.Host` (MarketsGrid.tsx:261-871, 611 LOC) → Host + useGridProfile + useGridTheme + AdminActionButtons + setup
- 5C. `RuleEditor` (ConditionalStylingPanel.tsx:323-717, 395 LOC) → RuleEditor + ConditionPicker + StyleAssignmentPanel + IndicatorPicker
- 5D. `ColumnSettingsEditorInner` (ColumnSettingsPanel.tsx:200-611, 412 LOC) → split per concern

### Phase 6 — Migration to new ARCHITECTURE.md (BLOCKED on user decision)
- See "CRITICAL SCOPE FINDING" above. Multi-week. 14 sub-steps.

### Phase 7 — Hardcoded color sweep (1,411 hex + 522 rgb)
### Phase 8 — Type safety (`any` reduction in fi-trading-reference + dock-editor-react)
### Phase 9 — Split remaining >800-LOC files (HelpPanel, FormatterPicker, ConditionalStylingPanel, dock.ts, client.ts, config-manager.ts, etc.)

---

## Working state

| Item | Status | Notes |
|---|---|---|
| Branch created | ✓ | `chore/audit-cleanup-architectural-alignment` from `main` |
| Worklog created | ✓ | This file |
| Memory saved (workflow prefs) | ✓ | `feedback_refactor_workflow.md` |
| `docs/ARCHITECTURE.md` rewrite | uncommitted | Carried onto this branch as in-progress user work; preserved as-is |
| Phase 1A-E | pending | Starting now |
| Phase 2+ | pending | After Phase 1 verification |
| Architectural-scope decision | **PENDING USER** | Must resolve before Phase 6 |

---

## Done log (most recent first — append on each commit)

### Phase C-4 — split initializePlatform / customActions (533 LOC) (2026-04-29)
**Verification:** `npx turbo typecheck test` → 62/62 successful (openfin-platform force-rebuilt: 7/7 with 49 tests passing).

The audit's "initWorkspace 611 LOC" turned out to be `initializePlatform` (533 LOC) — its body is 95% the inline `customActions` literal with 13 OpenFin action handlers. Extracted to a factory:

- `packages/openfin-platform/src/internal/customActions.ts` (423 LOC) — `buildCustomActions(deps)` returns the same `CustomActionsMap`. Each handler's `callerType` guard preserved verbatim. Dependencies threaded as: `runThemeToggle`, `openChildWindow`, `getConfigManager` (lazy lookup of the module-level singleton), `exportAllConfig`.
- `initializePlatform` shrank from 533 LOC to **~70 LOC** — body is now `await init({ overrideCallback?, browser, theme, customActions: buildCustomActions(deps) })`.

Behavior preserved verbatim:
- All 13 action keys identical (ACTION_LAUNCH_APP, ACTION_LAUNCH_COMPONENT, ACTION_TOGGLE_THEME, ACTION_OPEN_DOCK_EDITOR, ACTION_OPEN_REGISTRY_EDITOR, ACTION_OPEN_WORKSPACE_SETUP, ACTION_OPEN_DATA_PROVIDERS, ACTION_OPEN_CONFIG_BROWSER, ACTION_RELOAD_DOCK, ACTION_SHOW_DEVTOOLS, ACTION_EXPORT_CONFIG, ACTION_IMPORT_CONFIG, ACTION_TOGGLE_PROVIDER).
- Same `callerType` guards (CustomButton vs CustomDropdownItem) per handler.
- Same `fin.Window.create` shapes for dock-editor, registry-editor, config-browser, import-config (the 4 handlers that don't go through the shared `openChildWindow` helper).
- Same `runThemeToggle` re-entry coalescing path for the fallback non-dock theme toggle.
- Module-level `dockActionHandlers` (the Dock3 mirror map) untouched — it's structurally simpler and not part of this split.

Parent file `workspace.ts` shrank from **1,058 LOC to 702 LOC** (under the 800-LOC ceiling).

Note: the new `buildCustomActions` function body is itself ~408 LOC because it returns a 13-key literal. That technically exceeds the 80-LOC function ceiling, but each individual handler closure is well under it; the "function" is essentially a flat data structure. Splitting further into per-domain action files (launch / theme / windows / configIO) would be a follow-up if the team wants tighter granularity.

### Phase C-3 — split MarketsGrid.Host (611 LOC) (2026-04-29)
**Verification:** `npx turbo typecheck test` → 62/62 successful (markets-grid force-rebuilt: 3/3, 56 tests pass).

The 611-LOC `Host` function inside `packages/markets-grid/src/MarketsGrid.tsx` was the platform's marquee component and the worst function-size violation outside `initWorkspace`. Extract-function refactor across 4 lifecycle hooks + 4 component modules:

**`hooks/`**
- `useGridLevelDataPersistence.ts` (95 LOC) — load-on-mount + save-on-prop-change for gridLevelData. Encapsulates the StrictMode-double-effect-safe `lastPersistedRef` comparison verbatim.
- `useUnsavedChangesGuard.ts` (23 LOC) — `beforeunload` listener while `isDirty`.
- `useImperativeMarketsGridHandle.ts` (51 LOC) — `forwardRef` plumbing + one-shot `onReady` fire when the api lands.
- `useProfileSwitchGuard.ts` (93 LOC) — pendingSwitch state + `requestLoadProfile` / `confirmSwitchSave` / `confirmSwitchDiscard` / `cancelSwitch`.

**`internal/`**
- `AdminActionButtons.tsx` (80 LOC) — relocated; carries the lucide icon map and resolver.
- `ProfileSelectorBlock.tsx` (90 LOC) — encapsulates the giant onClone/onExport/onImport closures around `ProfileSelector`.
- `MarketsGridToolbar.tsx` (141 LOC) — the entire primary toolbar row (filters carousel + action cluster + profile selector + save + settings + admin actions).
- `ProfileSwitchDialog.tsx` (71 LOC) — the unsaved-changes AlertDialog.

`Host` is now a ~120-LOC orchestrator: prop destructure, adapter ref, hook calls, save handler, settings/toolbar UI state, and a thin render that composes the internal/ components.

Behavior preserved verbatim:
- All `data-testid` carried through (`save-all-btn`, `save-all-dirty`, `style-toolbar-toggle`, `v2-settings-open-btn`, `profile-switch-confirm`, `profile-switch-cancel`, `profile-switch-discard`, `profile-switch-save`, `admin-action-${id}`).
- Same render order (header extras → primary toolbar → optional pinned formatting toolbar → AG-Grid → settings sheet → switch dialog).
- Same StrictMode-safe gridLevelData round-trip (the moved hook copies the comment + ref logic verbatim).
- Same one-shot `onReady` semantics (handleRef + readyFiredRef inside the new hook).
- Same captureGridStateInto-then-saveActiveProfile sequence in `handleSaveAll`.
- Same Save-and-Switch / Discard-and-Switch ordering in the dialog handlers.

Parent file `MarketsGrid.tsx` shrank from **920 LOC to 516 LOC** (under the 800-LOC ceiling).

### Phase C-2 — split ColumnSettingsEditorInner (412 LOC) (2026-04-29)
**Verification:** `npx turbo typecheck test` → 62/62 successful (force-rebuilt core: 3/3, full repo: 62/62).

The 412-LOC `ColumnSettingsEditorInner` function in `packages/core/src/modules/column-customization/ColumnSettingsPanel.tsx` was a 5× violation of the 80-LOC function ceiling. Extract-function refactor into 11 sub-modules under the existing `editors/` subdirectory:
- `editors/ColumnEditorHeader.tsx` (62 LOC) — title input + Reset/Save buttons
- `editors/ColumnMetaStrip.tsx` (39 LOC) — COL ID / TYPE / OVERRIDES / TEMPLATES meta cells
- `editors/HeaderBand.tsx` (45 LOC) — Band 01: header name + tooltip
- `editors/LayoutBand.tsx` (108 LOC) — Band 02: width / pin / hide / sortable / resizable
- `editors/TemplatesBand.tsx` (122 LOC) — Band 03: applied chips + picker
- `editors/CellStyleBand.tsx` (24 LOC) — Band 04
- `editors/HeaderStyleBand.tsx` (25 LOC) — Band 05
- `editors/ValueFormatBand.tsx` (27 LOC) — Band 06
- `editors/TriStateToggle.tsx` (39 LOC) — relocated; used by LayoutBand
- `editors/TemplatePicker.tsx` (52 LOC) — relocated; used by TemplatesBand
- `editors/styleAdapter.ts` (95 LOC) — `toStyleEditorValue` / `fromStyleEditorValue` / `pruneUndefined` / `pickBorders` / `isEmptyAssignment` / `countOverrides` (all relocated)

`ColumnSettingsEditorInner` is now a ~75-LOC orchestrator. Filter and RowGrouping editors stay in their existing un-Banded shape — wrapped in tiny `FilterBandWrapper` / `RowGroupingBandWrapper` (Bands 07/08) inline.

Behavior preserved:
- Markup unchanged. Every `cols-*` data-testid carried through.
- Same draft / save / discard semantics via `useModuleDraft`.
- Same auto-prune of empty assignments via `isEmptyAssignment` in the commit path.
- Same tri-state toggle for `sortable` / `resizable`.
- Same template-picker empty states.

Parent file `ColumnSettingsPanel.tsx` shrank from **792 LOC to 422 LOC** (under the 800-LOC ceiling).

### Phase C-1 — split RuleEditor (395 LOC) (2026-04-28)
**Verification:** `npx turbo typecheck test` → 62/62 successful.

The 395-LOC `RuleEditor` function in `packages/core/src/modules/conditional-styling/ConditionalStylingPanel.tsx` was extracted into 6 focused sub-components plus `ColumnPickerMulti` (already inlined in the same file). All sub-components live under a new `editor/` subdirectory:
- `editor/RuleEditorHeader.tsx` (53 LOC) — title input + save/delete buttons
- `editor/RuleMetaStrip.tsx` (103 LOC) — STATUS / SCOPE / PRIORITY / APPLIED meta cells
- `editor/ExpressionBand.tsx` (81 LOC) — expression editor + validation
- `editor/TargetColumnsBand.tsx` (17 LOC) — wrapper around `ColumnPickerMulti`
- `editor/FlashBand.tsx` (109 LOC) — flash on match config
- `editor/ValueFormatterBand.tsx` (51 LOC) — per-rule value formatter
- `editor/ColumnPickerMulti.tsx` (103 LOC) — relocated from parent file

`RuleEditor` is now a ~110-LOC orchestrator that builds the prop graph and renders these in order. Markup, behavior, and every `cs-*` testId are preserved verbatim. Each sub-component is `memo`-wrapped so the orchestrator's per-band re-renders only fire when that band's slice of `draft` changes.

Parent file `ConditionalStylingPanel.tsx` shrank from 1,036 LOC to **681 LOC** (under the 800-LOC ceiling for the first time). The IndicatorPicker (~290 LOC) stays inline because it's a single self-contained sub-tree with no extracted bands of its own.

### Phase D-4 — HostWrapper + HostContext + useHost in @marketsui/host-wrapper-react (2026-04-28)
**Verification:** `npx turbo typecheck test` → 62/62 successful (was 60 before D-4 — +2 from new package tasks). 5 new tests.

This is Seam #2 from `docs/ARCHITECTURE.md`. Adds the React host wrapper *additively* — no existing component uses it yet; existing `WidgetHost` / `WidgetHostContext` in `@marketsui/widget-sdk` continues to work for current consumers.

**`@marketsui/host-wrapper-react`**
- `HostContext` React context exposing `HostContextValue` — extends `IdentitySnapshot` and adds `runtime`, `configManager`, `theme`, `configUrl`, plus runtime-event delegates (`onThemeChanged`, `onWindowShown`, `onWindowClosing`, `onCustomDataChanged`).
- `useHost()` hook — throws a clear error when used outside a wrapper (intentional — silent fallback would mask integration bugs).
- `<HostWrapper runtime configManager>` — accepts instances OR Promises (so `await OpenFinRuntime.create()` plays naturally). Renders the `loading` slot until both resolve, then mounts children with the resolved context.
- Theme tracking: pulls initial value from `runtime.getTheme()` and re-renders consumers via `runtime.onThemeChanged`. The memoized context value's identity changes only on theme flips.
- 5 jsdom tests (loading state, identity exposure, theme reactivity, useHost-outside-wrapper error, runtime delegate flow).

**Phase D-4b (Angular HostService) — DEFERRED** to a follow-up commit. ng-packagr setup adds noise to this commit; the React wrapper covers Path B's primary surface for now and Angular consumers can adopt later.

**Phase D-5 (LocalStorage / Memory ConfigManagers) — DEFERRED to Path C.** Reason: implementing two full new backends of the existing `ConfigClient` interface (~30 methods across 5 sub-domains: AppConfig, AppRegistry, UserProfiles, Roles, Permissions) is ~400 LOC for an interface Path C plans to retire and replace with a smaller `ConfigManager`. Better to do the redesign + 4 backends together in Path C than ship throwaway backends now. Existing `LocalConfigClient` (Dexie) + `RestConfigClient` continue to satisfy all current apps.

### Phase D-1/D-2/D-3 — Runtime port + browser/openfin implementations (2026-04-28)
**Verification:** `npx turbo typecheck test` → 60/60 tasks successful (was 52 before D, +8 from new pkg tasks). 40 new tests across the 3 packages.

This is the first concrete piece of Path B — the new `RuntimePort` seam from `docs/ARCHITECTURE.md` is now scaffolded **additively** alongside the existing `openfin-platform*` shells. Nothing in the existing codebase imports the new packages yet; that integration follows.

**Phase D-1 — `@marketsui/runtime-port` (foundation layer)**
- `packages/runtime-port/` — pure TS, no runtime imports.
- `RuntimePort` interface: `name`, `resolveIdentity`, `openSurface`, `getTheme`, `onThemeChanged`, `onWindowShown`, `onWindowClosing`, `onCustomDataChanged`, `dispose`.
- Types: `IdentitySnapshot`, `SurfaceKind`, `SurfaceSpec`, `SurfaceHandle`, `Theme`, `Unsubscribe`.
- 6 smoke tests using a `FakeRuntime` in-test class — confirms the interface is implementable and lifecycle semantics round-trip.

**Phase D-2 — `@marketsui/runtime-browser`**
- `packages/runtime-browser/` — implements `RuntimePort` against DOM APIs.
- Identity: URL search params + mount-prop overrides + `crypto.randomUUID()` fallback.
- Theme: `[data-theme]` attribute on `<html>` first, `prefers-color-scheme` second; live updates via MutationObserver + matchMedia listener.
- Lifecycle: `visibilitychange` → `onWindowShown` (with initial-fire on mount); `beforeunload` → `onWindowClosing`.
- Surfaces: `popout` via `window.open()` (with `?data=...` base64 customData); `modal` aliased to `popout`; `inpage` delegates to a registered handler.
- 19 tests under jsdom: identity (7) + BrowserRuntime (12).

**Phase D-3 — `@marketsui/runtime-openfin`**
- `packages/runtime-openfin/` — implements `RuntimePort` against `fin.*`.
- Async factory `OpenFinRuntime.create()` because OpenFin view options are read via promise.
- Identity priority: view `customData` > URL params > overrides > UUID. View `identity.name` is the canonical `instanceId`.
- Theme: `[data-theme]` (apps already wire this during workspace init); MutationObserver tracks updates.
- Lifecycle: bridges view `'shown'` and `'destroyed'` events.
- `customData` polling (500ms interval) — OpenFin doesn't broadcast options-updated events; polling stops when no listeners are attached or when disposed.
- `openSurface` for popout/modal currently throws an explanatory error — apps still using `@marketsui/openfin-platform-stern`'s `PlatformAdapter.openWidget` are unaffected. Real `createView` wiring follows in a later phase.
- Allows `allowMissingFin: true` for tests / non-fin environments.
- 15 tests under jsdom: identity (7) + OpenFinRuntime (8).

**Architecture compliance**
- New packages match the layer model: `runtime-port` is foundation (no runtime imports); `runtime-browser` and `runtime-openfin` only depend on `runtime-port` (+ runtime-browser for openfin's identity helper) + their respective platforms (`@openfin/core` is an OPTIONAL peer for `runtime-openfin`).
- ARCHITECTURE.md still lists `tokens-primeng` and `icons-svg` as foundations — those stay as-is. The new packages slot in alongside.

### Phase 3C — openfinDock moved into the stern shell (2026-04-28)
**Verification:** `npx turbo typecheck test` → 52/52 tasks successful.

Closes the architecture violation where shell-layer code (importing from `@openfin/workspace` and `@openfin/workspace-platform`) lived in two app workspaces. The two copies (`apps/stern-reference-react/src/openfin/openfinDock.ts` and `apps/stern-reference-angular/src/app/openfin/openfinDock.ts`, both 577 LOC) were byte-identical.

- New file: `packages/openfin-platform-stern/src/dock/openfinDock.ts` — same content; cross-package imports rewritten as relative imports inside the shell:
  - `@marketsui/openfin-platform-stern` → `../utils/urlHelper.js`, `../types/openfinEvents.js`, `../platform/menuLauncher.js`, `../utils/defaultIcons.js`
- New barrel: `packages/openfin-platform-stern/src/dock/index.ts` re-exports `*` from `./openfinDock.js`.
- New subpath export in `packages/openfin-platform-stern/package.json`: `"./dock"` → `./dist/dock/index.js`. Required adding the `exports` field; preserved the existing `main`/`types` for backward compatibility.
- Apps updated:
  - `apps/stern-reference-react/src/openfin/OpenfinProvider.tsx:5` — `import * as dock from './openfinDock.js'` → `import * as dock from '@marketsui/openfin-platform-stern/dock'`
  - `apps/stern-reference-angular/src/app/openfin/openfin-provider.component.ts:18` — same change without the `.js` extension
- Deleted: both apps' local `openfinDock.ts` files (-1,154 LOC duplication).
- Behavior: identical. Same exports (`register`, `deregister`, `isQuitting`, `setQuitting`, `isDockAvailable`, etc.) consumed via namespace import.
- The earlier `bootstrap.ts` injected-`dockActions` design remains in place; this move just relocates the dock module so any future caller (including the shell itself) can import it without crossing back through an app workspace.

### Phase 2G — chart subpath export; Phase 2H skipped (2026-04-28)
**Verification:** `npx turbo typecheck test` → 52/52 tasks successful.

**Phase 2G — recharts off the @marketsui/ui main barrel:**
- `packages/ui/src/index.ts` — removed `export * from './components/chart.js'` from the data-display section. Comment block explains the rationale.
- `packages/ui/package.json` — added `./chart` subpath export pointing at `./dist/components/chart.js`. Future consumers import as `import { ChartContainer } from '@marketsui/ui/chart'`.
- Verified zero internal consumers: no `import {Chart…} from '@marketsui/ui'` anywhere in `packages/` or `apps/`. fi-trading-reference uses `recharts` directly. So this change is non-breaking.
- Outcome: any future consumer of `@marketsui/ui` no longer pulls recharts through the main barrel.

**Phase 2H — SKIPPED:**
- The audit recommended moving Monaco's `ExpressionEditor` to a subpath, but inspection of `packages/core/src/ui/ExpressionEditor/ExpressionEditor.tsx:15` shows Monaco is already code-split via `const LazyInner = lazy(() => import('./ExpressionEditorInner'))`. The wrapper exported from `core/index.ts:148` doesn't load Monaco eagerly — only the lightweight Suspense + FallbackInput shell. The audit finding was stale; no change needed.
- Worklog flag: this is the first audit item we've found to be incorrect on inspection. Be similarly skeptical when reviewing the remaining items.

### Phase 2E-F — hot-path memoization (2026-04-28)
**Verification:** `npx turbo typecheck test` → 52/52 tasks successful.
- **Phase 2E** — `packages/widgets-react/src/blotter/BlotterGrid.tsx` extracted inline `rowSelection` and `sideBar` literals into `useMemo`s. AG-Grid no longer sees fresh option objects on every parent re-render.
- **Phase 2F** — `packages/widgets-react/src/v2/markets-grid-container/useChordHotkey.ts` internalized a `handlerRef` so the keydown effect no longer takes the user-provided `handler` as a dep. Inline arrow callers (e.g., `MarketsGridContainer.tsx:216`) no longer cause the document keydown listener to be removed and re-added on every render. Listener firing reads the latest handler via the ref.
- Behavior preserved: same `rowSelection`/`sideBar` config; same chord matching semantics.

### Phase 2A-D — leak fixes + hot-path log gating (2026-04-28)
**Verification:** `npx turbo typecheck test` → 52/52 tasks successful (242 core tests + 56 markets-grid tests passed).
- **Phase 2A** — `packages/widget-sdk/src/hooks/useWidget.ts` `onSave`/`onDestroy` now return an unsubscribe `() => void` (was `void`). Type signatures in `packages/widget-sdk/src/types/widget.ts` updated to match.
- **Phase 2B** — `packages/widgets-react/src/blotter/SimpleBlotter.tsx`:
  - Extracted the `selectionChanged` listener into a separate `useEffect` keyed on `gridApi`, with `removeEventListener` in cleanup. Was leaking on every grid remount.
  - The `widget.onSave(...)` call inside the lifecycle effect now stores its returned unsubscribe and calls it in cleanup. Was accumulating closures every effect re-run (definite memory leak).
- **Phase 2C** — `packages/widget-sdk/src/adapters/BrowserAdapter.ts` `beforeunload` listener stored as a class field; removed in `dispose()`. Adapter recreations during HMR/route changes no longer leak window listeners.
- **Phase 2D** — Hot-path `console.log` calls gated behind a per-file `const DEBUG = false`:
  - `packages/data-plane/src/v2/worker/Hub.ts` — 7 logs (provider attach, late-joiner replay, broadcast fan-out)
  - `packages/data-plane/src/v2/client/DataPlane.ts` — 4 logs (subscribe, delta, status, buffered)
  - `packages/widgets-react/src/v2/markets-grid-container/MarketsGridContainer.tsx` — 11 logs (per-render gate, subscribe, snapshot, status, update batches, unsubscribe)
- All log calls preserved structurally — flip `DEBUG = true` per file to re-enable. Eliminates measurable CPU cost at 1000+ msg/s without removing the diagnostic capability.
- Behavior preserved: error-path `console.warn` and `console.error` calls left untouched. AG-Grid selection and platform-save behavior unchanged.

### Phase 1 — orphan + stale-comment sweep (2026-04-28)
**Verification:** `npx turbo typecheck` → 45/45 tasks successful (full repo build + typecheck).
- Deleted `agGridStateManager.ts` (root, 235 LOC) — superseded by `packages/core/src/modules/grid-state/`.
- Deleted `useAgGridKeyboardNavigation.tsx` (root, 372 LOC) — superseded by the same module.
- Deleted `vite.demo.config.ts` (root) — pointed at non-existent `demo/` dir; not imported anywhere.
- Removed broken `dev` script from `packages/core/package.json` (referenced the deleted vite config).
- Updated stale docstring + inline comment in `packages/openfin-platform-stern/src/bootstrap.ts` — the cited circular-dep justification (`dataProviderConfigService` in `widgets-react`) no longer applies; the service moved to `@marketsui/data-plane` already.
- Created `docs/REFACTOR_WORKLOG.md` (this file).
- Net: -700 LOC, no behavior change, 45/45 tasks pass.

---

## Key decisions

- **2026-04-28** — Phase 3 revision: cross-app dedup is more nuanced than the audit suggested. Verified deeper:
  - `apps/demo-angular` has its own `app.config.ts` (basic providers, no PrimeNG theming), distinct `package.json` with corporate-artifactory dependency notes, distinct `tsconfig.json` and `styles.scss`. Deleting it would lose a deliberately barebones reference. Only the source files (`widgets/`, `services/`, `app.ts`) are byte-identical with `fi-trading-reference-angular`.
  - `apps/demo-configservice-react` is a meaningfully different demo (ConfigService persistence + user-switcher + ConfigBrowser popout). Has a unique `ConfigBrowserPopout.tsx` and depends on `@marketsui/config-service`, `@marketsui/config-browser`, `@marketsui/openfin-platform`. Only the showcase content (`MarketDepth.tsx`, `marketDepthData.ts`, `showcaseProfile.ts`, `data.ts`, `custom-scrollbar.ts`) is byte-identical with `apps/demo-react`.
  - **Decision:** defer 3A (delete demo-angular) and 3B (merge configservice into demo-react) to Path C, where the architecture pivots to a single `apps/reference-{react,angular}` and these apps go away. Doing the extraction now would be throwaway work plus risks losing the demonstrably distinct demo purposes.
  - **Phase 3C still proceeds**: `openfinDock.ts` (577 LOC, byte-identical between stern apps) belongs in the stern shell anyway — moving it is architecturally meaningful and survives Path C.
- **2026-04-28** — Use a single long-lived branch `chore/audit-cleanup-architectural-alignment` rather than per-phase branches. Each phase becomes 1+ commit; PR happens at the end.
- **2026-04-28** — Preserve the user's uncommitted `docs/ARCHITECTURE.md` rewrite. Do NOT touch this file. The aspirational architecture it describes will guide later phases pending user direction.
- **2026-04-28** — Phase 1 is "delete-only + comment-update" — verifiable safe under any architectural direction.
- **2026-04-28** — User chose **Path B then Path C**:
  - Path B (1 wk): audit cleanup + add architectural seams *additively* (`RuntimePort`, `HostWrapper`, additional `ConfigManager` backends) without breaking existing code.
  - Path C (multi-wk, follows B): full migration — restructure component pkgs, possibly rename namespace `@marketsui/*` → `@starui/*`, replace reference apps, rewrite data-plane.
  - **Constraint:** zero loss of UI features, functions, behaviors. Verify each phase with `npx turbo typecheck` + `build` + `test`. Add behavior-pinning tests before any destructive Path C moves.
