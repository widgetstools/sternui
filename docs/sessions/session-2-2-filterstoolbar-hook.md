# Session 2.2 — Extract `useFilterModel` hook from `FiltersToolbar`

You are a fresh agent session. Your task is to extract filter state management from `FiltersToolbar.tsx` (795 LOC) into a `useFilterModel` hook. The toolbar component becomes JSX-only (~250 LOC). Independent of any other session.

## Required reading

- [`packages/react/widgets/markets-grid/src/FiltersToolbar.tsx`](../../packages/react/widgets/markets-grid/src/FiltersToolbar.tsx) — target. Read top-to-bottom.
- [`CLAUDE.md`](../../CLAUDE.md) — naming + boundary rules

## Setup

```sh
git fetch origin main
git checkout -b feat/filterstoolbar-hook origin/main
npm ci --legacy-peer-deps

npx turbo typecheck build test
# Expected: green baseline
```

## Task

Move filter state + AG-Grid `filterChanged` subscription + pinned-column state out of `FiltersToolbar.tsx` into a new hook `useFilterModel`. The toolbar consumes the hook and renders JSX.

### Step 1 — Inventory

```sh
grep -n "useState\|useEffect\|useCallback\|useMemo\|useRef" packages/react/widgets/markets-grid/src/FiltersToolbar.tsx
grep -n "gridApi\." packages/react/widgets/markets-grid/src/FiltersToolbar.tsx
grep -n "addEventListener\|removeEventListener" packages/react/widgets/markets-grid/src/FiltersToolbar.tsx
```

Identify:
- **State pieces**: active filter set, pinned columns, filter chip data, search-in-filter strings
- **Subscriptions**: any `gridApi.addEventListener('filterChanged', ...)` — `useEffect` with cleanup
- **Side-effect callbacks**: setFilter, clearFilter, pinColumn, unpinColumn
- **Pure render chunks**: chip rows, dropdowns, "clear all" buttons — leave these in JSX

### Step 2 — Create the hook

`packages/react/widgets/markets-grid/src/useFilterModel.ts`:

```ts
/**
 * useFilterModel — owns the filter-model state for FiltersToolbar.
 *
 * Subscribes to the supplied gridApi's `filterChanged` event and
 * exposes the live filter state + handlers. The toolbar consumes
 * the returned shape; no other consumer.
 *
 * Internal-only — not exported from the package barrel.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GridApi, FilterChangedEvent } from 'ag-grid-community';

export interface UseFilterModelOpts {
  /**
   * The grid's API. May be null before AG-Grid has fired `onGridReady`.
   * The hook is a no-op when null.
   */
  readonly gridApi: GridApi | null;
}

export interface FilterChipModel {
  readonly columnId: string;
  readonly columnName: string;
  readonly summary: string; // "= 42" / "contains foo" / "in [A, B]"
}

export interface UseFilterModelResult {
  /** Active filter chips, one per filtered column. */
  readonly chips: readonly FilterChipModel[];
  /** Currently-pinned column ids. */
  readonly pinnedColumnIds: readonly string[];
  setFilter(columnId: string, filterModel: unknown): void;
  clearFilter(columnId: string): void;
  clearAllFilters(): void;
  pinColumn(columnId: string): void;
  unpinColumn(columnId: string): void;
}

export function useFilterModel(opts: UseFilterModelOpts): UseFilterModelResult {
  const { gridApi } = opts;
  const [chips, setChips] = useState<readonly FilterChipModel[]>([]);
  const [pinnedColumnIds, setPinnedColumnIds] = useState<readonly string[]>([]);

  // Subscribe to filterChanged
  useEffect(() => {
    if (!gridApi) return;
    const handler = (_ev: FilterChangedEvent) => {
      // Read AG-Grid's filterModel + columnState, derive chips,
      // setChips(...) + setPinnedColumnIds(...).
      // Match what FiltersToolbar.tsx does today.
    };
    gridApi.addEventListener('filterChanged', handler);
    return () => {
      gridApi.removeEventListener('filterChanged', handler);
    };
  }, [gridApi]);

  // setFilter / clearFilter / pinColumn / unpinColumn — copy the
  // logic from FiltersToolbar.tsx verbatim. Each calls the
  // corresponding gridApi method.

  const setFilter = useCallback((columnId: string, filterModel: unknown) => {
    if (!gridApi) return;
    // gridApi.setFilterModel({ [columnId]: filterModel })
    // ...
  }, [gridApi]);

  // ...etc.

  return useMemo(
    () => ({
      chips,
      pinnedColumnIds,
      setFilter,
      clearFilter,
      clearAllFilters,
      pinColumn,
      unpinColumn,
    }),
    [chips, pinnedColumnIds, setFilter, clearFilter, clearAllFilters, pinColumn, unpinColumn],
  );
}
```

**Critical:** the `useEffect` cleanup must unsubscribe. The previous bug class this prevents: stale grid → leaked listener → memory growth across mount/unmount cycles.

### Step 3 — Shrink the toolbar

`FiltersToolbar.tsx` becomes:

```tsx
export function FiltersToolbar(props: FiltersToolbarProps) {
  const model = useFilterModel({ gridApi: props.gridApi });

  return (
    <div className="...">
      <ChipRow chips={model.chips} onRemove={model.clearFilter} />
      <ClearAllButton
        disabled={model.chips.length === 0}
        onClick={model.clearAllFilters}
      />
      {/* ...the rest of the existing JSX, wired to model.* */}
    </div>
  );
}
```

