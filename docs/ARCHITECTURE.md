# StarUI Platform Architecture

See also: root [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) and [`docs/ARCHITECTURE_GUIDE.md`](../../docs/ARCHITECTURE_GUIDE.md).

## Layer model

```
┌─────────────────────────────────────────┐
│  Apps (phase 6)                         │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  @starui/grid-react + @starui/app  │  React bindings, Hosted*
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  @starui/grid                         │  MarketsGrid product
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  @starui/engine                       │  Vanilla grid platform
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  @starui/host + adapters              │  Ports + browser/openfin
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  @starui/types                        │  Foundation types
└─────────────────────────────────────────┘
```

## Host ports

| Port | Required | Default |
|---|---|---|
| `RuntimePort` | Yes | `@starui/host-browser` |
| `StoragePort` | Yes | localStorage (phase 3) |
| `DataPort` | No | — |
| `ConfigPort` | No | — |

## Folder layout

Ten architecture buckets under `packages/` — see
[`docs/PACKAGE_ORGANIZATION.md`](./PACKAGE_ORGANIZATION.md):

```
packages/design-system/   — (1) tokens, icons
packages/angular-ui/      — (2) PrimeNG controls (scaffold)
packages/react-ui/        — (3) shadcn primitives
packages/angular-grid/    — (4) @starui/grid-angular
packages/react-grid/      — (5) @starui/grid
packages/data/            — (6) host-data, host-config
packages/openfin/         — (7) host-openfin, openfin-platform
packages/angular-core/    — (8) app, widgets, config-browser
packages/react-core/      — (9) app, widgets-react, tools
packages/shared/          — (10) engine, host, types, widget contract
```

## Import rules

- `engine` must not import from `grid`, `grid-react`, or `app`
- `grid` must not import `@openfin/*` — OpenFin lives in `host-openfin`
- `host-openfin` is optional; browser-only apps never import it
- Framework adapters (`grid-react`, future `grid-angular`) sit above `grid`

## Phase 1 packages (shipped)

- `@starui/types`
- `@starui/host`
- `@starui/host-browser`

## Phase 2 packages (shipped)

- `@starui/engine` — vanilla grid platform (ported from `@starui/core`, OpenFin shim removed)

## Phase 3 packages (shipped)

- `@starui/grid` — merged MarketsGrid + customizer (`widget/`, `customizer/`, `runtime/openFin`)

## Phase 4 packages (shipped)

- `@starui/design-system` — tokens, CSS, framework adapters
- `@starui/ui` — shadcn/Radix primitives
