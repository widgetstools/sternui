# StarGrid Platform — Phase 2 Implementation Plan

> **Branch:** `refactor/stargrid-engine-phase2`  
> **Status:** Complete

**Goal:** Port `@starui/core` → `@stargrid/engine` with OpenFin utilities removed from the vanilla layer.

---

## Completed

- [x] Created branch `refactor/stargrid-engine-phase2`
- [x] Copied `packages/shared/core/src` → `grid-platform/packages/engine/src`
- [x] Removed `utils/openFin.ts` and `openFin.test.ts`
- [x] Removed OpenFin exports from engine barrel
- [x] Added `rowPath.ts` to `@stargrid/types` (`getValueByPath`, `composeRowId`)
- [x] Rewired engine imports to `@stargrid/types`
- [x] Added package.json, tsconfig, vite, vitest configs
- [x] All engine unit tests passing

---

## Phase 3 preview

1. Merge `markets-grid` + `grid-react` → `@stargrid/grid`
2. Re-introduce `openFinWindowOpener` in grid layer or `@stargrid/host-openfin`
3. Wire `host: GridHostContext` prop on MarketsGrid
