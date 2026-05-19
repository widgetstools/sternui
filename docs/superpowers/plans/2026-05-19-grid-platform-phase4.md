# StarGrid Platform — Phase 4 Implementation Plan

> **Branch:** `refactor/stargrid-engine-phase2`  
> **Status:** Complete

**Goal:** Port `@starui/design-system` + `@starui/ui` → `@stargrid/design-system` + `@stargrid/ui`; remove legacy `file:` bridge from `@stargrid/grid`.

---

## Completed

- [x] Copied `packages/shared/foundation/design-system` → `grid-platform/packages/design-system`
- [x] Copied `packages/react/ui` → `grid-platform/packages/ui`
- [x] Renamed packages to `@stargrid/design-system`, `@stargrid/ui`
- [x] Aligned `applyTheme()` with `@stargrid/types` `THEME_STORAGE_KEY` (`stargrid:theme`)
- [x] Rewired `@stargrid/grid` imports off `@starui/*`
- [x] Fixed vitest alias resolution + React dedupe (378/386 grid tests passing)

---

## Phase 5 preview

- `@stargrid/host-data` — port SharedWorker / DataServices
- `@stargrid/host-config` — port ConfigManager
- `@stargrid/host-openfin` — OpenFin plugin
- Wire `host: GridHostContext` on `MarketsGrid`
