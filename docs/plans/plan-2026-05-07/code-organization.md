# Code Organization — Monorepo Bucket Redesign

**Date:** 2026-05-07
**Status:** Design / brainstorm. No code changes yet.
**Participants:** Anand, Claude
**Companion docs:**
- [`config-manager-redesign.md`](./config-manager-redesign.md) — config service surface (drives the new tools/ bucket members)
- [`data-services-redesign.md`](./data-services-redesign.md) — SharedWorker data services (drives Inspect Shared Worker tool)

---

## ⚠ Paramount constraint — applies to every PR in this plan

**Zero loss of features, functionality, look-and-feel, or behavior.**
This is non-negotiable and overrides every other consideration in
the migration. Cleaner package layout is the goal; preserving every
end-user behavior is the constraint.

**What this means in practice:**

- Every PR is a **structural move + repointing only**. No code
  refactor, no API change, no "while we're here" cleanup that alters
  observable behavior.
- For pure deletions (Stern apps, axe-blotter, fi-trading-reference,
  dock-editor, registry-editor): the deletion is safe ONLY if
  every consumer has been confirmed migrated, no end-user-facing
  capability is lost, and any feature still in use has an equivalent
  destination. PR-1.5's "dead code" sweep is bounded by `knip`/grep
  evidence — symbols flagged as unused must be **doubly verified**
  (search for dynamic imports, string-keyed component lookups,
  CSS-class references) before deletion.
- For package moves: imports get repointed; runtime behavior
  doesn't change. Tests must pass before AND after each PR.
- For the `core/{ui,hooks,modules}` extraction (PR-8): the new
  `grid-react` package re-exports the same public surface that
  consumers import today. Any consumer's import path changes from
  `@starui/core` to `@starui/grid-react` (or vice versa per symbol),
  but the symbol's behavior is byte-identical to what it was.
- **Verification gates per PR:** before merge, every PR runs
  `npx turbo typecheck build test e2e` and the diff in observable
  behavior is **zero** (no new test failures, no e2e regressions,
  no visual diff in the demo apps that currently exercise the
  affected code).
- If a PR cannot satisfy this constraint, **the PR is wrong** —
  pause, re-plan, do not paper over with TODOs or "we'll fix later"
  notes.

## What this is

A working session to bring clarity to the **whole monorepo's bucket
layout**, not just one feature. After yesterday's two redesigns added
new packages (config-service-react, config-service-angular,
config-editor-ui, config-admin-web, …), the existing 27-package + 11-app
arrangement needs a defensible structure before more pieces land.

Specifically:

1. **`apps/` taxonomy** — what counts as an app and what doesn't.
2. **`packages/{shared,react,angular}/` sub-buckets** — which roles
   exist inside each bucket and what belongs in each.
3. **Decomposing `@starui/core`** — the 32k-LOC god-package, ~75% of
   which is React content sitting in the framework-agnostic bucket.
4. **Deleting dead/replaced code** — Dock Editor, Component Registry,
   Stern shell, axe-blotter, fi-trading skeletons.
5. **Naming convention** — package names inside the new sub-buckets.

---

## Context — what exists today

### The numbers

- **27 packages** across `packages/{shared,react,angular}/`
- **11 apps** across `apps/`
- **Four empty apps** (`fi-trading-reference`, `fi-trading-reference-angular`,
  `stern-reference-react`, `stern-reference-angular`)
