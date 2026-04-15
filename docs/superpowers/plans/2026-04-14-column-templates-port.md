# Column Templates Port (sub-project #2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the v1 `column-templates` module to `@grid-customizer/core-v2` with full v1 feature parity (styling + formatter + behavior + cellEditor/cellRenderer + typeDefaults), no backward-compatibility code, and no tech debt. Wires the `templateIds?: string[]` field that sub-project #1 added storage-only on `ColumnAssignment`.

**Architecture:** Two cooperating modules. `column-templates` (new) is a passive state holder plus a pure exported `resolveTemplates()` function. `column-customization` (extended) declares `dependencies: ['column-templates']`, bumps `schemaVersion` 2 → 3, adds three new optional fields (`cellEditorName`, `cellEditorParams`, `cellRendererName`) on `ColumnAssignment`, and threads the resolver into its column-def walker. To make the cross-module read possible from inside `transformColumnDefs`, `GridContext` is extended with `getModuleState`.

**Tech Stack:** TypeScript, Vitest, AG-Grid Community/Enterprise 35 (`ColDef.cellStyle`, `cellEditor`, `cellRenderer`, `cellDataType`), no React surface in this sub-project.

**Spec:** `docs/superpowers/specs/2026-04-14-column-templates-port-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `packages/core-v2/src/core/types.ts` | modify | Extend `GridContext` with `getModuleState<T>(moduleId)` |
| `packages/core-v2/src/core/GridCore.ts` | modify | Thread `getModuleStateFn` into `createGridContext()` |
| `packages/core-v2/src/core/GridCore.test.ts` | modify | Assert `transformColumnDefs` receives a `ctx.getModuleState` that reads sibling state |
| `packages/core-v2/src/modules/column-customization/state.ts` | modify | Add `cellEditorName?`, `cellEditorParams?`, `cellRendererName?` to `ColumnAssignment` |
| `packages/core-v2/src/modules/column-customization/index.ts` | modify | Bump `schemaVersion` 2→3; add `dependencies: ['column-templates']`; rewrite `applyAssignments` to read templates state and call `resolveTemplates`; emit 3 new fields |
| `packages/core-v2/src/modules/column-customization/index.test.ts` | modify | Update fixtures to provide a `ctx.getModuleState` stub; +8 integration tests |
| `packages/core-v2/src/modules/column-templates/state.ts` | create | `ColumnTemplate`, `ColumnDataType`, `ColumnTemplatesState`, `INITIAL_COLUMN_TEMPLATES` |
| `packages/core-v2/src/modules/column-templates/state.test.ts` | create | INITIAL defaults; deserialize fallbacks |
| `packages/core-v2/src/modules/column-templates/resolveTemplates.ts` | create | Pure `resolveTemplates(assignment, templatesState, colDataType)` |
| `packages/core-v2/src/modules/column-templates/resolveTemplates.test.ts` | create | 20 tests (chain build, fold, assignment-last, typeDefaults, edge cases) |
| `packages/core-v2/src/modules/column-templates/index.ts` | create | Module + re-exports |
| `packages/core-v2/src/modules/column-templates/index.test.ts` | create | Module metadata + serialize/deserialize round-trip |
| `packages/core-v2/src/index.ts` | modify | Re-export `columnTemplatesModule`, `INITIAL_COLUMN_TEMPLATES`, `ColumnTemplate`, `ColumnDataType`, `ColumnTemplatesState`, `resolveTemplates` |
| `packages/markets-grid-v2/src/MarketsGrid.tsx` | modify | Add `columnTemplatesModule` to `DEFAULT_V2_MODULES` ahead of `columnCustomizationModule` |

---

## Conventions

- All Vitest commands run from the repo root: `npx vitest run <path>`.
- Type checks run from the repo root: `npx tsc --noEmit -p packages/core-v2/tsconfig.json`.
- Commits stage only the files the step touches; never `git add -A`.
- Every commit message uses the existing project style: `feat(scope): …`, `test(scope): …`, `refactor(scope): …`, `fix(scope): …`. Scope is the v2 module id (`column-templates`, `column-customization`, `core-v2`).

---

## Task 1: Extend `GridContext` with `getModuleState`

**Why first:** The spec's resolver design needs `transformColumnDefs` in `column-customization` to read `column-templates` state. Today `transformColumnDefs(defs, state, ctx)` receives a `GridContext` that has no cross-module read. Adding it now is a one-time core extension that unblocks the rest of the plan and matches the `ModuleContext.getModuleState` shape that already exists.

**Files:**
- Modify: `packages/core-v2/src/core/types.ts`
- Modify: `packages/core-v2/src/core/GridCore.ts`
- Modify: `packages/core-v2/src/core/GridCore.test.ts`

- [ ] **Step 1.1: Write failing test for cross-module read from `transformColumnDefs`**

Open `packages/core-v2/src/core/GridCore.test.ts` and add this test to whichever describe block already groups transform-pipeline tests (search for `transformColumnDefs(`). Add the import for `Module` if not already present.

```ts
it('exposes ctx.getModuleState to transformColumnDefs so a module can read sibling state', () => {
  // sibling module owns a list of pinned colIds; the consumer module reads it.
  interface SiblingState { pinned: string[] }
  const sibling: Module<SiblingState> = {
    id: 'sibling',
    name: 'Sibling',
    schemaVersion: 1,
    priority: 0,
    getInitialState: () => ({ pinned: ['a'] }),
    serialize: (s) => s,
    deserialize: (raw) => (raw as SiblingState) ?? { pinned: [] },
  };
  const consumer: Module<{}> = {
    id: 'consumer',
    name: 'Consumer',
    schemaVersion: 1,
    priority: 10,
    dependencies: ['sibling'],
    getInitialState: () => ({}),
    serialize: () => ({}),
    deserialize: () => ({}),
    transformColumnDefs(defs, _state, ctx) {
      const s = ctx.getModuleState<SiblingState>('sibling');
      return defs.map((d) =>
        'field' in d && d.field && s.pinned.includes(d.field)
          ? { ...d, pinned: 'left' as const }
          : d,
      );
    },
  };
  const stateMap = new Map<string, unknown>([
    ['sibling', sibling.getInitialState()],
    ['consumer', consumer.getInitialState()],
  ]);
  const core = new GridCore({
    gridId: 'g1',
    modules: [sibling, consumer],
    getModuleState: <T>(id: string) => stateMap.get(id) as T,
    setModuleState: () => {},
  });
  // Attach a fake gridApi so createGridContext returns non-null. This matches
  // the pattern used by every other transform-pipeline test in this file
  // (search `core.onGridReady(fakeApi)` for examples).
  core.onGridReady({} as never);
  const out = core.transformColumnDefs([{ field: 'a' }, { field: 'b' }]);
  expect(out[0]).toEqual({ field: 'a', pinned: 'left' });
  expect(out[1]).toEqual({ field: 'b' });
});
```

- [ ] **Step 1.2: Run the test to confirm it fails**

```bash
npx vitest run packages/core-v2/src/core/GridCore.test.ts -t "exposes ctx.getModuleState"
```

Expected: FAIL with a TypeScript error like `Property 'getModuleState' does not exist on type 'GridContext'`. (If the test compiles and fails at runtime instead, that's also fine — the next steps will fix both.)

- [ ] **Step 1.3: Extend the `GridContext` type**

In `packages/core-v2/src/core/types.ts`, find the `GridContext` interface (around line 24) and add the read accessor:

```ts
export interface GridContext {
  readonly gridId: string;
  readonly gridApi: GridApi;
  readonly getRowId: GetRowIdFunc;
  /**
   * Read another module's current state. The same accessor that `ModuleContext`
   * exposes; surfaced here so cross-module reads work from inside
   * `transformColumnDefs` / `transformGridOptions`.
   *
   * Caller must know the target module's state shape — pass the type via the
   * generic, e.g. `ctx.getModuleState<ColumnTemplatesState>('column-templates')`.
   */
  readonly getModuleState: <T>(moduleId: string) => T;
}
```

- [ ] **Step 1.4: Wire `getModuleState` into `createGridContext`**

In `packages/core-v2/src/core/GridCore.ts`, find `createGridContext` (around line 221) and add the new field:

```ts
private createGridContext(): GridContext | null {
  if (!this.gridApi) return null;
  const field = this.rowIdField;
  return {
    gridId: this.gridId,
    gridApi: this.gridApi,
    getRowId: (params: GetRowIdParams) =>
      String((params.data as Record<string, unknown>)[field]),
    getModuleState: this.getModuleStateFn,
  };
}
```

`getModuleStateFn` is already a private field on the class (added in Day 2 of the v2 build). No new constructor wiring required.

- [ ] **Step 1.5: Run the test to confirm it passes**

```bash
npx vitest run packages/core-v2/src/core/GridCore.test.ts -t "exposes ctx.getModuleState"
```

Expected: PASS.

- [ ] **Step 1.6: Run the full GridCore test file to make sure nothing else broke**

```bash
npx vitest run packages/core-v2/src/core/GridCore.test.ts
```

Expected: all green.

- [ ] **Step 1.7: Type-check**

```bash
npx tsc --noEmit -p packages/core-v2/tsconfig.json
```

Expected: clean. (If a downstream module test was passing `ctx = {} as never` and now fails because TS realises the new field is missing, ignore it for this step — Task 7 fixes those test fixtures.)

- [ ] **Step 1.8: Commit**

```bash
git add packages/core-v2/src/core/types.ts packages/core-v2/src/core/GridCore.ts packages/core-v2/src/core/GridCore.test.ts
git commit -m "feat(core-v2): expose getModuleState on GridContext for cross-module transform reads"
```

---

## Task 2: Add `cellEditorName` / `cellEditorParams` / `cellRendererName` to `ColumnAssignment`

**Why now:** Sub-project #2 ships full v1 feature parity, which includes editor/renderer overrides on assignments (not just on templates). The walker emission for these three new fields is independent of template resolution — wiring them now means the resolver tests can assert that template-set values flow through the same emission code paths.

**Files:**
- Modify: `packages/core-v2/src/modules/column-customization/state.ts`
- Modify: `packages/core-v2/src/modules/column-customization/index.ts`
- Modify: `packages/core-v2/src/modules/column-customization/index.test.ts`

- [ ] **Step 2.1: Update the existing fixture so all transform tests get a stub `ctx.getModuleState`**

In `packages/core-v2/src/modules/column-customization/index.test.ts`, find the line `const ctx = {} as never;` (around line 24, inside the `describe('column-customization module — transformColumnDefs', …)` block) and replace it with:

```ts
// Stub GridContext for transform tests. `getModuleState` returns an empty
// templates state so the walker's resolver call is a no-op until tests opt in
// by overriding the stub via `makeCtx({...})` (added in Task 7).
const ctx = {
  gridId: 'test',
  gridApi: {} as never,
  getRowId: () => '0',
  getModuleState: <T,>(_id: string) => ({ templates: {}, typeDefaults: {} } as T),
} as never;
```

This keeps every existing test green: the stub returns an empty templates state so the resolver is an identity. Don't run the suite yet — the resolver doesn't exist yet; we'll come back here in Task 7.

- [ ] **Step 2.2: Write failing test for `cellEditorName` flowing through the walker**

Add this inside the `describe('column-customization module — transformColumnDefs', …)` block in `packages/core-v2/src/modules/column-customization/index.test.ts`:

```ts
it('emits colDef.cellEditor when cellEditorName is set on the assignment', () => {
  const state: ColumnCustomizationState = {
    assignments: { symbol: { colId: 'symbol', cellEditorName: 'agSelectCellEditor' } },
  };
  const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
  expect(out[0].cellEditor).toBe('agSelectCellEditor');
});

it('emits colDef.cellEditorParams when cellEditorParams is set on the assignment', () => {
  const state: ColumnCustomizationState = {
    assignments: {
      symbol: {
        colId: 'symbol',
        cellEditorName: 'agSelectCellEditor',
        cellEditorParams: { values: ['A', 'B'] },
      },
    },
  };
  const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
  expect(out[0].cellEditorParams).toEqual({ values: ['A', 'B'] });
});

it('emits colDef.cellRenderer when cellRendererName is set on the assignment', () => {
  const state: ColumnCustomizationState = {
    assignments: { symbol: { colId: 'symbol', cellRendererName: 'sideRenderer' } },
  };
  const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
  expect(out[0].cellRenderer).toBe('sideRenderer');
});
```

- [ ] **Step 2.3: Run the new tests and confirm they fail**

```bash
npx vitest run packages/core-v2/src/modules/column-customization/index.test.ts -t "cellEditor|cellRenderer"
```

Expected: 3 FAIL — TypeScript will reject `cellEditorName` / `cellEditorParams` / `cellRendererName` as unknown fields on `ColumnAssignment` until the next step.

- [ ] **Step 2.4: Add the three new optional fields to `ColumnAssignment`**

In `packages/core-v2/src/modules/column-customization/state.ts`, find the `ColumnAssignment` interface (around lines 9-29) and append three new optional fields after `templateIds?:`:

```ts
  // ─── New in schemaVersion 3 (sub-project #2) ─────────────────────────────
  // Direct editor / renderer overrides. Resolved by AG-Grid's component
  // registry by name — consumers are responsible for registering components
  // via `GridOptions.components`. `cellEditorParams` is treated as opaque
  // and replaced wholesale on template merge (no deep merge).
  cellEditorName?: string;
  cellEditorParams?: Record<string, unknown>;
  cellRendererName?: string;
}
```

The closing `}` is the existing one for `ColumnAssignment`; do not add a second `}`.

- [ ] **Step 2.5: Add the three matching emission blocks in `applyAssignments`**

In `packages/core-v2/src/modules/column-customization/index.ts`, find `applyAssignments` (around lines 20-65). After the existing `valueFormatterTemplate` block (around line 58-60), and before the templateIds signpost comment (around line 61-62), add:

```ts
    if (a.cellEditorName !== undefined) merged.cellEditor = a.cellEditorName;
    if (a.cellEditorParams !== undefined) merged.cellEditorParams = a.cellEditorParams;
    if (a.cellRendererName !== undefined) merged.cellRenderer = a.cellRendererName;
