# Filters Toolbar — Design Spec

**Date:** 2026-04-13
**Status:** Approved
**Author:** Claude + User

---

## Overview

A Filters toolbar that lets users capture the current AG-Grid filter state as named toggle buttons. Each button represents a saved filter snapshot. Users can toggle filters on/off to apply or remove them. When multiple filters are active, they combine with OR logic (a row passes if it matches any active filter set).

---

## Data Model

```typescript
interface SavedFilter {
  id: string;                    // unique ID: `sf_{timestamp}_{random}`
  label: string;                 // user-editable label
  filterModel: FilterModel;      // snapshot from api.getFilterModel()
  active: boolean;               // toggle state
}
```

- Persisted to `localStorage` key `gc-filters:{gridId}` on explicit Save button click
- Auto-loaded from localStorage on component mount

---

## Architecture

### Filter Application Strategy

| Active Count | Strategy | Floating Filters |
|---|---|---|
| **0** | `setFilterModel(null)` — clear all | Empty (normal grid state) |
| **1** | `setFilterModel(savedModel)` — native AG-Grid | Shows saved filter state in floating filters |
| **2+** | `setFilterModel(null)` + External Filter with OR logic | Empty — toggle buttons indicate active filters |

### External Filter (OR Logic)

When 2+ filters are active, AG-Grid's `isExternalFilterPresent` + `doesExternalFilterPass` callbacks handle filtering:

- **`isExternalFilterPresent`**: Returns `true` when 2+ saved filters are active
- **`doesExternalFilterPass(node)`**: For each active saved filter, checks if the row matches ALL conditions within that filter (AND within a set). Returns `true` if the row matches ANY active filter set (OR across sets).

These callbacks are wired via a `useRef` inside `MarketsGrid` so `FiltersToolbar` can update the active filter list without re-rendering the grid.

### Filter Evaluator

A lightweight `filterEvaluator.ts` module that matches AG-Grid filter models against row data. Supports:

- **agTextColumnFilter**: equals, notEqual, contains, notContains, startsWith, endsWith, blank, notBlank
- **agNumberColumnFilter**: equals, notEqual, lessThan, lessThanOrEqual, greaterThan, greaterThanOrEqual, inRange, blank, notBlank
- **agSetColumnFilter**: values array — row value must be included in the set
- **ICombinedSimpleModel**: AND/OR operator between two conditions on the same column

```typescript
// Public API
function doesRowPassFilterModel(
  filterModel: FilterModel,
  rowData: Record<string, any>
): boolean;
```

For each column in the filter model, evaluates the column's filter against `rowData[colId]`. All column filters must pass (AND across columns within one saved filter).

---

## Component Structure

### FiltersToolbar

**File:** `packages/markets-grid/src/FiltersToolbar.tsx`

**Props:**
```typescript
interface FiltersToolbarProps {
  core: GridCustomizerCore;
  store: GridStore;
  gridId: string;
  activeFiltersRef: React.MutableRefObject<SavedFilter[]>;
}
```

**Layout:**
```
[+ Add] | [Filter 1] [Filter 2] [Filter 3] ...              [Save]
```

- Height: `h-9` (36px), matching FormattingToolbar pattern
- Background: `bg-card`, bottom border: `border-b border-border`
- Left padding: `px-4` with filter icon + "FILTERS" label in muted text
- All buttons use existing `gc-tbtn` CSS class patterns

### + Add Button

1. Reads `api.getFilterModel()` from grid
2. If empty/null: no-op (disabled appearance or brief tooltip)
3. If filters exist:
   - Creates new `SavedFilter` with auto-generated label
   - Adds to state in **active** state
   - No need to re-apply filter (already applied on grid)

**Auto-label generation:**
- Single column filter: `"Status: FILLED"` or `"Price > 100"` (column name + summary)
- Multi-column: `"Status + Side"` (column header names joined with +)
- Fallback: `"Filter N"` (incrementing counter)

### Toggle Buttons

- Shadcn `<Button>` with size `sm`
- **Active state**: `bg-primary/15 text-primary` with `border border-primary/30` — matches `gc-tbtn-active` pattern
- **Inactive state**: standard `gc-tbtn` styling (muted, 55% opacity)
- Small Filter icon (12px) + label text
- `onClick`: toggles `active` boolean, then calls `applyActiveFilters()`

### Right-Click Context Menu