- **`@starui/core`** is **32,231 LOC** in a single package — and its
  own header comment names this as a temporary all-in-one:
  > "One package, no `-v2` suffix, no React-vs-vanilla split yet
  > (that's a future packaging decision)."
  > — [`packages/shared/core/src/index.ts:1`](../../packages/shared/core/src/index.ts#L1)

### What's inside `@starui/core` (the god-package)

| Subdir | LOC | Nature | Belongs in |
|---|---|---|---|
| `modules/` | 13,851 | React grid modules (each `Module<S>` + React panel) | **`packages/react/`** |
| `ui/` | 9,272 | React primitives (StyleEditor, ColorPicker, ExpressionEditor, SettingsPanel, format-editor — **+ a duplicate copy of shadcn**) | **`packages/react/`** |
| `profiles/` | 1,456 | ProfileManager (vanilla) | `shared/core` |
| `css/` | 1,380 | CssInjector | `shared/core` |
| `expression/` | 1,306 | CSP-safe expression engine (vanilla, self-contained) | `shared/core` |
| `hooks/` | 1,136 | React bindings for the platform | **`packages/react/`** |
| `platform/` | 1,110 | GridPlatform, EventBus, ApiHub (vanilla) | `shared/core` |
| `colDef/`, `store/`, `history/`, `security/`, `utils/`, `types/`, `test/` | ~3,002 | Vanilla helpers | `shared/core` |
| `persistence/` | 178 | StorageAdapter + Memory/Dexie adapters | `shared/core` |
| **TOTAL** | **32,691** | **~75% React, ~25% vanilla** | — |

> **Headline:** ~24,259 LOC of React content lives in `packages/shared/`
> in violation of the bucket rule. That single fact drives most of
> what follows.

### Other smells named (but not all addressed in this doc)

1. **Angular naming asymmetric** — `@starui/angular-config-browser`
   (prefix) vs React `@starui/config-browser-react` (suffix). One
   package literally named `@starui/angular`.
2. **shadcn duplicated** — both `packages/react/ui/` and
   `packages/shared/core/src/ui/shadcn/` exist. CLAUDE.md "carve-out"
   already names this.
3. **Demo proliferation** — four React demo-shaped apps with overlapping
   purpose (user will prune manually).
4. **`widgets-react` depends on `openfin-platform-stern`** — a generic
   widgets lib pulling in a bank-specific shell.
5. **`openfin-platform-stern` lives in `shared/`** — but a deployment-
   specific OpenFin shell isn't framework-agnostic. (Resolved by
   deletion below.)
6. **`@starui/dock-editor` is a grab-bag**, not just an editor.
   It currently exports at least three distinct capabilities:
   `WorkspaceSetup`, `DockEditorPanel`, and `ImportConfig`, plus a
   shared `injectEditorStyles` CSS helper. Each needs an explicit home
   when the package is dismantled.

---

## Decisions

### 1. `apps/` — only reference apps + the service

`apps/` is sacred for things that ship and run. Its taxonomy collapses
to **two categories**:

1. **Reference apps** — show how a real consumer assembles the
   framework. Showcase: ConfigManager, OpenFin dock, MarketsGrid.
   Demo apps are NOT references; they may be kept as personal
   sandboxes (see Decision 2).
2. **Operational services** — long-running backends. Currently one:
   `config-service-server`.

Deleted entirely:

| App | Reason |
|---|---|
| `apps/stern-reference-react/` | Stern is out — bank-specific shell |
| `apps/stern-reference-angular/` | Stern is out |
| `apps/fi-trading-reference/` | fi-trading scope removed |
| `apps/fi-trading-reference-angular/` | fi-trading scope removed |
| `apps/axe-blotter-demo/` | Not in scope |
| `apps/markets-ui-angular-reference/` | **Deferred.** Angular React-side parity isn't there yet (per user). Re-introduce when components reach parity. |

Reference shape (after Stern + Angular removal):

```
apps/
  reference-react-browser/         (← rename of markets-ui-react-reference)
  reference-react-openfin/         (new, OR runtime-detect from the same source)
  config-service-server/           (existing)
  demo-react/                      (kept; user will prune)
  demo-angular/                    (kept; user will prune)
  demo-configservice-react/        (kept; user will prune)
```

> **Open sub-decision (Decision 1a):** Is `reference-react-browser` and
> `reference-react-openfin` two separate apps, or one app with runtime
> detection via `@starui/runtime-port`? Punted — user wants to consider
> after the bucket layout is settled.

### 2. Demo apps — kept, user-pruned

`demo-react`, `demo-angular`, `demo-configservice-react` are **not**
deleted in this redesign. The user will decide what to keep, fold, or
delete on their own timeline. They are explicitly **not** "references"
and don't get the showcase obligation.

### 3. The `tools/` sub-bucket is the headline new structure

Tooling UIs / dev utilities live in `packages/react/tools/` and
`packages/angular/tools/` — never as flat siblings of widgets, SDKs,
and providers.

**Initial occupants** (the user-named list — more may join):

| Tool | Status today | Lands at |
|---|---|---|
| **Workspace Setup** | Already exists inside `dock-editor-react` ([WorkspaceSetup.tsx](../../packages/react/dock-editor-react/src/WorkspaceSetup.tsx) + `components/workspace-setup/`) | `packages/react/tools/workspace-setup-react/` |
| **Config Browser** | `packages/react/config-browser-react/` (2,347 LOC) | `packages/react/tools/config-browser-react/` |
| **Data Provider editors** | Does not exist as a standalone package — pieces live inside `widgets-react` and `data-plane-react` | `packages/react/tools/data-providers-react/` (new; extract) |
| **Inspect Shared Worker** | Does not exist — implied by yesterday's data-services design | `packages/react/tools/inspect-shared-worker-react/` (new) |

Angular twins land at `packages/angular/tools/<tool>-angular/` when
parity work happens. Workspace Setup's Angular code already exists at
[`packages/angular/dock-editor-angular/src/workspace-setup/`](../../packages/angular/dock-editor-angular/src/workspace-setup/) — same extraction pattern.

### 4. The "old" Dock Editor and Component Registry — deleted entirely

These are dead code, replaced by Workspace Setup. Per the user's
"no v1/v2" rule, they get deleted, not deprecated.

**Packages deleted in full:**

- `packages/react/dock-editor-react/` (5,437 LOC) — after extracting
  Workspace Setup
- `packages/react/registry-editor-react/` (1,111 LOC)
- `packages/angular/dock-editor-angular/` (2,865 LOC) — after
  extracting Workspace Setup
- `packages/angular/registry-editor-angular/` (969 LOC)

**What stays** (NOT deleted — these are runtime, not editors):

- `packages/shared/openfin-platform/src/dock.ts`,
  `workspace.ts`, `workspaceGc.ts`, etc. — the dock/workspace
  **runtime API** that Workspace Setup drives. Editing changes; runtime
  doesn't.

**Real consumers (verified by grep) and their resolutions:**

| Consumer | Imports today | Action |
|---|---|---|
| `config-browser-react/src/editorStyles.ts` | re-exports `injectEditorStyles` from `@starui/dock-editor` | `injectEditorStyles` is **not editor-specific** — it's CSS injection. Move it to `@starui/core` (vanilla CSS injection helper). config-browser-react then re-exports from `@starui/core`. |
| `registry-editor-react/src/editorStyles.ts` | same | Deleted with `registry-editor-react`. |
| `dock-editor-react/src/WorkspaceSetup.tsx` | `useRegistryEditor` from `@starui/registry-editor` | **Fold `useRegistryEditor` (and any other registry-editor primitives WorkspaceSetup depends on) into the new `workspace-setup-react` package.** They go where they're used. |
| `apps/markets-ui-react-reference/src/main.tsx` | lazy-imports `ImportConfig` and `WorkspaceSetup` from `@starui/dock-editor` | Switch to `@starui/workspace-setup-react`. **`ImportConfig` is a third capability** in dock-editor (not just WorkspaceSetup) — it gets extracted to `workspace-setup-react` alongside WorkspaceSetup, OR (if it has a distinct user purpose) becomes its own tool: `@starui/import-config-react`. Decide during PR-3 by inspecting what `ImportConfig` actually does. |
| `apps/markets-ui-react-reference/src/views/DockEditor.tsx` | `DockEditorPanel` from `@starui/dock-editor` | View file deleted; route removed. The Workspace Setup view replaces it. |
| `apps/markets-ui-react-reference/src/views/RegistryEditor.tsx` | `RegistryEditorPanel` from `@starui/registry-editor` | View file deleted; route removed. |
| `apps/markets-ui-angular-reference` | uses `dock-editor-page.component.ts`, `registry-editor-page.component.ts` | Already deferred (Decision 1) — app is being deleted in PR-1. |

### 5. Bucket sub-taxonomy — `packages/shared/`

```
packages/shared/
  foundation/                ← pure leaves; no internal deps allowed
    shared-types/
    design-system/           (token CSS variables)
    icons-svg/
    tokens-primeng/          (Angular-targeted; CSS-only, framework-agnostic)
  runtime/                   ← runtime abstraction layer
    runtime-port/            (interface)
    runtime-browser/         (impl)
    runtime-openfin/         (impl)
  services/                  ← vanilla TS services consumed by framework adapters
    config-service/
    data-plane/
    component-host/
  platform/                  ← runtime shells (vanilla)
    openfin-platform/        (existing — dock/workspace/launch runtime API)
  core/                      ← framework-agnostic grid platform (vanilla TS only — see Decision 7)
```

**Bucket rules** (enforced by convention; ESLint follow-up):

- **`foundation/` packages** must not import from any other package.
  They're leaves of the dependency graph by definition.
- **`runtime/`, `services/`, `platform/`** may depend on `foundation/`
  and on each other within the same bucket. Cross-bucket imports allowed.
- **`core/`** is its own package at the root of `shared/` (NOT inside
  `platform/`) — it's a framework-agnostic grid platform, distinct
  conceptually from OpenFin platform.
- **No package in `shared/` may import React, Angular, or any
  framework-coupled library.** Bucket rule. Violation = file lives in
  the wrong bucket.

### 6. Bucket sub-taxonomy — `packages/react/`

```
packages/react/
  ui/                              (existing — shadcn primitives; no twin → no -react suffix)
  sdk/
    widget-sdk/                    (existing — drop "Stern" branding; no twin → no suffix)
  widgets/                         ← end-user UI components
    markets-grid/                  (existing — the widget shell)
    grid-react/                    (← extracted from core/{ui,hooks,modules}; ~24k LOC)
    widgets-react/                 (existing — drop the openfin-platform-stern dep)
  hosts/
    host-wrapper-react/            (existing)
  providers/                       ← Provider + hook shells around shared/services
    data-plane-react/              (existing)
    config-service-react/          (new — from yesterday's plan)
  tools/                           ← dev/operator UIs
    workspace-setup-react/         (← extracted from dock-editor-react)
    config-browser-react/          (existing — moves; package name unchanged)
    data-providers-react/          (new — extract from widgets-react/data-plane-react)
    inspect-shared-worker-react/   (new — from yesterday's data-services design)
```

**Notes:**

- `grid-react` consumes `@starui/core` (vanilla grid platform) and is
  itself consumed by `markets-grid` (the widget). This breaks the
  current god-package edge: `markets-grid → core` becomes
  `markets-grid → grid-react → core`. Strictly more layers, strictly
  cleaner.
- `widgets/` is the only sub-bucket with multiple "shapes" of member
  (a widget shell, a grid impl, a widget collection). Acceptable —
  they're all "things a consuming app drops into its UI."

### 7. Bucket sub-taxonomy — `packages/angular/`

```
packages/angular/
  hosts/
    host-wrapper-angular/          (existing)
  providers/
    config-service-angular/        (new — from yesterday's plan)
  widgets/
    widgets-angular/               (← rename of @starui/angular; today's pkg name is just "angular" which hides what it is)
  tools/
    workspace-setup-angular/       (← extract from dock-editor-angular when parity work happens)
    config-browser-angular/        (← rename of @starui/angular-config-browser; align suffix to -angular)
```

Angular bucket is **deliberately smaller** than React because Angular
parity is currently behind. As parity work catches up:

- Add `widgets/markets-grid-angular/` (new — Angular twin of MarketsGrid)
- Add `widgets/grid-angular/` (Angular twin of grid-react)
- Add other tools' Angular twins

### 8. Naming convention — `-react` / `-angular` suffix

**Rule:** Package name carries the framework suffix; folder lives under
the framework-named bucket.

| Folder | Package name |
|---|---|
| `packages/react/tools/config-browser-react/` | `@starui/config-browser-react` |
| `packages/angular/tools/config-browser-angular/` | `@starui/config-browser-angular` |
| `packages/react/widgets/markets-grid/` | *(future)* `@starui/markets-grid-react` |

**Why suffix even when bucket already says React:**

1. **Folder = file organization** (filesystem audience).
2. **Package name = import-site clarity** (developer audience).
   `import { ConfigBrowser } from '@starui/config-browser-react'` is
   self-explanatory; a developer doesn't need to chase the folder to
   know which framework they're pulling in.
3. **Symmetric with the React/Angular twin rule** — a `-react`
   package's existence implies an `-angular` twin (or a deliberate
   gap). The suffix makes that contract visible.