```

- [ ] **Step 2.6: Run the new tests and confirm they pass**

```bash
npx vitest run packages/core-v2/src/modules/column-customization/index.test.ts -t "cellEditor|cellRenderer"
```

Expected: 3 PASS.

- [ ] **Step 2.7: Run the full column-customization test file**

```bash
npx vitest run packages/core-v2/src/modules/column-customization/index.test.ts
```

Expected: all green (existing tests + 3 new).

- [ ] **Step 2.8: Bump `schemaVersion` 2 → 3 (do NOT extend `migrate`)**

In `packages/core-v2/src/modules/column-customization/index.ts`, change `schemaVersion: 2` to `schemaVersion: 3`. Leave the existing `migrate` function untouched — it still only handles `fromVersion === 1`. Per the spec's no-backward-compatibility decision, v2 snapshots on disk will fall through to the existing "cannot migrate from schemaVersion 2; falling back to initial state" warning path. There is no production v2 data to break.

The change is a single-line edit; the resulting module declaration looks like:

```ts
export const columnCustomizationModule: Module<ColumnCustomizationState> = {
  id: 'column-customization',
  name: 'Columns',
  schemaVersion: 3,                          // bumped from 2
  // ... rest unchanged ...
};
```

- [ ] **Step 2.9: Update the metadata test in `index.test.ts`**

In `packages/core-v2/src/modules/column-customization/index.test.ts`, find the existing metadata test (around line 11-16) that asserts `schemaVersion === 2` and update it to assert `=== 3`:

```ts
it('declares schemaVersion and stable id', () => {
  expect(columnCustomizationModule.id).toBe('column-customization');
  expect(columnCustomizationModule.schemaVersion).toBe(3);
  // After general-settings (priority 0) so per-column overrides win.
  expect(columnCustomizationModule.priority).toBeGreaterThan(0);
});
```

- [ ] **Step 2.10: Update `state.test.ts` — rename describe, assert new fields default to undefined, add v2 → v3 fallback test**

In `packages/core-v2/src/modules/column-customization/state.test.ts`, the existing migration describe is titled `'column-customization — migrate (schemaVersion 1 → 2)'`. Update it to reflect the new range and tighten the existing assertion to cover the three new fields. Then add a v2 fallback test below it.

Replace the existing first describe block with:

```ts
describe('column-customization — migrate (schemaVersion 1 → 3)', () => {
  it('passes a v1 snapshot through unchanged (new v2 + v3 fields default to undefined)', () => {
    const v1State = {
      assignments: {
        symbol: { colId: 'symbol', headerName: 'Ticker', initialWidth: 120 },
      },
    };
    const out = columnCustomizationModule.migrate!(v1State, 1) as ColumnCustomizationState;
    expect(out).toEqual(v1State);
    // None of the new v2 fields should be auto-populated.
    expect(out.assignments.symbol.cellStyleOverrides).toBeUndefined();
    expect(out.assignments.symbol.headerStyleOverrides).toBeUndefined();
    expect(out.assignments.symbol.valueFormatterTemplate).toBeUndefined();
    expect(out.assignments.symbol.templateIds).toBeUndefined();
    // None of the new v3 fields should be auto-populated either.
    expect(out.assignments.symbol.cellEditorName).toBeUndefined();
    expect(out.assignments.symbol.cellEditorParams).toBeUndefined();
    expect(out.assignments.symbol.cellRendererName).toBeUndefined();
  });
});

