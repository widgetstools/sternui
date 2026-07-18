# `@wellsfargo-starui/ssrm-grid` package (CustomSSRMGrid) — Design

**Date:** 2026-07-15  
**Status:** Complete — Custom-only; no Perspective / `file:ssrmgrid` on MarketsGrid  
**Branch / worktree:** `feat/marketsgrid-ssrm-dual-engine`  
**Repos:** `/Users/develop/wfh/ssrmgrid` → starui monorepo (`@wellsfargo-starui/ssrm-grid`)  
**AG Grid:** 36.x

## Goal

Make **CustomSSRMGrid** (main-thread RowMirror SSRM) a first-class StarUI framework package so MarketsGrid and other consumers no longer depend on a fragile out-of-repo `file:ssrmgrid` link.

MarketsGrid SSRM mounts **Custom only**. There is no Perspective-backed `SSRMGrid` path and no `ssrmgrid` package dependency.

## Non-goals

- Perspective worker / WASM / `SSRMGrid.tsx` integration (not needed).
- Folding SSRM into `@wellsfargo-starui/grid` itself (keep engine package separate from MarketsGrid chrome).
- Changing HostedMarketsGrid / STOMP provider APIs (already wired; stay as-is).
- Making SSRM the MarketsGrid default (still `useSSRM` opt-in).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Package layout | `packages/react-grid/ssrm-grid` → `@wellsfargo-starui/ssrm-grid` | Matches `packages/react-grid/*` |
| Move method | One-time **copy** of modules + tests | Private sandbox repo; avoid git-subtree noise |
| Scope | **Custom only** | Production path; no WASM packaging |
| Perspective | **Not integrated** | Dropped from MarketsGrid; `ssrmEngine` / `ssrmExpectedRowCount` are deprecated no-ops |
| Public default entry | No `@finos/perspective` | Default import graph stays lean |

## Architecture

```text
@wellsfargo-starui/ssrm-grid
  CustomSSRMGrid
  createCustomEngine / RowMirror
  SSRMColDef, filters, block cache, dirty helpers
  trafficLight / shareOfTotal / getGroupLeafRows / compile helpers

@wellsfargo-starui/grid
  ssrmgrid-entry.ts → CustomSSRMGrid ← @wellsfargo-starui/ssrm-grid
  SsrmMarketsGridSurface → always CustomSSRMGrid
```

## Package layout

```text
packages/react-grid/ssrm-grid/
  package.json                 # name: @wellsfargo-starui/ssrm-grid
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

## Public API

```ts
// @wellsfargo-starui/ssrm-grid
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
export type { SsrmEngine } from '…';

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

**Not exported:** `SSRMGrid`, `createPerspectiveEngine`, worker client, Perspective host.

### Peers / deps

| Kind | Packages |
|------|----------|
| peer | `react`, `react-dom`, `ag-grid-community`, `ag-grid-enterprise`, `ag-grid-react` (^36) |
| dep | none for Perspective |

Note: helpers named `perspectiveExpression` / `perspectiveExpr` are **string expression** naming for the Custom engine — not the FINOS Perspective product.

## `@wellsfargo-starui/grid` changes (done)

1. Depend on `"@wellsfargo-starui/ssrm-grid": "*"` only (no `file:ssrmgrid`).
2. `ssrmgrid-entry.ts` re-exports Custom from `@wellsfargo-starui/ssrm-grid`.
3. `SsrmMarketsGridSurface` always mounts `CustomSSRMGrid`; `ssrmEngine` ignored.

## Success criteria

- Fresh clone builds/runs MarketsGrid SSRM without a sibling checkout of `wfh/ssrmgrid`.
- `@wellsfargo-starui/ssrm-grid` tests pass.
- `markets-grid-lab` Custom stress + `star-demo` blotter (`useSSRM`) still work.
- Default `@wellsfargo-starui/ssrm-grid` import graph does **not** resolve `@finos/perspective`.

## Risks / mitigations

| Risk | Mitigation |
|------|------------|
| Dual AG ModuleRegistry (`@wellsfargo-starui/grid` + `@wellsfargo-starui/ssrm-grid`) | Keep registration idempotent; long-term single site |
| Shared filter files named `perspectiveExpr` confuse ownership | Comment that Custom owns them; rename optional later |