4. **Zero rename cost** for existing packages like
   `@starui/config-browser-react` — only the folder moves.

**Carve-out: drop the suffix when no twin can ever exist.**

| Package | No twin because |
|---|---|
| `@starui/ui` | shadcn is React-only by design; Angular uses PrimeNG → `@starui/tokens-primeng` |
| `@starui/widget-sdk` | The widget contract is React-side; Angular widgets would be a separate framework |
| `@starui/tokens-primeng` | PrimeNG is Angular-only |

**Angular naming cleanup (in this redesign):**

| Old | New |
|---|---|
| `@starui/angular` | `@starui/widgets-angular` (clarifies the role) |
| `@starui/angular-config-browser` | `@starui/config-browser-angular` |
| `@starui/angular-dock-editor` | *(deleted; Workspace Setup extracted)* |
| `@starui/angular-registry-editor` | *(deleted)* |

### 9. `@starui/core` — vanilla-only

Per the user's lock: **`core` keeps only framework-agnostic code.**
React parts move out. Core stays as a single package — no
sub-decomposition into expression/persistence/profiles/etc — because
splitting vanilla-only code further isn't worth the package overhead.

**Stays in `core` (vanilla TS, ~7,972 LOC):**

- `platform/` — GridPlatform, EventBus, ApiHub
- `store/` — createGridStore, autosave
- `persistence/` — StorageAdapter, MemoryAdapter, DexieAdapter
- `profiles/` — ProfileManager
- `expression/` — CSP-safe expression engine
- `css/` — CssInjector
- `colDef/`, `history/`, `security/`, `utils/`, `types/`, `test/`

