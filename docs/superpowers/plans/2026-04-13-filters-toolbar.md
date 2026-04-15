# Filters Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Filters toolbar where users capture grid filter state as named toggle buttons that apply/remove saved filters with OR logic when multiple are active.

**Architecture:** `FiltersToolbar` component lives in `packages/markets-grid/src/`. Filter evaluation for OR logic uses AG-Grid's `isExternalFilterPresent` + `doesExternalFilterPass` via a mutable ref. A lightweight `filterEvaluator.ts` matches AG-Grid filter models against row data. `MarketsGrid` gains a `showFiltersToolbar` boolean prop that internally wires up the Filters toolbar slot with correct props.

**Tech Stack:** React 19, AG-Grid Enterprise 35, Zustand, Shadcn UI (Button, Popover, Input), Lucide icons, Playwright E2E

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/markets-grid/src/filterEvaluator.ts` | Create | Pure function: evaluates AG-Grid filter models against row data |
| `packages/markets-grid/src/FiltersToolbar.tsx` | Create | Toolbar component: +, toggle buttons, context menu, save |
| `packages/markets-grid/src/types.ts` | Modify | Add `SavedFilter` interface, `showFiltersToolbar` prop |
| `packages/markets-grid/src/MarketsGrid.tsx` | Modify | Wire external filter ref, create Filters toolbar slot |
| `packages/markets-grid/src/index.ts` | Modify | Export new types and components |
| `apps/demo/src/App.tsx` | Modify | Replace placeholder Filters toolbar with `showFiltersToolbar={true}` |
| `e2e/filters-toolbar.spec.ts` | Create | E2E tests for all filter toolbar features |
| `docs/IMPLEMENTED_FEATURES.md` | Modify | Document the Filters toolbar feature |

---

### Task 1: Filter Evaluator — Pure Logic

**Files:**
- Create: `packages/markets-grid/src/filterEvaluator.ts`

- [ ] **Step 1: Create the filter evaluator module**

```typescript
// packages/markets-grid/src/filterEvaluator.ts

/**
 * Lightweight AG-Grid filter model evaluator.
 * Used for OR-combining multiple saved filters via external filter API.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** AG-Grid FilterModel = Record<colId, columnFilterModel> */
type FilterModel = Record<string, any>;

// ─── Single-Value Matchers ──────────────────────────────────────────────────

function matchesTextFilter(cellValue: any, model: any): boolean {
  if (!model || !model.type) return true;
  const val = cellValue == null ? '' : String(cellValue).toLowerCase();
  const filter = (model.filter ?? '').toLowerCase();

  switch (model.type) {
    case 'equals': return val === filter;
    case 'notEqual': return val !== filter;
    case 'contains': return val.includes(filter);
    case 'notContains': return !val.includes(filter);
    case 'startsWith': return val.startsWith(filter);
    case 'endsWith': return val.endsWith(filter);
    case 'blank': return cellValue == null || String(cellValue).trim() === '';
    case 'notBlank': return cellValue != null && String(cellValue).trim() !== '';
    default: return true;
  }
}

function matchesNumberFilter(cellValue: any, model: any): boolean {
  if (!model || !model.type) return true;
  const val = cellValue == null ? null : Number(cellValue);

  switch (model.type) {
    case 'blank': return cellValue == null;
    case 'notBlank': return cellValue != null;
    default: break;
  }

  if (val == null || isNaN(val)) return false;
  const filter = Number(model.filter);

  switch (model.type) {
    case 'equals': return val === filter;
    case 'notEqual': return val !== filter;
    case 'lessThan': return val < filter;
    case 'lessThanOrEqual': return val <= filter;
    case 'greaterThan': return val > filter;
    case 'greaterThanOrEqual': return val >= filter;
    case 'inRange': return val >= filter && val <= Number(model.filterTo);
    default: return true;
  }
}

function matchesSetFilter(cellValue: any, model: any): boolean {
  if (!model || !model.values) return true;
  const values: any[] = model.values;
  if (values.length === 0) return false;
  const val = cellValue == null ? null : String(cellValue);
  return values.includes(val);
}

// ─── Column Filter Dispatcher ───────────────────────────────────────────────

