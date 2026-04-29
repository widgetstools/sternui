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

- **2026-04-28** — Use a single long-lived branch `chore/audit-cleanup-architectural-alignment` rather than per-phase branches. Each phase becomes 1+ commit; PR happens at the end.
- **2026-04-28** — Preserve the user's uncommitted `docs/ARCHITECTURE.md` rewrite. Do NOT touch this file. The aspirational architecture it describes will guide later phases pending user direction.
- **2026-04-28** — Phase 1 is "delete-only + comment-update" — verifiable safe under any architectural direction.
