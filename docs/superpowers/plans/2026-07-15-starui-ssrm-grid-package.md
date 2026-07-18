# `@wellsfargo-starui/ssrm-grid` (Custom only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move CustomSSRMGrid + RowMirror SSRM stack into a first-class `@wellsfargo-starui/ssrm-grid` package in the starui monorepo, and retarget `@wellsfargo-starui/grid` to use it for the default Custom path while leaving Perspective `SSRMGrid` on temporary `file:ssrmgrid`.

**Architecture:** One-time copy of Custom + shared modules from `/Users/develop/wfh/ssrmgrid` into `packages/react-grid/ssrm-grid`. Extract shared types (`SSRMTransaction`, grand/group total modes) out of `SSRMGrid.tsx` so Custom has no Perspective import. `@wellsfargo-starui/grid` `ssrmgrid-entry.ts` re-exports Custom from `@wellsfargo-starui/ssrm-grid` and Perspective from `ssrmgrid`.

**Tech Stack:** TypeScript, React 19, AG Grid 36, Vitest, npm workspaces (`packages/react-grid/*`).

**Spec:** `docs/superpowers/specs/2026-07-15-starui-ssrm-grid-package-design.md`

## Global Constraints

- AG Grid peers: `ag-grid-community` / `enterprise` / `react` `^36.0.0`
- Phase 1: **no** `@finos/perspective` in `@wellsfargo-starui/ssrm-grid` dependency graph
- Do not delete `/Users/develop/wfh/ssrmgrid`; keep `file:ssrmgrid` on `@wellsfargo-starui/grid` for Perspective only
- Consume as source (no emit), same as `@wellsfargo-starui/grid`: `"build": "echo '… no emit'"`
- Worktree: `/Users/develop/wfh/starui/.worktrees/marketsgrid-ssrm-dual-engine` on branch `feat/marketsgrid-ssrm-dual-engine`
- Source of truth for copy: `/Users/develop/wfh/ssrmgrid`

## File structure (target)

```text
packages/react-grid/ssrm-grid/
  package.json
  tsconfig.json
  vitest.config.ts
  README.md
  src/
    index.ts
    vite-env.d.ts
    agGrid/
      modules.ts
      theme.ts
    types/
      ssrmTransaction.ts          # SSRMTransaction, GrandTotalRowMode, GroupTotalRowMode
    custom/
      CustomSSRMGrid.tsx
      columnOverride.ts
      QuickFilterHighlightCellRenderer.tsx
      quickFilterHighlight.ts
      quickFilterHighlight.css
      ssrmStatusBarPanels.tsx
    engine/
      customEngine.ts
      materializeCalcColumns.ts
      types.ts                    # SsrmEngine (without requiring perspectiveEngine)
      index.ts                    # createCustomEngine + materializeCalcColumns only
    ssrm/
      applyWorkerDirtyToGrid.ts
      chartAllViaAgGrid.ts
      compileColExpression.ts
      configuredGate.ts
      createCustomDatasource.ts
      exportAllViaAgGrid.ts
      getGroupLeafRows.ts
      mergeLeafUpdateRows.ts
      mirrorGroupAgg.ts
      mirrorLoadingCell.tsx
      patchLoadedGroupAggregates.ts
      readGridQueryState.ts
      refreshAllLoadedStores.ts
      rowMirror.ts
      shareOfTotal.ts
      ssrmBlockCache.ts
      trafficLightAgg.ts
      types.ts
    filters/
      ssrmFilters.ts              # from workers/ssrmFilters.ts
      perspectiveExpr.ts          # from workers/perspectiveExpr.ts (main-thread; not WASM)
    tests/
      … (Custom-relevant tests only)
```

**Modify:**

- `packages/react-grid/grid/package.json` — add `@wellsfargo-starui/ssrm-grid`; keep `ssrmgrid` file dep
- `packages/react-grid/grid/src/engine/ssrmgrid-entry.ts` — split imports
- `packages/react-grid/grid/src/engine/ssrmTrafficLightAgg.ts` — import from `@wellsfargo-starui/ssrm-grid` if it currently imports `ssrmgrid`
- `packages/react-grid/grid/src/engine/ssrmShareOfTotal.ts` — same
- `packages/react-grid/grid/vitest.config.ts` — alias `@wellsfargo-starui/ssrm-grid` if needed for tests

---

### Task 1: Scaffold `@wellsfargo-starui/ssrm-grid` package

**Files:**
- Create: `packages/react-grid/ssrm-grid/package.json`
- Create: `packages/react-grid/ssrm-grid/tsconfig.json`
- Create: `packages/react-grid/ssrm-grid/vitest.config.ts`
- Create: `packages/react-grid/ssrm-grid/src/index.ts` (stub)
- Create: `packages/react-grid/ssrm-grid/src/vite-env.d.ts`
- Create: `packages/react-grid/ssrm-grid/README.md`
- Create: `packages/react-grid/ssrm-grid/src/tests/packageSmoke.test.ts`