**Moves out to `packages/react/widgets/grid-react/` (~24,259 LOC):**

- `core/ui/` → `grid-react/src/ui/`
- `core/hooks/` → `grid-react/src/hooks/`
- `core/modules/` → `grid-react/src/modules/`

**The shadcn duplicate is collapsed:** `core/ui/shadcn/` is dropped;
`grid-react` consumes `@starui/ui` directly. The CLAUDE.md "carve-out"
covering `core/ui/shadcn` becomes unnecessary and gets deleted.

**Updated dependency edges after the move:**

```
markets-grid (widget)
  → grid-react (React UI, hooks, modules)
    → core (vanilla grid platform)
    → ui   (shadcn primitives)
```

### 10. Stern + deployment-shell cleanup

`packages/shared/openfin-platform-stern/` (2,266 LOC) is **deleted
entirely** along with the Stern reference apps. Reasoning:

- It's a deployment-specific OpenFin shell — wrong bucket (it's not
  framework-agnostic; it's deployment-specific).
- With Stern apps gone, no consumer left.
- `widgets-react` currently imports it — that import is dropped as
  part of the deletion.

`@starui/openfin-platform` (the **generic** OpenFin shell) stays in
`packages/shared/platform/` because its surface is genuinely generic
(dock, workspace, launch, IAB topics). If a future deployment needs
its own shell, it lives in `apps/` (next to its reference app), not in
`packages/shared/`.

