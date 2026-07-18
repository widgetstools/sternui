# Formatting Toolbar — Grouping Options popover (grid-wide grouping/total settings)

**Date:** 2026-06-23
**Status:** Design approved
**Branch:** `feature/formatter-enhancements`

## Context

Five grid-wide grouping/total settings already exist in `general-settings`
(Tier 2) and are applied via `transformGridOptions`, but they're only reachable
through the full Grid Options panel — cumbersome for quick access. They are:

| Setting | state field | values |
|---|---|---|
| Hide Agg in Header | `suppressAggFuncInHeader` | boolean |
| Group Sub-Total Row | `groupTotalRow` | Off(`undefined`) / `top` / `bottom` |
| Grand Total Row | `grandTotalRow` | Off(`undefined`) / `top` / `bottom` / `pinnedTop` / `pinnedBottom` |
| Group Display | `groupDisplayType` | `singleColumn` / `multipleColumns` / `groupRows` / `custom` |
| Row Group Panel | `rowGroupPanelShow` | `never` / `onlyWhenGrouping` / `always` |

These are **grid-wide** (whole grid), distinct from the per-column Group pills
added earlier (which write per-column column-customization assignments).

The Formatting Toolbar already edits grid-wide `general-settings`
(`toggleHeaderCaseUppercase`, `toggleCellTooltips` write to the module via
`setGeneralSettingsState`), so co-locating these is consistent with precedent.

## Decisions (from brainstorming)

- **Placement:** a **"Grouping options" popover** anchored in the existing
  `ModuleGrouping` ("Group") segment of the Formatting Toolbar. Quick access via
  the formatter toolbar is acceptable (need not be reachable when the toolbar is
  closed).
- **Scope:** the 5 controls are **grid-wide** and therefore **always enabled**
  (not gated by column selection, unlike the per-column Group pills).
- **Persistence:** writes to `general-settings` via `setGeneralSettingsState`
  (no undo/redo wrapper — matches existing general-settings toggles); applied
  live by `transformGridOptions`; saved to the active profile on Save.

## Design

### 1. UI — popover trigger in `ModuleGrouping`

- A `PillButton` (sliders/settings icon, tooltip "Grouping options",
  `data-testid="fmt-grouping-options"`) to the right of the per-column pills.
- Opens a shadcn `Popover` (`@wellsfargo-starui/ui`) with the 5 controls, each a labeled
  row:
  - **Hide Agg in Header** — toggle (`Pill`/switch).
  - **Group Sub-Total Row** — `SegmentedToggle`: Off / Top / Bottom.
  - **Grand Total Row** — `ToolbarSelect`: Off / Top / Bottom / Pinned Top / Pinned Bottom.
  - **Group Display** — `ToolbarSelect`: Single Column / Multiple Columns / Group Rows / Custom.
  - **Row Group Panel** — `SegmentedToggle`: Never / Only When Grouping / Always.
- shadcn/design-system primitives + tokens only (light/dark safe). The per-column
  pills stay inline; the popover holds the whole-grid settings — visually
  separating the two scopes.

### 2. State + actions

- `useFormatterActions` already reads `generalSettingsState`. Expose the 5 values
  on `FormatterState.grouping` (or flat fields): `suppressAggFuncInHeader`,
  `groupTotalRow`, `grandTotalRow`, `groupDisplayType`, `rowGroupPanelShow`.
- Add 5 setters mirroring `toggleHeaderCaseUppercase`:
  - `toggleHideAggInHeader(): void`
  - `setGroupTotalRow(v: 'top' | 'bottom' | undefined): void`
  - `setGrandTotalRow(v: 'top' | 'bottom' | 'pinnedTop' | 'pinnedBottom' | undefined): void`
  - `setGroupDisplayType(v: GroupDisplayType): void`
  - `setRowGroupPanelShow(v: 'never' | 'onlyWhenGrouping' | 'always'): void`

  Each: `setGeneralSettingsState((prev) => ({ ...(prev ?? INITIAL_GENERAL_SETTINGS), <field>: v }))`.
  Add to the `FormatterActions` interface + the returned actions bundle.

### 3. Persistence

No new persistence code. `general-settings` is part of the profile;
`transformGridOptions` already maps all 5 onto grid options (live-editable).

### 4. Tests

- Integration (`FormattingToolbar.test.tsx`): open the popover via
  `fmt-grouping-options`; toggle **Hide Agg in Header** → assert
  `general-settings.suppressAggFuncInHeader` flips; assert the popover renders
  the grid-wide controls. (Radix `Select` is awkward in jsdom — select-value
  assertions lean on the action wiring + the reliably-testable toggle.)
- Keep `grid` suite green.

## Out of scope

- Adding these to the primary toolbar / ViewMenu (always-visible access) — the
  user accepted formatter-toolbar-scoped access.
- Any new grid-option behaviour — the transforms already exist.
- Per-column total/agg-header settings (these are grid-wide only).

## Files (anticipated)

- `packages/react-grid/grid/src/widget/formatter/useFormatterActions.ts` — 5 setters + reads.
- `packages/react-grid/grid/src/widget/formatter/state.ts` — `FormatterState`/`FormatterActions` additions.
- `packages/react-grid/grid/src/widget/formatter/modules/ModuleGrouping.tsx` — popover trigger + body.
- `packages/react-grid/grid/src/widget/FormattingToolbar.test.tsx` — integration test.
- `docs/current-features.md` — document the popover.