**Interfaces:**
- Produces: workspace package `@wellsfargo-starui/ssrm-grid` resolvable as `"*"` from `@wellsfargo-starui/grid`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "@wellsfargo-starui/ssrm-grid",
  "version": "0.1.0",
  "private": true,
  "description": "CustomSSRMGrid — AG Grid SSRM over main-thread RowMirror (StarUI framework)",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "echo '@wellsfargo-starui/ssrm-grid: consumed as source (no emit)'"
  },
  "peerDependencies": {
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "ag-grid-community": "^36.0.0",
    "ag-grid-enterprise": "^36.0.0",
    "ag-grid-react": "^36.0.0"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "~4.5.2",
    "ag-grid-community": "36.0.0",
    "ag-grid-enterprise": "36.0.0",
    "ag-grid-react": "36.0.0",
    "jsdom": "^29.0.2",
    "react": "~19.2.5",
    "react-dom": "~19.2.5",
    "typescript": "~5.9.3",
    "vitest": "^4.1.4"
  }
}
```

Do **not** add `@finos/perspective`. If `agGrid/modules.ts` requires charts enterprise, add `ag-charts-enterprise` as a **peer** (major `14.x` as in ssrmgrid) and as a devDependency for tests.

- [ ] **Step 2: Write tsconfig.json**

Mirror `@wellsfargo-starui/grid` `tsconfig.json` (verify with `cat packages/react-grid/grid/tsconfig.json` and match `extends` / `jsx`).

- [ ] **Step 3: Write vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'ag-grid-community', 'ag-grid-enterprise', 'ag-grid-react'],
  },
  test: {
    environment: 'jsdom',
    include: ['src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx'],
  },
});
```

- [ ] **Step 4: Stub index + smoke test**

`src/index.ts`:

```ts
export const SSRM_GRID_PACKAGE = '@wellsfargo-starui/ssrm-grid' as const;
```

`src/tests/packageSmoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SSRM_GRID_PACKAGE } from '../index.js';

describe('@wellsfargo-starui/ssrm-grid', () => {
  it('exports package id', () => {
    expect(SSRM_GRID_PACKAGE).toBe('@wellsfargo-starui/ssrm-grid');
  });
});
```

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

`README.md` — Custom-only Phase 1; Perspective remains in external `ssrmgrid` via `@wellsfargo-starui/grid`.

- [ ] **Step 5: Install + run smoke test**

```bash
cd /Users/develop/wfh/starui/.worktrees/marketsgrid-ssrm-dual-engine
npm install -w @wellsfargo-starui/ssrm-grid
npm run test -w @wellsfargo-starui/ssrm-grid
```

Expected: 1 test pass.

- [ ] **Step 6: Commit**

```bash
git add packages/react-grid/ssrm-grid
git commit -m "$(cat <<'EOF'
chore(ssrm-grid): scaffold @wellsfargo-starui/ssrm-grid package

EOF
)"
```

---

### Task 2: Extract shared transaction types + copy shared ssrm modules

**Files:**
- Create: `packages/react-grid/ssrm-grid/src/types/ssrmTransaction.ts`
- Create: all `src/ssrm/*` listed in File structure (copy from ssrmgrid, fix relative imports)
- Create: `src/filters/ssrmFilters.ts`, `src/filters/perspectiveExpr.ts`
- Create: `src/agGrid/modules.ts`, `src/agGrid/theme.ts`
- Create: `src/engine/types.ts`, `src/engine/materializeCalcColumns.ts`, `src/engine/customEngine.ts`, `src/engine/index.ts`

**Interfaces:**
- Produces: `SSRMTransaction`, `GrandTotalRowMode`, `GroupTotalRowMode` without importing `SSRMGrid`
- Produces: `createCustomEngine`, `RowMirror`, filter helpers usable by CustomSSRMGrid

- [ ] **Step 1: Extract types from ssrmgrid `SSRMGrid.tsx`**

Locate `SSRMTransaction`, `GrandTotalRowMode`, `GroupTotalRowMode` in `/Users/develop/wfh/ssrmgrid/src/ssrmgrid/SSRMGrid.tsx` and copy verbatim into `src/types/ssrmTransaction.ts`.

- [ ] **Step 2: Copy shared files with path rewrite**

From `/Users/develop/wfh/ssrmgrid`:

| Source | Dest |
|--------|------|
| Custom-needed `src/ssrm/*.ts(x)` | `src/ssrm/` |
| `src/ssrm/engine/customEngine.ts`, `materializeCalcColumns.ts`, `types.ts` | `src/engine/` |
| `src/workers/ssrmFilters.ts` | `src/filters/ssrmFilters.ts` |
| `src/workers/perspectiveExpr.ts` | `src/filters/perspectiveExpr.ts` |
| `src/agGrid/*` | `src/agGrid/` |