Custom positioned menu (not native browser context menu) using absolute-positioned div:

1. **Rename** — Opens Shadcn `<Popover>` anchored to the button, containing:
   - Shadcn `<Input>` pre-filled with current label
   - Confirm on Enter key or blur
   - Cancel on Escape
2. **Remove** — Deletes the SavedFilter from state, re-applies remaining active filters

Menu styling: `bg-card border border-border rounded-md shadow-lg`, items with hover highlight, 9-11px font size matching toolbar aesthetic.

### Save Button

- Right-aligned (pushed with `ml-auto`)
- Save icon (Lucide `Save`)
- Serializes `SavedFilter[]` to `localStorage['gc-filters:{gridId}']`
- Flash checkmark feedback (400ms) using `useFlashConfirm` pattern from FormattingToolbar
- **Explicit save only** — no auto-persist

---

## Integration with MarketsGrid

### New Prop

```typescript
interface MarketsGridProps<TData = any> {
  // ... existing props ...
  showFiltersToolbar?: boolean;  // NEW — default false
}
```

When `true`, MarketsGrid internally creates the Filters toolbar slot and injects it into the ToolbarSwitcher after the Style slot and before any `extraToolbars`.

### External Filter Wiring

Inside MarketsGrid:

```typescript
const activeFiltersRef = useRef<SavedFilter[]>([]);

// Passed to AgGridReact
<AgGridReact
  isExternalFilterPresent={() => {
    const active = activeFiltersRef.current.filter(f => f.active);
    return active.length >= 2;
  }}
  doesExternalFilterPass={(node) => {
    const active = activeFiltersRef.current.filter(f => f.active);
    return active.some(f => doesRowPassFilterModel(f.filterModel, node.data));
  }}
  // ... other props
/>
```

### Filter Change Listener

MarketsGrid registers `onFilterChanged` to track when the user manually changes filters via floating filters or column menu. This is informational — it doesn't auto-capture filters; the user explicitly clicks `+`.

### Toolbar Slot

```typescript
// Inside MarketsGrid, when showFiltersToolbar is true:
const filtersSlot: ToolbarSlot = {
  id: 'filters',
  label: 'Filters',
  color: 'var(--bn-yellow, #f0b90b)',
  content: (
    <FiltersToolbar
      core={core}
      store={store}
      gridId={gridId}
      activeFiltersRef={activeFiltersRef}
    />
  ),
};
```

---

## Files to Create

| File | Purpose |
|---|---|
| `packages/markets-grid/src/FiltersToolbar.tsx` | Main toolbar component |
| `packages/markets-grid/src/filterEvaluator.ts` | Filter model matcher for OR evaluation |

## Files to Modify

| File | Change |
|---|---|
| `packages/markets-grid/src/MarketsGrid.tsx` | Add `showFiltersToolbar` prop, wire external filter ref, create Filters toolbar slot, pass `ExternalFilterModule` |
| `packages/markets-grid/src/types.ts` | Add `showFiltersToolbar?: boolean` to `MarketsGridProps`, export `SavedFilter` type |
| `packages/markets-grid/src/index.ts` | Export `FiltersToolbar`, `SavedFilter` |
| `apps/demo/src/App.tsx` | Replace placeholder Filters content with `showFiltersToolbar={true}`, remove Filters from `extraToolbars` |

## E2E Tests to Write

| Test | Description |
|---|---|
| Add filter button | Set a column filter, click +, verify toggle button appears |
| Toggle filter on/off | Toggle button off → filter clears; toggle on → filter re-applies |
| Multiple filters OR | Create 2 filters with different criteria, activate both, verify OR logic |
| Rename filter | Right-click → Rename, type new name, verify label updates |
| Remove filter | Right-click → Remove, verify button disappears |
| Save + persist | Save filters, reload page, verify filters restored |
| Empty filter guard | Click + with no active filters, verify nothing happens |
| Single filter native | One active filter → floating filters show saved state |

---

## Dependencies

- `ExternalFilterModule` from `ag-grid-community` — must be registered for `isExternalFilterPresent`/`doesExternalFilterPass` to work
- Already using `AllEnterpriseModule` which includes it

---

## Out of Scope

- Drag-to-reorder toggle buttons
- Filter groups/folders
- Import/export filter sets
- Advanced filter builder UI
- Server-side filter evaluation
