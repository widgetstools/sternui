# StarGrid Platform

Greenfield successor to the StarUI monorepo's package graph — **MarketsGrid as
the product**, **host ports as the integration surface**.

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | `@stargrid/types`, `@stargrid/host`, `@stargrid/host-browser` | **Done** |
| 2 | `@stargrid/engine` (port of `@starui/core`) | **Done** |
| 3 | `@stargrid/grid` | **Done** |
| 4 | `@stargrid/design-system` + `@stargrid/ui` | **Done** |
| 5 | Host ports + `host` on MarketsGrid | **Done** |
| 6 | `@stargrid/app` + demo + parity gate | **Done** |
| 7 | Deferred: widgets, openfin-platform, config-browser, e2e | **Done** |

Legacy `@starui/*` packages in the parent monorepo remain read-only reference
until remaining parity items (config-editor, workspace-setup) land.

## Quick start

```bash
cd grid-platform
npm install
npm run typecheck
npm run build
npm run test
npm run e2e          # Playwright vs demo on :5190
npm run dev:demo     # http://localhost:5190
```

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Parity gate](./docs/PARITY.md)
- [Design spec](../docs/superpowers/specs/2026-05-19-grid-platform-design.md)

## Package map

```
@stargrid/types              Foundation types
@stargrid/host               Port interfaces + GridHostContext
@stargrid/host-browser       Browser RuntimePort
@stargrid/engine             Vanilla grid platform
@stargrid/design-system      Tokens, CSS, AG/shadcn adapters
@stargrid/ui                 shadcn/Radix primitives
@stargrid/grid               MarketsGrid + customizer
@stargrid/host-config        ConfigManager + profile storage
@stargrid/host-data          SharedWorker data services
@stargrid/host-data-react    DataServicesProvider + hooks
@stargrid/host-openfin       OpenFin RuntimePort
@stargrid/openfin-platform   Workspace shell + ./config + ./plugin
@stargrid/widgets            HostedMarketsGrid + MarketsGridContainer
@stargrid/config-browser     Config browser dev tool
@stargrid/app                StarGridApp declarative root
```

## Demo app

```bash
npm run dev:demo   # http://localhost:5190
```

See [`apps/demo-react/README.md`](./apps/demo-react/README.md).
