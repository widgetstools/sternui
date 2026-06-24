# Formatter Toolbar — Row Group + Agg Function Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Enable Row Group" + "Agg Function" controls to the quick Formatting Toolbar that set `enableRowGroup` / `aggFunc` (+ `enableValue`) on the selected column(s), persisted via the existing column-customization assignments.

**Architecture:** A new toolbar segment (`ModuleGrouping.tsx`) calls two new formatter actions, which call a new pure reducer (`applyRowGroupingReducer`) that merges into `assignments[colId].rowGrouping`. The engine transforms already map that onto the colDef; persistence to the active profile / templates is automatic.

**Tech Stack:** React 19, TypeScript, Vitest 4 + jsdom, AG Grid 35, shadcn/design-system primitives.

## Global Constraints

- UI consumes `@starui/design-system` tokens + shadcn/`@starui/ui` primitives only. No native `<input>`/`<select>`. (CLAUDE.md UI rules.)
- `AggFuncName` set is exactly: `sum, min, max, count, avg, first, last` (NO `custom` in the toolbar).
- "Enable Row Group" sets `enableRowGroup` only (capability flag) — never `rowGroup`.
- Picking an agg sets `aggFunc` + `enableValue: true`; "None" clears both.
- Clearing sets keys to `undefined` (revert to default), and removes `rowGrouping` entirely when it becomes empty.
- Keep `grid` + `widgets-react` Vitest suites green.

---

### Task 1: Engine — `applyRowGroupingReducer` (pure reducer + unit test)

**Files:**
- Modify: `packages/shared/engine/src/customizer/modules/column-customization/formattingActions.ts`
- Test: `packages/shared/engine/src/customizer/modules/column-customization/formattingActions.test.ts` (add cases; create if absent)

**Interfaces:**
- Produces: `applyRowGroupingReducer(colIds: readonly string[], patch: { enableRowGroup?: boolean | undefined; aggFunc?: AggFuncName | undefined; enableValue?: boolean | undefined }, scope?: ScopeKind): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState`
- Consumes: `RowGroupingConfig`, `AggFuncName`, `ColumnAssignment`, `ColumnCustomizationState`, `ScopeKind` (already imported/defined in this module).

- [ ] **Step 1: Write the failing test**

```ts
// formattingActions.test.ts
import { describe, it, expect } from 'vitest';
import { applyRowGroupingReducer } from './formattingActions';

describe('applyRowGroupingReducer', () => {
  it('sets enableRowGroup on each selected column', () => {
    const next = applyRowGroupingReducer(['a', 'b'], { enableRowGroup: true })(undefined);
    expect(next.assignments.a.rowGrouping?.enableRowGroup).toBe(true);
    expect(next.assignments.b.rowGrouping?.enableRowGroup).toBe(true);
  });

  it('sets aggFunc and enableValue together', () => {
    const next = applyRowGroupingReducer(['a'], { aggFunc: 'sum', enableValue: true })(undefined);
    expect(next.assignments.a.rowGrouping?.aggFunc).toBe('sum');
    expect(next.assignments.a.rowGrouping?.enableValue).toBe(true);
  });

  it('clears aggFunc + enableValue when set to undefined, leaving enableRowGroup', () => {
    const seeded = applyRowGroupingReducer(['a'], { enableRowGroup: true, aggFunc: 'avg', enableValue: true })(undefined);
    const next = applyRowGroupingReducer(['a'], { aggFunc: undefined, enableValue: undefined })(seeded);
    expect(next.assignments.a.rowGrouping?.aggFunc).toBeUndefined();
    expect(next.assignments.a.rowGrouping?.enableValue).toBeUndefined();
    expect(next.assignments.a.rowGrouping?.enableRowGroup).toBe(true);
  });

  it('removes the rowGrouping object entirely when it becomes empty', () => {
    const seeded = applyRowGroupingReducer(['a'], { enableRowGroup: true })(undefined);
    const next = applyRowGroupingReducer(['a'], { enableRowGroup: undefined })(seeded);
    expect(next.assignments.a.rowGrouping).toBeUndefined();
  });

  it('is a no-op for empty colIds', () => {
    const prev = { assignments: {} };
    expect(applyRowGroupingReducer([], { enableRowGroup: true })(prev)).toBe(prev);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared/engine && npx vitest run src/customizer/modules/column-customization/formattingActions.test.ts -t applyRowGroupingReducer`