describe('column-customization — migrate from v2 (no backward compat by design)', () => {
  it('v2 snapshots hit the "cannot migrate from schemaVersion 2" warning + fall back to initial', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const v2 = { assignments: { symbol: { colId: 'symbol', headerName: 'Ticker' } } };
      const out = columnCustomizationModule.migrate!(v2, 2) as ColumnCustomizationState;
      expect(out).toEqual(INITIAL_COLUMN_CUSTOMIZATION);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('column-customization'),
        expect.stringContaining('cannot migrate from schemaVersion 2'),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
```

The existing file already imports `vi`, so no import change is needed. If the existing v1 → v2 describe contains additional tests beyond the one shown in this step (read the file with `cat` to confirm), preserve them — just rename the describe title and extend the new-field-defaults assertion.

- [ ] **Step 2.11: Run the column-customization tests + type-check**

```bash
npx vitest run packages/core-v2/src/modules/column-customization/
npx tsc --noEmit -p packages/core-v2/tsconfig.json
```

Expected: all green; no type errors.

- [ ] **Step 2.12: Commit**

```bash
git add packages/core-v2/src/modules/column-customization/state.ts \
        packages/core-v2/src/modules/column-customization/index.ts \
        packages/core-v2/src/modules/column-customization/index.test.ts \
        packages/core-v2/src/modules/column-customization/state.test.ts
git commit -m "feat(column-customization): add cellEditor/cellRenderer fields, bump schemaVersion 2→3"
```

---

## Task 3: Create `column-templates/state.ts`

**Files:**
- Create: `packages/core-v2/src/modules/column-templates/state.ts`
- Create: `packages/core-v2/src/modules/column-templates/state.test.ts`

- [ ] **Step 3.1: Write the state module**

Create `packages/core-v2/src/modules/column-templates/state.ts`:

```ts
import type {
  CellStyleOverrides,
  ValueFormatterTemplate,
} from '../column-customization/state';

/**
 * A reusable bundle of per-column overrides. Templates are referenced from
 * `ColumnAssignment.templateIds[]`; the resolver in `./resolveTemplates.ts`
 * folds the chain into a composite assignment that the column-customization
 * walker emits.
 *
 * Field semantics (see `resolveTemplates.ts` for the merge rules):
 *  - `cellStyleOverrides` / `headerStyleOverrides` merge per-field across the chain.
 *  - Every other field is last-writer-wins.
 *  - `cellEditorParams` is opaque — a later template's params object replaces
 *    the earlier one wholesale (no deep merge).
 *  - `cellEditorName` / `cellRendererName` are AG-Grid component-registry keys.
 *    Component registration is the consumer's responsibility (e.g. via
 *    `GridOptions.components`).
 */
export interface ColumnTemplate {
  readonly id: string;
  name: string;
  description?: string;
  // Styling
  cellStyleOverrides?: CellStyleOverrides;
  headerStyleOverrides?: CellStyleOverrides;
  // Formatting
  valueFormatterTemplate?: ValueFormatterTemplate;
  // Behavior flags
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;
  // Cell editor + renderer (resolved via AG-Grid's component registry by name)
  cellEditorName?: string;
  cellEditorParams?: Record<string, unknown>;
  cellRendererName?: string;
  // Audit (kept for forward-UX needs in sub-project #4)
  createdAt: number;
  updatedAt: number;
}

/**
 * AG-Grid's `cellDataType` vocabulary that `typeDefaults` keys against. We
 * deliberately don't include AG-Grid's `'object'` / custom types — typeDefaults
 * is meant for the four broad bucket types users want to style consistently
 * (e.g., "every numeric column right-aligns").
 */
export type ColumnDataType = 'numeric' | 'date' | 'string' | 'boolean';

export interface ColumnTemplatesState {
  /** templateId → ColumnTemplate. */
  templates: Record<string, ColumnTemplate>;
  /** dataType → templateId. The resolver applies the matching template as the
   *  bottom-of-chain default when the column's assignment has NO explicit
   *  `templateIds` field. An empty `templateIds: []` opts the column out of
   *  this fallback. */
  typeDefaults: Partial<Record<ColumnDataType, string>>;
}

export const INITIAL_COLUMN_TEMPLATES: ColumnTemplatesState = {
  templates: {},
  typeDefaults: {},
};
```

- [ ] **Step 3.2: Write state tests**

Create `packages/core-v2/src/modules/column-templates/state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { INITIAL_COLUMN_TEMPLATES, type ColumnTemplatesState } from './state';

describe('column-templates state', () => {
  it('INITIAL_COLUMN_TEMPLATES has empty templates and typeDefaults', () => {
    expect(INITIAL_COLUMN_TEMPLATES).toEqual({ templates: {}, typeDefaults: {} });
  });

  it('INITIAL_COLUMN_TEMPLATES is a fresh object — callers can mutate spread copies', () => {
    const a: ColumnTemplatesState = { ...INITIAL_COLUMN_TEMPLATES, templates: {} };
    a.templates['x'] = {
      id: 'x', name: 'X', createdAt: 0, updatedAt: 0,
    };
    // The shared INITIAL must not have been mutated.
    expect(INITIAL_COLUMN_TEMPLATES.templates).toEqual({});
  });
});
```

- [ ] **Step 3.3: Run the state tests**

```bash
npx vitest run packages/core-v2/src/modules/column-templates/state.test.ts
```

Expected: 2 PASS.

- [ ] **Step 3.4: Commit**

```bash
git add packages/core-v2/src/modules/column-templates/state.ts \
        packages/core-v2/src/modules/column-templates/state.test.ts
git commit -m "feat(column-templates): add state types and INITIAL_COLUMN_TEMPLATES"
```

---

## Task 4: Create `column-templates` module skeleton

**Files:**
- Create: `packages/core-v2/src/modules/column-templates/index.ts`
- Create: `packages/core-v2/src/modules/column-templates/index.test.ts`

- [ ] **Step 4.1: Write failing module-metadata + serialize/deserialize tests**

Create `packages/core-v2/src/modules/column-templates/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { columnTemplatesModule, INITIAL_COLUMN_TEMPLATES } from './index';
import type { ColumnTemplatesState } from './state';

describe('column-templates module — metadata', () => {
  it('declares stable id and schemaVersion 1', () => {
    expect(columnTemplatesModule.id).toBe('column-templates');
    expect(columnTemplatesModule.schemaVersion).toBe(1);
  });

  it('declares no module dependencies (pure state holder)', () => {
    expect(columnTemplatesModule.dependencies ?? []).toEqual([]);
  });

  it('runs before column-customization in the transform pipeline (priority < 10)', () => {
    expect(columnTemplatesModule.priority).toBeLessThan(10);
  });

  it('exposes no transformColumnDefs and no SettingsPanel (column-customization owns the walker; UI lands in sub-project #4)', () => {
    expect(columnTemplatesModule.transformColumnDefs).toBeUndefined();
    expect(columnTemplatesModule.SettingsPanel).toBeUndefined();
  });
});

describe('column-templates module — serialize / deserialize', () => {
  it('round-trips state', () => {
    const state: ColumnTemplatesState = {
      templates: {
        n1: { id: 'n1', name: 'Numeric', sortable: true, createdAt: 1, updatedAt: 2 },
      },
      typeDefaults: { numeric: 'n1' },
    };
    expect(columnTemplatesModule.deserialize(columnTemplatesModule.serialize(state))).toEqual(state);
  });

  it('tolerates null / undefined / non-object payloads → INITIAL', () => {
    expect(columnTemplatesModule.deserialize(null)).toEqual(INITIAL_COLUMN_TEMPLATES);
    expect(columnTemplatesModule.deserialize(undefined)).toEqual(INITIAL_COLUMN_TEMPLATES);
    expect(columnTemplatesModule.deserialize('garbage')).toEqual(INITIAL_COLUMN_TEMPLATES);
  });

  it('drops malformed templates / typeDefaults sub-fields', () => {
    const out = columnTemplatesModule.deserialize({
      templates: 'not an object',
      typeDefaults: 42,
    });
    expect(out).toEqual(INITIAL_COLUMN_TEMPLATES);
  });
});
```

- [ ] **Step 4.2: Run the tests, confirm they fail (module doesn't exist yet)**

```bash
npx vitest run packages/core-v2/src/modules/column-templates/index.test.ts
```

Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 4.3: Write the module**

Create `packages/core-v2/src/modules/column-templates/index.ts`:

```ts
import type { Module } from '../../core/types';
import {
  INITIAL_COLUMN_TEMPLATES,
  type ColumnTemplatesState,
  type ColumnTemplate,
  type ColumnDataType,
} from './state';

/**
 * Passive state holder for reusable column-template definitions. No
 * transformColumnDefs, no SettingsPanel — `column-customization` owns the
 * walker and reads this module's state via `ctx.getModuleState`. UI surface
 * lands in sub-project #4 (FormattingToolbar v2 port).
 *
 * Priority 5 places this module before `column-customization` (10) in the
 * transform pipeline, so its state is settled by the time the customization
 * walker reads it. Order is also enforced structurally by
 * `column-customization.dependencies = ['column-templates']` (Task 6).
 */
export const columnTemplatesModule: Module<ColumnTemplatesState> = {
  id: 'column-templates',
  name: 'Templates',
  schemaVersion: 1,
  priority: 5,

  getInitialState: () => ({ ...INITIAL_COLUMN_TEMPLATES }),

  serialize: (state) => state,

  deserialize: (data) => {
    if (!data || typeof data !== 'object') return { ...INITIAL_COLUMN_TEMPLATES };
    const raw = data as Partial<ColumnTemplatesState>;
    return {
      templates:
        raw.templates && typeof raw.templates === 'object' && !Array.isArray(raw.templates)
          ? (raw.templates as Record<string, ColumnTemplate>)
          : {},
      typeDefaults:
        raw.typeDefaults && typeof raw.typeDefaults === 'object' && !Array.isArray(raw.typeDefaults)
          ? (raw.typeDefaults as Partial<Record<ColumnDataType, string>>)
          : {},
    };
  },
};

export type { ColumnTemplate, ColumnDataType, ColumnTemplatesState };
export { INITIAL_COLUMN_TEMPLATES };
```

- [ ] **Step 4.4: Run the tests, confirm they pass**

```bash
npx vitest run packages/core-v2/src/modules/column-templates/index.test.ts
```

Expected: all green.

- [ ] **Step 4.5: Commit**

```bash
git add packages/core-v2/src/modules/column-templates/index.ts \
        packages/core-v2/src/modules/column-templates/index.test.ts
git commit -m "feat(column-templates): add module skeleton with serialize/deserialize"
```

---

## Task 5: Write `resolveTemplates` resolver (TDD, all 20 tests)

**Files:**
- Create: `packages/core-v2/src/modules/column-templates/resolveTemplates.ts`
- Create: `packages/core-v2/src/modules/column-templates/resolveTemplates.test.ts`

The resolver gets built up incrementally — each sub-task adds a behavior + its tests. Each step ends with a passing test suite and a commit.

- [ ] **Step 5.1: Write the resolveTemplates test scaffold + identity tests (tests 1, 2, 16)**

Create `packages/core-v2/src/modules/column-templates/resolveTemplates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveTemplates } from './resolveTemplates';
import type { ColumnTemplate, ColumnTemplatesState } from './state';
import type { ColumnAssignment } from '../column-customization/state';

const baseAssignment = (over: Partial<ColumnAssignment> = {}): ColumnAssignment => ({
  colId: 'price',
  ...over,
});

const tpl = (id: string, over: Partial<ColumnTemplate> = {}): ColumnTemplate => ({
  id,
  name: id,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const emptyState: ColumnTemplatesState = { templates: {}, typeDefaults: {} };

describe('resolveTemplates — identity / no-op paths', () => {
  it('test 1 — no templateIds and no typeDefault → returns assignment unchanged (identity)', () => {
    const a = baseAssignment({ headerName: 'Price' });
    expect(resolveTemplates(a, emptyState, undefined)).toBe(a);
  });

  it('test 2 — empty templateIds: [] and no typeDefault → returns assignment unchanged', () => {
    const a = baseAssignment({ templateIds: [] });
    expect(resolveTemplates(a, emptyState, undefined)).toBe(a);
  });

  it('test 16 — empty template (only id/name/timestamps) in chain → no-op merge, doesn\'t clear existing fields', () => {
    const a = baseAssignment({ headerName: 'Price', sortable: true, templateIds: ['empty'] });
    const state: ColumnTemplatesState = {
      templates: { empty: tpl('empty') },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.headerName).toBe('Price');
    expect(out.sortable).toBe(true);
  });
});
```

- [ ] **Step 5.2: Run the tests, confirm they fail**

```bash
npx vitest run packages/core-v2/src/modules/column-templates/resolveTemplates.test.ts
```

Expected: FAIL — `Cannot find module './resolveTemplates'`.

- [ ] **Step 5.3: Write the resolver — minimal version (chain build + identity short-circuit)**

Create `packages/core-v2/src/modules/column-templates/resolveTemplates.ts`:

```ts
import type {
  CellStyleOverrides,
  ColumnAssignment,
  ValueFormatterTemplate,
} from '../column-customization/state';
import type {
  ColumnDataType,
  ColumnTemplate,
  ColumnTemplatesState,
} from './state';

/**
 * Compose a `ColumnAssignment` from its referenced templates + any
 * type-default + the assignment's own fields, in this precedence (low → high):
 *
 *   1. typeDefault for `colDataType`, IF the assignment has no explicit
 *      `templateIds` field. An explicit `templateIds: []` blocks this fallback,
 *      so users can opt out of typeDefaults per-column.
 *   2. Each id in `assignment.templateIds[]`, in array order — later wins.
 *   3. Assignment's own fields — always win last.
 *
 * Per-field merge for `cellStyleOverrides` and `headerStyleOverrides` (so two
 * templates can layer typography vs colors without clobbering each other).
 * Last-writer-wins for everything else. `cellEditorParams` is opaque and
 * replaced wholesale on merge — no deep merge.
 *
 * Pure: same input always produces equal output. Reference equality is only
 * promised on the identity short-circuit (no templates apply).
 */
export function resolveTemplates(
  assignment: ColumnAssignment,
  templatesState: ColumnTemplatesState,
  colDataType: ColumnDataType | undefined,
): ColumnAssignment {
  // 1. Build the ordered chain of templates to apply (low → high precedence).
  const chain: ColumnTemplate[] = [];

  if (assignment.templateIds === undefined && colDataType !== undefined) {
    const fallbackId = templatesState.typeDefaults[colDataType];
    const fallback = fallbackId ? templatesState.templates[fallbackId] : undefined;
    if (fallback) chain.push(fallback);
  }

  for (const id of assignment.templateIds ?? []) {
    const t = templatesState.templates[id];
    if (t) chain.push(t);
    // Unknown ids silently skipped — template was deleted but assignment
    // still references it. Don't crash the grid; just no-op the missing layer.
  }

  if (chain.length === 0) return assignment;

  // 2. Fold the chain left-to-right, then assignment last.
  const composed: ColumnAssignment = { colId: assignment.colId };
  for (const t of chain) applyTemplateLikeOver(composed, t);
  applyTemplateLikeOver(composed, assignment);
  return composed;
}

/**
 * Layer a template-shaped or assignment-shaped object onto an accumulator.
 * Per-field merge for the two style fields; last-writer-wins for the rest;
 * `cellEditorParams` is treated as opaque (wholesale replace).
 *
 * Mutates `target` and returns it. Used by both the chain fold and the
 * assignment-wins-last step so the two paths can't drift.
 */
function applyTemplateLikeOver(
  target: ColumnAssignment,
  source: Partial<ColumnTemplate> & Partial<ColumnAssignment>,
): ColumnAssignment {
  // Per-field merge for styling.
  if (source.cellStyleOverrides !== undefined) {
    target.cellStyleOverrides = mergeStyle(target.cellStyleOverrides, source.cellStyleOverrides);
  }
  if (source.headerStyleOverrides !== undefined) {
    target.headerStyleOverrides = mergeStyle(target.headerStyleOverrides, source.headerStyleOverrides);
  }
  // Last-writer-wins for everything else.
  if (source.valueFormatterTemplate !== undefined) {
    target.valueFormatterTemplate = source.valueFormatterTemplate as ValueFormatterTemplate;
  }
  if (source.sortable !== undefined) target.sortable = source.sortable;
  if (source.filterable !== undefined) target.filterable = source.filterable;
  if (source.resizable !== undefined) target.resizable = source.resizable;
  if (source.cellEditorName !== undefined) target.cellEditorName = source.cellEditorName;
  if (source.cellEditorParams !== undefined) target.cellEditorParams = source.cellEditorParams;
  if (source.cellRendererName !== undefined) target.cellRendererName = source.cellRendererName;
  // Assignment-only fields — only present when source is the assignment itself.
  if ('headerName' in source && source.headerName !== undefined) target.headerName = source.headerName;
  if ('headerTooltip' in source && source.headerTooltip !== undefined) target.headerTooltip = source.headerTooltip;
  if ('initialWidth' in source && source.initialWidth !== undefined) target.initialWidth = source.initialWidth;
  if ('initialHide' in source && source.initialHide !== undefined) target.initialHide = source.initialHide;
  if ('initialPinned' in source && source.initialPinned !== undefined) target.initialPinned = source.initialPinned;
  if ('templateIds' in source && source.templateIds !== undefined) target.templateIds = source.templateIds;
  return target;
}

function mergeStyle(
  base: CellStyleOverrides | undefined,
  top: CellStyleOverrides,
): CellStyleOverrides {
  if (!base) return top;
  return {
    typography: base.typography || top.typography
      ? { ...base.typography, ...top.typography }
      : undefined,
    colors: base.colors || top.colors
      ? { ...base.colors, ...top.colors }
      : undefined,
    alignment: base.alignment || top.alignment
      ? { ...base.alignment, ...top.alignment }
      : undefined,
    // Borders merge per-side, not per-property within a side. A complete
    // BorderSpec is a unit; you don't typically want "t1's color + t2's width".
    borders: base.borders || top.borders
      ? { ...base.borders, ...top.borders }
      : undefined,
  };
}
```

- [ ] **Step 5.4: Run the tests, confirm they pass**

```bash
npx vitest run packages/core-v2/src/modules/column-templates/resolveTemplates.test.ts
```

Expected: 3 PASS.

- [ ] **Step 5.5: Add chain-composition tests (tests 3, 4, 5, 6)**

Append to `packages/core-v2/src/modules/column-templates/resolveTemplates.test.ts`:

```ts
describe('resolveTemplates — chain composition', () => {
  it('test 3 — single templateId → fields from template appear on resolved', () => {
    const a = baseAssignment({ templateIds: ['t1'] });
    const state: ColumnTemplatesState = {
      templates: { t1: tpl('t1', { sortable: true, filterable: false }) },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.sortable).toBe(true);
    expect(out.filterable).toBe(false);
  });

  it('test 4 — two templateIds → later wins for last-writer-wins fields', () => {
    const a = baseAssignment({ templateIds: ['t1', 't2'] });
    const state: ColumnTemplatesState = {
      templates: {
        t1: tpl('t1', { sortable: true, filterable: true, resizable: false }),
        t2: tpl('t2', { sortable: false, resizable: true }),
      },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.sortable).toBe(false);     // t2 won
    expect(out.filterable).toBe(true);    // only t1 set it; survives
    expect(out.resizable).toBe(true);     // t2 won
  });

  it('test 5 — overlapping cellStyleOverrides.typography → per-field merge (later bold wins, earlier fontSize survives)', () => {
    const a = baseAssignment({ templateIds: ['t1', 't2'] });
    const state: ColumnTemplatesState = {
      templates: {
        t1: tpl('t1', { cellStyleOverrides: { typography: { bold: false, fontSize: 14 } } }),
        t2: tpl('t2', { cellStyleOverrides: { typography: { bold: true } } }),
      },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.cellStyleOverrides?.typography?.bold).toBe(true);
    expect(out.cellStyleOverrides?.typography?.fontSize).toBe(14);
  });

  it('test 6 — overlapping colors AND non-overlapping borders → both merged into one composed style', () => {
    const a = baseAssignment({ templateIds: ['t1', 't2'] });
    const state: ColumnTemplatesState = {
      templates: {
        t1: tpl('t1', {
          cellStyleOverrides: {
            colors: { background: '#000', text: '#fff' },
            borders: { top: { width: 1, style: 'solid', color: '#ccc' } },
          },
        }),
        t2: tpl('t2', {
          cellStyleOverrides: {
            colors: { background: '#111' },
            borders: { bottom: { width: 2, style: 'dashed', color: '#888' } },
          },
        }),
      },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.cellStyleOverrides?.colors).toEqual({ background: '#111', text: '#fff' });
    expect(out.cellStyleOverrides?.borders?.top).toEqual({ width: 1, style: 'solid', color: '#ccc' });
    expect(out.cellStyleOverrides?.borders?.bottom).toEqual({ width: 2, style: 'dashed', color: '#888' });
  });
});
```

- [ ] **Step 5.6: Run the tests, confirm they pass**

```bash
npx vitest run packages/core-v2/src/modules/column-templates/resolveTemplates.test.ts
```

Expected: 7 PASS.

- [ ] **Step 5.7: Add assignment-wins-last tests (tests 7, 8, 9)**

Append:

```ts
describe('resolveTemplates — assignment wins last', () => {
  it('test 7 — assignment override of a styling sub-field beats template (per-field)', () => {
    const a = baseAssignment({
      templateIds: ['t1'],
      cellStyleOverrides: { typography: { bold: false } },
    });
    const state: ColumnTemplatesState = {
      templates: {
        t1: tpl('t1', { cellStyleOverrides: { typography: { bold: true, fontSize: 14 } } }),
      },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.cellStyleOverrides?.typography?.bold).toBe(false);     // assignment won
    expect(out.cellStyleOverrides?.typography?.fontSize).toBe(14);    // template's value survives
  });

  it('test 8 — assignment override of a behavior flag beats template', () => {
    const a = baseAssignment({ templateIds: ['t1'], sortable: false });
    const state: ColumnTemplatesState = {
      templates: { t1: tpl('t1', { sortable: true }) },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.sortable).toBe(false);
  });

  it('test 9 — assignment valueFormatterTemplate beats template (entire union replaced)', () => {
    const a = baseAssignment({
      templateIds: ['t1'],
      valueFormatterTemplate: { kind: 'preset', preset: 'currency' },
    });
    const state: ColumnTemplatesState = {
      templates: {
        t1: tpl('t1', { valueFormatterTemplate: { kind: 'preset', preset: 'percent' } }),
      },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'currency' });
  });
});
```

- [ ] **Step 5.8: Run the tests, confirm they pass**

```bash
npx vitest run packages/core-v2/src/modules/column-templates/resolveTemplates.test.ts
```

Expected: 10 PASS.

- [ ] **Step 5.9: Add unknown-id + typeDefaults tests (tests 10, 11, 12, 13, 14, 15)**

Append:

```ts
describe('resolveTemplates — unknown ids and typeDefaults', () => {
  it('test 10 — templateIds references unknown id → silently skipped, other ids still apply', () => {
    const a = baseAssignment({ templateIds: ['ghost', 't1'] });
    const state: ColumnTemplatesState = {
      templates: { t1: tpl('t1', { sortable: true }) },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.sortable).toBe(true);
  });

  it('test 11 — templateIds undefined AND typeDefault exists for column dataType → typeDefault applies', () => {
    const a = baseAssignment(); // no templateIds
    const state: ColumnTemplatesState = {
      templates: { numericTpl: tpl('numericTpl', { sortable: true }) },
      typeDefaults: { numeric: 'numericTpl' },
    };
    const out = resolveTemplates(a, state, 'numeric');
    expect(out.sortable).toBe(true);
  });

  it('test 12 — templateIds: [] (explicit empty) AND typeDefault exists → typeDefault does NOT apply (explicit opt-out)', () => {
    const a = baseAssignment({ templateIds: [] });
    const state: ColumnTemplatesState = {
      templates: { numericTpl: tpl('numericTpl', { sortable: true }) },
      typeDefaults: { numeric: 'numericTpl' },
    };
    const out = resolveTemplates(a, state, 'numeric');
    expect(out.sortable).toBeUndefined();
  });

  it('test 13 — typeDefault references unknown templateId → silently no-op', () => {
    const a = baseAssignment();
    const state: ColumnTemplatesState = {
      templates: {},
      typeDefaults: { numeric: 'ghost' },
    };
    const out = resolveTemplates(a, state, 'numeric');
    expect(out).toBe(a); // identity short-circuit
  });

  it('test 14 — typeDefault for numeric applies; columns of other dataTypes unaffected', () => {
    const a = baseAssignment();
    const state: ColumnTemplatesState = {
      templates: { numTpl: tpl('numTpl', { filterable: true }) },
      typeDefaults: { numeric: 'numTpl' },
    };
    expect(resolveTemplates(a, state, 'string').filterable).toBeUndefined();
    expect(resolveTemplates(a, state, 'date').filterable).toBeUndefined();
    expect(resolveTemplates(a, state, 'numeric').filterable).toBe(true);
  });

  it('test 15 — typeDefault composition: column with no templateIds, only typeDefault → resolved fields match the typeDefault template', () => {
    const a = baseAssignment();
    const state: ColumnTemplatesState = {
      templates: {
        d: tpl('d', {
          sortable: true,
          cellStyleOverrides: { alignment: { horizontal: 'right' } },
        }),
      },
      typeDefaults: { date: 'd' },
    };
    const out = resolveTemplates(a, state, 'date');
    expect(out.sortable).toBe(true);
    expect(out.cellStyleOverrides?.alignment?.horizontal).toBe('right');
  });
});
```

- [ ] **Step 5.10: Run the tests, confirm they pass**

```bash
npx vitest run packages/core-v2/src/modules/column-templates/resolveTemplates.test.ts
```

Expected: 16 PASS.

- [ ] **Step 5.11: Add purity + border-merge + opaque-params tests (tests 17, 18, 19, 20)**

Append:

```ts
describe('resolveTemplates — purity, borders, opaque params', () => {
  it('test 17 — pure function: same input produces equal output values', () => {
    const a = baseAssignment({ templateIds: ['t1'], sortable: false });
    const state: ColumnTemplatesState = {
      templates: { t1: tpl('t1', { sortable: true, filterable: true }) },
      typeDefaults: {},
    };
    const out1 = resolveTemplates(a, state, undefined);
    const out2 = resolveTemplates(a, state, undefined);
    expect(out1).toEqual(out2);
  });

  it('test 18 — borders: t1 sets only top, t2 sets only bottom → both present in resolved', () => {
    const a = baseAssignment({ templateIds: ['t1', 't2'] });
    const state: ColumnTemplatesState = {
      templates: {
        t1: tpl('t1', {
          cellStyleOverrides: { borders: { top: { width: 1, style: 'solid', color: '#aaa' } } },
        }),
        t2: tpl('t2', {
          cellStyleOverrides: { borders: { bottom: { width: 2, style: 'dashed', color: '#bbb' } } },
        }),
      },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    expect(out.cellStyleOverrides?.borders?.top).toEqual({ width: 1, style: 'solid', color: '#aaa' });
    expect(out.cellStyleOverrides?.borders?.bottom).toEqual({ width: 2, style: 'dashed', color: '#bbb' });
  });

  it('test 19 — borders: t1 sets top, t2 also sets top → t2\'s full BorderSpec wins (per-side replace, not per-property)', () => {
    const a = baseAssignment({ templateIds: ['t1', 't2'] });
    const state: ColumnTemplatesState = {
      templates: {
        t1: tpl('t1', {
          cellStyleOverrides: { borders: { top: { width: 1, style: 'solid', color: '#aaa' } } },
        }),
        t2: tpl('t2', {
          cellStyleOverrides: { borders: { top: { width: 3, style: 'dotted', color: '#ccc' } } },
        }),
      },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    // t2 wholesale replaced t1's top-border spec — including the color.
    expect(out.cellStyleOverrides?.borders?.top).toEqual({ width: 3, style: 'dotted', color: '#ccc' });
  });

  it('test 20 — cellEditorParams replaced wholesale by later template (not deep-merged) — opaque-object semantic', () => {
    const a = baseAssignment({ templateIds: ['t1', 't2'] });
    const state: ColumnTemplatesState = {
      templates: {
        t1: tpl('t1', {
          cellEditorName: 'agSelectCellEditor',
          cellEditorParams: { values: ['A', 'B'], placeholder: 'pick' },
        }),
        t2: tpl('t2', {
          cellEditorParams: { values: ['X', 'Y'] },
        }),
      },
      typeDefaults: {},
    };
    const out = resolveTemplates(a, state, undefined);
    // t2's params replaced t1's wholesale — `placeholder` is gone.
    expect(out.cellEditorParams).toEqual({ values: ['X', 'Y'] });
    // But cellEditorName came from t1 and is unchanged (t2 didn't set it).
    expect(out.cellEditorName).toBe('agSelectCellEditor');
  });
});
```

- [ ] **Step 5.12: Run the full resolver test file**

```bash
npx vitest run packages/core-v2/src/modules/column-templates/resolveTemplates.test.ts
```

Expected: 20 PASS.

- [ ] **Step 5.13: Run the entire column-templates test directory**

```bash
npx vitest run packages/core-v2/src/modules/column-templates
```

Expected: all green (state + module skeleton + resolver).

- [ ] **Step 5.14: Type-check**

```bash
npx tsc --noEmit -p packages/core-v2/tsconfig.json
```

Expected: clean.

- [ ] **Step 5.15: Commit**

```bash
git add packages/core-v2/src/modules/column-templates/resolveTemplates.ts \
        packages/core-v2/src/modules/column-templates/resolveTemplates.test.ts
git commit -m "feat(column-templates): implement resolveTemplates with 20 tests covering chain composition, typeDefaults, and edge cases"
```

---

## Task 6: Wire `column-customization.dependencies = ['column-templates']`

**Why before the walker change:** The dependency declaration is a structural assertion — the next task assumes the two modules will always register together. Prove the enforcement works first; then do the walker integration on a known-sound foundation.

**Files:**
- Modify: `packages/core-v2/src/modules/column-customization/index.ts`
- Modify: `packages/core-v2/src/modules/column-customization/index.test.ts`

- [ ] **Step 6.1: Write failing dep-enforcement test**

In `packages/core-v2/src/modules/column-customization/index.test.ts`, find the `describe('column-customization module — metadata', …)` block and add this test inside it:

```ts
it('declares column-templates as a dependency (enforced at registration)', () => {
  expect(columnCustomizationModule.dependencies).toEqual(['column-templates']);
});
```

Also add a separate describe block at the bottom of the file for the integration assertion:

```ts
describe('column-customization module — dependency enforcement', () => {
  it('topoSortModules throws when column-templates is missing from the module list', async () => {
    const { topoSortModules } = await import('../../core/topoSort');
    expect(() => topoSortModules([columnCustomizationModule])).toThrow(
      /column-templates/,
    );
  });

  it('topoSortModules orders column-templates BEFORE column-customization', async () => {
    const { topoSortModules } = await import('../../core/topoSort');
    const { columnTemplatesModule } = await import('../column-templates');
    // Pass them in the "wrong" order to make sure topo-sort actually reorders.
    const sorted = topoSortModules([columnCustomizationModule, columnTemplatesModule]);
    const ids = sorted.map((m) => m.id);
    expect(ids.indexOf('column-templates')).toBeLessThan(ids.indexOf('column-customization'));
  });
});
```

- [ ] **Step 6.2: Run the new tests, confirm the first two fail**

```bash
npx vitest run packages/core-v2/src/modules/column-customization/index.test.ts -t "column-templates"
```

Expected: FAIL — `dependencies` is undefined; topoSort throws because `dependencies` doesn't list `column-templates`.

- [ ] **Step 6.3: Add the dependency declaration**

In `packages/core-v2/src/modules/column-customization/index.ts`, find the module declaration (around line 77-83) and add the `dependencies` field after `schemaVersion`:

```ts
export const columnCustomizationModule: Module<ColumnCustomizationState> = {
  id: 'column-customization',
  name: 'Columns',
  schemaVersion: 3,
  dependencies: ['column-templates'],
  // After general-settings (which sets defaultColDef) so per-column overrides
  // win when they conflict with the grid-wide defaults.
  priority: 10,
  // … rest unchanged …
```

- [ ] **Step 6.4: Run the dep tests, confirm they pass**

```bash
npx vitest run packages/core-v2/src/modules/column-customization/index.test.ts -t "column-templates"
```

Expected: PASS.

- [ ] **Step 6.5: Run the full column-customization test file**

```bash
npx vitest run packages/core-v2/src/modules/column-customization/index.test.ts
```

Expected: all green.

- [ ] **Step 6.6: Commit**

```bash
git add packages/core-v2/src/modules/column-customization/index.ts \
        packages/core-v2/src/modules/column-customization/index.test.ts
git commit -m "feat(column-customization): declare dependencies: ['column-templates']"
```

---

## Task 7: Walker integration — call `resolveTemplates` from `applyAssignments`

**Files:**
- Modify: `packages/core-v2/src/modules/column-customization/index.ts`
- Modify: `packages/core-v2/src/modules/column-customization/index.test.ts`

- [ ] **Step 7.1: Add a `makeCtx` test helper**

In `packages/core-v2/src/modules/column-customization/index.test.ts`, near the top of the file (after the imports, before the first `describe`), add:

```ts
import type { ColumnTemplatesState } from '../column-templates';
import type { GridContext } from '../../core/types';

// Build a stub GridContext for transform tests, with `getModuleState` wired
// to return a column-templates state of the caller's choosing.
function makeCtx(templates: Partial<ColumnTemplatesState> = {}): GridContext {
  const tplState: ColumnTemplatesState = {
    templates: templates.templates ?? {},
    typeDefaults: templates.typeDefaults ?? {},
  };
  return {
    gridId: 'test',
    gridApi: {} as never,
    getRowId: () => '0',
    getModuleState: <T,>(id: string) => {
      if (id === 'column-templates') return tplState as T;
      throw new Error(`makeCtx: no stub for module "${id}"`);
    },
  };
}
```

Then update the existing `const ctx = …` in the `describe('column-customization module — transformColumnDefs', …)` block — replace the Step 2.1 stub with:

```ts
const ctx = makeCtx();
```

- [ ] **Step 7.2: Write failing integration tests for resolver wiring**

Append these tests to the same `describe('column-customization module — transformColumnDefs', …)` block:

```ts
it('reads column-templates state via ctx.getModuleState (templateIds emit fields from referenced template)', () => {
  const localCtx = makeCtx({
    templates: {
      bold: {
        id: 'bold',
        name: 'Bold',
        cellStyleOverrides: { typography: { bold: true } },
        createdAt: 0,
        updatedAt: 0,
      },
    },
  });
  const state: ColumnCustomizationState = {
    assignments: { symbol: { colId: 'symbol', templateIds: ['bold'] } },
  };
  const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, localCtx) as ColDef[];
  expect(out[0].cellStyle).toEqual({ fontWeight: 'bold' });
});

it('assignment fields beat template fields (per-field for styling, last-writer for the rest)', () => {
  const localCtx = makeCtx({
    templates: {
      tpl: {
        id: 'tpl',
        name: 'tpl',
        sortable: true,
        cellStyleOverrides: { typography: { bold: true, fontSize: 14 } },
        createdAt: 0,
        updatedAt: 0,
      },
    },
  });
  const state: ColumnCustomizationState = {
    assignments: {
      symbol: {
        colId: 'symbol',
        templateIds: ['tpl'],
        sortable: false,
        cellStyleOverrides: { typography: { bold: false } },
      },
    },
  };
  const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, localCtx) as ColDef[];
  expect(out[0].sortable).toBe(false);
  expect(out[0].cellStyle).toEqual({ fontWeight: 'normal', fontSize: '14px' });
});

it('typeDefault for the column\'s cellDataType applies when the assignment has no templateIds', () => {
  const defsWithType: AnyColDef[] = [
    { field: 'price', cellDataType: 'numeric' } satisfies ColDef,
  ];
  const localCtx = makeCtx({
    templates: {
      num: {
        id: 'num',
        name: 'num',
        cellStyleOverrides: { alignment: { horizontal: 'right' } },
        createdAt: 0,
        updatedAt: 0,
      },
    },
    typeDefaults: { numeric: 'num' },
  });
  // Empty assignment subscribes the column to the typeDefault.
  const state: ColumnCustomizationState = {
    assignments: { price: { colId: 'price' } },
  };
  const out = columnCustomizationModule.transformColumnDefs!(defsWithType, state, localCtx) as ColDef[];
  expect(out[0].cellStyle).toEqual({ textAlign: 'right' });
});

it('typeDefault is a no-op when colDef.cellDataType is undefined (resolver requires the data-type field)', () => {
  // `baseDefs` columns have no cellDataType set.
  const localCtx = makeCtx({
    templates: {
      num: {
        id: 'num',
        name: 'num',
        cellStyleOverrides: { alignment: { horizontal: 'right' } },
        createdAt: 0,
        updatedAt: 0,
      },
    },
    typeDefaults: { numeric: 'num' },
  });
  const state: ColumnCustomizationState = {
    assignments: { price: { colId: 'price' } },
  };
  const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, localCtx) as ColDef[];
  expect(out[1].cellStyle).toBeUndefined();
});

it('templates compose with explicit assignment cellEditor — assignment wins last', () => {
  const localCtx = makeCtx({
    templates: {
      tpl: {
        id: 'tpl',
        name: 'tpl',
        cellEditorName: 'agSelectCellEditor',
        cellEditorParams: { values: ['A', 'B'] },
        createdAt: 0,
        updatedAt: 0,
      },
    },
  });
  const state: ColumnCustomizationState = {
    assignments: {
      symbol: {
        colId: 'symbol',
        templateIds: ['tpl'],
        cellEditorParams: { values: ['X'] },
      },
    },
  };
  const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, localCtx) as ColDef[];
  expect(out[0].cellEditor).toBe('agSelectCellEditor');         // from template
  expect(out[0].cellEditorParams).toEqual({ values: ['X'] });    // assignment wholesale-replaces
});

it('identity short-circuit still fires when assignments map is empty (no templates state read)', () => {
  // Build a context whose getModuleState THROWS so we know the walker never read it.
  const throwCtx: GridContext = {
    gridId: 'test',
    gridApi: {} as never,
    getRowId: () => '0',
    getModuleState: () => {
      throw new Error('should not have been called');
    },
  };
  const out = columnCustomizationModule.transformColumnDefs!(baseDefs, INITIAL_COLUMN_CUSTOMIZATION, throwCtx);
  expect(out).toBe(baseDefs);
});

it('unknown template ids in templateIds are silently skipped (template was deleted but assignment still references it)', () => {
  const localCtx = makeCtx({
    templates: {
      ok: { id: 'ok', name: 'ok', sortable: true, createdAt: 0, updatedAt: 0 },
    },
  });
  const state: ColumnCustomizationState = {
    assignments: { symbol: { colId: 'symbol', templateIds: ['ghost', 'ok'] } },
  };
  const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, localCtx) as ColDef[];
  expect(out[0].sortable).toBe(true);
});

it('two templateIds compose styling per-field on emitted cellStyle', () => {
  const localCtx = makeCtx({
    templates: {
      a: {
        id: 'a',
        name: 'a',
        cellStyleOverrides: { typography: { bold: true }, colors: { background: '#000' } },
        createdAt: 0,
        updatedAt: 0,
      },
      b: {
        id: 'b',
        name: 'b',
        cellStyleOverrides: { colors: { text: '#fff' } },
        createdAt: 0,
        updatedAt: 0,
      },
    },
  });
  const state: ColumnCustomizationState = {
    assignments: { symbol: { colId: 'symbol', templateIds: ['a', 'b'] } },
  };
  const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, localCtx) as ColDef[];
  expect(out[0].cellStyle).toEqual({ fontWeight: 'bold', backgroundColor: '#000', color: '#fff' });
});
```

- [ ] **Step 7.3: Run the new tests, confirm they fail**

```bash
npx vitest run packages/core-v2/src/modules/column-customization/index.test.ts -t "templateId|template|typeDefault|identity short-circuit"
```

Expected: FAIL — the walker doesn't call the resolver yet, so templates/typeDefaults have no effect; the cellEditorParams test will also fail because the walker emits the assignment value directly without going through the resolver.

- [ ] **Step 7.4: Update `applyAssignments` to read templates state and call the resolver**

In `packages/core-v2/src/modules/column-customization/index.ts`, replace the import block at the top (around lines 1-11) with:

```ts
import type { ColDef, ColGroupDef } from 'ag-grid-community';
import type { AnyColDef, GridContext, Module } from '../../core/types';
import {
  INITIAL_COLUMN_CUSTOMIZATION,
  migrateFromLegacy,
  type ColumnAssignment,
  type ColumnCustomizationState,
  type LegacyColumnCustomizationState,
} from './state';
import { cellStyleToAgStyle } from './adapters/cellStyleToAgStyle';
import { valueFormatterFromTemplate } from './adapters/valueFormatterFromTemplate';
import { resolveTemplates } from '../column-templates/resolveTemplates';
import type { ColumnTemplatesState, ColumnDataType } from '../column-templates/state';
```

Then replace the `applyAssignments` function (around lines 20-65) with:

```ts
function applyAssignments(
  defs: AnyColDef[],
  assignments: Record<string, ColumnAssignment>,
  templatesState: ColumnTemplatesState,
): AnyColDef[] {
  return defs.map((def) => {
    // Group: recurse into children. The group itself has no colId so it
    // can't be assigned — only leaves can.
    if ('children' in def && Array.isArray(def.children)) {
      const next = applyAssignments(def.children, assignments, templatesState);
      const childrenUnchanged =
        next.length === def.children.length &&
        next.every((c, i) => c === def.children[i]);
      return childrenUnchanged ? def : { ...def, children: next };
    }

    const colDef = def as ColDef;
    const colId = colDef.colId ?? colDef.field;
    if (!colId) return def;
    const a = assignments[colId];
    if (!a) return def;

    // Resolve templates + typeDefault into a composite assignment.
    // `cellDataType` is AG-Grid's dataType vocabulary (numeric / date / string /
    // boolean) — the resolver only fires the typeDefault fallback when this is
    // set on the colDef AND the assignment has no explicit `templateIds`.
    const resolved = resolveTemplates(
      a,
      templatesState,
      colDef.cellDataType as ColumnDataType | undefined,
    );

    const merged: ColDef = { ...colDef };
    if (resolved.headerName !== undefined) merged.headerName = resolved.headerName;
    if (resolved.headerTooltip !== undefined) merged.headerTooltip = resolved.headerTooltip;
    if (resolved.initialWidth !== undefined) merged.initialWidth = resolved.initialWidth;
    if (resolved.initialHide !== undefined) merged.initialHide = resolved.initialHide;
    if (resolved.initialPinned !== undefined) merged.initialPinned = resolved.initialPinned;
    if (resolved.sortable !== undefined) merged.sortable = resolved.sortable;
    if (resolved.filterable !== undefined) merged.filter = resolved.filterable;
    if (resolved.resizable !== undefined) merged.resizable = resolved.resizable;
    if (resolved.cellStyleOverrides !== undefined) {
      merged.cellStyle = cellStyleToAgStyle(resolved.cellStyleOverrides);
    }
    if (resolved.headerStyleOverrides !== undefined) {
      merged.headerStyle = cellStyleToAgStyle(resolved.headerStyleOverrides);
    }
    if (resolved.valueFormatterTemplate !== undefined) {
      merged.valueFormatter = valueFormatterFromTemplate(resolved.valueFormatterTemplate);
    }
    if (resolved.cellEditorName !== undefined) merged.cellEditor = resolved.cellEditorName;
    if (resolved.cellEditorParams !== undefined) merged.cellEditorParams = resolved.cellEditorParams;
    if (resolved.cellRendererName !== undefined) merged.cellRenderer = resolved.cellRendererName;
    return merged;
  });
}
```

Then update `transformColumnDefs` (around lines 108-111) to read templates state:

```ts
transformColumnDefs(defs, state, ctx) {
  if (Object.keys(state.assignments).length === 0) return defs;
  const templatesState =
    ctx.getModuleState<ColumnTemplatesState>('column-templates');
  return applyAssignments(defs, state.assignments, templatesState);
},
```

- [ ] **Step 7.5: Run the new integration tests, confirm they pass**

```bash
npx vitest run packages/core-v2/src/modules/column-customization/index.test.ts -t "templateId|template|typeDefault|identity short-circuit"
```

Expected: 8 PASS.

- [ ] **Step 7.6: Run the full column-customization test file**

```bash
npx vitest run packages/core-v2/src/modules/column-customization/index.test.ts
```

Expected: all green (existing tests still pass because `makeCtx()` defaults give an empty templates state — resolver is identity).

- [ ] **Step 7.7: Type-check**

```bash
npx tsc --noEmit -p packages/core-v2/tsconfig.json
```

Expected: clean.

- [ ] **Step 7.8: Commit**

```bash
git add packages/core-v2/src/modules/column-customization/index.ts \
        packages/core-v2/src/modules/column-customization/index.test.ts