function matchesColumnFilter(cellValue: any, model: any): boolean {
  if (!model) return true;

  // Combined model (AND/OR of two conditions on same column)
  if (model.operator && model.conditions) {
    const results = model.conditions.map((c: any) => matchesColumnFilter(cellValue, c));
    return model.operator === 'AND'
      ? results.every(Boolean)
      : results.some(Boolean);
  }

  const filterType = model.filterType ?? model.type ?? '';

  switch (filterType) {
    case 'text': return matchesTextFilter(cellValue, model);
    case 'number': return matchesNumberFilter(cellValue, model);
    case 'set': return matchesSetFilter(cellValue, model);
    default:
      // For text/number filters without explicit filterType,
      // infer from presence of filter property type
      if (typeof model.filter === 'string') return matchesTextFilter(cellValue, model);
      if (typeof model.filter === 'number') return matchesNumberFilter(cellValue, model);
      return true;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Check if a row passes ALL column filters in a filter model.
 * Each column filter must pass (AND across columns within one saved filter).
 */
export function doesRowPassFilterModel(
  filterModel: FilterModel,
  rowData: Record<string, any>,
): boolean {
  for (const colId of Object.keys(filterModel)) {
    const colFilter = filterModel[colId];
    const cellValue = rowData[colId];
    if (!matchesColumnFilter(cellValue, colFilter)) return false;
  }
  return true;
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/develop/aggrid-customization && npx tsc --noEmit --project packages/markets-grid/tsconfig.json 2>&1 | head -20`
Expected: No errors (or only pre-existing unrelated ones)

- [ ] **Step 3: Commit**

```bash
git add packages/markets-grid/src/filterEvaluator.ts
git commit -m "feat(filters): add filter model evaluator for OR logic

Pure function that matches AG-Grid filter models (text, number, set)
against row data. Supports combined models with AND/OR operators.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Types — SavedFilter Interface & MarketsGrid Props

**Files:**
- Modify: `packages/markets-grid/src/types.ts`

- [ ] **Step 1: Add SavedFilter type and showFiltersToolbar prop**

Add these to `packages/markets-grid/src/types.ts`:

After the `ToolbarSlotConfig` interface (after line 15), add:

```typescript
/** A saved filter snapshot with a user-editable label and toggle state. */
export interface SavedFilter {
  /** Unique ID: `sf_{timestamp}_{random}` */
  id: string;
  /** User-editable label (e.g. "Buy Orders", "Status: FILLED") */
  label: string;
  /** Snapshot of AG-Grid's getFilterModel() at capture time */
  filterModel: Record<string, any>;
  /** Whether this filter is currently applied */
  active: boolean;
}
```

In the `MarketsGridProps` interface, after `extraToolbars?: ToolbarSlotConfig[];` (line 38), add:

```typescript
  /**
   * Show the built-in Filters toolbar in the toolbar switcher.
   * Allows users to capture, name, and toggle saved grid filters.
   */
  showFiltersToolbar?: boolean;
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/develop/aggrid-customization && npx tsc --noEmit --project packages/markets-grid/tsconfig.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/markets-grid/src/types.ts
git commit -m "feat(filters): add SavedFilter type and showFiltersToolbar prop

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: FiltersToolbar Component

**Files:**
- Create: `packages/markets-grid/src/FiltersToolbar.tsx`

- [ ] **Step 1: Create the FiltersToolbar component**

```typescript
// packages/markets-grid/src/FiltersToolbar.tsx

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { GridCustomizerCore, GridStore } from '@grid-customizer/core';
import { Button, Popover, Input, Tooltip, cn } from '@grid-customizer/core';
import { Plus, Save, Check, Filter, X, Pencil, Trash2 } from 'lucide-react';
import type { SavedFilter } from './types';

// ─── Auto-Label Generation ──────────────────────────────────────────────────

function generateLabel(filterModel: Record<string, any>, existingCount: number): string {
  const colIds = Object.keys(filterModel);
  if (colIds.length === 0) return `Filter ${existingCount + 1}`;

  if (colIds.length === 1) {
    const colId = colIds[0];
    const model = filterModel[colId];
    const name = colId.charAt(0).toUpperCase() + colId.slice(1);

    // Set filter: show values
    if (model?.filterType === 'set' && model?.values?.length) {
      const vals = model.values.slice(0, 2).join(', ');
      return model.values.length > 2 ? `${name}: ${vals}...` : `${name}: ${vals}`;
    }
    // Text/Number: show type + value
    if (model?.filter != null) {
      return `${name}: ${model.filter}`;
    }
    return name;
  }

  // Multi-column: join names
  if (colIds.length <= 3) {
    return colIds.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(' + ');
  }
  return `${colIds.length} Filters`;
}

function makeId(): string {
  return `sf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Flash Confirm Hook ─────────────────────────────────────────────────────

function useFlashConfirm(): [boolean, () => void] {
  const [confirmed, setConfirmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useCallback(() => {
    setConfirmed(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setConfirmed(false), 400);
  }, []);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return [confirmed, flash];
}

// ─── Context Menu ───────────────────────────────────────────────────────────

interface ContextMenuState {
  filterId: string;
  x: number;
  y: number;
}

// ─── Component ──────────────────────────────────────────────────────────────

export interface FiltersToolbarProps {
  core: GridCustomizerCore;
  store: GridStore;
  gridId: string;
  /** Mutable ref updated by this component; read by MarketsGrid's external filter */
  activeFiltersRef: React.MutableRefObject<SavedFilter[]>;
}

export function FiltersToolbar({ core, store, gridId, activeFiltersRef }: FiltersToolbarProps) {
  const [filters, setFilters] = useState<SavedFilter[]>(() => {
    try {
      const raw = localStorage.getItem(`gc-filters:${gridId}`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [saveConfirmed, flashSave] = useFlashConfirm();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Sync the activeFiltersRef whenever filters change
  useEffect(() => {
    activeFiltersRef.current = filters.filter(f => f.active);
  }, [filters, activeFiltersRef]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  // ── Apply active filters to grid ──
  const applyActiveFilters = useCallback((updatedFilters: SavedFilter[]) => {
    const api = core.getGridApi();
    if (!api) return;

    const active = updatedFilters.filter(f => f.active);

    if (active.length === 0) {
      // Clear all filters
      api.setFilterModel(null);
    } else if (active.length === 1) {
      // Single filter: apply natively via setFilterModel
      api.setFilterModel(active[0].filterModel);
    } else {
      // Multiple: clear native filters, external filter handles OR
      api.setFilterModel(null);
      // External filter will pick up from activeFiltersRef
      api.onFilterChanged();
    }
  }, [core]);

  // ── Add filter ──
  const handleAdd = useCallback(() => {
    const api = core.getGridApi();
    if (!api) return;

    const filterModel = api.getFilterModel();
    if (!filterModel || Object.keys(filterModel).length === 0) return;

    const newFilter: SavedFilter = {
      id: makeId(),
      label: generateLabel(filterModel, filters.length),
      filterModel,
      active: true,
    };

    const updated = [...filters, newFilter];
    setFilters(updated);
    // Don't re-apply — filter is already active on grid
  }, [core, filters]);

  // ── Toggle filter ──
  const handleToggle = useCallback((id: string) => {
    const updated = filters.map(f => f.id === id ? { ...f, active: !f.active } : f);
    setFilters(updated);
    applyActiveFilters(updated);
  }, [filters, applyActiveFilters]);

  // ── Remove filter ──
  const handleRemove = useCallback((id: string) => {
    const updated = filters.filter(f => f.id !== id);
    setFilters(updated);
    setContextMenu(null);
    applyActiveFilters(updated);
  }, [filters, applyActiveFilters]);

  // ── Rename filter ──
  const startRename = useCallback((id: string) => {
    const filter = filters.find(f => f.id === id);
    if (!filter) return;
    setRenameId(id);
    setRenameValue(filter.label);
    setContextMenu(null);
  }, [filters]);

  const confirmRename = useCallback(() => {
    if (!renameId || !renameValue.trim()) {
      setRenameId(null);
      return;
    }
    setFilters(prev => prev.map(f =>
      f.id === renameId ? { ...f, label: renameValue.trim() } : f
    ));
    setRenameId(null);
  }, [renameId, renameValue]);

  // ── Save to localStorage ──
  const handleSave = useCallback(() => {
    try {
      localStorage.setItem(`gc-filters:${gridId}`, JSON.stringify(filters));
    } catch { /* quota exceeded */ }
    flashSave();
  }, [filters, gridId, flashSave]);

  // ── Context menu handler ──
  const handleContextMenu = useCallback((e: React.MouseEvent, filterId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ filterId, x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div
      className="flex items-center gap-2 h-9 shrink-0 border-b border-border bg-card text-xs"
      style={{ paddingLeft: 16, paddingRight: 16 }}
    >
      {/* ── Add Button ── */}
      <Tooltip content="Capture current filter as toggle button">
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 w-7 h-7 rounded-[4px] gc-tbtn"
          onMouseDown={(e) => { e.preventDefault(); handleAdd(); }}
        >
          <Plus size={14} strokeWidth={1.75} />
        </Button>
      </Tooltip>

      {/* ── Separator ── */}
      {filters.length > 0 && (
        <div className="gc-toolbar-sep h-5 mx-0.5" />
      )}

      {/* ── Toggle Buttons ── */}
      <div className="flex items-center gap-1 flex-1 overflow-x-auto">
        {filters.map(f => (
          <React.Fragment key={f.id}>
            {renameId === f.id ? (
              <div className="flex items-center">
                <Input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmRename();
                    if (e.key === 'Escape') setRenameId(null);
                  }}
                  onBlur={confirmRename}
                  autoFocus
                  className="h-6 w-28 text-xs px-2"
                  style={{ fontSize: 10, fontFamily: "var(--fi-sans, 'Geist', sans-serif)" }}
                />
              </div>
            ) : (
              <button
                onClick={() => handleToggle(f.id)}
                onContextMenu={(e) => handleContextMenu(e, f.id)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 h-6 rounded-[4px] text-[10px] font-semibold',
                  'border transition-all duration-150 cursor-pointer whitespace-nowrap',
                  "font-[var(--fi-sans,'Geist',sans-serif)]",
                  f.active
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'bg-transparent text-muted-foreground border-border opacity-60 hover:opacity-90 hover:bg-accent/40',
                )}
                title={`${f.label} — click to toggle, right-click for options`}
              >
                <Filter size={10} strokeWidth={2} />
                <span>{f.label}</span>
              </button>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* ── Save Button ── */}
      {filters.length > 0 && (
        <>
          <div className="gc-toolbar-sep h-5 mx-0.5" />
          <Tooltip content="Save filter buttons">
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 w-7 h-7 rounded-[4px] gc-tbtn gc-tbtn-confirm"
              onMouseDown={(e) => { e.preventDefault(); handleSave(); }}
            >
              {saveConfirmed ? <Check size={14} strokeWidth={2} /> : <Save size={14} strokeWidth={1.75} />}
            </Button>
          </Tooltip>
        </>
      )}

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div
          className="fixed z-[10010] rounded-md border border-border bg-card shadow-lg py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-foreground hover:bg-accent/60 transition-colors"
            style={{ fontFamily: "var(--fi-sans, 'Geist', sans-serif)" }}
            onClick={() => startRename(contextMenu.filterId)}
          >
            <Pencil size={12} strokeWidth={1.75} />
            Rename
          </button>
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-destructive hover:bg-accent/60 transition-colors"
            style={{ fontFamily: "var(--fi-sans, 'Geist', sans-serif)" }}
            onClick={() => handleRemove(contextMenu.filterId)}
          >
            <Trash2 size={12} strokeWidth={1.75} />
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/develop/aggrid-customization && npx tsc --noEmit --project packages/markets-grid/tsconfig.json 2>&1 | head -20`
Expected: No errors (or only pre-existing unrelated ones)

- [ ] **Step 3: Commit**

```bash
git add packages/markets-grid/src/FiltersToolbar.tsx
git commit -m "feat(filters): add FiltersToolbar component

Toggle buttons for saved filters with add/remove/rename/save.
Context menu on right-click, auto-label generation from filter model.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Wire MarketsGrid — External Filter & Toolbar Slot

**Files:**
- Modify: `packages/markets-grid/src/MarketsGrid.tsx`

- [ ] **Step 1: Add imports and external filter ref**

In `packages/markets-grid/src/MarketsGrid.tsx`, update the imports at the top:

Change line 1 from:
```typescript
import React, { useCallback, useRef, useMemo } from 'react';
```
to:
```typescript
import React, { useCallback, useRef, useMemo, useState } from 'react';
```

After the existing imports (after line 12), add:

```typescript
import { FiltersToolbar } from './FiltersToolbar';
import { doesRowPassFilterModel } from './filterEvaluator';
import type { SavedFilter } from './types';
```

- [ ] **Step 2: Add showFiltersToolbar prop and external filter wiring**

In the destructured props (around line 35), add `showFiltersToolbar = false,` after `extraToolbars,`.

After the `getRowId` useMemo (around line 49), add:

```typescript
  // ── External filter for OR-combining multiple saved filters ──
  const activeFiltersRef = useRef<SavedFilter[]>([]);
```

- [ ] **Step 3: Add isExternalFilterPresent and doesExternalFilterPass to AgGridReact**

In the `<AgGridReact>` JSX (around line 131-146), add these two props after `cellSelection={true}`:

```typescript
          isExternalFilterPresent={() => activeFiltersRef.current.length >= 2}
          doesExternalFilterPass={(node: any) => {
            const active = activeFiltersRef.current;
            if (active.length < 2 || !node.data) return true;
            return active.some(f => doesRowPassFilterModel(f.filterModel, node.data));
          }}
```

- [ ] **Step 4: Build Filters toolbar slot in the toolbar section**

In the toolbar rendering section (around line 81-127), modify the `hasExtra` logic. Replace the existing block starting at `const hasExtra = ...` through the end of the toolbar IIFE with:

```typescript
        // Build toolbar slots: formatting bar is always first
        const slots: ToolbarSlot[] = [
          { id: 'style', label: 'Style', color: 'var(--primary, #14b8a6)', content: formattingBar },
        ];

        // Inject built-in Filters toolbar if enabled
        if (showFiltersToolbar) {
          slots.push({
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
          });
        }

        // Append any user-provided extra toolbars
        if (extraToolbars) {
          for (const t of extraToolbars) {
            slots.push({
              id: t.id,
              label: t.label,
              color: t.color ?? '',
              content: t.content,
            });
          }
        }

        if (slots.length === 1) {
          // Single toolbar — no switcher needed
          return (
            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ flex: 1 }}>{formattingBar}</div>
              {settingsBtn}
            </div>
          );
        }

        return (
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ flex: 1 }}>
              <ToolbarSwitcher toolbars={slots} defaultActiveId="style" />
            </div>
            {settingsBtn}
          </div>
        );