Expected: FAIL — `applyRowGroupingReducer is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `formattingActions.ts` (mirrors `applyFormatterReducer`; import `AggFuncName`, `RowGroupingConfig` from `./state` if not already):

```ts
/**
 * Row-grouping / aggregation convenience — merges `patch` into each selected
 * column's `rowGrouping` config. Keys set to `undefined` are cleared; an empty
 * `rowGrouping` object is removed. Capability/initial-state flags only — this
 * never sets `rowGroup` (immediate grouping is out of scope for the toolbar).
 */
export function applyRowGroupingReducer(
  colIds: readonly string[],
  patch: {
    enableRowGroup?: boolean | undefined;
    aggFunc?: AggFuncName | undefined;
    enableValue?: boolean | undefined;
  },
  scope: ScopeKind = 'selected',
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    // Row grouping is column-level only — no global scope.
    if (scope === 'all' || colIds.length === 0) return base;

    const assignments = { ...base.assignments };
    for (const colId of colIds) {
      const a: ColumnAssignment = assignments[colId] ?? { colId };
      const rg: RowGroupingConfig = { ...(a.rowGrouping ?? {}) };
      for (const [k, v] of Object.entries(patch) as Array<[keyof RowGroupingConfig, unknown]>) {
        if (v === undefined) delete rg[k];
        else (rg as Record<string, unknown>)[k] = v;
      }
      const next: ColumnAssignment = { ...a };
      if (Object.keys(rg).length === 0) delete next.rowGrouping;
      else next.rowGrouping = rg;
      assignments[colId] = next;
    }
    return { ...base, assignments };
  };
}
```

If `AggFuncName` / `RowGroupingConfig` aren't already imported at the top of the file, add: `import type { AggFuncName, RowGroupingConfig } from './state';` (verify existing import line first — `ColumnAssignment` is already imported).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared/engine && npx vitest run src/customizer/modules/column-customization/formattingActions.test.ts -t applyRowGroupingReducer`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/engine/src/customizer/modules/column-customization/formattingActions.ts packages/shared/engine/src/customizer/modules/column-customization/formattingActions.test.ts
git commit -m "feat(engine): applyRowGroupingReducer for column rowGrouping config"
```

---

### Task 2: Formatter — resolve `enableRowGroup` + `aggFunc` into `ResolvedFormatting`

**Files:**
- Modify: `packages/react-grid/grid/src/widget/formattingToolbarHooks.ts` (interface `ResolvedFormatting` ~line 210; derivation in `useColumnFormatting` ~line 248-305)
- Test: `packages/react-grid/grid/src/widget/formattingToolbarHooks.test.ts` (add cases if a test exists; otherwise covered via Task 4 component test — note in commit)

**Interfaces:**
- Produces: `ResolvedFormatting.enableRowGroup?: boolean` and `ResolvedFormatting.aggFunc?: AggFuncName` (read from the first selected column's `assignment.rowGrouping`).
- Consumes: `AggFuncName` from `@starui/grid/customizer`.

- [ ] **Step 1: Extend the interface**

In `formattingToolbarHooks.ts`, add to `interface ResolvedFormatting` (after `editable?`):

```ts
  /** Resolved `rowGrouping.enableRowGroup` for the first selected column. */
  enableRowGroup?: boolean;
  /** Resolved `rowGrouping.aggFunc` for the first selected column. */
  aggFunc?: AggFuncName;
```

Add the import near the other `@starui/grid/customizer` type imports: `import type { AggFuncName } from '@starui/grid/customizer';` (verify it isn't already imported).

- [ ] **Step 2: Derive the values**

In `useColumnFormatting`, where the assignment for the first column is read (alongside `editable`), add:

```ts
    // rowGrouping reflects the FIRST selected column (consistent with editable).
    const firstAssign = cust?.assignments?.[colIds[0]];
    const enableRowGroup = firstAssign?.rowGrouping?.enableRowGroup;
    const aggFunc = firstAssign?.rowGrouping?.aggFunc;
```

…and include `enableRowGroup, aggFunc` in the returned `ResolvedFormatting` object (and in the `empty` fallback they stay `undefined`, so no change needed there).

- [ ] **Step 3: Typecheck**

Run: `cd packages/react-grid/grid && npx tsc --noEmit` (or rely on Task 4's vitest run).
Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/react-grid/grid/src/widget/formattingToolbarHooks.ts
git commit -m "feat(grid): resolve enableRowGroup + aggFunc into ResolvedFormatting"
```

---

### Task 3: Formatter — `toggleEnableRowGroup` + `setAggFunc` actions

