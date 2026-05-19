# StarGrid Platform — Phase 3 Implementation Plan

> **Branch:** `refactor/stargrid-engine-phase2`  
> **Status:** Complete (scaffold)

**Goal:** Merge `@starui/markets-grid` + `@starui/grid-react` → `@stargrid/grid`.

---

## Completed

- [x] Copied `grid-react/src` → `packages/grid/src/customizer/`
- [x] Copied `markets-grid/src` → `packages/grid/src/widget/`
- [x] Moved OpenFin shim to `packages/grid/src/runtime/openFin.ts`
- [x] Bulk-rewired `@starui/core` → `@stargrid/engine`, `@starui/grid-react` → `@stargrid/grid/customizer`
- [x] Added `getPathAccessor` / `getPathSetter` to `@stargrid/types`
- [x] Bridged `@starui/ui` + `@starui/design-system` via `file:` deps (until Phase 4)
- [x] Production typecheck clean (tests excluded from `tsc`)
- [x] **292 / 319** grid tests passing (27 failures — Radix/ui context in test harness; fix in Phase 4)

---

## Phase 3 follow-ups

- [ ] Wire `host: GridHostContext` on `MarketsGrid`
- [ ] Fix remaining test harness failures after ui/design-system port
- [ ] Deduplicate `customizer/ui/shadcn/` → `@starui/ui`

## Phase 4 preview

Port `@starui/design-system` + `@starui/ui` → `@stargrid/design-system` + `@stargrid/ui`
