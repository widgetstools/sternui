# StarGrid Platform — Parity Gate

> Cross-reference against legacy [`docs/FEATURE_INVENTORY.md`](../../docs/FEATURE_INVENTORY.md).

**Last verified:** 2026-05-19 · branch `refactor/stargrid-engine-phase2`

## Summary

| Area | Legacy package | StarGrid package | Status |
|---|---|---|---|
| Grid platform core | `@starui/core` | `@stargrid/engine` | **Ported** |
| MarketsGrid widget | `@starui/markets-grid` | `@stargrid/grid/widget` | **Ported** |
| Grid customizer | `@starui/grid-react` | `@stargrid/grid/customizer` | **Ported** (merged) |
| Design tokens + CSS | `@starui/design-system` | `@stargrid/design-system` | **Ported** |
| shadcn primitives | `@starui/ui` | `@stargrid/ui` | **Ported** |
| Runtime port | `@starui/runtime-port` + browser | `@stargrid/host` + `@stargrid/host-browser` | **Ported** |
| Config persistence | `@starui/config-service` | `@stargrid/host-config` | **Ported** |
| Data services | `@starui/data-services` | `@stargrid/host-data` | **Ported** |
| Data services React | `@starui/data-services-react` | `@stargrid/host-data-react` | **Ported** |
| OpenFin runtime | `@starui/runtime-openfin` | `@stargrid/host-openfin` | **Ported** |
| App shell | `@starui/app-shell-react` + providers | `@stargrid/app` (`StarGridApp`) | **Ported** |
| Demo app | `apps/demo-react` | `grid-platform/apps/demo-react` | **Ported** (zero `@starui/*`) |
| OpenFin workspace shell | `@starui/openfin-platform` | `@stargrid/openfin-platform` | **Ported** |
| Hosted wrappers | `@starui/widgets-react/hosted` | `@stargrid/widgets/hosted` | **Ported** |
| Config browser tool | `@starui/config-browser-react` | `@stargrid/config-browser` | **Ported** |
| Data provider editor | `@starui/config-editor-ui` | — | **Deferred** |
| Workspace setup | `@starui/workspace-setup-react` | — | **Deferred** |
| Angular parity | `@starui/widgets-angular` | — | **Deferred** |
| E2E suite | root `e2e/` (legacy demo) | `grid-platform/apps/demo-react/e2e` | **Ported** (10 core specs) |

## Automated verification (grid-platform workspace)

```bash
cd grid-platform
npm install
npm run typecheck   # 16 packages + demo
npm run build
npm run test        # engine · grid 386 · host-config 102 · host-data 123 · openfin-platform 67 · app …
npm run e2e         # 10 core MarketsGrid specs vs @stargrid/demo-react on :5190
```

## Product feature parity (MarketsGrid)

- [x] Module pipeline (general-settings, column-customization, conditional-styling, …)
- [x] ProfileManager + storage adapters (memory, localStorage bundle, config-service)
- [x] Formatting toolbar + global header style
- [x] Settings sheet + column/group/calculated panels
- [x] Expression engine + security policy
- [x] AG Grid 35 theming via design-system adapters
- [x] `host: GridHostContext` wiring
- [x] OpenFin popout helpers (`@stargrid/grid/runtime/openfin`)
- [x] `HostedMarketsGrid` + `MarketsGridContainer` (`@stargrid/widgets`)
- [x] OpenFin workspace shell + config subpath (`@stargrid/openfin-platform`)
- [x] Config browser dev tool (`@stargrid/config-browser`)

## Gate criteria

- [x] `@stargrid/app` ships `<StarGridApp>` + `useStarGridHost()` + plugin hook
- [x] Demo app mounts MarketsGrid with **zero** `@starui/*` imports
- [x] Full workspace build/typecheck green
- [x] E2E core suite ported (10 specs; ~25/28 passing on first run — token + toolbar label drift)
- [x] OpenFin reference shell (`@stargrid/openfin-platform` + `openFinPlatformPlugin`)

**Estimated MarketsGrid-path parity:** ~95%
**Full platform parity (config-editor, workspace-setup, Angular):** ~75%

## OpenFin plugin usage

```tsx
import { StarGridApp } from '@stargrid/app';
import { openFinPlatformPlugin } from '@stargrid/openfin-platform/plugin';

<StarGridApp appId="my-app" plugins={[openFinPlatformPlugin]}>
  …
</StarGridApp>
```

Browser-only dev: plugin no-ops when `fin` is undefined.

## E2E notes

Core specs ported from legacy root `e2e/`:

- `v2-settings-panels`, `v2-formatting-toolbar`, `v2-filters-toolbar`, `v2-general-settings`
- `v2-column-customization`, `v2-conditional-styling`, `v2-calculated-columns`, `v2-column-groups`
- `v2-autosave`, `design-system-theme-switch`

Deferred (need multi-grid / fixture views / second demo):

- Profile isolation, nested fixtures, popout, hosted-markets-grid, template-create-apply

## Remaining work

1. Port `@starui/config-editor-ui` → `@stargrid/config-editor-ui`
2. Port `@starui/workspace-setup-react`
3. Port remaining E2E specs once demo supports fixture routes
4. Port `@starui/widgets-react/v2/provider-editor` (DataProviderEditor)
5. Angular parity (`@starui/widgets-angular`)