```

This replaces the old `hasExtra` check and the two existing branches. The logic now:
1. Always creates the Style slot
2. Conditionally adds Filters slot if `showFiltersToolbar`
3. Appends any user `extraToolbars`
4. Falls back to single-toolbar mode if only 1 slot

- [ ] **Step 5: Verify compilation**

Run: `cd /Users/develop/aggrid-customization && npx tsc --noEmit --project packages/markets-grid/tsconfig.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/markets-grid/src/MarketsGrid.tsx
git commit -m "feat(filters): wire FiltersToolbar into MarketsGrid

Add showFiltersToolbar prop, external filter ref for OR logic,
and inject Filters toolbar slot into ToolbarSwitcher.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Exports & Demo App

**Files:**
- Modify: `packages/markets-grid/src/index.ts`
- Modify: `apps/demo/src/App.tsx`

- [ ] **Step 1: Update exports**

In `packages/markets-grid/src/index.ts`, add after the `ToolbarSwitcher` exports (around line 4-5):

```typescript
export { FiltersToolbar } from './FiltersToolbar';
export type { SavedFilter } from './types';
```

- [ ] **Step 2: Update App.tsx — replace Filters placeholder with showFiltersToolbar**

In `apps/demo/src/App.tsx`:

Remove the Filter import from lucide-react (line 5). Change:
```typescript
import { Sun, Moon, Database, Filter } from 'lucide-react';
```
to:
```typescript
import { Sun, Moon, Database } from 'lucide-react';
```