### 11. Migration order — small, reversible PRs

The full move is **not one PR**. Sequence proposed:

1. **PR-1 — Delete dead apps + Stern shell.** Stern apps, Stern shell
   package, axe-blotter, fi-trading-reference apps. Pure deletion, no
   rewiring. Mechanical and reversible via git.
2. **PR-1.5 — Sweep confirmed dead code in surviving packages**
   (Decision 12). Delete `widgets-react/src/dock/DockConfigurator.tsx`
   (671 LOC, zero consumers); drop the unused exports listed in
   Decision 12 from `markets-grid`, `core/modules/conditional-styling`,
   `core/ui/format-editor`, `core/ui/ExpressionEditor`,
   `widget-sdk/src/types/index.ts`, `widget-sdk/src/providers/WidgetHost.tsx`
   (`WidgetHostContext`), and `config-browser-react/src/agGridTheme.ts`;
   strip unused deps from `packages/react/ui/package.json` and the
   devDeps listed. Skip the demo-app duplicates (`customScrollbar.ts`)
   — those belong to user-pruned demos. Skip `core/ui/shadcn/` — that
   waits for PR-8.
3. **PR-2 — Repoint old-editor consumers.** Drop `dock-editor` /
   `registry-editor` imports from `widgets-react`,
   `config-browser-react`, and the React reference app. Specifics
   determined during PR-2 by inspecting current usage (per Decision 4
   consumer table).
3. **PR-3 — Extract Workspace Setup (and its dependencies).** Move
   `WorkspaceSetup.tsx` + `components/workspace-setup/` from
   `dock-editor-react` to a new
   `packages/react/tools/workspace-setup-react/` package. **Also move
   any `registry-editor-react` primitives WorkspaceSetup depends on**
   (`useRegistryEditor` confirmed; check for others during the PR).
   Decide whether `ImportConfig` lives in this same package or becomes
   its own `tools/import-config-react/`. Move `injectEditorStyles`
   from `dock-editor-react` to `@starui/core` (it's a vanilla CSS
   helper, not editor-specific). Update the reference app to import
   from the new locations.
4. **PR-4 — Delete `dock-editor-react` + `registry-editor-react`.**
   After Workspace Setup is safely extracted and consumers repointed,
   delete both packages. Same for the Angular twins.
5. **PR-5 — Move `config-browser-react` into `tools/`.** Folder move
   only. Package name unchanged. Update workspace glob in root
   `package.json`.
6. **PR-6 — Sub-bucket the rest of `packages/react/`.** Move
   `host-wrapper-react`, `data-plane-react`, `widget-sdk` etc. into
   their bucket subdirs. Folder moves only.
7. **PR-7 — Sub-bucket `packages/shared/`.** Move existing packages
   into `foundation/`, `runtime/`, `services/`, `platform/`. Folder
   moves only.
8. **PR-8 — Extract `core`'s React content into `grid-react`.**
   Largest PR. Move `ui/`, `hooks/`, `modules/` from
   `packages/shared/core/src/` to
   `packages/react/widgets/grid-react/src/`. Update `core`'s
   `package.json` (remove React peer deps), update `markets-grid`'s
   imports to point at `grid-react`. Drop the duplicate
   `core/ui/shadcn` in favor of `@starui/ui`.
9. **PR-9 — Sub-bucket `packages/angular/` + naming cleanup.** Move
   into `hosts/`, `providers/`, `widgets/`, `tools/`. Rename
   `@starui/angular` → `widgets-angular` and `@starui/angular-config-browser`
   → `config-browser-angular`.