Target: under 250 LOC. The chips, search input, dropdowns, and pinned-column chips are all rendered here; they consume the hook.

### Step 4 — Don't break public API

The `FiltersToolbar` props interface is **unchanged**. Read MarketsGrid.tsx to confirm how it's used today and preserve every prop name.

### Step 5 — Tests

Create `packages/react/widgets/markets-grid/src/useFilterModel.test.ts`:

```ts
import { afterEach, describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFilterModel } from './useFilterModel';
import type { GridApi } from 'ag-grid-community';

afterEach(() => vi.restoreAllMocks());

function makeFakeGridApi(): GridApi & { __fire: (ev: unknown) => void } {
  let handlers: Array<(ev: unknown) => void> = [];
  return {
    addEventListener: vi.fn((event: string, fn: (ev: unknown) => void) => {
      if (event === 'filterChanged') handlers.push(fn);
    }),
    removeEventListener: vi.fn((event: string, fn: (ev: unknown) => void) => {
      handlers = handlers.filter((h) => h !== fn);
    }),
    setFilterModel: vi.fn(),
    // ...add other methods the hook calls
    __fire: (ev: unknown) => handlers.forEach((h) => h(ev)),
  } as unknown as GridApi & { __fire: (ev: unknown) => void };
}

describe('useFilterModel', () => {
  it('subscribes on mount and unsubscribes on unmount', () => {
    const api = makeFakeGridApi();
    const { unmount } = renderHook(() => useFilterModel({ gridApi: api }));
    expect(api.addEventListener).toHaveBeenCalledWith('filterChanged', expect.any(Function));
    unmount();
    expect(api.removeEventListener).toHaveBeenCalledWith('filterChanged', expect.any(Function));
  });

  it('is a no-op when gridApi is null', () => {
    const { result } = renderHook(() => useFilterModel({ gridApi: null }));
    expect(result.current.chips).toEqual([]);
    expect(result.current.pinnedColumnIds).toEqual([]);
  });

  it('setFilter calls gridApi.setFilterModel', () => {
    const api = makeFakeGridApi();
    const { result } = renderHook(() => useFilterModel({ gridApi: api }));
    act(() => result.current.setFilter('side', { type: 'equals', filter: 'BUY' }));
    expect(api.setFilterModel).toHaveBeenCalled();
  });

  it('filterChanged event updates chips state', () => {
    const api = makeFakeGridApi();
    const { result } = renderHook(() => useFilterModel({ gridApi: api }));
    act(() => api.__fire(/* event payload that AG-Grid would send */));
    // Assert chips state matches expectation.
  });
});
```

Add more cases as the production logic demands. The hook should be the single source of subscription truth; tests verify it.

## Verification

```sh
# 1. Hook tests
npm test -w @starui/markets-grid -- --run useFilterModel

# 2. Full package
npm test -w @starui/markets-grid

# 3. Apps typecheck
npm run typecheck -w @starui/demo-react -w @starui/demo-configservice-react -w @starui/markets-ui-react-reference

# 4. E2E (filter flows specifically)
npx playwright test e2e/v2-two-grid-isolation.spec.ts

# 5. File size
wc -l packages/react/widgets/markets-grid/src/FiltersToolbar.tsx
# Expected: under 250

wc -l packages/react/widgets/markets-grid/src/useFilterModel.ts
# Expected: 300-500

# 6. Final gate
npx turbo typecheck build test
```

## Manual smoke

```sh
npm run dev -w @starui/markets-ui-react-reference
```

Open a blotter and:
- Type into a column header filter → chip appears
- Click chip's × → filter clears
- Apply 3 filters → 3 chips → click "clear all" → all chips gone
- Pin a column → reload page → still pinned (if persistence is wired through profiles)

## Commit, push, open PR

```sh
git add packages/react/widgets/markets-grid/src/useFilterModel.ts \
        packages/react/widgets/markets-grid/src/useFilterModel.test.ts \
        packages/react/widgets/markets-grid/src/FiltersToolbar.tsx
git commit -m "$(cat <<'EOF'
refactor(markets-grid): extract useFilterModel from FiltersToolbar

Moves filter state + AG-Grid `filterChanged` subscription + pinned-
column state out of FiltersToolbar.tsx (795 LOC) into a new hook
useFilterModel. Toolbar drops to ~XXX LOC of pure JSX.

The hook owns the gridApi.addEventListener('filterChanged', …)
subscription with proper cleanup — fixes a class of leak where the
old listener persisted past a parent unmount.

Public API unchanged: FiltersToolbar props identical, behaviour
identical (verified via e2e regression).

Tests cover:
  - subscribe/unsubscribe on mount/unmount
  - no-op when gridApi is null
  - setFilter / clearFilter / pinColumn dispatch to gridApi
  - filterChanged event updates chips state

Verification: npx turbo typecheck build test — green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin feat/filterstoolbar-hook
gh pr create --title "refactor(markets-grid): extract useFilterModel hook" --body "<see commit>"
```

Report the PR URL.

## Out of scope

- Changing AG-Grid's filter API. We adapt to it.
- Changing the filter chip visual.
- Persistence (profile-scoped filter restoration is Refactor 3 territory).
- Touching `HelpPanel.tsx` or `FormatterPicker.tsx`.
- Adding new dependencies.