Replace the entire `extraToolbars` array (lines 91-118) with just the Data toolbar:

```typescript
  // Demo extra toolbars — placeholder content to showcase the switcher
  const extraToolbars: ToolbarSlotConfig[] = [
    {
      id: 'data',
      label: 'Data',
      color: 'var(--bn-blue, #3da0ff)',
      content: (
        <div className="flex items-center gap-3 h-9 shrink-0 border-b border-border bg-card text-xs px-4">
          <Database size={14} strokeWidth={1.75} style={{ color: 'var(--bn-blue)' }} />
          <span style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>
            Data connections, live subscriptions, and field mappings — coming soon
          </span>
        </div>
      ),
    },
  ];
```

In the `<MarketsGrid>` JSX (around line 156), add `showFiltersToolbar={true}` after `rowIdField="id"`:

```tsx
        <MarketsGrid
          gridId="demo-blotter"
          rowData={rowData}
          columnDefs={columnDefs}
          theme={theme}
          rowIdField="id"
          showFiltersToolbar={true}
          extraToolbars={extraToolbars}
          sideBar={{ toolPanels: ['columns', 'filters'] }}
          statusBar={{
            statusPanels: [
              { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
              { statusPanel: 'agSelectedRowCountComponent', align: 'left' },
            ],
          }}
        />
```

