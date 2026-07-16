# `@starui/ssrm-grid` package (CustomSSRMGrid) — Design

**Date:** 2026-07-15  
**Status:** Phase 1 complete (Custom-only; Perspective follow-up pending)  
**Branch / worktree:** `feat/marketsgrid-ssrm-dual-engine`  
**Repos:** `/Users/develop/wfh/ssrmgrid` → starui monorepo  
**AG Grid:** 36.x

## Goal

Make **CustomSSRMGrid** (main-thread RowMirror SSRM) a first-class StarUI framework package so MarketsGrid and other consumers no longer depend on a fragile out-of-repo `file:ssrmgrid` link.

Phase 1 ships **Custom only**. Perspective-backed `SSRMGrid` stays in the external `ssrmgrid` repo until a follow-up (`@starui/ssrm-grid/perspective`).

## Non-goals (Phase 1)

- Moving Perspective worker / WASM / `SSRMGrid.tsx` into starui.
- Deleting or archiving `/Users/develop/wfh/ssrmgrid` (keep as sandbox until Perspective follow-up).
- Folding SSRM into `@starui/grid` itself (keep engine package separate from MarketsGrid chrome).
- Changing HostedMarketsGrid / STOMP provider APIs (already wired; stay as-is).
- Making SSRM the MarketsGrid default (still `useSSRM` opt-in).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Package layout | `packages/react-grid/ssrm-grid` → `@starui/ssrm-grid` | Matches `packages/react-grid/*`; not `@starui/engine` (no React AG shell there) |
| Move method | One-time **copy** of modules + tests | Private sandbox repo; avoid git-subtree noise |
| Phase 1 scope | **Custom only** | Production path today; avoid WASM packaging in the first PR |
| Perspective during Phase 1 | Keep temporary `ssrmgrid` (or `file:`) dep **only** for `SSRMGrid` / `ssrmEngine="perspective"` | Surface API unchanged; Custom becomes framework-owned |
| Public default entry | No `@finos/perspective` | Default import graph stays lean |

## Current state

- `@starui/grid` depends on `"ssrmgrid": "file:../../../../ssrmgrid"`.
- Façade: `packages/react-grid/grid/src/engine/ssrmgrid-entry.ts`.
- Mount: `SsrmMarketsGridSurface.tsx` — default `CustomSSRMGrid`; `ssrmEngine="perspective"` → `SSRMGrid`.
- Apps (`star-demo`, `markets-grid-lab`) import SSRM only via `@starui/grid` / widgets-react.

## Target architecture

```text
@starui/ssrm-grid          (NEW — Phase 1)
  CustomSSRMGrid
  createCustomEngine / RowMirror
  SSRMColDef, filters, block cache, dirty helpers
  trafficLight / shareOfTotal / getGroupLeafRows / compile helpers

@starui/grid
  ssrmgrid-entry.ts
    Custom*  ← @starui/ssrm-grid
    SSRMGrid ← ssrmgrid (external, temporary)
  SsrmMarketsGridSurface (unchanged public props)

ssrmgrid (external repo — temporary)
  SSRMGrid + Perspective worker only (until Phase 2)
```

Phase 2 (out of scope here): `@starui/ssrm-grid/perspective`, drop `file:ssrmgrid`, lazy-load WASM.

## Package layout

```text
packages/react-grid/ssrm-grid/
  package.json                 # name: @starui/ssrm-grid
  src/
    index.ts                   # public Custom API
    agGrid/                    # modules + theme (idempotent register)
    custom/
      CustomSSRMGrid.tsx
      …
    shared/                    # columnOverride, filters, block cache, etc.
  src/tests/                   # migrated vitest suite (Custom-relevant)
```

Root workspaces already include `packages/react-grid/*`.

## Public API (Phase 1)

```ts
// @starui/ssrm-grid
export { CustomSSRMGrid } from '…';
export type {
  CustomSSRMGridHandle,
  CustomSSRMGridProps,
  SSRMColDef,
  SSRMTransaction,
  GrandTotalRowMode,
  GroupTotalRowMode,
  DirtyMessage,
} from '…';

export { createCustomEngine, materializeCalcColumns } from '…';
export type { SsrmEngine /* custom-capable surface */ } from '…';

export {
  foldTrafficLight,
  isTrafficLightAgg,
  shareOfTotal,
  shareOfAggregate,
  formatShareOfTotal,
  formatShareOfAggregate,
  shareExceeds,
  resolveAggregate,
  fetchAllGroupLeafRows,
  mergeGroupPathIntoFilterModel,
  toGroupLeafCols,
  compileExpression,
  compileEditableExpression,
  compileCellStyleExpression,
  compileCellClassRuleExpression,
  resolveAggFuncName,
} from '…';
```

**Not exported in Phase 1:** `SSRMGrid`, `createPerspectiveEngine`, worker client, Perspective host.

### Peers / deps

| Kind | Packages |
|------|----------|
| peer | `react`, `react-dom`, `ag-grid-community`, `ag-grid-enterprise`, `ag-grid-react` (^36) |
| dep | none for Perspective |
| optional later | `@finos/perspective` on `/perspective` only |

