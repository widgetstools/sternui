# MarketsGrid Dual Engine (CSRM + SSRM) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `useSSRM` to MarketsGrid so large datasets run on `SSRMGrid` (Perspective + AG Grid 36 SSRM) while CSRM remains the default, with shared tooling and a capability matrix.

**Architecture:** Introduce an engine adapter behind MarketsGrid: CSRM keeps `MarketsGridSurface` + `AgGridReact`; SSRM mounts `SSRMGrid` from the `ssrmgrid` package. Shared `GridPlatform` tooling stays; runtimes that walk all nodes are gated or adapted per phase. This plan delivers **Phase 0 (scaffold) + Phase 1 (blotter core + `.old`/`.new`)**. Phases 2–4 (calcs/traffic-light, alerts/editing, polish) are follow-on plans.

**Tech Stack:** React 19, AG Grid (align to 36 for SSRM path), `@starui/grid`, `ssrmgrid`, Vitest, FINOS Perspective (via ssrmgrid).

**Spec:** `docs/superpowers/specs/2026-07-14-marketsgrid-ssrm-dual-engine-design.md`

## Global Constraints

- Keep CSRM path (`useSSRM={false}` / omitted) behaviour identical — zero regression.
- Do not delete CSRM; do not make SSRM the default.
- AG Grid **36+** APIs only on the SSRM path (no deprecated SSRM APIs).
- starui `@starui/grid` currently peers `ag-grid-*@^35.1.0`; SSRM path must resolve **36.x** without breaking CSRM consumers (see Task 1).
- Capability matrix: unported SSRM features are **disabled with tooltip**, never silent no-ops.
- Excel formatters / `valueFormatter` / `cellStyle` pass through unchanged on both engines.
- `.old`/`.new` on SSRM = previous-values store for **viewport / recently updated** rows only.
- Traffic-light hierarchical custom agg is **Phase 2** (not this plan).
- Commits: small, focused; do not push unless asked.

## File structure (Phase 0–1)

| File | Responsibility |
|------|----------------|
| `packages/react-grid/grid/src/engine/types.ts` | `GridEngineKind`, capability ids, shared engine handle shape |
| `packages/react-grid/grid/src/engine/ssrmCapabilities.ts` | Phase-gated capability matrix for `useSSRM` |
| `packages/react-grid/grid/src/engine/SsrmMarketsGridSurface.tsx` | Mounts `<SSRMGrid>`; maps MarketsGrid props → SSRMGrid props |
| `packages/react-grid/grid/src/engine/previousValuesStore.ts` | Row-id → field → previous value for `.old`/`.new` |
| `packages/react-grid/grid/src/engine/applyTickToSsrm.ts` | Snapshot/tick adapter → `SSRMGridHandle.applyTransaction(Async)` |
| `packages/react-grid/grid/src/widget/types.ts` | Add `useSSRM?: boolean` |
| `packages/react-grid/grid/src/widget/MarketsGrid.tsx` | Branch surface on `useSSRM` |
| `packages/react-grid/grid/package.json` | Depend on `ssrmgrid`; AG Grid 36 alignment strategy |
| `packages/react-core/widgets-react/.../applyProviderToGrid.ts` | Optional SSRM tick path (or parallel `applyProviderToSsrm.ts`) |
| Lab app | Toggle `useSSRM` for large-N scenario |

**Repos layout note:** `ssrmgrid` lives at `/Users/develop/wfh/ssrmgrid` (sibling of starui). Link via `file:../../ssrmgrid` or npm workspace / pack — Task 1 picks one and documents it.

---

### Task 1: Link `ssrmgrid` and resolve AG Grid 36 for the SSRM path

**Files:**
- Modify: `packages/react-grid/grid/package.json`
- Create: `packages/react-grid/grid/src/engine/ssrmgrid-entry.ts` (re-export surface)
- Create: `packages/react-grid/grid/src/engine/ssrmgrid-entry.test.ts`
- Modify: root install notes in plan commit message / short `docs/superpowers/specs` addendum only if install steps are non-obvious

**Interfaces:**
- Produces: `import { SSRMGrid, type SSRMGridHandle, type SSRMColDef } from './ssrmgrid-entry.js'` resolves without runtime error in Vitest.

**Context:** starui grid uses AG Grid **35.1.0**; ssrmgrid uses **36.0.0**. Dual majors in one app are risky. Prefer:

