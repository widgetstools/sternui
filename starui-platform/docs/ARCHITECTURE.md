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

```
packages/shared/   — vanilla TS (types, shared-types, design-system, host, engine, host-*)
packages/react/    — React (ui, grid, app, widgets, host-data-react, config-browser)
packages/angular/  — Angular twins of react/ (grid, app, widgets, host-data-angular, config-browser)
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
