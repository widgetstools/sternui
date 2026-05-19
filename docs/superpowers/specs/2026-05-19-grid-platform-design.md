# StarGrid Platform — Design Specification

> **Status:** Approved (Option A — greenfield workspace with surgical port)  
> **Date:** 2026-05-19  
> **Legacy reference:** `../ARCHITECTURE_PROPOSAL.md`, `packages/` in parent monorepo

## Goal

Build **`grid-platform/`** — a clean, modular successor to the StarUI package
graph, anchored on **MarketsGrid as the product** and **host ports as the
integration surface**. Any framework (React first, Angular later) consumes
the grid through small, optional adapters; OpenFin and ConfigService are
plugins, not structural dependencies.

## Namespace

**`@stargrid/*`** — parallel to legacy `@starui/*` during migration. Apps
may depend on both during the transition window; no tarball name collisions.

## Package layout (target ~12 packages)

```
grid-platform/packages/
├── types/              @stargrid/types           Shared shapes (identity, theme, profiles)
├── engine/             @stargrid/engine          Vanilla TS: GridPlatform, modules, expressions
├── host/               @stargrid/host            Port interfaces + GridHostContext
├── host-browser/       @stargrid/host-browser    BrowserRuntimePort + defaults
├── host-openfin/       @stargrid/host-openfin    OpenFin plugin (optional)
├── host-config/        @stargrid/host-config     ConfigManager port + Dexie/REST (phase 5)
├── host-data/          @stargrid/host-data       SharedWorker DataPort (phase 5)
├── design-system/      @stargrid/design-system   Tokens, CSS, AG/shadcn adapters (phase 4)
├── ui/                 @stargrid/ui              shadcn primitives (phase 4)
├── grid/               @stargrid/grid            MarketsGrid + customizer (merged, phase 3)
├── grid-react/         @stargrid/grid-react      React bindings + HostedMarketsGrid (phase 3)
└── app/                @stargrid/app             Declarative StarGridApp root (phase 6)
```

## Host port model

All optional integrations flow through **`GridHostContext`**:

```ts
interface GridHostContext {
  runtime: RuntimePort;           // required — browser or openfin
  storage: StoragePort;           // required — localStorage default
  data?: DataPort;                // optional — live feeds via SharedWorker
  config?: ConfigPort;            // optional — cross-instance profile sync
}
```

### RuntimePort

Identity, theme, surfaces (popout/modal), window lifecycle, workspace-save
hook. **No OpenFin types in engine or grid.**

### StoragePort

Profile bundle persistence. Default: `localStorage`. Optional:
ConfigManager-backed adapter.

### DataPort

Named dataset subscription + `AppDataLookup` for `{{provider.key}}` resolution.
Grid works without it (static `rowData`).

### ConfigPort

App registry, auth tables, REST sync. Grid works without it.

## Principles

1. **Grid is the product** — one merged `@stargrid/grid`, not widget + customizer split.
2. **Host is optional** — sensible defaults; full platform is opt-in.
3. **Ports over providers** — one context object, not four nested React providers.
4. **Plugins over layers** — OpenFin loads only when `@stargrid/host-openfin` is imported.
5. **Port proven code** — migrate from legacy `packages/`, do not re-prove behavior.
6. **Parity checklist** — migrate against `docs/FEATURE_INVENTORY.md`, not aesthetics.

## Migration phases

| Phase | Deliverable | Source |
|---|---|---|
| **1** | Scaffold + `@stargrid/types` + `@stargrid/host` + `@stargrid/host-browser` | New + port runtime-port/browser |
| **2** | `@stargrid/engine` (core sans OpenFin leakage) | `packages/shared/core` |
| **3** | `@stargrid/grid` + `@stargrid/grid-react` | `markets-grid` + `grid-react` merged |
| **4** | `@stargrid/design-system` + `@stargrid/ui` | foundation packages |
| **5** | `@stargrid/host-data` + `@stargrid/host-config` + `@stargrid/host-openfin` | services + openfin-platform |
| **6** | `@stargrid/app` + demo + parity gate | app-shell + Hosted* pattern |

## Non-goals (phase 1)

- Angular packages (defer until React path is green)
- Full grid port (phase 3)
- Tarball / propagate pipeline (add when first consumer app lands)
- Deleting legacy `packages/` (frozen reference until parity gate passes)

## Success criteria

Phase 1 complete when:

- `grid-platform/` builds, typechecks, and tests independently
- `@stargrid/host-browser` passes ported identity + theme tests
- Port interfaces documented and stable enough for phase 2 engine work

Full migration complete when:

- Demo app mounts MarketsGrid with zero legacy `@starui/*` imports
- FEATURE_INVENTORY parity checklist ≥ 95% green
- Legacy monorepo marked read-only