1. Bump `@starui/grid` (and consumers that share one AG Grid instance) peer/devDeps to `36.0.0` **or**
2. If a full monorepo bump is blocked this sprint, document that `useSSRM` requires AG Grid 36 and fail fast with a clear error when versions mismatch.

- [ ] **Step 1: Decide and record the version strategy in a comment at top of `ssrmgrid-entry.ts`**

```ts
/**
 * SSRM engine entry — re-exports ssrmgrid.
 * AG Grid: ssrmgrid requires 36.x. MarketsGrid CSRM historically used 35.1.
 * Strategy: align @starui/grid to ag-grid-community/enterprise/react 36.0.0
 * so one ModuleRegistry serves both surfaces.
 */
export { SSRMGrid } from 'ssrmgrid';
export type { SSRMGridHandle, SSRMGridProps, SSRMColDef, SSRMTransaction } from 'ssrmgrid';
```

(If `ssrmgrid` does not yet export these from its package root, add a proper `exports` map in `/Users/develop/wfh/ssrmgrid/package.json` first — see Step 2.)

- [ ] **Step 2: Make `ssrmgrid` importable as a library**

In `/Users/develop/wfh/ssrmgrid/package.json`, ensure:

```json
{
  "name": "ssrmgrid",
  "type": "module",
  "main": "./src/ssrmgrid/SSRMGrid.tsx",
  "types": "./src/ssrmgrid/SSRMGrid.tsx",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

Create `/Users/develop/wfh/ssrmgrid/src/index.ts` if missing:

```ts
export { SSRMGrid } from './ssrmgrid/SSRMGrid';
export type {
  SSRMGridHandle,
  SSRMGridProps,
  SSRMTransaction,
  GrandTotalRowMode,
  GroupTotalRowMode,
} from './ssrmgrid/SSRMGrid';
export type { SSRMColDef } from './ssrmgrid/columnOverride';
export {
  shareOfTotal,
  shareOfAggregate,
  formatShareOfTotal,
  formatShareOfAggregate,
  shareExceeds,
  resolveAggregate,
} from './ssrm/shareOfTotal';
```

- [ ] **Step 3: Add file dependency from `@starui/grid`**

In `packages/react-grid/grid/package.json` dependencies:

```json
"ssrmgrid": "file:../../../../ssrmgrid"
```

(Adjust relative path from `packages/react-grid/grid` to the ssrmgrid repo — from that folder, sibling monorepo is typically `../../../../ssrmgrid` if starui and ssrmgrid share `wfh/`.)

Bump peer/dev `ag-grid-community`, `ag-grid-enterprise`, `ag-grid-react` to `36.0.0` in the same package (and run monorepo install).

- [ ] **Step 4: Write a smoke test that the entry imports**

```ts
// packages/react-grid/grid/src/engine/ssrmgrid-entry.test.ts
import { describe, expect, it } from 'vitest';

describe('ssrmgrid-entry', () => {
  it('exports SSRMGrid', async () => {
    const mod = await import('./ssrmgrid-entry.js');
    expect(mod.SSRMGrid).toBeTypeOf('object'); // forwardRef component
  });
});
```

- [ ] **Step 5: Run test**

Run: `npm test -w @starui/grid -- src/engine/ssrmgrid-entry.test.ts`

Expected: PASS (or FAIL until export path fixed — iterate Step 2–3).

- [ ] **Step 6: Commit**

```bash
git add packages/react-grid/grid/package.json packages/react-grid/grid/src/engine/ssrmgrid-entry.ts packages/react-grid/grid/src/engine/ssrmgrid-entry.test.ts
# also ssrmgrid package.json + src/index.ts if changed (separate repo commit)
git commit -m "feat(grid): link ssrmgrid and align AG Grid 36 for SSRM engine"
```

---

### Task 2: Capability matrix

**Files:**
- Create: `packages/react-grid/grid/src/engine/types.ts`
- Create: `packages/react-grid/grid/src/engine/ssrmCapabilities.ts`
- Create: `packages/react-grid/grid/src/engine/ssrmCapabilities.test.ts`

**Interfaces:**
- Produces:
  - `type GridEngineKind = 'csrm' | 'ssrm'`
  - `type SsrmCapabilityId = 'presentation' | 'excelFormat' | 'columnGroups' | 'namedAgg' | 'grouping' | 'liveTicks' | 'exportAll' | 'oldNewDiff' | 'calcColumns' | 'customJsAgg' | 'trafficLightAgg' | 'alerts' | 'smartEdit' | 'externalFilter'`
  - `function isSsrmCapabilityEnabled(id: SsrmCapabilityId, phase: SsrmPhase): boolean`
  - `type SsrmPhase = 0 | 1 | 2 | 3 | 4` (default **1** after Phase 1 ships; scaffold uses **0**)

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { isSsrmCapabilityEnabled } from './ssrmCapabilities.js';

describe('isSsrmCapabilityEnabled', () => {
  it('phase 0 enables presentation and excelFormat only', () => {
    expect(isSsrmCapabilityEnabled('presentation', 0)).toBe(true);
    expect(isSsrmCapabilityEnabled('excelFormat', 0)).toBe(true);
    expect(isSsrmCapabilityEnabled('liveTicks', 0)).toBe(false);
    expect(isSsrmCapabilityEnabled('calcColumns', 0)).toBe(false);
  });

  it('phase 1 enables blotter core + oldNewDiff', () => {
    expect(isSsrmCapabilityEnabled('liveTicks', 1)).toBe(true);
    expect(isSsrmCapabilityEnabled('grouping', 1)).toBe(true);
    expect(isSsrmCapabilityEnabled('oldNewDiff', 1)).toBe(true);
    expect(isSsrmCapabilityEnabled('trafficLightAgg', 1)).toBe(false);
    expect(isSsrmCapabilityEnabled('alerts', 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -w @starui/grid -- src/engine/ssrmCapabilities.test.ts`