**Do not copy:** `SSRMGrid.tsx`, `createPerspectiveDatasource.ts`, `perspectiveEngine.ts`, `workerClient.ts`, `workers/perspective*.ts`, `ssrmQueryEngine.ts`, `sumTotals.ts`, `ingestRows.ts`, demo/App files.

Rewrite imports after copy:

- `../workers/ssrmFilters` → `../filters/ssrmFilters.js`
- engine paths under old `ssrm/` → `../engine/…`
- any `SSRMGrid` type import → `../types/ssrmTransaction.js`

`src/engine/index.ts` must **not** export `createPerspectiveEngine`:

```ts
export type { SsrmEngine, SsrmEngineKind } from './types.js';
export { createCustomEngine } from './customEngine.js';
export { materializeCalcColumns } from './materializeCalcColumns.js';
```

- [ ] **Step 3: Sanity-check no Perspective imports**

```bash
cd packages/react-grid/ssrm-grid
rg -n "@finos/perspective|perspectiveHost|createPerspectiveEngine|workerClient" src || true
```

Expected: no matches (except possibly comments / `SsrmEngineKind` string `'perspective'`).

- [ ] **Step 4: Commit**

```bash
git add packages/react-grid/ssrm-grid/src
git commit -m "$(cat <<'EOF'
feat(ssrm-grid): copy Custom shared engine and filter modules

EOF
)"
```

---

### Task 3: Copy CustomSSRMGrid UI and wire package exports

**Files:**
- Create: `src/custom/CustomSSRMGrid.tsx` (+ columnOverride, QuickFilter*, status bar, css)
- Modify: `src/index.ts` — full public API from the design spec

**Interfaces:**
- Produces: `CustomSSRMGrid`, `CustomSSRMGridHandle`, `CustomSSRMGridProps`, `SSRMColDef`, helpers from the design spec

- [ ] **Step 1: Copy UI files into `src/custom/`**

From `ssrmgrid/src/ssrmgrid/`: `CustomSSRMGrid.tsx`, `columnOverride.ts`, `QuickFilterHighlightCellRenderer.tsx`, `quickFilterHighlight.ts`, `quickFilterHighlight.css`, `ssrmStatusBarPanels.tsx`.

Fix type import:

```ts
import type {
  GrandTotalRowMode,
  GroupTotalRowMode,
  SSRMTransaction,
} from '../types/ssrmTransaction.js';
```

Fix relatives to `../ssrm/`, `../agGrid/`, `../filters/`, `../engine/`.

- [ ] **Step 2: Write full `src/index.ts`**

Export the full design-spec public API (`CustomSSRMGrid`, types, `createCustomEngine`, trafficLight, shareOfTotal, getGroupLeafRows, compile helpers). Drop or keep Task 1 smoke constant — update smoke test if dropped.

- [ ] **Step 3: Run package typecheck**

```bash
npm run typecheck -w @wellsfargo-starui/ssrm-grid
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/react-grid/ssrm-grid
git commit -m "$(cat <<'EOF'
feat(ssrm-grid): add CustomSSRMGrid and public exports

EOF
)"
```

---

### Task 4: Migrate Custom-relevant unit tests

**Files:**
- Create: `packages/react-grid/ssrm-grid/src/tests/*.test.ts`

**Copy** (from `ssrmgrid/src/tests/`):  
`applyWorkerDirtyToGrid`, `chartAllViaAgGrid`, `columnOverride`, `compileColExpression`, `configuredGate`, `customEngine`, `exportAllViaAgGrid`, `getGroupLeafRows`, `mergeLeafUpdateRows`, `mirrorGroupAgg`, `mirrorLoadingCell`, `patchLoadedGroupAggregates`, `quickFilterHighlight`, `refreshAllLoadedStores`, `rowMirror`, `shareOfTotal`, `ssrmBlockCache`, `ssrmFilters`, `ssrmStatusBarPanels`, `trafficLightAgg` — plus keep `packageSmoke.test.ts`.

**Do not copy:** `ingestRows`, `perspectiveDottedColumns`, `ssrmQueryEngine`.

- [ ] **Step 1: Copy tests and rewrite import paths**

- [ ] **Step 2: Run tests**

```bash
npm run test -w @wellsfargo-starui/ssrm-grid
```

Expected: all copied tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/react-grid/ssrm-grid/src/tests
git commit -m "$(cat <<'EOF'
test(ssrm-grid): migrate CustomSSRMGrid unit tests

