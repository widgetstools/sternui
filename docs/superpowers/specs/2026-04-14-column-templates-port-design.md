# Column Templates Port (v1 → v2) — Design

**Sub-project:** #2 of 4 in the v1→v2 forward port of `FormattingToolbar`.

**Goal:** Port the v1 `column-templates` module to `@grid-customizer/core-v2` with full v1 feature parity, no backward-compatibility code, and no tech debt.

**Predecessor:** Sub-project #1 (`column-customization` schema extension) shipped `templateIds?: string[]` on `ColumnAssignment` but left it unwired. This sub-project wires it.

---

## Decisions reached during brainstorming

| # | Question | Decision |
|---|---|---|
| Q1 | What can a template carry? | Full v1 parity: styling + formatter + behavior flags + cell editor + cell renderer |
| Q2 | typeDefaults? | Yes, included with proper column-type-aware resolution |
| Q3 | UI panel in this sub-project? | No. Templates are state + resolver only; FormattingToolbar in #4 owns the UX |
| Q4 | Composition semantics | Per-field merge for styling; last-writer-wins for everything else; assignment overrides win highest |
| Approach | Where does the resolver live? | In `column-templates` as a pure exported function; `column-customization` imports and calls it |
| BC | Backward compatibility with v1 IndexedDB profiles? | No. v2 is greenfield; drop all v1 migration code |

---

## Architecture

Two modules cooperate via a typed cross-module read:

- **`column-templates`** (new) — passive store of `Record<id, ColumnTemplate>` plus `typeDefaults: Partial<Record<ColumnDataType, templateId>>`. Exports a pure `resolveTemplates(assignment, templatesState, cellDataType)` function. No `transformColumnDefs`, no SettingsPanel, no lifecycle hooks.
- **`column-customization`** (extended) — gains `dependencies: ['column-templates']`, bumps `schemaVersion` 2 → 3, adds three new optional fields (`cellEditorName`, `cellEditorParams`, `cellRendererName`) on `ColumnAssignment`. Its `transformColumnDefs` reads the templates state via `ctx.getModuleState('column-templates')` and calls `resolveTemplates` once per assigned column before emitting fields to the colDef.

The module dependency enforcement built in sub-project #0 fires for the first time here: registering `column-customization` without `column-templates` first will throw at `core.registerModule()` time.

```
                    ┌─────────────────────────────────┐
                    │  column-templates module        │
                    │  • state: { templates,          │
                    │             typeDefaults }      │
                    │  • exports resolveTemplates()   │
                    └────────────────┬────────────────┘
                                     │ (typed import + value import)
                                     ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  column-customization module                                 │
   │                                                              │
   │  transformColumnDefs(defs, state, ctx):                      │
   │    if no assignments → return defs (perf short-circuit)      │
   │    templatesState = ctx.getModuleState('column-templates')   │
   │    for each assignment:                                      │
   │      resolved = resolveTemplates(assignment,                 │
   │                                  templatesState,             │
   │                                  colDef.cellDataType)        │
   │      emit resolved fields to colDef                          │
   └──────────────────────────────────────────────────────────────┘
```

---

## Data model

### `packages/core-v2/src/modules/column-templates/state.ts`

```ts
import type { CellStyleOverrides, ValueFormatterTemplate }
  from '../column-customization/state';

export interface ColumnTemplate {
  readonly id: string;                                    // stable; never reused after delete
  name: string;                                           // user-visible, unique per state
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
  // Audit
  createdAt: number;
  updatedAt: number;
}

export type ColumnDataType = 'numeric' | 'date' | 'string' | 'boolean';

export interface ColumnTemplatesState {
  templates: Record<string, ColumnTemplate>;
  typeDefaults: Partial<Record<ColumnDataType, string>>;  // dataType → templateId
}

export const INITIAL_COLUMN_TEMPLATES: ColumnTemplatesState = {
  templates: {},
  typeDefaults: {},
};
```

**Field-level decisions:**