- [ ] **Step 3: Implement**

```ts
// ssrmCapabilities.ts
export type SsrmPhase = 0 | 1 | 2 | 3 | 4;

export type SsrmCapabilityId =
  | 'presentation'
  | 'excelFormat'
  | 'columnGroups'
  | 'namedAgg'
  | 'grouping'
  | 'liveTicks'
  | 'exportAll'
  | 'oldNewDiff'
  | 'calcColumns'
  | 'customJsAgg'
  | 'trafficLightAgg'
  | 'alerts'
  | 'smartEdit'
  | 'externalFilter';

const PHASE_MIN: Record<SsrmCapabilityId, SsrmPhase> = {
  presentation: 0,
  excelFormat: 0,
  columnGroups: 1,
  namedAgg: 1,
  grouping: 1,
  liveTicks: 1,
  exportAll: 1,
  oldNewDiff: 1,
  calcColumns: 2,
  customJsAgg: 2,
  trafficLightAgg: 2,
  alerts: 3,
  smartEdit: 3,
  externalFilter: 3,
};

/** Current shipped SSRM capability floor for MarketsGrid. Bump when a phase lands. */
export const CURRENT_SSRM_PHASE: SsrmPhase = 0;

export function isSsrmCapabilityEnabled(
  id: SsrmCapabilityId,
  phase: SsrmPhase = CURRENT_SSRM_PHASE,
): boolean {
  return PHASE_MIN[id] <= phase;
}

export function ssrmCapabilityTooltip(id: SsrmCapabilityId): string {
  const min = PHASE_MIN[id];
  return `Not available on server row model until SSRM phase ${min}`;
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/react-grid/grid/src/engine/types.ts packages/react-grid/grid/src/engine/ssrmCapabilities.ts packages/react-grid/grid/src/engine/ssrmCapabilities.test.ts
git commit -m "feat(grid): add SSRM capability matrix for MarketsGrid dual engine"
```

---

### Task 3: `useSSRM` prop + surface branch (CSRM unchanged)

**Files:**
- Modify: `packages/react-grid/grid/src/widget/types.ts`
- Modify: `packages/react-grid/grid/src/widget/MarketsGrid.tsx`
- Create: `packages/react-grid/grid/src/engine/SsrmMarketsGridSurface.tsx`
- Create: `packages/react-grid/grid/src/engine/SsrmMarketsGridSurface.test.tsx` (render smoke with mocked SSRMGrid)

**Interfaces:**
- Produces: `MarketsGridProps.useSSRM?: boolean` (default `false`)
- Consumes: `SSRMGrid` from `ssrmgrid-entry`

- [ ] **Step 1: Add prop to types**

In `MarketsGridProps`, after `rowData` docs:

```ts
  /**
   * When true, use SSRMGrid (Perspective + AG Grid SSRM) for large datasets.
   * Default false — classic CSRM MarketsGrid. SSRM features are gated by
   * `CURRENT_SSRM_PHASE` in `engine/ssrmCapabilities.ts`.
   */
  useSSRM?: boolean;
```

- [ ] **Step 2: Minimal `SsrmMarketsGridSurface`**