EOF
)"
```

---

### Task 5: Retarget `@wellsfargo-starui/grid` entry to `@wellsfargo-starui/ssrm-grid`

**Files:**
- Modify: `packages/react-grid/grid/package.json`
- Modify: `packages/react-grid/grid/src/engine/ssrmgrid-entry.ts`
- Modify: `ssrmTrafficLightAgg.ts` / `ssrmShareOfTotal.ts` if they import `ssrmgrid`
- Modify: `packages/react-grid/grid/vitest.config.ts`

**Interfaces:**
- Consumes: `@wellsfargo-starui/ssrm-grid` for Custom; `ssrmgrid` for `SSRMGrid` only
- Produces: unchanged `ssrmgrid-entry` surface (`CustomSSRMGridHandle as SSRMGridHandle`)

- [ ] **Step 1: Add dependency**

```json
"@wellsfargo-starui/ssrm-grid": "*",
"ssrmgrid": "file:../../../../ssrmgrid"
```

- [ ] **Step 2: Rewrite `ssrmgrid-entry.ts`**

```ts
export {
  CustomSSRMGrid,
  shareOfTotal,
  shareOfAggregate,
  formatShareOfTotal,
  formatShareOfAggregate,
  shareExceeds,
  resolveAggregate,
} from '@wellsfargo-starui/ssrm-grid';
export type {
  CustomSSRMGridHandle,
  CustomSSRMGridProps,
  SSRMColDef,
  SSRMTransaction,
} from '@wellsfargo-starui/ssrm-grid';
export type { CustomSSRMGridHandle as SSRMGridHandle } from '@wellsfargo-starui/ssrm-grid';

export { SSRMGrid } from 'ssrmgrid';
export type { SSRMGridProps } from 'ssrmgrid';

export { getSsrmShareOfTotal, type SsrmShareOfTotalParams } from './ssrmShareOfTotal.js';
```

- [ ] **Step 3: Point helper imports at `@wellsfargo-starui/ssrm-grid`**

- [ ] **Step 4: Vitest alias**

```ts
{ find: '@wellsfargo-starui/ssrm-grid', replacement: resolve(__dirname, '../ssrm-grid/src/index.ts') },
```

- [ ] **Step 5: Install + verify**

```bash
npm install -w @wellsfargo-starui/grid
npm run typecheck -w @wellsfargo-starui/grid
npm run test -w @wellsfargo-starui/grid -- src/engine
```

- [ ] **Step 6: Commit**

```bash
git add packages/react-grid/grid/package.json packages/react-grid/grid/src/engine packages/react-grid/grid/vitest.config.ts
git commit -m "$(cat <<'EOF'
feat(grid): use @wellsfargo-starui/ssrm-grid for CustomSSRMGrid

Perspective SSRMGrid remains on temporary file:ssrmgrid.

EOF
)"
```

---

### Task 6: Verify demos (star-demo + lab Custom path)

**Files:** none required unless import/alias fixes

- [ ] **Step 1: Typecheck star-demo**

```bash
npm run typecheck -w @wellsfargo-starui/star-demo
```

Expected: exit 0.

- [ ] **Step 2: Confirm no app imports `ssrmgrid` directly**

```bash
rg -n "from ['\"]ssrmgrid['\"]" apps/demos/star-demo apps/demos/markets-grid-lab || true
```

Expected: no matches.

- [ ] **Step 3: Confirm Custom package has no Perspective dep**

```bash
rg -n "@finos/perspective" packages/react-grid/ssrm-grid/package.json packages/react-grid/ssrm-grid/src || true
```

Expected: no matches in package.json / src (except comments).

- [ ] **Step 4: Manual smoke (optional if broker available)**

```bash
npm run dev:stomp
npm run dev:star-demo
```

Blotter with `useSSRM` + Custom should populate from STOMP snapshot.

- [ ] **Step 5: Update spec status if desired + commit**

```bash
git add docs/superpowers/specs/2026-07-15-starui-ssrm-grid-package-design.md packages/react-grid/ssrm-grid/README.md
git commit -m "$(cat <<'EOF'
docs(ssrm-grid): mark Custom-only package Phase 1 complete

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Package at `packages/react-grid/ssrm-grid` | 1 |
| Custom-only, no Perspective dep | 2–3 |
| Shared filters without WASM | 2 |
| Extract types away from `SSRMGrid.tsx` | 2–3 |
| Public API exports | 3 |
| Migrated Custom tests | 4 |
| `@wellsfargo-starui/grid` uses `@wellsfargo-starui/ssrm-grid` for Custom | 5 |
| Keep `file:ssrmgrid` for Perspective | 5 |
| star-demo / lab still work via `@wellsfargo-starui/grid` | 6 |

## Out of scope

- `@wellsfargo-starui/ssrm-grid/perspective` subpath
- Removing `file:ssrmgrid`
- Archiving `/Users/develop/wfh/ssrmgrid`
- Changing `useSSRM` / STOMP snapshot wiring