10. **PR-10 — Workspace globs + docs.** Update root `package.json`
    workspace globs to list the new sub-bucket paths. Update
    `docs/ARCHITECTURE.md` and `CLAUDE.md` to reflect the new layout.
11. **PR-11 — Tarball pack workflow** (Decision 13). Add `/lib/` to
    root `.gitignore`. Add `pack:libs` script to root `package.json`
    that runs `turbo run build` then iterates packages with `npm pack
    --pack-destination ../../lib`. Add a small helper that emits the
    `overrides` manifest snippet a reference app can paste into its
    own `package.json`. No app changes required by this PR — it just
    makes the workflow available for whoever builds the first new
    reference app (e.g. `reference-react-openfin`, Decision 1a).

> Each PR is mechanically isolated and individually revertible. The
> god-package extraction (PR-8) is intentionally near the end, after
> the easier moves have built up confidence in the new structure.

### 12. Confirmed dead code — separate sweep before bucket moves

A `knip` + `depcheck` + grep audit across the React side surfaced
**~9,000–11,000 LOC of dead code (≈14–17% of the React surface)**.
Most of it is auto-swept by other PRs (e.g. all dead code inside
`dock-editor-react` and `registry-editor-react` disappears with PR-4
that deletes those packages). What remains needs an explicit sweep
because it lives in packages that aren't being deleted.

**The non-auto-swept wins:**

| File / symbol | LOC | Status |
|---|---|---|
| `packages/react/widgets-react/src/dock/DockConfigurator.tsx` | 671 | Exported from root barrel; **zero consumers** anywhere in repo. Pure dead weight. |
| `packages/react/markets-grid/src/formatter/formatterPresets.ts` — `FMT_USD/EUR/GBP/JPY`, `currentTickToken`, `TICK_MENU` exports | ~50 | Exported, never consumed externally. |
| `packages/react/markets-grid/src/streamSafeNumberFloatingFilter.ts` — `parseNumberExpression` export | ~30 | Exported, never consumed externally. |
| `packages/shared/core/src/modules/conditional-styling/transforms.ts` — `FLASH_PULSE_RULE_ID`, `FLASH_PULSE_CSS`, `buildCssText`, `buildCellClassPredicate` | ~100 | Exported, never consumed externally. |
| `packages/shared/core/src/ui/format-editor/index.ts` — `FormatSwatch` export, `hexToHsv`/`hsvToHex` exports | ~50 | No external consumer. |
| `packages/shared/core/src/ui/ExpressionEditor` barrel — `LANGUAGE_ID`, `defaultFunctionsProvider` | ~30 | No external consumer. |
| `packages/shared/core/src/modules/calculated-columns/fieldSchema.tsx` — `Row`, `OptNumberControl`, `TextControl`, `SelectControl`, `FieldRenderer` | ~50 | Exported, used only inside the same file. |
| `packages/react/widget-sdk/src/types/index.ts` | 23 | Unimported file. |
| `packages/react/widget-sdk/src/providers/WidgetHost.tsx` — `WidgetHostContext` export | ~15 | Exported, no consumer. |
| `packages/react/config-browser-react/src/agGridTheme.ts` — `agGridThemeDark`, `agGridThemeLight` exports | ~40 | Exported, no consumer. |
| **Unused production deps** in `packages/react/ui/package.json`: `@hookform/resolvers`, `date-fns`, `zod` | dep-only | Pure cleanup; no LOC change. Drop from `package.json`. |
| **Unused devDeps**: `@testing-library/user-event` in `markets-grid`, `@types/react-dom` in `widget-sdk`, `ag-grid-enterprise` in `widgets-react`, `@monaco-editor/react` in `core` | dep-only | Drop from `package.json`. |
| `apps/demo-react/src/customScrollbar.ts` + identical copy in `apps/demo-configservice-react/` | 354 (combined) | Identical, unimported. Demo apps are user-pruned (Decision 2) — flagged but not deleted in this redesign. |

**Stale-but-intentional shims** (not deleted; documented for future cleanup):

- `widgets-react/src/hosted/HostedMarketsGrid.tsx` — `LEGACY_CLEANUP_SENTINEL` one-shot localStorage migration. Removable once all clients have run it.
- `widgets-react/src/hosted/useHostedIdentity.ts` — "legacy hardcoded discriminator" fallback branch.
- `markets-grid/src/streamSafeFloatingFilter.ts:173` — explicit `// Last-resort fallback to the deprecated path` comment.
- `core/modules/saved-filters/index.ts:67` — comment references "v2 validator" (validator code itself is current API).
- `core/ui/ExpressionEditor/language.ts` — `variable.column.deprecated` token. Intentional UX warning for old `{col}` syntax.