```tsx
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { SSRMGrid, type SSRMGridHandle, type SSRMColDef } from './ssrmgrid-entry.js';
import type { MarketsGridProps } from '../widget/types.js';

export type SsrmMarketsGridSurfaceProps<TData> = {
  rowData: TData[];
  columnDefs: SSRMColDef[];
  rowIdField: string;
  height?: string | number;
  quickFilterText?: string;
};

export const SsrmMarketsGridSurface = forwardRef<
  SSRMGridHandle,
  SsrmMarketsGridSurfaceProps<Record<string, unknown>>
>(function SsrmMarketsGridSurface(props, ref) {
  const inner = useRef<SSRMGridHandle>(null);
  useImperativeHandle(ref, () => ({
    applyTransaction: (tx) => inner.current?.applyTransaction(tx),
    applyTransactionAsync: (tx) => inner.current?.applyTransactionAsync(tx),
    getApi: () => inner.current?.getApi() ?? null,
    getServerSideSelectionState: () =>
      inner.current?.getServerSideSelectionState() ?? null,
    setServerSideSelectionState: (s) =>
      inner.current?.setServerSideSelectionState(s),
    chartFilteredData: (opts) =>
      inner.current?.chartFilteredData(opts) ?? Promise.resolve(null),
  }));

  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
      <SSRMGrid
        ref={inner}
        columnDefs={props.columnDefs}
        rowData={props.rowData as Record<string, unknown>[]}
        getRowId={props.rowIdField}
        height="100%"
        quickFilterText={props.quickFilterText}
      />
    </div>
  );
});
```

- [ ] **Step 3: Branch in MarketsGrid shell**

Where `MarketsGridSurface` is rendered, if `props.useSSRM`:

```tsx
{props.useSSRM ? (
  <SsrmMarketsGridSurface
    ref={ssrmRef}
    rowData={rowData as Record<string, unknown>[]}
    columnDefs={transformedColDefs as SSRMColDef[]}
    rowIdField={typeof rowIdField === 'string' ? rowIdField : 'id'}
  />
) : (
  <MarketsGridSurface ...existing />
)}
```

Keep CSRM path byte-stable when `useSSRM` is false/undefined.

- [ ] **Step 4: Smoke test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('./ssrmgrid-entry.js', () => ({
  SSRMGrid: vi.fn(() => <div data-testid="ssrm-grid" />),
}));

import { SsrmMarketsGridSurface } from './SsrmMarketsGridSurface.js';

describe('SsrmMarketsGridSurface', () => {
  it('renders SSRMGrid host', () => {
    const { getByTestId } = render(
      <SsrmMarketsGridSurface
        rowData={[{ id: '1' }]}
        columnDefs={[{ field: 'id' }]}
        rowIdField="id"
      />,
    );
    expect(getByTestId('ssrm-grid')).toBeTruthy();
  });
});
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(grid): add useSSRM prop and SsrmMarketsGridSurface scaffold"
```

---

### Task 4: Tick / snapshot adapter for SSRM

**Files:**
- Create: `packages/react-grid/grid/src/engine/applyTickToSsrm.ts`
- Create: `packages/react-grid/grid/src/engine/applyTickToSsrm.test.ts`
- Modify: `packages/react-core/widgets-react/src/container/markets-grid-container/useProviderDataWiring.ts` (or Container) to call SSRM path when engine is SSRM

**Interfaces:**
- Produces:
```ts
export function applyTickToSsrm(
  handle: Pick<SSRMGridHandle, 'applyTransactionAsync'>,
  rows: Record<string, unknown>[],
): void;
```
- Consumes: `SSRMGridHandle.applyTransactionAsync`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { applyTickToSsrm } from './applyTickToSsrm.js';

describe('applyTickToSsrm', () => {
  it('forwards updates to applyTransactionAsync', () => {
    const applyTransactionAsync = vi.fn();
    applyTickToSsrm({ applyTransactionAsync }, [{ id: 'a', pnl: 1 }]);
    expect(applyTransactionAsync).toHaveBeenCalledWith({
      update: [{ id: 'a', pnl: 1 }],
    });
  });
});
```

- [ ] **Step 2: Implement**

```ts
import type { SSRMGridHandle } from './ssrmgrid-entry.js';

export function applyTickToSsrm(
  handle: Pick<SSRMGridHandle, 'applyTransactionAsync'>,
  rows: Record<string, unknown>[],
): void {
  if (rows.length === 0) return;
  handle.applyTransactionAsync({ update: rows });
}
```

