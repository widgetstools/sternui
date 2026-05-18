---
title: "v2 rewrite — repository structure + file budget"
subtitle: "Package map sizing to under 200 files for React-only v2"
date: "2026-05-19"
status: "Decision document — supersedes the existing flat 10-package v2 layout"
---

# Goals

Two locked decisions, with a third aspirational target:

1. **Three-bucket layout** — `packages/shared/` (framework-agnostic),
   `packages/react/` (React-specific), `packages/angular/`
   (placeholder for v2 rewrite scope). Anti-duplication rule:
   anything not bound to a UI framework lives in `shared/`. See
   `PUBLIC_API_SPEC.md` §1.5.
2. **Naming convention** — `@starui/<name>` for `shared/`,
   `@starui/react-<name>` for `react/`, `@starui/ng-<name>` for
   `angular/`. Framework prefix is mandatory; cross-bucket imports
   skipping it are rejected at lint.
3. **Aspirational target** — under 200 source files for React-only
   v2 (vs v1's ~1,200). Per-package budgets in §3 below.

# Package map

## `packages/shared/`

| Package | Purpose | File budget |
|---|---|---|
| `@starui/types`           | Shared TypeScript types (`AppConfigRow`, `IdentitySnapshot`, `Theme`, `ProfileSnapshot`, etc.). Re-exported by every consumer. No runtime code. | 5 |
| `@starui/shared`          | Vanilla utilities: path accessors (§2.5), `getValueByPath`, expression engine, profile-set encoding helpers, JSON canonicalisation, `createLogger`. | 25 |
| `@starui/design-system`   | Tokens (`tokens.css`, `palettes.css`), AG-Grid theme factory (`SF_AG_THEME`), PrimeNG preset placeholder, per-theme styling runtime API. Repackages `/Users/develop/wfh/StaruI-design`. | 8 |
| `@starui/runtime-port`    | `RuntimePort` interface (no impls). One file with types + the documented contract. | 2 |
| `@starui/config-client`   | REST `ConfigClient` factory + request/response shapes. Thin client; no auth machinery beyond the `getToken` callback. | 8 |
| `@starui/config-server`   | The repurposed configservice-old: Express server, `Storage` interface, `SqliteStorage` + `MongoStorage` impls, JWT validation middleware, mode-flag boot guard. Phased migration plan in `./config-server-design.md`. | 25 |
| `@starui/openfin`         | OpenFin workspace platform integration: registration, dock V2/V3 renderers (§9.5), IAB topics, custom actions, popout helpers. Vanilla TS — consumed by React + Angular hosts. | 25 |
| **Total `shared/`**       |                                                                                          | **98** |

## `packages/react/`

| Package | Purpose | File budget |
|---|---|---|
| `@starui/react-runtime`        | `BrowserRuntime` (RuntimePort impl) + `HostWrapper` + `useHost` hook. The React-specific glue between `@starui/runtime-port` and React's component tree. | 5 |
| `@starui/react-ui`             | shadcn primitives bound to `@starui/design-system` tokens: Input, Select, Textarea, Button, Dialog, Popover, DropdownMenu, Tooltip, HoverCard, ContextMenu, AlertDialog, Sheet, Drawer, Menubar, plus `PortalContainerProvider` (N1). | 25 |
| `@starui/react-app`            | `<StarUIApp>` + `StarUIPlugin` contract + bootstrap chain (§1.4). | 5 |
| `@starui/react-markets-grid`   | The heavy grid widget: 9 modules (general-settings, column-templates, column-customization, calculated-columns, column-groups, conditional-styling, grid-state, toolbar-visibility, saved-filters), expression editor host, formatter dialog, settings sheet, profile manager UI. | 50 |
| `@starui/react-widgets`        | `Hosted*` wrappers (HostedMarketsGrid, HostedDataProviderEditor, HostedConfigBrowser, HostedWorkspaceSetup, HostedConfigEditorUI), admin tools (DataProviderEditor, ConfigBrowserPanel, WorkspaceSetup). | 15 |
| **Total `react/`**             |                                                                                          | **100** |

## `packages/angular/`

| Package | Purpose | File budget |
|---|---|---|
| (placeholder) | Empty for v2 rewrite scope. The directory and naming reserve the slot for Angular-parity work after React feature-completeness. | 0 |

## Totals

- **`shared/`: 98 files**
- **`react/`: 100 files**
- **`angular/`: 0 files (placeholder)**
- **Grand total: 198 files**

That's exactly the <200 target, with effectively zero slack.

### What's NOT counted in the file budget

- **Test files (`*.test.ts`, `*.test.tsx`)** — these scale with
  source. A reasonable test:source ratio is 1:2, so ~100
  additional test files. Tests are not in the 200 budget.
- **Build artifacts (`dist/`, `*.tsbuildinfo`)** — generated, not
  source.
- **Config files (`package.json`, `tsconfig.json`,
  `vitest.config.ts`, etc.)** — counted per-package; each
  package contributes ~3 config files. With 12 packages, that's
  ~36 config files. Not part of the 200 source budget.
- **The repurposed `configservice-old` HTML admin UI** — moves to
  `@starui/react-widgets/ConfigBrowserPanel` (already counted)
  or is dropped entirely.
- **Demo apps (`apps/demo-react`)** — outside `packages/`. Not in
  the source budget.

# Comparison with v1 (~1,200 files)

Where the file-count reduction comes from:

| v1 source | v2 plan | Reduction lever |
|---|---|---|
| 9 grid modules × ~12 files each = 108  | 9 modules × ~5 files each = 45 | Collapse `state.ts` + `transforms.ts` + `reducers.ts` per module into one file. |
| Dual `widgets-react` + `markets-grid` | Single `react-markets-grid` | Merge the (over-split) widget shell + the controller; remove the v1-era hosted-component chain. |
| 5 design-system source files + 5 adapter files × 4 frameworks = 25 | 8 files in `@starui/design-system` | One tokens file + one AG-Grid factory + per-framework preset, instead of per-package re-exports. |
| Dexie config service (~30 files) + dual provider | Single REST `ConfigClient` + single server | Already locked in §4 rewrite. |
| Per-package logger conventions (302 bare console calls) | One `createLogger` in `@starui/shared` | Already locked in §1.3. |
| `widget-sdk` + `BlotterGrid` + `SimpleBlotter` + multi-deep `HostedComponent` chain | Dropped | v1 legacy code already marked for deletion. |
| Angular packages (hosts, providers, widgets, tools — ~80 files) | Placeholder | Angular post-React-feature-freeze; not in v2 scope. |

# Migration from current v2 monorepo

The current `/Users/develop/staruiv2/` has 10 flat packages that
don't reflect the three-bucket split. Physical reorganization
required:

```
Current v2                       →  New layout
─────────────────────────────────────────────────────────────────────────
packages/app/                    →  packages/react/react-app/
packages/config/                 →  packages/shared/config-client/
                                    + packages/shared/config-server/ (new)
packages/core/                   →  packages/shared/shared/
                                    + packages/react/react-runtime/ (split)
packages/data/                   →  packages/shared/shared/ (merge)
packages/design-system/          →  packages/shared/design-system/
packages/grid/                   →  packages/react/react-markets-grid/
packages/openfin/                →  packages/shared/openfin/
packages/runtime/                →  packages/shared/runtime-port/
                                    + packages/react/react-runtime/ (split)
packages/types/                  →  packages/shared/types/
packages/widgets/                →  packages/react/react-widgets/
                                    + packages/react/react-ui/ (extract shadcn)
```

This is mechanical work; rerunning `scripts/migrate-from-v1.py` is
not — that script was designed for v1 → v2 transfer with the
old flat layout. A new migration script (`scripts/reorganize-v2.py`)
moves files into the three-bucket layout and rewrites imports.

The reorganization is a one-time PR that lands before any further
v2 feature work, so subsequent commits operate in the final
layout.

# Phases (incremental, each shippable in isolation)

1. **Phase 1 — Reorganize the v2 monorepo** to the three-bucket
   layout. Mechanical: move directories, rewrite imports, update
   `tsconfig.base.json` paths and Vite aliases. No new code.
2. **Phase 2 — Package `@starui/design-system`** by copying
   `/Users/develop/wfh/StaruI-design/tokens.css`,
   `palettes.css`, `aggrid-theme.js`, `primeng-preset.ts`,
   `primeng-tokens.css` into the package and wrapping with a
   typed API. Add the `SF_AG_THEME` factory typings. Wire shadcn
   variables to `--sf-*` palette tokens.
3. **Phase 3 — Strip `react-ui` from `widgets`** into its own
   package with the design-system bindings. Every shadcn
   primitive's `Content` reads `useResolvedPortalContainer()`
   from N1.
4. **Phase 4 — Rewrite `@starui/react-markets-grid`** consuming
   only `@starui/react-ui` primitives, only `--sf-*` tokens, and
   the single `SF_AG_THEME`. Lint enforcement (`@starui/no-native-form-controls`,
   `@starui/no-inline-style-tokens`) lands with this phase.
5. **Phase 5 — Build `@starui/config-server`** per
   `./config-server-design.md` (already documented). 5 sub-phases
   in that doc.
6. **Phase 6 — Hosted wrappers + admin tools** in
   `@starui/react-widgets`, dropping the v1-era
   multi-deep-`HostedComponent` chain and inlining what's needed
   from the v1 widget-sdk.

Each phase is a tight PR. The file-count target is verified at
the end of Phase 6.

# Open questions

1. **Should `@starui/react-ui` be a separate package or live
   inside `@starui/react-app`?** Separate is cleaner — the shadcn
   bindings are stable while `react-app` evolves. Tentatively
   separate.
2. **Where does the dock V2/V3 renderer live?** Today the spec
   says `@starui/openfin` (in `shared/`). The renderers are
   vanilla TS — they don't depend on React. So shared/openfin is
   correct. The React glue (passing the dock entries through
   plugin context) lives in `@starui/react-app`.
3. **Is `@starui/shared` too big at 25 files?** Possibly. If it
   grows beyond 35, split into `@starui/shared-utils` (the small
   helpers) and `@starui/shared-engine` (the expression engine).
   Defer until size forces it.

---

*Authored 2026-05-19. Changes to the package map or budget
require a docs PR that also updates `PUBLIC_API_SPEC.md` §1.5
and §15 #14.*