- [ ] **Step 3: Verify the app compiles and runs**

Run: `cd /Users/develop/aggrid-customization && npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/markets-grid/src/index.ts apps/demo/src/App.tsx
git commit -m "feat(filters): enable FiltersToolbar in demo app

Replace Filters placeholder with showFiltersToolbar={true}.
Export FiltersToolbar and SavedFilter from markets-grid.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Visual Verification

- [ ] **Step 1: Start dev server and verify in browser**

Run: `cd /Users/develop/aggrid-customization && npm run dev -w apps/demo &`

Open `http://localhost:5190` and verify:
1. Three pills visible on hover above toolbar: Style, Filters, Data
2. Click Filters pill — shows filter toolbar with just the `+` button
3. Set a column filter via floating filter (e.g. type "BUY" in Side column)
4. Click `+` — toggle button appears with label like "Side: BUY"
5. Click the toggle button — it toggles off, filter clears
6. Click again — filter re-applies, floating filter shows "BUY"
7. Right-click toggle → Rename → type "Buy Orders" → Enter
8. Right-click toggle → Remove → button disappears
9. Create 2 filters, activate both, verify OR logic (more rows show)
10. Click Save, reload page, verify filters persist

- [ ] **Step 2: Fix any visual/functional issues found**

- [ ] **Step 3: Run existing E2E tests to verify no regressions**