git commit -m "feat(column-customization): wire resolveTemplates into applyAssignments walker"
```

---

## Task 8: Public API exports + DEFAULT_V2_MODULES update

**Files:**
- Modify: `packages/core-v2/src/index.ts`
- Modify: `packages/markets-grid-v2/src/MarketsGrid.tsx`

- [ ] **Step 8.1: Re-export `column-templates` from the core-v2 barrel**

In `packages/core-v2/src/index.ts`, add this block alongside the other module exports (after the existing `columnCustomizationModule` re-export, around line 56):

```ts
export { columnTemplatesModule, INITIAL_COLUMN_TEMPLATES } from './modules/column-templates';
export type { ColumnTemplate, ColumnDataType, ColumnTemplatesState } from './modules/column-templates';
export { resolveTemplates } from './modules/column-templates/resolveTemplates';
```

- [ ] **Step 8.2: Add `columnTemplatesModule` to `DEFAULT_V2_MODULES`**

In `packages/markets-grid-v2/src/MarketsGrid.tsx`, find the import block (around lines 5-12) and add `columnTemplatesModule`:

```ts
import {
  generalSettingsModule,
  columnTemplatesModule,
  columnCustomizationModule,
  conditionalStylingModule,
  savedFiltersModule,
  toolbarVisibilityModule,
  type AnyModule,
} from '@grid-customizer/core-v2';
```

Then update `DEFAULT_V2_MODULES` (around lines 34-40) — `columnTemplatesModule` must come before `columnCustomizationModule` (the topo sort will reorder it anyway, but listing it in dependency order makes the file self-documenting):

```ts
export const DEFAULT_V2_MODULES: AnyModule[] = [
  generalSettingsModule,
  columnTemplatesModule,
  columnCustomizationModule,
  conditionalStylingModule,
  savedFiltersModule,
  toolbarVisibilityModule,
];
```

- [ ] **Step 8.3: Type-check both packages**

```bash
npx tsc --noEmit -p packages/core-v2/tsconfig.json
npx tsc --noEmit -p packages/markets-grid-v2/tsconfig.json
```

Expected: clean.

- [ ] **Step 8.4: Run all tests across both packages**

```bash
npx vitest run packages/core-v2 packages/markets-grid-v2
```

Expected: all green.

- [ ] **Step 8.5: Commit**

```bash
git add packages/core-v2/src/index.ts \
        packages/markets-grid-v2/src/MarketsGrid.tsx