(Phase 1 simplification: treat all ticks as upserts via `update`; SSRMGrid/Perspective upserts by index. Snapshot replace still uses `rowData` prop / configure `setRowData`.)

- [ ] **Step 3: Wire Container**

When MarketsGrid is mounted with `useSSRM`, provider tick handler must not call `gridApi.applyTransactionAsync`. Instead resolve `SSRMGridHandle` from MarketsGrid ref (extend handle — Task 5) and call `applyTickToSsrm`.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(grid): apply provider ticks to SSRMGrid handle"
```

---

### Task 5: Unifyмент MarketsGridHandle for dual engine

**Files:**
- Modify: `packages/react-grid/grid/src/widget/types.ts` (`MarketsGridHandle`)
- Modify: `packages/react-grid/grid/src/widget/MarketsGrid.tsx` (`useImperativeHandle`)

**Interfaces:**
- Produces (additions):
```ts
export interface MarketsGridHandle {
  // existing…
  /** SSRM only — null when useSSRM is false */
  getSsrmHandle?: () => SSRMGridHandle | null;
  /** Engine-neutral tick apply used by Container */
  applyDataTransactionAsync?: (tx: { add?: unknown[]; update?: unknown[]; remove?: unknown[] }) => void;
}
```

- [ ] **Step 1: Implement handle branching**

When `useSSRM`, `applyDataTransactionAsync` → `ssrmRef.applyTransactionAsync`.  
When CSRM, keep existing GridApi transaction path.

- [ ] **Step 2: Unit test handle routing** (mock both surfaces)

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(grid): dual-engine MarketsGridHandle transaction routing"
```

---

### Task 6: Previous-values store for `.old` / `.new` (Phase 1)

**Files:**
- Create: `packages/react-grid/grid/src/engine/previousValuesStore.ts`
- Create: `packages/react-grid/grid/src/engine/previousValuesStore.test.ts`
- Modify: conditional-styling SSRM activation path (or shared helper used by `timedActivations` when engine is SSRM)

**Interfaces:**
```ts
export type FieldDiff = { oldValue: unknown; newValue: unknown };

export class PreviousValuesStore {
  remember(rowId: string, fields: Record<string, unknown>): void;
  /** Returns diffs for keys present in `next`; updates store to `next`. */
  diffAndUpdate(rowId: string, next: Record<string, unknown>): Map<string, FieldDiff>;
  forget(rowId: string): void;
  clear(): void;
}
```

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { PreviousValuesStore } from './previousValuesStore.js';

