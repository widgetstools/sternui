# Angular Core (bucket 8)

Angular product shells and tools. Same feature set as React Core (bucket 9) —
implement on the React surface first, port here next.

## Package parity

| React (`packages/react-core/`) | Angular (`packages/angular-core/`) | Package name |
|---|---|---|
| `app/` | `app/` | `@starui/app-angular` |
| `widgets-react/` | `widgets/` | `@starui/widgets-angular` |
| `config-browser/` | `config-browser/` | `@starui/config-browser-angular` |

Grid lives in `packages/angular-grid/`; data adapters in `packages/data/`.

## Import rules

- Must **not** import from `packages/react-*`.
- Vanilla core: `@starui/engine`, `@starui/host`, etc. (`packages/shared/`).
- Data: `@starui/host-data`, `@starui/host-config` (`packages/data/`).
- UI: **PrimeNG** + `@starui/tokens-primeng` (scaffold under `packages/angular-ui/`).
- Filenames: Angular Style Guide kebab-case + role suffix (`*.component.ts`, `*.service.ts`).

## Legacy reference (parent monorepo)

Pre-starui-platform Angular code to mine when porting:

- `packages/angular/widgets/widgets-angular/`
- `packages/angular/tools/config-browser-angular/`
- `packages/angular/providers/config-service-angular/`
- `packages/angular/providers/data-services-angular/`
- `packages/angular/hosts/host-wrapper-angular/`

See [`docs/PACKAGE_ORGANIZATION.md`](../../docs/PACKAGE_ORGANIZATION.md) for the full ten-bucket map.
