# StarUI Platform

Greenfield successor to the StarUI monorepo's package graph — **MarketsGrid as
the product**, **host ports as the integration surface**.

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | `@starui/types`, `@starui/host`, `@starui/host-browser` | **Done** |
| 2 | `@starui/engine` (port of `@starui/core`) | **Done** |
| 3 | `@starui/grid` | **Done** |
| 4 | `@starui/design-system` + `@starui/ui` | **Done** |
| 5 | Host ports + `host` on MarketsGrid | **Done** |
| 6 | `@starui/app` + demo + parity gate | **Done** |
| 7 | Deferred: widgets, openfin-platform, config-browser, e2e | **Done** |

Legacy root `packages/` has been removed; this workspace is the sole active codebase.

## Quick start

```bash
cd starui-platform
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
- [Root architecture guide](../docs/ARCHITECTURE_GUIDE.md)

## Package layout

```
packages/
├── shared/                  # Vanilla TS — framework-agnostic
│   ├── types/
│   ├── shared-types/        # @starui/shared-types (foundation)
│   ├── design-system/       # @starui/design-system (tokens, themes)
│   ├── host/
│   ├── host-browser/
│   ├── host-openfin/
│   ├── host-config/
│   ├── host-data/
│   ├── engine/
│   └── openfin-platform/
└── react/                   # React bindings + product UI
    ├── ui/                  # @starui/ui (shadcn primitives)
    ├── grid/
    ├── app/
    ├── widgets-react/
    ├── widget-sdk/
    ├── host-data-react/
    └── config-browser/
└── angular/                 # Angular twins of react/ (scaffold — day 2)
    ├── grid/                → @starui/grid-angular
    ├── app/                 → @starui/app-angular
    ├── widgets/             → @starui/widgets-angular
    ├── host-data-angular/   → @starui/host-data-angular
    └── config-browser/      → @starui/config-browser-angular
```

## Package map

```
@starui/types              Foundation types
@starui/host               Port interfaces + GridHostContext
@starui/host-browser       Browser RuntimePort
@starui/engine             Vanilla grid platform
@starui/design-system      Tokens, CSS, AG/shadcn adapters
@starui/ui                 shadcn/Radix primitives
@starui/grid               MarketsGrid + customizer
@starui/host-config        ConfigManager + profile storage
@starui/host-data          SharedWorker data services
@starui/host-data-react    DataServicesProvider + hooks
@starui/host-openfin       OpenFin RuntimePort
@starui/openfin-platform   Workspace shell + ./config + ./plugin
@starui/widgets-react     HostedMarketsGrid + MarketsGridContainer + blotter
@starui/config-browser     Config browser dev tool
@starui/app                StarGridApp declarative root
```

## Demo app

```bash
npm run dev:demo   # http://localhost:5190
```

See [`apps/demo-react/README.md`](./apps/demo-react/README.md).
