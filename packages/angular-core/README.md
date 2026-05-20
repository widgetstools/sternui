# Angular Core (bucket 8)

Angular product shells and tools. **Shipped as one bundled tarball**
(`@starui/angular-core`) containing:

| Subfolder | Workspace package | Import subpath |
|---|---|---|
| `app/` | `@starui/app-angular` | `@starui/angular-core/app` |
| `widgets/` | `@starui/widgets-angular` | `@starui/angular-core/widgets` |
| `config-browser/` | `@starui/config-browser-angular` | `@starui/angular-core/config-browser` |

Grid lives in `packages/angular-grid/` (`@starui/grid-angular`, separate tarball).
Data adapters in `packages/data/`.

## Tarball install

```json
"@starui/angular-core": "file:../libs/starui-angular-core-0.1.0-<sha8>.tgz"
```

See `libs/manifest.json` for the current hashed filename.

## Import rules

- Must **not** import from `packages/react-*`.
- Vanilla core: `@starui/engine`, `@starui/host`, etc. (`packages/shared/`).
- Data: `@starui/host-data`, `@starui/host-config` (`packages/data/`).
- UI: **PrimeNG** + `@starui/tokens-primeng` (scaffold under `packages/angular-ui/`).
- Filenames: Angular Style Guide kebab-case + role suffix (`*.component.ts`, `*.service.ts`).

## Legacy reference (parent monorepo)

Pre-marketsui-platform Angular code to mine when porting:

- `packages/angular/widgets/widgets-angular/`
- `packages/angular/tools/config-browser-angular/`
- `packages/angular/providers/config-service-angular/`
- `packages/angular/providers/data-services-angular/`
- `packages/angular/hosts/host-wrapper-angular/`

See [`docs/PACKAGE_ORGANIZATION.md`](../docs/PACKAGE_ORGANIZATION.md) for the full ten-bucket map.
