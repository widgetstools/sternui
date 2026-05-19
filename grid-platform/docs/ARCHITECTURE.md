# StarGrid Architecture

See also: [design spec](../../docs/superpowers/specs/2026-05-19-grid-platform-design.md)

## Layer model

```
┌─────────────────────────────────────────┐
│  Apps (phase 6)                         │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  @stargrid/grid-react + @stargrid/app  │  React bindings, Hosted*
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  @stargrid/grid                         │  MarketsGrid product
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  @stargrid/engine                       │  Vanilla grid platform
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  @stargrid/host + adapters              │  Ports + browser/openfin
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  @stargrid/types                        │  Foundation types
└─────────────────────────────────────────┘
```

## Host ports

| Port | Required | Default |
|---|---|---|
| `RuntimePort` | Yes | `@stargrid/host-browser` |
| `StoragePort` | Yes | localStorage (phase 3) |
| `DataPort` | No | — |
| `ConfigPort` | No | — |

## Import rules

- `engine` must not import from `grid`, `grid-react`, or `app`
- `grid` must not import `@openfin/*` — OpenFin lives in `host-openfin`
- `host-openfin` is optional; browser-only apps never import it
- Framework adapters (`grid-react`, future `grid-angular`) sit above `grid`

## Phase 1 packages (shipped)

- `@stargrid/types`
- `@stargrid/host`
- `@stargrid/host-browser`

## Phase 2 packages (shipped)

- `@stargrid/engine` — vanilla grid platform (ported from `@starui/core`, OpenFin shim removed)

## Phase 3 packages (shipped)

- `@stargrid/grid` — merged MarketsGrid + customizer (`widget/`, `customizer/`, `runtime/openFin`)