**Files:**
- Modify: `packages/react-grid/grid/src/widget/formatter/useFormatterActions.ts` (add callbacks; export in the returned actions object)
- Modify: `packages/react-grid/grid/src/widget/formatter/state.ts` (add to `FormatterActions` type + the composer that assembles `actions`)

**Interfaces:**
- Consumes: `applyRowGroupingReducer` (Task 1) via `@starui/engine`; `fmt.enableRowGroup` / `fmt.aggFunc` (Task 2).
- Produces: `actions.toggleEnableRowGroup(): void`, `actions.setAggFunc(name: AggFuncName | null): void`.

- [ ] **Step 1: Add the callbacks in `useFormatterActions.ts`**

Mirror `toggleEditable`. Import `applyRowGroupingReducer` from `@starui/engine` (alongside the other reducer imports) and `AggFuncName` type from `@starui/grid/customizer`:

```ts
  const toggleEnableRowGroup = useCallback(() => {
    if (!colIdsRef.current.length) return;
    const next = !fmt.enableRowGroup;
    setCustStateWithHistory(
      applyRowGroupingReducer(colIdsRef.current, { enableRowGroup: next ? true : undefined }, scopeRef.current),
    );
  }, [setCustStateWithHistory, fmt.enableRowGroup, colIdsRef, scopeRef]);

  const setAggFunc = useCallback((name: AggFuncName | null) => {
    if (!colIdsRef.current.length) return;
    setCustStateWithHistory(
      applyRowGroupingReducer(
        colIdsRef.current,
        name
          ? { aggFunc: name, enableValue: true }
          : { aggFunc: undefined, enableValue: undefined },
        scopeRef.current,
      ),
    );
  }, [setCustStateWithHistory, colIdsRef, scopeRef]);
```

Add `toggleEnableRowGroup` and `setAggFunc` to the object this hook returns.

- [ ] **Step 2: Expose in `state.ts`**

Add to the `FormatterActions` interface:

```ts
  toggleEnableRowGroup: () => void;
  setAggFunc: (name: AggFuncName | null) => void;
```

Import `AggFuncName` type in `state.ts` (from `@starui/grid/customizer`) and ensure the composer spreads these from `useFormatterActions` into the public `actions` bundle.

- [ ] **Step 3: Typecheck**

Run: `cd packages/react-grid/grid && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add packages/react-grid/grid/src/widget/formatter/useFormatterActions.ts packages/react-grid/grid/src/widget/formatter/state.ts
git commit -m "feat(grid): formatter actions toggleEnableRowGroup + setAggFunc"
```

---

### Task 4: Formatter — `ModuleGrouping.tsx` segment + render it + component test

**Files:**
- Create: `packages/react-grid/grid/src/widget/formatter/modules/ModuleGrouping.tsx`
- Modify: `packages/react-grid/grid/src/widget/formatter/Formatter.tsx` (render `<ModuleGrouping>` among the other modules)
- Test: `packages/react-grid/grid/src/widget/formatter/modules/ModuleGrouping.test.tsx`

**Interfaces:**
- Consumes: `FormatterState`, `FormatterActions` (state.ts); `Module`, `Pill`, `ToolbarSelect`, `Hair` (primitives.tsx); `AggFuncName` (`@starui/grid/customizer`).

- [ ] **Step 1: Write the component**

```tsx
import { Group } from 'lucide-react';
import { Hair, Module, Pill, ToolbarSelect, TOOLBAR_SELECT_EMPTY } from '../primitives';
import type { FormatterActions, FormatterState } from '../state';
import type { AggFuncName } from '@starui/grid/customizer';

const AGG_OPTIONS: Array<{ value: string; label: string }> = [
  { value: TOOLBAR_SELECT_EMPTY, label: 'None' },
  { value: 'sum', label: 'Sum' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Count' },
  { value: 'avg', label: 'Avg' },
  { value: 'first', label: 'First' },
  { value: 'last', label: 'Last' },
];

export function ModuleGrouping({
  state,
  actions,
}: {
  state: FormatterState;
  actions: FormatterActions;
}) {
  const { fmt, disabled } = state;
  const aggValue = fmt.aggFunc ?? TOOLBAR_SELECT_EMPTY;

  return (
    <Module index="09" label="Group">
      <Pill
        disabled={disabled}
        tooltip="Enable row group (make column groupable)"
        active={!!fmt.enableRowGroup}
        onClick={actions.toggleEnableRowGroup}
        data-testid="fmt-enable-row-group"
      >
        <Group size={13} strokeWidth={2} />
      </Pill>
      <Hair />
      <ToolbarSelect
        disabled={disabled}
        value={aggValue}
        options={AGG_OPTIONS}
        ariaLabel="Aggregation function"
        data-testid="fmt-agg-func"
        onChange={(v) =>
          actions.setAggFunc(v === TOOLBAR_SELECT_EMPTY ? null : (v as AggFuncName))
        }
      />
    </Module>
  );
}
```