describe('PreviousValuesStore', () => {
  it('diffAndUpdate exposes old vs new for changed fields', () => {
    const s = new PreviousValuesStore();
    s.remember('r1', { price: 100 });
    const d = s.diffAndUpdate('r1', { price: 105, qty: 1 });
    expect(d.get('price')).toEqual({ oldValue: 100, newValue: 105 });
    // second call: old is previous new
    const d2 = s.diffAndUpdate('r1', { price: 110 });
    expect(d2.get('price')).toEqual({ oldValue: 105, newValue: 110 });
  });

  it('forget drops row', () => {
    const s = new PreviousValuesStore();
    s.remember('r1', { price: 1 });
    s.forget('r1');
    const d = s.diffAndUpdate('r1', { price: 2 });
    expect(d.get('price')?.oldValue).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement store**

```ts
export type FieldDiff = { oldValue: unknown; newValue: unknown };

export class PreviousValuesStore {
  #byRow = new Map<string, Map<string, unknown>>();

  remember(rowId: string, fields: Record<string, unknown>): void {
    const m = new Map<string, unknown>();
    for (const [k, v] of Object.entries(fields)) m.set(k, v);
    this.#byRow.set(rowId, m);
  }

  diffAndUpdate(rowId: string, next: Record<string, unknown>): Map<string, FieldDiff> {
    const prev = this.#byRow.get(rowId) ?? new Map<string, unknown>();
    const diffs = new Map<string, FieldDiff>();
    const updated = new Map(prev);
    for (const [k, newValue] of Object.entries(next)) {
      const oldValue = prev.get(k);
      if (!Object.is(oldValue, newValue)) {
        diffs.set(k, { oldValue, newValue });
      }
      updated.set(k, newValue);
    }
    this.#byRow.set(rowId, updated);
    return diffs;
  }

  forget(rowId: string): void {
    this.#byRow.delete(rowId);
  }

  clear(): void {
    this.#byRow.clear();
  }
}
```

- [ ] **Step 3: Hook into SSRM tick path**

Before `applyTickToSsrm`, for each row id call `diffAndUpdate` and stash diffs where conditional-styling expression ctx can read them (mirror CSRM `rowDiffCache` WeakMap keyed by row data object **or** by row id string for SSRM).

Minimum Phase 1: export a module-level/API hub `getSsrmRowDiff(rowId)` used by SSRM conditional-styling activate when `isSsrmCapabilityEnabled('oldNewDiff')`.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(grid): previous-values store for SSRM .old/.new styling"
```

---

### Task 7: Gate unported modules when `useSSRM`

**Files:**
- Modify: Settings / module registration to read `useSSRM` + `isSsrmCapabilityEnabled`
- Prefer: pass `engineKind: 'ssrm' | 'csrm'` into `GridPlatform` context once

**Behaviour:**
- Calc columns editor: visible but save disabled with `ssrmCapabilityTooltip('calcColumns')` at phase &lt; 2
- Custom agg expression: same for `customJsAgg`
- Alerts module: disabled at phase &lt; 3

- [ ] **Step 1: Add `engineKind` to platform/host context**

- [ ] **Step 2: Disable 1–2 highest-risk controls (calc + custom agg) with tooltip**

- [ ] **Step 3: Manual check CSRM still enables them when `useSSRM` false**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(grid): gate SSRM-unready MarketsGrid modules via capability matrix"
```

---

### Task 8: MarketsGrid lab toggle (manual verification)

**Files:**
- Modify: `apps/demos/markets-grid-lab` (or equivalent) — add checkbox **Use SSRM (large dataset)** bound to `useSSRM`

- [ ] **Step 1: Add toggle to lab chrome**

- [ ] **Step 2: With `useSSRM`, load ≥5k rows, confirm grid paints, Excel-formatted column still formats, CSRM toggle restores classic path**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(lab): toggle useSSRM on MarketsGrid feature lab"
```

---

### Task 9: Bump `CURRENT_SSRM_PHASE` to 1 and regression pass

**Files:**
- Modify: `ssrmCapabilities.ts` → `CURRENT_SSRM_PHASE = 1`
- Update phase-0 tests expectations if they hard-coded the constant

- [ ] **Step 1: Set phase to 1**

- [ ] **Step 2: Run**

```bash
npm test -w @starui/grid
npm test -w @starui/widgets-react
```

Expected: existing CSRM tests green; new SSRM unit tests green.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(grid): enable SSRM phase 1 capabilities (blotter core + old/new)"
```

---

## Follow-on plans (do not implement in this plan)

| Phase | Plan doc (create when Phase 1 ships) | Scope |
|-------|--------------------------------------|--------|
| 2 | `docs/superpowers/plans/YYYY-MM-DD-marketsgrid-ssrm-phase2-calcs.md` | `perspectiveExpression` transpile; `SUM`/`AVG`; **trafficLight/rag named agg**; gate unmappable custom aggs |
| 3 | `...-phase3-alerts-edit.md` | Alerts on dirty/deltas; smart-edit via SSRM tx; context link without external filter |
| 4 | `...-phase4-parity.md` | Matrix green; docs; perf at 50k+ / high tick; optional `rowModel` alias |
| After 1–4 | `docs/superpowers/plans/2026-07-15-stomp-rowshape-ssrm.md` | STOMP `rowShape: 'ssrm'` — **DONE** (flatten + stream + Behaviour editor) |

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `useSSRM` prop; keep CSRM default | Task 3 |
| Depend on ssrmgrid; AG Grid 36 | Task 1 |
| Capability matrix; no silent no-ops | Tasks 2, 7 |
| Snapshot + ticks → SSRMGrid | Tasks 4–5 |
| Excel formatting pass-through | Task 3 (ColDefs unchanged) + Phase 1 |
| `.old`/`.new` previous-values | Task 6 |
| Lab toggle | Task 8 |
| Traffic light / custom JS agg | Follow-on Phase 2 (explicitly out of scope here) |
| Alerts / smart-edit / external filter | Follow-on Phase 3 |
| Zero CSRM regression | Task 9 |

## Placeholder / consistency review

- No TBD steps; Phase 2–4 deferred as named follow-on plans.
- `SSRMGridHandle` method names match ssrmgrid `SSRMGrid.tsx`.
- `CURRENT_SSRM_PHASE` is the single bump point for enabling capabilities.