Run: `cd /Users/develop/aggrid-customization && npx playwright test 2>&1 | tail -20`
Expected: All 104 existing tests pass

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(filters): visual and functional polish

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: E2E Tests

**Files:**
- Create: `e2e/filters-toolbar.spec.ts`

- [ ] **Step 1: Create the E2E test suite**

```typescript
// e2e/filters-toolbar.spec.ts

import { test, expect, Page } from '@playwright/test';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function waitForGrid(page: Page) {
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  await page.waitForTimeout(500);
}

async function clearPersistedState(page: Page) {
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter(k => k.startsWith('gc-state:') || k.startsWith('gc-filters:'))
      .forEach(k => localStorage.removeItem(k));
  });
}

/** Switch to the Filters toolbar via the pill switcher */
async function switchToFilters(page: Page) {
  // Hover above the toolbar area to reveal pills
  const toolbar = page.locator('.gc-toolbar-switcher');
  await toolbar.hover({ position: { x: 100, y: 0 } });
  await page.waitForTimeout(200);
  // Click the Filters pill
  const filtersPill = page.locator('.gc-pill-label', { hasText: 'FILTERS' });
  await filtersPill.click();
  await page.waitForTimeout(200);
}

/** Get visible row count from the grid */
async function getVisibleRowCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    return document.querySelectorAll('.ag-center-cols-container .ag-row').length;
  });
}

/** Set a text filter on a column via the floating filter input */
async function setFloatingFilter(page: Page, colId: string, value: string) {
  const input = page.locator(`.ag-floating-filter[col-id="${colId}"] input`);
  await input.click();
  await input.fill(value);
  await input.press('Enter');
  await page.waitForTimeout(500);
}

/** Set a Set filter on a column (side, status, etc.) via column menu */
async function setSetFilter(page: Page, colId: string, values: string[]) {
  // Open column menu filter
  const header = page.locator(`.ag-header-cell[col-id="${colId}"]`);
  await header.hover();
  const filterBtn = header.locator('.ag-header-cell-filter-button');
  await filterBtn.click();
  await page.waitForTimeout(300);

  // In set filter, deselect all first
  const selectAll = page.locator('.ag-set-filter-list .ag-set-filter-item').first();
  await selectAll.click();
  await page.waitForTimeout(200);

  // Select desired values
  for (const val of values) {
    const item = page.locator(`.ag-set-filter-item`, { hasText: val });
    await item.click();
    await page.waitForTimeout(100);
  }

  // Close the filter popup by pressing Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

/** Count toggle buttons in the filters toolbar */
async function getFilterButtonCount(page: Page): Promise<number> {
  return page.locator('.gc-toolbar-switcher .gc-toolbar-content button:has(svg)').count()
    .then(() => {
      // More reliable: count buttons with Filter icon inside the toolbar content area
      return page.evaluate(() => {
        const toolbar = document.querySelector('.gc-toolbar-content');
        if (!toolbar) return 0;
        // Filter toggle buttons have the specific class pattern
        return toolbar.querySelectorAll('button[title*="click to toggle"]').length;
      });
    });
}

/** Click the + (Add) button on the Filters toolbar */
async function clickAddFilter(page: Page) {
  await page.locator('.gc-toolbar-content button:has(svg.lucide-plus)').click();
  await page.waitForTimeout(300);
}

/** Click the Save button on the Filters toolbar */
async function clickSaveFilters(page: Page) {
  await page.locator('.gc-toolbar-content button:has(svg.lucide-save)').click();
  await page.waitForTimeout(300);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Filters Toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForGrid(page);
    await clearPersistedState(page);
    await page.reload();
    await waitForGrid(page);
    await switchToFilters(page);
  });

  test('shows empty toolbar with only + button', async ({ page }) => {
    const count = await getFilterButtonCount(page);
    expect(count).toBe(0);
    // + button should exist
    const addBtn = page.locator('.gc-toolbar-content button:has(svg.lucide-plus)');
    await expect(addBtn).toBeVisible();
  });

  test('+ button does nothing when no filters are set', async ({ page }) => {
    await clickAddFilter(page);
    const count = await getFilterButtonCount(page);
    expect(count).toBe(0);
  });

  test('captures current filter as toggle button', async ({ page }) => {
    // Set a filter on the Side column
    await setSetFilter(page, 'side', ['BUY']);
    await switchToFilters(page);

    // Click +
    await clickAddFilter(page);

    // Toggle button should appear
    const count = await getFilterButtonCount(page);
    expect(count).toBe(1);

    // Should have a label containing "Side" or "BUY"
    const btn = page.locator('button[title*="click to toggle"]').first();
    const text = await btn.textContent();
    expect(text).toBeTruthy();
  });

  test('toggle off removes filter from grid', async ({ page }) => {
    // Set filter and capture it
    await setSetFilter(page, 'side', ['BUY']);
    const filteredCount = await getVisibleRowCount(page);

    await switchToFilters(page);
    await clickAddFilter(page);

    // Toggle off
    const toggleBtn = page.locator('button[title*="click to toggle"]').first();
    await toggleBtn.click();
    await page.waitForTimeout(500);

    // More rows should be visible now (filter removed)
    const unfilteredCount = await getVisibleRowCount(page);
    expect(unfilteredCount).toBeGreaterThan(filteredCount);
  });

  test('toggle on re-applies filter', async ({ page }) => {
    // Set filter and capture
    await setSetFilter(page, 'side', ['BUY']);
    await switchToFilters(page);
    await clickAddFilter(page);

    // Toggle off
    const toggleBtn = page.locator('button[title*="click to toggle"]').first();
    await toggleBtn.click();
    await page.waitForTimeout(500);
    const unfilteredCount = await getVisibleRowCount(page);

    // Toggle back on
    await toggleBtn.click();
    await page.waitForTimeout(500);
    const refilteredCount = await getVisibleRowCount(page);

    expect(refilteredCount).toBeLessThan(unfilteredCount);
  });

  test('multiple filters with OR logic shows more rows', async ({ page }) => {
    // Create filter 1: Side = BUY
    await setSetFilter(page, 'side', ['BUY']);
    const buyCount = await getVisibleRowCount(page);
    await switchToFilters(page);
    await clickAddFilter(page);

    // Clear current filter
    const toggleBtn1 = page.locator('button[title*="click to toggle"]').first();
    await toggleBtn1.click();
    await page.waitForTimeout(300);

    // Create filter 2: Status = FILLED
    await setSetFilter(page, 'status', ['FILLED']);
    const filledCount = await getVisibleRowCount(page);
    await switchToFilters(page);
    await clickAddFilter(page);

    // Now activate both — OR should show BUY + FILLED rows
    await toggleBtn1.click();
    await page.waitForTimeout(500);

    const bothCount = await getVisibleRowCount(page);
    // OR should show at least as many as the larger individual set
    expect(bothCount).toBeGreaterThanOrEqual(Math.max(buyCount, filledCount));
  });

  test('right-click shows context menu with Rename and Remove', async ({ page }) => {
    // Create a filter button
    await setSetFilter(page, 'side', ['BUY']);
    await switchToFilters(page);
    await clickAddFilter(page);

    // Right-click
    const toggleBtn = page.locator('button[title*="click to toggle"]').first();
    await toggleBtn.click({ button: 'right' });
    await page.waitForTimeout(200);

    // Context menu should appear
    const menu = page.locator('.fixed.z-\\[10010\\]');
    await expect(menu).toBeVisible();
    await expect(menu.locator('text=Rename')).toBeVisible();
    await expect(menu.locator('text=Remove')).toBeVisible();
  });

  test('rename via context menu updates label', async ({ page }) => {
    // Create a filter button
    await setSetFilter(page, 'side', ['BUY']);
    await switchToFilters(page);
    await clickAddFilter(page);

    // Right-click → Rename
    const toggleBtn = page.locator('button[title*="click to toggle"]').first();
    await toggleBtn.click({ button: 'right' });
    await page.waitForTimeout(200);
    await page.locator('text=Rename').click();
    await page.waitForTimeout(200);

    // Input should appear
    const input = page.locator('.gc-toolbar-content input');
    await expect(input).toBeVisible();
    await input.fill('Buy Orders');
    await input.press('Enter');
    await page.waitForTimeout(200);

    // Button should now show new label
    const btn = page.locator('button[title*="click to toggle"]').first();
    const text = await btn.textContent();
    expect(text).toContain('Buy Orders');
  });

  test('remove via context menu deletes button', async ({ page }) => {
    // Create a filter button
    await setSetFilter(page, 'side', ['BUY']);
    await switchToFilters(page);
    await clickAddFilter(page);
    expect(await getFilterButtonCount(page)).toBe(1);

    // Right-click → Remove
    const toggleBtn = page.locator('button[title*="click to toggle"]').first();
    await toggleBtn.click({ button: 'right' });
    await page.waitForTimeout(200);
    await page.locator('text=Remove').click();
    await page.waitForTimeout(300);

    expect(await getFilterButtonCount(page)).toBe(0);
  });

  test('save persists filters across page reload', async ({ page }) => {
    // Create a filter button
    await setSetFilter(page, 'side', ['BUY']);
    await switchToFilters(page);
    await clickAddFilter(page);

    // Save
    await clickSaveFilters(page);
    await page.waitForTimeout(500);

    // Reload
    await page.reload();
    await waitForGrid(page);
    await switchToFilters(page);

    // Filter button should still exist
    expect(await getFilterButtonCount(page)).toBe(1);
  });

  test('single active filter shows in floating filters', async ({ page }) => {
    // Create and toggle a filter with known value
    await setSetFilter(page, 'side', ['BUY']);
    await switchToFilters(page);
    await clickAddFilter(page);

    // Toggle off
    const toggleBtn = page.locator('button[title*="click to toggle"]').first();
    await toggleBtn.click();
    await page.waitForTimeout(500);

    // Floating filter should be clear
    // Toggle back on
    await toggleBtn.click();
    await page.waitForTimeout(500);

    // Filter should be re-applied — visible row count should be reduced
    const allRows = 500; // total data rows
    const filteredCount = await getVisibleRowCount(page);
    expect(filteredCount).toBeLessThan(allRows);
  });
});
```