Verify `ToolbarSelect`'s exact prop names against `primitives.tsx` (`value`, `options`, `onChange`, `ariaLabel`, `disabled`) and match them; adjust if the signature differs.

- [ ] **Step 2: Render it in `Formatter.tsx`**

Import `ModuleGrouping` and place it next to the other `<Module*` segments (after `ModuleFormat`), passing `state={state} actions={actions}` exactly like its siblings.

- [ ] **Step 3: Write the component test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModuleGrouping } from './ModuleGrouping';

function makeState(over = {}) {
  return { fmt: { bold: false, italic: false, underline: false, borders: {}, ...over }, disabled: false } as any;
}

describe('ModuleGrouping', () => {
  it('toggles enable row group', () => {
    const toggleEnableRowGroup = vi.fn();
    render(<ModuleGrouping state={makeState()} actions={{ toggleEnableRowGroup, setAggFunc: vi.fn() } as any} />);
    fireEvent.click(screen.getByTestId('fmt-enable-row-group'));
    expect(toggleEnableRowGroup).toHaveBeenCalledOnce();
  });

  it('sets an agg function', () => {
    const setAggFunc = vi.fn();
    render(<ModuleGrouping state={makeState()} actions={{ toggleEnableRowGroup: vi.fn(), setAggFunc } as any} />);
    // Drive ToolbarSelect to 'sum' — match how other formatter module tests
    // exercise ToolbarSelect (open + click option, or change event).
    // Assert setAggFunc called with 'sum'.
  });
});
```

Fill the second test's interaction to match how existing `Module*.test.tsx` drive `ToolbarSelect` (open trigger + click the "Sum" option). Assert `setAggFunc` was called with `'sum'`, and (separately) that selecting "None" calls `setAggFunc(null)`.

- [ ] **Step 4: Run tests**

Run: `cd packages/react-grid/grid && npx vitest run src/widget/formatter/modules/ModuleGrouping.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/react-grid/grid/src/widget/formatter/modules/ModuleGrouping.tsx packages/react-grid/grid/src/widget/formatter/Formatter.tsx packages/react-grid/grid/src/widget/formatter/modules/ModuleGrouping.test.tsx
git commit -m "feat(grid): Formatting Toolbar row-group + agg-function segment"
```

---

### Task 5: Docs + full-suite green

**Files:**
- Modify: `docs/current-features.md` (formatter toolbar section — add the new controls)

- [ ] **Step 1: Document the controls**

Add a bullet under the Formatting Toolbar entry describing: "Group" segment — Enable Row Group toggle (`enableRowGroup` capability flag) + Agg Function dropdown (`None`/sum/min/max/count/avg/first/last; sets `aggFunc` + `enableValue`), applied to selected column(s), persisted via column-customization assignments (active profile + templates).

- [ ] **Step 2: Run both package suites**

Run: `cd packages/react-grid/grid && npx vitest run` then `cd packages/react-core/widgets-react && npx vitest run`
Expected: all green (grid ≥ 649+new, widgets-react 216 +1 skipped).

- [ ] **Step 3: Commit**

```bash
git add docs/current-features.md
git commit -m "docs: Formatting Toolbar row-group + agg-function controls"
```

## Self-Review

- **Spec coverage:** UI segment (Task 4), enableRowGroup semantics (Tasks 1,3), agg set + enableValue + None-clears-both (Tasks 1,3,4), persistence via assignments (automatic — Task 1 reducer writes the slot the engine already transforms; no task needed), tests (Tasks 1,4), docs (Task 5). ✓
- **Placeholder scan:** Task 4 Step 3 second test + the `ToolbarSelect` prop-name verification are the only "match existing pattern" notes — intentional, because the exact `ToolbarSelect` interaction/prop names must be confirmed against `primitives.tsx` at implementation time. Confirm before finalizing.
- **Type consistency:** `applyRowGroupingReducer`, `toggleEnableRowGroup`, `setAggFunc`, `AggFuncName`, `ResolvedFormatting.enableRowGroup/aggFunc` are used consistently across tasks.