git commit -m "feat(core-v2): export column-templates module + add to DEFAULT_V2_MODULES"
```

---

## Task 9: Verification sweep

**Why:** Lock down that nothing snuck through (stale schemaVersion, missed exports, accidental v1-style residue).

- [ ] **Step 9.1: Full v2 vitest run**

```bash
npx vitest run packages/core-v2
```

Expected: all green.

- [ ] **Step 9.2: Full markets-grid-v2 vitest run**

```bash
npx vitest run packages/markets-grid-v2
```

Expected: all green.

- [ ] **Step 9.3: Type-check both packages**

```bash
npx tsc --noEmit -p packages/core-v2/tsconfig.json
npx tsc --noEmit -p packages/markets-grid-v2/tsconfig.json
```

Expected: clean.

- [ ] **Step 9.4: Confirm no stale `schemaVersion: 2` remains in column-customization**

Search for the old version number in the module's own files:

```bash
grep -rn "schemaVersion: 2" packages/core-v2/src/modules/column-customization/
```

Expected: no matches. (Other modules may legitimately still be at `schemaVersion: 1` or `2` — that's fine.)

- [ ] **Step 9.5: Confirm no consumer outside `column-templates` reaches into its internal files**

```bash
grep -rn "from '@grid-customizer/core-v2/.*column-templates" packages/ apps/
```

Expected: no matches. Consumers must go through the package barrel (`@grid-customizer/core-v2`), not deep paths.

- [ ] **Step 9.6: Confirm dependency enforcement test exists and passes**

```bash
npx vitest run packages/core-v2/src/modules/column-customization/index.test.ts -t "topoSortModules throws when column-templates is missing"
```

Expected: 1 PASS.

- [ ] **Step 9.7: Update IMPLEMENTED_FEATURES.md**

Per the project's post-implementation checklist (`docs/IMPLEMENTED_FEATURES.md`), append a "v2.1" entry summarizing the column-templates port. Open `docs/IMPLEMENTED_FEATURES.md` and add a new section under whatever the current latest version heading is:

```markdown
### Column Templates (v2 sub-project #2)