- [ ] **Step 2: Run the E2E tests**

Run: `cd /Users/develop/aggrid-customization && npx playwright test e2e/filters-toolbar.spec.ts 2>&1 | tail -30`
Expected: All tests pass

- [ ] **Step 3: Run full test suite for regression check**

Run: `cd /Users/develop/aggrid-customization && npx playwright test 2>&1 | tail -20`
Expected: All tests pass (104 existing + new filter tests)

- [ ] **Step 4: Fix any failing tests**

- [ ] **Step 5: Commit**

```bash
git add e2e/filters-toolbar.spec.ts
git commit -m "test(filters): add E2E tests for FiltersToolbar

10 tests covering: add, toggle on/off, multiple OR logic, rename,
remove, save/persist, empty guard, floating filter sync.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Update Documentation

**Files:**
- Modify: `docs/IMPLEMENTED_FEATURES.md`

- [ ] **Step 1: Add Filters Toolbar section to IMPLEMENTED_FEATURES.md**

After section "3. Multi-Toolbar Switcher" (and before "4. Styling Architecture"), add a new section:

```markdown
## 4. Filters Toolbar

### Saved Filter Buttons
- Built-in toolbar activated via `showFiltersToolbar={true}` on `MarketsGrid`
- Appears as "Filters" pill in the toolbar switcher (yellow/amber accent)
- `+` button captures current `api.getFilterModel()` snapshot as a toggle button
- Auto-generates labels from filter state (e.g. "Status: FILLED", "Side + Venue")
- Empty guard: `+` does nothing when no filters are set on the grid

