# Angular packages (`@starui/*-angular`)

Angular twins of the React packages under `packages/react/`. Same feature set,
same layer boundaries — implement on the React surface first, port here next.

## Package parity

| React (`packages/react/`) | Angular (`packages/angular/`) | Package name |
|---|---|---|
| `grid/` | `grid/` | `@starui/grid-angular` |
| `app/` | `app/` | `@starui/app-angular` |
| `widgets/` | `widgets/` | `@starui/widgets-angular` |
| `host-data-react/` | `host-data-angular/` | `@starui/host-data-angular` |
| `config-browser/` | `config-browser/` | `@starui/config-browser-angular` |

## Import rules

- Must **not** import from `packages/react/*`.
- Vanilla core: `@starui/engine`, `@starui/host`, `@starui/host-config`, etc. (`packages/shared/`).
- UI: **PrimeNG** + `@starui/tokens-primeng` (not yet vendored — add under `packages/shared/` when Angular work starts).
- Filenames: Angular Style Guide kebab-case + role suffix (`*.component.ts`, `*.service.ts`).

## Legacy reference (parent monorepo)

Pre-starui-platform Angular code to mine when porting:

- `packages/angular/widgets/widgets-angular/`
- `packages/angular/tools/config-browser-angular/`
- `packages/angular/providers/config-service-angular/`
- `packages/angular/providers/data-services-angular/`
- `packages/angular/hosts/host-wrapper-angular/`
