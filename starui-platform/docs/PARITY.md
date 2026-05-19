# StarUI Platform — Parity Gate

> Parity gate for the StarUI platform migration (legacy `@starui/*` → `starui-platform`).

**Last verified:** 2026-05-19 · branch `refactor/starui-engine-phase2`

## Summary

| Area | Legacy package | StarGrid package | Status |
|---|---|---|---|
| Grid platform core | `@starui/core` | `@starui/engine` | **Ported** |
| MarketsGrid widget | `@starui/markets-grid` | `@starui/grid/widget` | **Ported** |
| Grid customizer | `@starui/grid-react` | `@starui/grid/customizer` | **Ported** (merged) |
| Design tokens + CSS | `@starui/design-system` | `@starui/design-system` (`packages/design-system/design-system`) | **Ported** — in-repo |
| shadcn primitives | `@starui/ui` | `@starui/ui` (`packages/react-ui/ui`) | **Ported** — in-repo |
| Shared types | `@starui/shared-types` | `@starui/shared-types` (`packages/shared/shared-types`) | **Ported** — in-repo |
| Runtime port | `@starui/runtime-port` + browser | `@starui/host` + `@starui/host-browser` | **Ported** |
| Config persistence | `@starui/config-service` | `@starui/host-config` | **Ported** |
| Data services | `@starui/data-services` | `@starui/host-data` | **Ported** |
| Data services React | `@starui/data-services-react` | `@starui/host-data-react` | **Ported** |
| OpenFin runtime | `@starui/runtime-openfin` | `@starui/host-openfin` | **Ported** |
| App shell | `@starui/app-shell-react` + providers | `@starui/app` (`StarGridApp`) | **Ported** |
| Demo app | `apps/demo-react` | `starui-platform/apps/demo-react` | **Ported** (zero `@starui/*`) |
| OpenFin workspace shell | `@starui/openfin-platform` | `@starui/openfin-platform` | **Ported** |
| Widget contract (agnostic) | (in `@starui/widget-sdk`) | `@starui/widget` (`packages/shared/widget`) | **Ported** |
| Widget browser adapter | (in `@starui/widget-sdk`) | `@starui/widget-browser` | **Ported** |
| Widget SDK (React) | `@starui/widget-sdk` | `@starui/widget-sdk` (`packages/react-core/widget-sdk`) | **Ported** — React-only |
| Config browser tool | `@starui/config-browser-react` | `@starui/config-browser` | **Ported** |
| Data provider editor | `@starui/config-editor-ui` | — | **Deferred** |
| Workspace setup | `@starui/workspace-setup-react` | — | **Deferred** |
| Angular parity | `@starui/widgets-angular` | — | **Deferred** |
| E2E suite | root `e2e/` (legacy demo) | `starui-platform/apps/demo-react/e2e` | **Ported** (10 core specs) |

## Automated verification (starui-platform workspace)

```bash
cd starui-platform
npm install
npm run typecheck   # 16 packages + demo
npm run build
npm run test        # engine · grid 386 · host-config 102 · host-data 123 · openfin-platform 67 · app …
npm run e2e         # 10 core MarketsGrid specs vs @starui/demo-react on :5190
```

## Product feature parity (MarketsGrid)

- [x] Module pipeline (general-settings, column-customization, conditional-styling, …)
- [x] ProfileManager + storage adapters (memory, localStorage bundle, config-service)
- [x] Formatting toolbar + global header style
- [x] Settings sheet + column/group/calculated panels
- [x] Expression engine + security policy
- [x] AG Grid 35 theming via design-system adapters
- [x] `host: GridHostContext` wiring
- [x] OpenFin popout helpers (`@starui/grid/runtime/openfin`)
- [x] `HostedMarketsGrid` + `MarketsGridContainer` (`@starui/widgets-react`)
- [x] OpenFin workspace shell + config subpath (`@starui/openfin-platform`)
- [x] Config browser dev tool (`@starui/config-browser`)

## Gate criteria

- [x] `@starui/app` ships `<StarGridApp>` + `useStarGridHost()` + plugin hook
- [x] Demo app mounts MarketsGrid with **zero** `@starui/*` imports
- [x] Full workspace build/typecheck green
- [x] E2E core suite ported (10 specs; ~25/28 passing on first run — token + toolbar label drift)
- [x] OpenFin reference shell (`@starui/openfin-platform` + `openFinPlatformPlugin`)

**Estimated MarketsGrid-path parity:** ~95%
**Full platform parity (config-editor, workspace-setup, Angular):** ~75%

## OpenFin plugin usage

```tsx
import { StarGridApp } from '@starui/app';
import { openFinPlatformPlugin } from '@starui/openfin-platform/plugin';

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

1. Port `@starui/config-editor-ui` → `@starui/config-editor-ui`
2. Port `@starui/workspace-setup-react`
3. Port remaining E2E specs once demo supports fixture routes
4. Port `@starui/widgets-react/v2/provider-editor` (DataProviderEditor)
5. Angular parity (`@starui/widgets-angular`)
