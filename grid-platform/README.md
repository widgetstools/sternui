# StarGrid Platform

Greenfield successor to the StarUI monorepo's package graph — **MarketsGrid as
the product**, **host ports as the integration surface**.

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | `@stargrid/types`, `@stargrid/host`, `@stargrid/host-browser` | **Done** |
| 2 | `@stargrid/engine` (port of `@starui/core`) | **Done** |
| 3 | `@stargrid/grid` + `@stargrid/grid-react` | **Done** (292/319 tests; ui bridge pending phase 4) |
| 4 | `@stargrid/design-system` + `@stargrid/ui` | Planned |
| 5 | `@stargrid/host-data`, `@stargrid/host-config`, `@stargrid/host-openfin` | Planned |
| 6 | `@stargrid/app` + demo + parity gate | Planned |

Legacy `@starui/*` packages in the parent monorepo remain the reference
implementation until the parity checklist passes.

## Quick start

```bash
cd grid-platform
npm install
npm run typecheck
npm run build
npm run test
```

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Design spec](../docs/superpowers/specs/2026-05-19-grid-platform-design.md)
- [Phase 1 plan](../docs/superpowers/plans/2026-05-19-grid-platform-phase1.md)

## Package map

```
@stargrid/types         Foundation types (identity, theme, surfaces)
@stargrid/host          Port interfaces + GridHostContext
@stargrid/host-browser  Browser RuntimePort implementation
@stargrid/engine        (stub) Vanilla grid engine
@stargrid/grid          (stub) MarketsGrid product surface
@stargrid/host-openfin  (stub) OpenFin plugin
```