- New `column-templates` module in `@grid-customizer/core-v2` — passive state
  store of `Record<id, ColumnTemplate>` plus `typeDefaults` keyed by
  AG-Grid `cellDataType`.
- Pure `resolveTemplates(assignment, templatesState, cellDataType)` resolver:
  composes a chain of templateIds + an optional typeDefault fallback into a
  composite assignment; assignment fields always win last.
- Per-field merge for `cellStyleOverrides` / `headerStyleOverrides` (typography,
  colors, alignment, borders); last-writer-wins for everything else.
  `cellEditorParams` replaced wholesale (opaque-object semantic).
- `column-customization` module bumped to `schemaVersion: 3` with three new
  optional fields on `ColumnAssignment` (`cellEditorName`, `cellEditorParams`,
  `cellRendererName`) and a new `dependencies: ['column-templates']`
  declaration — first real exercise of the v2 core's dep enforcement.
- `GridContext` extended with `getModuleState<T>(moduleId)` so cross-module
  reads work from inside `transformColumnDefs`.
- 20 resolver unit tests + 8 column-customization integration tests + module
  metadata + serialize/deserialize round-trip + dep-enforcement test.
- UI surface deferred to sub-project #4 (FormattingToolbar v2 port).
```

- [ ] **Step 9.8: Commit the docs update**

```bash
git add docs/IMPLEMENTED_FEATURES.md
git commit -m "docs: log column-templates v2 port (sub-project #2)"
```

- [ ] **Step 9.9: Final repo-wide health check**

```bash
git status
```

Expected: clean working tree (all changes committed). If anything is unexpectedly modified, investigate before declaring done.

---

## Final acceptance checklist

- [ ] All v2 vitest suites green (Step 9.1, 9.2)
- [ ] `tsc --noEmit` clean for both packages (Step 9.3)
- [ ] No stale `schemaVersion: 2` in column-customization (Step 9.4)
- [ ] No deep imports into column-templates from outside (Step 9.5)
- [ ] Dep enforcement test green (Step 9.6)
- [ ] `docs/IMPLEMENTED_FEATURES.md` updated (Step 9.7-9.8)
- [ ] Working tree clean (Step 9.9)

If any check fails, fix it before marking the sub-project complete.
