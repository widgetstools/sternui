# Formatting Toolbar — Row Group + Agg Function controls

**Date:** 2026-06-23
**Status:** Design approved (pending spec review)
**Branch:** `feature/formatter-enhancements`

## Context

The Formatting Toolbar is the quick, in-grid surface for applying formatting to
the **selected column(s)** — bold/italic/underline, font size, alignment,
text/background colour, and number/date format. Each control writes to the
**column-customization** module's `assignments` (keyed by `colId`) via reducers
in `formattingActions.ts`, staged through the formatter's undo/redo history and
persisted to the active profile on Save.

Users want to also set, from this same toolbar, for the selected column(s):

- **Enable Row Group**
- **Agg Function**

…and have those settings persist like every other formatter action.

The engine **already** supports these per column: the column-customization
assignment has a `rowGrouping` config (`RowGroupingConfig`) with
`enableRowGroup`, `enableValue`, `rowGroup`, `aggFunc`, etc., and the transforms
already apply them to the emitted `colDef`. The full **Column Settings** panel
already exposes them via `RowGroupingEditor`. The gap is purely the **quick
Formatting Toolbar**, which has no row-grouping controls today.

## Goal

Add two controls to the Formatting Toolbar that set `rowGrouping.enableRowGroup`
and `rowGrouping.aggFunc` (+ `enableValue`) on the selected column(s)' assignment,
reusing the existing reducer/history/persistence machinery so the values become
part of the saved profile and any column-template snapshot.

## Decisions (from brainstorming)

- **Surface:** the quick **Formatting Toolbar** (not the Column Settings panel,
  which already has `RowGroupingEditor`).
- **"Enable Row Group" semantics:** sets `colDef.enableRowGroup` — a *capability*
  flag (column becomes groupable / draggable to the row-group panel). It does
  **not** group the grid (`rowGroup`) immediately. No immediate visual change.
- **Agg Function options:** `None` + `sum, min, max, count, avg, first, last`.
  Excludes `custom` (custom needs an expression editor — stays in Column Settings).
- **Auto-enable value:** picking an agg function also sets `enableValue: true`;
  selecting `None` clears **both** `aggFunc` and `enableValue`.
- **Persistence:** stages into live column-customization state immediately
  (undo/redo, marks profile dirty); persists to the **currently active profile**
  on Save (same dirty→Save flow as the other formatter actions). Captured by
  column-template snapshots too. No new persistence code.

## Design

### 1. UI — new toolbar segment `ModuleGrouping.tsx`

A new segment alongside the existing `formatter/modules/Module*.tsx`:

- **Enable Row Group** — toggle button (Bold-style). On → `enableRowGroup: true`;
  off → clears it (`undefined`, reverts to AG-Grid default).
- **Agg Function** — dropdown: `None`, `sum`, `min`, `max`, `count`, `avg`,
  `first`, `last`. Pick a function → set `aggFunc` + `enableValue: true`;
  `None` → clear `aggFunc` and `enableValue`.

Behaviour:

- Applies to the currently **selected column(s)** (the toolbar's column
  selection / scope). These are column-level `colDef` props, so the cell/header
  **target** toggle does not apply — the segment ignores `target`.
- Control state reflects the **first selected column's** assignment (consistent
  with how the number-format readout derives current state); shown blank /
  indeterminate when the selection is empty.
- Uses shadcn/design-system primitives + tokens (light/dark safe), matching the
  other toolbar modules. No native `<select>`.

### 2. Reducer + actions

- **`applyRowGroupingReducer(colIds, patch, scope)`** in
  `packages/shared/engine/src/customizer/modules/column-customization/formattingActions.ts`.
  Merges `patch` (`{ enableRowGroup?, aggFunc?, enableValue? }`, each value or
  `undefined` to clear) into `assignments[colId].rowGrouping` for each colId.
  This is a sibling of `cellStyleOverrides` / `valueFormatterTemplate`; it does
  **not** go through the style-override (`writeOverridesReducer`) path.
- New actions in `useFormatterActions.ts` — `toggleEnableRowGroup()`,
  `setAggFunc(name | null)` — calling `setCustStateWithHistory(applyRowGroupingReducer(...))`
  so undo/redo + Save behave like every other formatter action.
- New derived state in the formatter `state.ts` / `useFormatter` exposing the
  current `enableRowGroup` / `aggFunc` for the selected column.

### 3. Data flow

```
toolbar control → useFormatterActions action
  → setCustStateWithHistory(applyRowGroupingReducer(colIds, patch, scope))
  → column-customization module state (assignments[colId].rowGrouping)
  → engine transforms apply enableRowGroup / aggFunc / enableValue to colDef
  → (profile marked dirty) → Save → active profile  /  column-template snapshot
```

### 4. Persistence / template

No new persistence code. `rowGrouping` already lives on the column-customization
assignment, captured by the active-profile Save and by column-template snapshots.
The engine transforms already map the values onto the colDef.

## Edge cases

- **Empty selection:** controls render disabled/indeterminate; actions no-op
  (mirrors existing formatter actions when `scope === 'selected'` and no colIds).
- **Multi-column with mixed values:** state reflects the first selected column;
  applying sets the chosen value on all selected columns.
- **Toggle off / None:** clears the relevant key(s) to `undefined` so the column
  reverts to grid defaults rather than persisting a `false`/empty value.
- **Virtual / calculated columns:** reducer keys by `colId`, so assignments still
  apply (consistent with existing reducers).

## Testing

- **Unit (`formattingActions`):** `applyRowGroupingReducer` — set enableRowGroup;
  set aggFunc (also sets enableValue); None clears both; multi-column; clearing
  leaves other assignment fields intact.
- **Component (toolbar segment):** toggle sets/clears `enableRowGroup`; dropdown
  sets `aggFunc` + `enableValue`; reflects selected-column state; empty-selection
  no-op.
- Keep full `grid` + `widgets-react` suites green.

## Out of scope

- Custom aggregation expressions (`aggFunc: 'custom'`) — remain in Column Settings.
- Immediate grouping (`rowGroup`) / pivot / rowGroupIndex ordering from the toolbar.
- Any change to the existing Column Settings `RowGroupingEditor`.

## Files (anticipated)

- `packages/shared/engine/src/customizer/modules/column-customization/formattingActions.ts` — add `applyRowGroupingReducer` (+ unit test).
- `packages/react-grid/grid/src/widget/formatter/modules/ModuleGrouping.tsx` — new segment.
- `packages/react-grid/grid/src/widget/formatter/useFormatterActions.ts` — actions.
- `packages/react-grid/grid/src/widget/formatter/state.ts` (+ `useFormatter`) — derived state.
- `packages/react-grid/grid/src/widget/formatter/Formatter.tsx` — render the new segment.
- `docs/current-features.md` — document the new toolbar controls.