**Confidence caveat (do NOT auto-delete):**

`core/ui/shadcn/`'s barrel exports are flagged "unused" at the barrel level by knip, but the individual exports ARE consumed internally — `markets-grid` imports `GhostIconButton`, `Tooltip`, `cn` from `@starui/core`. **Migrate those internal imports to `@starui/ui` first** (already required by PR-8); only then is `core/ui/shadcn/` safely deletable.

### 13. Tarball-consumption pattern for new reference apps

**The rule:** New reference apps in `apps/` consume our libraries
**from packed tarballs**, not from npm workspace symlinks. The pack
artifacts live in a gitignored `/lib/` at the repo root.

**Why this matters:** Workspace symlinks let an app "see through" to
internal modules and silently rely on files that wouldn't be in a
published tarball (missing from `"files"`, broken `"exports"` map,
peer-dep ranges that don't resolve cleanly). A reference app whose
job is to **show how a real consumer wires the framework** must
consume the framework the way a real consumer would. Tarballs make
packaging bugs surface during dev, not after a release.

**Locked choices:**

| Choice | Decision | Reason |
|---|---|---|
| **Pack scope** | Every workspace package | Predictable rule. `lib/` is a complete mirror of the publishable surface. No "is this internal?" judgment per package. |
| **Repack workflow** | Manual: `npm run pack:libs` then reinstall in the consuming app | Mirrors real consumer workflow. No fragile watcher tooling. One command per library iteration is acceptable cost for fidelity. |
| **Existing demos** | Stay on workspace symlinks | `demo-react`, `demo-angular`, `demo-configservice-react` are user-pruned (Decision 2) and transient. Don't change their workflow. |
| **`lib/` location** | `/lib/` at repo root, gitignored | Standard layout. CI regenerates on every build. Nothing binary in the repo. |

**Workflow shape:**

```bash
# Library author edits packages/react/widgets/markets-grid/src/...
npm run pack:libs              # turbo build + npm pack each package; emits /lib/*.tgz

# Reference app picks up the change
cd apps/reference-react-openfin
npm install                    # npm re-extracts the file:../../lib/starui-markets-grid-*.tgz
```

**Reference app `package.json` shape:**

```jsonc
{
  "dependencies": {
    "@starui/markets-grid-react": "file:../../lib/starui-markets-grid-react-1.0.0.tgz",
    "@starui/config-service-react": "file:../../lib/starui-config-service-react-1.0.0.tgz",
    // ... any other top-level imports
  },
  "overrides": {
    // Pin every transitive workspace dep to its tarball, so npm doesn't try
    // to fetch e.g. @starui/core from a registry.
    "@starui/core": "file:../../lib/starui-core-1.0.0.tgz",
    "@starui/ui": "file:../../lib/starui-ui-1.0.0.tgz",
    // ... full enumeration; helper script generates this from /lib/ contents
  }
}
```

**`pack:libs` script behavior** (defined in root `package.json`):

1. `turbo run build` — ensure every package's `dist/` is fresh.
2. For each workspace package: `npm pack --pack-destination ../../lib`.
3. (Optional) Regenerate the `overrides` manifest snippet that
   reference apps paste into their `package.json`.

**`/lib/.gitignore` entry:** Add `/lib/` to root `.gitignore`. Keep
the directory itself committed only via a `.gitkeep` if the location
needs to exist before first pack.

**Caveat — does NOT apply to:**

- **Existing apps** (`demo-react`, `demo-angular`,
  `demo-configservice-react`, `markets-ui-react-reference` →
  `reference-react-browser` after rename). These keep workspace
  symlinks. The tarball rule applies to **net-new reference apps**
  created after the migration completes (e.g. `reference-react-openfin`).
- **`config-service-server`**. It's an operational backend, not a
  consumer of the framework's UI libraries. Stays workspace-linked.
- **Internal cross-package development.** When working across two
  libraries, library authors keep using workspace symlinks for
  iteration speed. Only the consuming reference app crosses the
  tarball boundary.

**Implementation note:** Specifics of the manifest generator (point 3
above) and exact `package.json` shape get nailed down when the first
new reference app is actually built. The principle locked here is:
**tarballs not symlinks for new reference apps; manual repack flow;
gitignored `/lib/` at root.** Tooling is straightforward npm + turbo,
no Verdaccio or other infrastructure.

### 14. Out of scope for this redesign — revisit after the migration completes

Explicit punts (deferred, not decided against). **Per user direction:
this list gets re-evaluated as a discrete pass after PR-10 lands**;
nothing here is closed-out, just sequenced behind the bucket move.



- **Angular reference app + Angular parity.** Listed in Decision 1
  as deferred. No new Angular packages created until React parity
  is closer.
- **ESLint enforcement of bucket rules.** Convention-only for now,
  same posture as filename casing.
- **Per-module split of `grid-react`.** It lands as one package
  (~24k LOC). If individual modules grow consumers outside the grid,
  revisit.
- **Splitting `markets-grid`** (currently 11k LOC). Out of scope —
  it's a single widget; pulling it apart only makes sense if there's
  a reason to.
- **Decisions around `apps/reference-react-browser` vs
  `apps/reference-react-openfin`** (Decision 1a). To be picked up
  after this layout is settled.

---

## Open questions

None blocking — every decision above has a concrete resolution. The
deferred items in Decision 14 are *not* blockers; they're future work.

---

## Naming index — what gets renamed, what doesn't

| Today | Tomorrow |
|---|---|
| `packages/shared/core/` | `packages/shared/core/` (slimmed to vanilla only) |
| `packages/shared/config-service/` | `packages/shared/services/config-service/` |
| `packages/shared/data-plane/` | `packages/shared/services/data-plane/` |
| `packages/shared/component-host/` | `packages/shared/services/component-host/` |
| `packages/shared/shared-types/` | `packages/shared/foundation/shared-types/` |
| `packages/shared/design-system/` | `packages/shared/foundation/design-system/` |
| `packages/shared/icons-svg/` | `packages/shared/foundation/icons-svg/` |
| `packages/shared/runtime-port/` | `packages/shared/runtime/runtime-port/` |
| `packages/shared/runtime-browser/` | `packages/shared/runtime/runtime-browser/` |
| `packages/shared/runtime-openfin/` | `packages/shared/runtime/runtime-openfin/` |
| `packages/shared/openfin-platform/` | `packages/shared/platform/openfin-platform/` |
| `packages/shared/openfin-platform-stern/` | **DELETED** |
| `packages/react/ui/` | `packages/react/ui/` (no change) |
| `packages/react/widget-sdk/` | `packages/react/sdk/widget-sdk/` |
| `packages/react/markets-grid/` | `packages/react/widgets/markets-grid/` |
| `packages/react/widgets-react/` | `packages/react/widgets/widgets-react/` (drop Stern dep) |
| `packages/react/host-wrapper-react/` | `packages/react/hosts/host-wrapper-react/` |
| `packages/react/data-plane-react/` | `packages/react/providers/data-plane-react/` |
| `packages/react/config-browser-react/` | `packages/react/tools/config-browser-react/` |
| `packages/react/dock-editor-react/` | **DELETED** (after Workspace Setup extraction) |
| `packages/react/registry-editor-react/` | **DELETED** |
| *(new)* | `packages/react/widgets/grid-react/` (← from `core/{ui,hooks,modules}`) |
| *(new)* | `packages/react/tools/workspace-setup-react/` (← from `dock-editor-react`) |
| *(new)* | `packages/react/tools/data-providers-react/` |
| *(new)* | `packages/react/tools/inspect-shared-worker-react/` |
| *(new)* | `packages/react/providers/config-service-react/` |
| `packages/angular/angular/` | `packages/angular/widgets/widgets-angular/` (rename pkg `@starui/angular` → `@starui/widgets-angular`) |
| `packages/angular/host-wrapper-angular/` | `packages/angular/hosts/host-wrapper-angular/` |
| `packages/angular/config-browser-angular/` | `packages/angular/tools/config-browser-angular/` (rename pkg `@starui/angular-config-browser` → `@starui/config-browser-angular`) |
| `packages/angular/dock-editor-angular/` | **DELETED** (after Workspace Setup extraction) |
| `packages/angular/registry-editor-angular/` | **DELETED** |
| `packages/angular/tokens-primeng/` | `packages/shared/foundation/tokens-primeng/` (CSS-only; framework-agnostic; moves to shared) |
| *(new)* | `packages/angular/providers/config-service-angular/` |
| *(new)* | `packages/angular/tools/workspace-setup-angular/` (when Angular parity returns) |
| `apps/stern-reference-react/` | **DELETED** |
| `apps/stern-reference-angular/` | **DELETED** |
| `apps/fi-trading-reference/` | **DELETED** |
| `apps/fi-trading-reference-angular/` | **DELETED** |
| `apps/axe-blotter-demo/` | **DELETED** |
| `apps/markets-ui-angular-reference/` | **DELETED** (deferred — re-introduce when parity returns) |
| `apps/markets-ui-react-reference/` | `apps/reference-react-browser/` (rename) |
| *(new, possibly)* | `apps/reference-react-openfin/` (Decision 1a — punted) |