- `name` uniqueness is enforced by CRUD operations in the eventual UI (sub-project #4), not by the type system. The resolver does not depend on uniqueness.
- `cellEditorName` / `cellRendererName` are pass-through strings. AG-Grid resolves them via its component registry; v2 does not add a registration layer. Component registration is the consumer's responsibility (e.g. `markets-grid-v2` registers `sideRenderer` etc. via `GridOptions.components`).
- `cellEditorParams` is `Record<string, unknown>` and treated as opaque. Wholesale replacement on merge (no deep merge) — see Risk #3 below.
- `typeDefaults` keys are restricted to AG-Grid's `cellDataType` vocabulary (`'numeric' | 'date' | 'string' | 'boolean'`).
- `createdAt` / `updatedAt` are kept for forward UX needs ("sort templates by recently modified" in #4) and audit/debug. They cost nothing.

### Companion change: `packages/core-v2/src/modules/column-customization/state.ts`

`ColumnAssignment` gains three new optional fields and the module's `schemaVersion` bumps 2 → 3:

```ts
export interface ColumnAssignment {
  // ... existing fields from sub-projects #0 + #1 ...
  cellEditorName?: string;
  cellEditorParams?: Record<string, unknown>;
  cellRendererName?: string;
}
```

No migrate function added. Any v2 (schemaVersion 2) data on disk will fall through to the existing "cannot migrate from schemaVersion 2; falling back to initial state" warning path from sub-project #1. This is acceptable per the no-backward-compat decision: there is no production v2 data to break.

---

## Module shape

### `packages/core-v2/src/modules/column-templates/index.ts`

```ts
export const columnTemplatesModule: Module<ColumnTemplatesState> = {
  id: 'column-templates',
  name: 'Templates',
  schemaVersion: 1,
  // No `dependencies` — pure state holder, depends on nothing.
  // Priority 5 — runs before column-customization (10) so its state is
  // populated before the assignment walker reads it. Order is enforced by
  // the dep declaration on column-customization, not by priority.
  priority: 5,

  getInitialState: () => ({ ...INITIAL_COLUMN_TEMPLATES }),

  serialize: (state) => state,
  deserialize: (data) => {
    if (!data || typeof data !== 'object') return { ...INITIAL_COLUMN_TEMPLATES };
    const raw = data as Partial<ColumnTemplatesState>;
    return {
      templates:
        raw.templates && typeof raw.templates === 'object' ? raw.templates : {},
      typeDefaults:
        raw.typeDefaults && typeof raw.typeDefaults === 'object'
          ? raw.typeDefaults
          : {},
    };
  },

  // No transformColumnDefs — column-customization owns the walker and
  // calls the resolver directly (Approach 1).
  // No SettingsPanel — UI lands in sub-project #4.
};
```

### `packages/core-v2/src/modules/column-customization/index.ts` (modified)

```ts
export const columnCustomizationModule: Module<ColumnCustomizationState> = {
  // ... existing fields ...
  schemaVersion: 3,                          // bumped from 2
  dependencies: ['column-templates'],        // NEW — first real exercise of the
                                              //       core's dep-enforcement contract
  // ... transform now reads templates state from ctx — see Resolver section ...
};
```

---

## Resolver

### `packages/core-v2/src/modules/column-templates/resolveTemplates.ts` (~80 LOC)

```ts
export function resolveTemplates(
  assignment: ColumnAssignment,
  templatesState: ColumnTemplatesState,
  colDataType: ColumnDataType | undefined,
): ColumnAssignment {
  // 1. Build the ordered chain of templates to apply (low → high precedence).
  //    Bottom: the typeDefault for this column's data type — only when the
  //    assignment has NO explicit `templateIds` (explicit list disables the
  //    type fallback so users can opt out of it on a per-column basis).
  //    Above: each id in `assignment.templateIds[]`, in array order.
  const chain: ColumnTemplate[] = [];

  if (assignment.templateIds === undefined && colDataType !== undefined) {
    const fallbackId = templatesState.typeDefaults[colDataType];
    const fallback = fallbackId ? templatesState.templates[fallbackId] : undefined;
    if (fallback) chain.push(fallback);
  }

  for (const id of assignment.templateIds ?? []) {
    const t = templatesState.templates[id];
    if (t) chain.push(t);  // unknown ids silently skipped (template was deleted)
  }

  if (chain.length === 0) return assignment;

  // 2. Fold the chain left-to-right, then assignment last (highest precedence).
  //    Per Q4: per-field merge for cellStyleOverrides + headerStyleOverrides;
  //    last-writer-wins for everything else; cellEditorParams replaced wholesale.
  const composed: ColumnAssignment = { colId: assignment.colId };
  for (const t of chain) applyTemplateLikeOver(composed, t);

  // 3. Assignment fields win last (per Q4).
  return applyTemplateLikeOver(composed, assignment);
}
```

The helper `applyTemplateLikeOver(target, source)` is shared between the chain fold and the assignment-wins-last step (see Risk #2). Per-field merge for the two style fields, last-writer-wins for everything else, treating `cellEditorParams` as an opaque object replaced wholesale.

```ts
function mergeStyle(
  base: CellStyleOverrides | undefined,
  top: CellStyleOverrides,
): CellStyleOverrides {
  if (!base) return top;
  return {
    typography: { ...base.typography, ...top.typography },
    colors:     { ...base.colors,     ...top.colors },
    alignment:  { ...base.alignment,  ...top.alignment },
    borders:    { ...base.borders,    ...top.borders },
  };
  // Empty sub-sections pruned by cellStyleToAgStyle adapter at emit time.
}
```

**Note on border merge granularity:** borders merge per-side (`top` / `right` / `bottom` / `left`), not per-property within a side. If t1 sets `borders.top = { width: 1, ... }` and t2 sets `borders.top = { width: 2, ... }`, t2's full `BorderSpec` replaces t1's. This is consistent with the discriminated nature of `BorderSpec` (a complete border-spec is a unit; you don't typically want "t1's color + t2's width").

### Walker change in `column-customization/index.ts`

`applyAssignments` grows two arguments and one cross-module read:

```ts
function applyAssignments(
  defs: AnyColDef[],
  assignments: Record<string, ColumnAssignment>,
  templatesState: ColumnTemplatesState,
  ctx: GridContext,
): AnyColDef[] {
  return defs.map((def) => {
    // ... group recursion unchanged ...
    const colDef = def as ColDef;
    const colId = colDef.colId ?? colDef.field;
    if (!colId) return def;
    const a = assignments[colId];
    if (!a) return def;

    const resolved = resolveTemplates(a, templatesState, colDef.cellDataType);

    const merged: ColDef = { ...colDef };
    // ... existing emission blocks now read from `resolved` not `a` ...
    // ... 3 new emission blocks: cellEditor, cellEditorParams, cellRenderer ...
    return merged;
  });
}

transformColumnDefs(defs, state, ctx) {
  if (Object.keys(state.assignments).length === 0) return defs;
  const templatesState = ctx.getModuleState<ColumnTemplatesState>('column-templates');
  return applyAssignments(defs, state.assignments, templatesState, ctx);
},
```

**typeDefaults requires an assignment entry.** This is a deliberate tradeoff: applying typeDefaults to *every* column of the matching data type (even those with no assignment) would force `transformColumnDefs` to drop its empty-assignments short-circuit, allocating new colDef objects on every grid mount even when nothing is customized. Requiring a (possibly empty) assignment as a "subscribe to typeDefaults" gesture preserves the perf short-circuit. Documented + tested. The FormattingToolbar in sub-project #4 can auto-create empty assignments when the user opts a column into typeDefaults.

---

## Tests

| File | Test count | Coverage |
|---|---|---|
| `column-templates/state.test.ts` | ~5 | INITIAL_*, deserialize fallbacks (null, non-object, malformed templates / typeDefaults sub-fields) |
| `column-templates/index.test.ts` | ~6 | Module metadata (id, schemaVersion, priority), no dependencies, serialize/deserialize round-trip, no SettingsPanel, no transformColumnDefs |
| `column-templates/resolveTemplates.test.ts` | ~20 | See breakdown below |
| `column-customization/state.test.ts` (delta) | +2 | New fields default to undefined; v2 → v3 fallback warning fires |
| `column-customization/index.test.ts` (delta) | +8 | Dep declaration; schemaVersion 3; identity short-circuit unchanged; getModuleState read; e2e templateId emission; e2e direct cellEditor override; e2e typeDefault with assignment + cellDataType; e2e typeDefault no-op when cellDataType undefined |

### `resolveTemplates.test.ts` — the 20 tests

1. No templateIds, no typeDefault → returns assignment unchanged (identity)
2. Empty `templateIds: []` → returns assignment unchanged, blocks typeDefault fallback
3. Single templateId → fields from template appear on resolved
4. Two templateIds → later wins for last-writer-wins fields (sortable, etc.)
5. Two templateIds with overlapping `cellStyleOverrides.typography` → per-field merge (later's `bold` wins, earlier's `fontSize` survives)
6. Two templateIds with overlapping `cellStyleOverrides.colors` AND non-overlapping `cellStyleOverrides.borders` → both merged into one composed style
7. Assignment override of a styling field beats template (per-field)
8. Assignment override of a behavior flag beats template (last-writer)
9. Assignment override of `valueFormatterTemplate` beats template (entire union replaced)
10. `templateIds` references unknown id → silently skipped, other ids still apply
11. `templateIds` is `undefined` AND typeDefault exists for column's dataType → typeDefault applies
12. `templateIds: []` (explicit empty) AND typeDefault exists → typeDefault does NOT apply (explicit opt-out)
13. typeDefault references unknown templateId → silently no-op
14. typeDefault for `numeric` applies; columns of other dataTypes unaffected
15. typeDefault composition: column with no `templateIds`, only typeDefault → resolved fields match the typeDefault template
16. Empty template (only id/name/timestamps) in chain → no-op merge, doesn't clear existing fields
17. Pure function: same input produces equal output values (reference invariance not promised)
18. Border merge: t1 sets only `top`, t2 sets only `bottom` → both present in resolved
19. Border merge: t1 sets `top`, t2 also sets `top` → t2's full `BorderSpec` wins (per-side replace, not per-property)
20. `cellEditorParams` is replaced wholesale by later template (not deep-merged) — opaque-object semantic

### Test infrastructure

The column-customization tests need a fixture for `ctx.getModuleState`. A `makeCtx({ templates, typeDefaults })` helper (~20 LOC, lives in `column-customization/index.test.ts`) returns a stub `GridContext`-shaped object with the right `getModuleState` impl.

### No new E2E tests in this sub-project

Sub-project #4 (FormattingToolbar) is when the UX surfaces. Sub-project #2 ships unit-test coverage only. The resolver + walker integration is fully testable at unit level.

---

## Risks

1. **Cycle risk in cross-module type imports.** `column-templates` imports `CellStyleOverrides` and `ValueFormatterTemplate` from `column-customization/state`. `column-customization` will import `ColumnTemplatesState` and `ColumnDataType` from `column-templates/state`, and `resolveTemplates` as a value. *Mitigation:* keep cross-module imports as `import type` only where possible; the only value import is `resolveTemplates` (one-way), which avoids the cycle.

2. **Helper duplication.** The chain-fold step and the assignment-wins-last step both want to layer a `ColumnTemplate`-or-`ColumnAssignment`-shaped object onto an accumulator. Easy to write two near-duplicate code paths that drift. *Mitigation:* one shared `applyTemplateLikeOver(target, source)` helper used by both call sites; tests 5–9 exercise both paths to keep them honest.

3. **`cellEditorParams` is opaque.** Wholesale-replace is the right semantic for an opaque config object, but a user expectation of "merge my one param into the template's" will surface eventually. *Mitigation:* JSDoc on `ColumnTemplate.cellEditorParams` documents wholesale-replace. Test 20 above locks the behavior. Defer "deep merge" to v2.2 only if real demand surfaces.

4. **typeDefaults requires `colDef.cellDataType`.** AG-Grid v33+ stable field, but if undefined and the user expects type-default to fire, they'll be confused. *Mitigation:* the "typeDefault no-op when cellDataType undefined" test in column-customization locks the behavior; the resolver JSDoc documents that consumers must set `cellDataType` explicitly on participating colDefs.

5. **schemaVersion 3 ships no migrate.** Per the no-backward-compat decision, this is intentional. v2 data on disk falls into the existing "cannot migrate from schemaVersion 2; falling back to initial state" warning path from sub-project #1. *Mitigation:* none required. Documented here so it isn't read as an oversight.

6. **First real exercise of v2 core's dependency enforcement.** The enforcer is unit-tested in `core-v2/src/core/`, but no real registration has exercised it. *Mitigation:* sub-project #2's first task is a unit test asserting that registering `column-customization` without `column-templates` throws. If it fails, fix the core enforcer before doing anything else in this sub-project.

---

## Sequencing within this sub-project

| Order | Step | Why first |
|---|---|---|
| 1 | Add `cellEditorName/Params/cellRendererName` to `ColumnAssignment` (schemaVersion bump 2 → 3) + 3 new walker emission blocks + tests | Unblocks resolver tests that need to assert these fields flow through |
| 2 | Create `column-templates` state.ts + module skeleton (no resolver yet) + module tests | Module exists, registers, serializes |
| 3 | Write `resolveTemplates.ts` purely — start with empty templateIds → identity, build up TDD-style | Pure function with no AG-Grid coupling |
| 4 | Wire the dependency: `column-customization.dependencies = ['column-templates']` + dep-enforcement test | Surfaces the cross-module wiring before the walker change |
| 5 | Modify the walker: read templates state from ctx, call resolver, pass resolved to emission | Final integration; end-to-end tests light up |
| 6 | typeDefaults path: extend resolver, extend walker to pass cellDataType, add tests | Self-contained add-on once chain composition works |
| 7 | Verification sweep (full vitest, tsc, greps for stale schemaVersion 2) | Same shape as sub-project #1's Task 10 |

**Total estimated new code:** ~600 LOC (state ~30, resolver ~80, walker delta ~30, tests ~450).
**Total estimated commits:** 8–10.

---

## Out of scope (explicitly)

- **No SettingsPanel.** UI lands in sub-project #4 (FormattingToolbar v2 port).
- **No `gc-state` / IndexedDB v1 reader.** No backward compatibility code; v2 is greenfield.
- **No theming integration.** Templates do not interact with light/dark theming. Deferred to a later sub-project if needed.
- **No template-export / template-import API.** YAGNI for sub-project #4.
- **No deep-merge for `cellEditorParams`.** Wholesale-replace only; revisited in v2.2 only on real demand.
- **No `cellDataType` auto-detection from row data.** Consumers must set `colDef.cellDataType` explicitly to opt into typeDefaults.

---

## Verification (run after all sequencing steps land)

1. `npx vitest run packages/core-v2/src/modules/column-templates packages/core-v2/src/modules/column-customization` — all green.
2. `npx tsc --noEmit -p packages/core-v2/tsconfig.json` — clean.
3. `grep -rn "schemaVersion: 2" packages/core-v2/src/modules/column-customization/` — no matches.
4. `grep -rn "from '@grid-customizer/core-v2/.*column-templates" packages/ apps/ | grep -v core-v2/src/modules/column-templates/` — no matches outside the module's own files (consumers wire up in #4).
5. Architectural assertion: registering `column-customization` without `column-templates` throws (covered by step 4 of the sequencing).