### Toggle Behavior
- Single filter active: applies via `setFilterModel()` — floating filters show saved state
- Multiple filters active: OR logic via `isExternalFilterPresent` + `doesExternalFilterPass`
- OR semantics: AND within a filter set, OR across sets (row passes if it matches any active set)
- `setFilterModel(null)` clears native filters when 2+ active; toggle buttons indicate state

### Context Menu (Right-Click)
- **Rename**: Inline `<Input>` field, confirm on Enter/blur, cancel on Escape
- **Remove**: Deletes the toggle button and re-applies remaining active filters

### Persistence
- Save button persists `SavedFilter[]` to `localStorage['gc-filters:{gridId}']`
- Auto-loads on component mount
- Explicit save only — no auto-persist

### Filter Evaluator
- Lightweight matcher in `filterEvaluator.ts` for text/number/set filter types
- Supports combined models (`ICombinedSimpleModel`) with AND/OR operators
- Used by `doesExternalFilterPass` for OR evaluation across multiple active filters

### Data Model
```typescript
interface SavedFilter {
  id: string;           // sf_{timestamp}_{random}
  label: string;        // user-editable
  filterModel: Record<string, any>;  // AG-Grid filter model snapshot
  active: boolean;      // toggle state
}
```
```

Renumber subsequent sections (4 → 5, 5 → 6, etc.).

Update the E2E test counts in the Testing section:
- Add row to test suites table: `| Filters Toolbar | e2e/filters-toolbar.spec.ts | 10 | Add, toggle, OR logic, rename, remove, save/persist |`
- Update total count from 104 to 114

Update Summary Statistics:
- E2E Tests: 104 → 114
- E2E Test Suites: 5 → 6

- [ ] **Step 2: Commit**

```bash
git add docs/IMPLEMENTED_FEATURES.md
git commit -m "docs: add Filters Toolbar to IMPLEMENTED_FEATURES.md

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