Charts helpers used by Custom stay as today (peer or same module registration pattern as `@starui/grid`).

## Modules to copy (from `/Users/develop/wfh/ssrmgrid`)

**In (Custom + shared):**

- `src/ssrmgrid/CustomSSRMGrid.tsx`, `columnOverride.ts`, `QuickFilterHighlight*`, `ssrmStatusBarPanels.tsx`, `quickFilterHighlight.css`
- `src/agGrid/modules.ts`, `theme.ts`
- `src/ssrm/engine/customEngine.ts`, `types.ts`, `materializeCalcColumns.ts`, `index` pieces for custom
- `src/ssrm/rowMirror.ts`, `mirrorGroupAgg.ts`, `mirrorLoadingCell.tsx`
- `src/ssrm/createCustomDatasource.ts`, `configuredGate.ts`, `ssrmBlockCache.ts`
- `src/ssrm/applyWorkerDirtyToGrid.ts`, `mergeLeafUpdateRows.ts`, `patchLoadedGroupAggregates.ts`
- `src/ssrm/refreshAllLoadedStores.ts`, `getGroupLeafRows.ts`, `readGridQueryState.ts`
- `src/ssrm/chartAllViaAgGrid.ts`, `exportAllViaAgGrid.ts`, `trafficLightAgg.ts`, `shareOfTotal.ts`
- `src/ssrm/compileColExpression.ts`, `types.ts` (shared request/result types needed by Custom)
- `src/workers/ssrmFilters.ts`, `perspectiveExpr.ts` (main-thread filter eval — **not** WASM; keep despite name)

**Out (Perspective / demo):**

- `SSRMGrid.tsx`, `createPerspectiveDatasource.ts`, `perspectiveEngine.ts`, `workerClient.ts`
- `workers/perspective-ssrm.worker.ts`, `perspectiveHost.ts`, `perspectiveWorkerPolyfill.ts`, `ssrmQueryEngine.ts`, …
- Vite demo app (`App.tsx`, `main.tsx`, `demo/`)

**Tests:** copy Custom-relevant vitest files; skip or gate Perspective-only tests until Phase 2.

## `@starui/grid` changes

1. Add dependency `"@starui/ssrm-grid": "*"`.
2. Keep temporary `"ssrmgrid": "file:…"` **only** while Perspective opt-in remains.
3. Rewrite `ssrmgrid-entry.ts`:

```ts
export { CustomSSRMGrid, …helpers } from '@starui/ssrm-grid';
export type { CustomSSRMGridHandle as SSRMGridHandle, … } from '@starui/ssrm-grid';
export { SSRMGrid } from 'ssrmgrid';           // temporary
export type { SSRMGridProps } from 'ssrmgrid'; // temporary
```

4. `ssrmTrafficLightAgg.ts` / `ssrmShareOfTotal.ts`: import from `@starui/ssrm-grid`.
5. `SsrmMarketsGridSurface` public API unchanged (`ssrmEngine`, handle shape).

## Success criteria

- Fresh clone of the worktree builds/runs MarketsGrid SSRM **Custom** without a sibling checkout of `wfh/ssrmgrid` **for the Custom path** (Perspective still needs the file link until Phase 2 — document that clearly).
- `@starui/ssrm-grid` tests pass (migrated Custom suite).
- `markets-grid-lab` Custom stress + `star-demo` blotter (`useSSRM` + `ssrmEngine="custom"`) still work.
- Default `@starui/ssrm-grid` import graph does **not** resolve `@finos/perspective`.

## Risks / mitigations

| Risk | Mitigation |
|------|------------|
| Dual AG ModuleRegistry (`@starui/grid` + `@starui/ssrm-grid`) | Keep registration idempotent; long-term single site |
| Shared filter files named `perspectiveExpr` confuse ownership | Rename optional in Phase 1.1; comment that Custom owns them |
| Temporary dual deps (`@starui/ssrm-grid` + `ssrmgrid`) | Document in package README; remove in Perspective follow-up |
| Pivot only on Perspective | Unchanged: `ssrmEngine="perspective"` escape hatch |
| Worktree `file:` path depth | Less critical for Custom after move; still needed for Perspective |

## Follow-up (Phase 2 — not this spec)

1. Add `@starui/ssrm-grid/perspective` with worker + WASM Vite notes.
2. Lazy-import from `SsrmMarketsGridSurface` when `ssrmEngine === 'perspective'`.
3. Remove `file:ssrmgrid` from `@starui/grid`.
4. Archive or thin-reexport external `ssrmgrid`.

## Open items for implementer

- Exact file tree under `src/custom` vs `src/shared` (match copy boundaries above).
- Whether `tryValueGetterToPerspective` / calc-to-Perspective helpers stay in Phase 1 exports (yes if Custom `columnOverride` still uses them for string expressions).
- CI workspace install: confirm `packages/react-grid/*` picks up the new package without root workspace edits.
