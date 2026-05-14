# Session 1.2 — Extract `useMarketsGridController` hook

You are a fresh agent session. Session 1.1's characterisation tests have merged. Your task is to extract all state + side effects from `MarketsGrid.tsx` into a `useMarketsGridController` hook. The view component becomes JSX-only.

## Prerequisites

- Session 1.1's PR (`feat/marketsgrid-characterisation-tests`) must be merged on main. Verify before starting:

```sh
git fetch origin main
git log origin/main --oneline -10 | grep "characterisation"
# Expected: a "test(markets-grid): characterisation tests for MarketsGrid" line
```

If you don't see it, STOP and ask the user to merge Session 1.1 first.

## Required reading

- [`docs/sessions/session-1-1-marketsgrid-characterisation-tests.md`](./session-1-1-marketsgrid-characterisation-tests.md) — your safety net (the test file it created)
- [`packages/react/widgets/markets-grid/src/MarketsGrid.tsx`](../../packages/react/widgets/markets-grid/src/MarketsGrid.tsx) — the target. 1376 lines.
- [`packages/react/widgets/markets-grid/src/MarketsGrid.characterisation.test.tsx`](../../packages/react/widgets/markets-grid/src/MarketsGrid.characterisation.test.tsx) — every test must still pass after your changes
- [`CLAUDE.md`](../../CLAUDE.md) — repo conventions

## Setup

```sh
git fetch origin main
git checkout -b feat/marketsgrid-controller-hook origin/main
npm ci --legacy-peer-deps

# Baseline check before touching anything
npx turbo typecheck build test
# Expected: green across every package
```

## Task

Move every `useState`, `useEffect`, `useRef`, `useCallback`, and `useMemo` related to profiles, grid-level data, and the grid lifecycle from `MarketsGrid.tsx` into a new hook `useMarketsGridController`. The view component is left with only JSX, prop forwarding, and the hook call.

### Step 1 — Inventory the state surface

```sh
grep -n "useState\|useRef\|useEffect\|useCallback\|useMemo" packages/react/widgets/markets-grid/src/MarketsGrid.tsx
```

For each hit, classify it as:
- **State** (`useState`, `useRef`) → belongs in the hook
- **Effect** (`useEffect`) → belongs in the hook
- **Derived** (`useMemo` based on props/state) → belongs in the hook
- **Callback** (`useCallback`) → belongs in the hook IF it touches state; otherwise can stay
- **Pure JSX prop** (e.g. column defs computed once) → can stay in the view

Most of the file should move. A 1376-line component typically has ~80-90% state/effect.

### Step 2 — Create the hook file

Create `packages/react/widgets/markets-grid/src/useMarketsGridController.ts`:

```ts
/**
 * useMarketsGridController — owns all state, effects, and side-effect
 * callbacks for the MarketsGrid view component.
 *
 * The view becomes JSX-only. Every observable behaviour (console log
 * strings, ProfileManager method invocation order, storageAdapter
 * call sites) must match what MarketsGrid.tsx did at the start of
 * this refactor — see MarketsGrid.characterisation.test.tsx for the
 * complete contract.
 *
 * Internal-only: not exported from the package barrel. Future
 * commits may make it public if external consumers need a headless
 * MarketsGrid; for now we keep the surface tight.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GridApi,
  GridReadyEvent,
  CellValueChangedEvent,
} from 'ag-grid-community';
import type { StorageAdapter, ProfileSnapshot } from '@starui/core';
// TODO: import whatever else the existing MarketsGrid.tsx pulls in
// — ProfileManager, GridLevelData type, etc.

export interface UseMarketsGridControllerOpts {
  // 1:1 with the existing MarketsGrid props that map to controller concerns.
  // Read MarketsGrid.tsx's props interface and copy the relevant subset.
  readonly gridId: string;
  readonly storageAdapter: StorageAdapter;
  readonly onEditProvider?: (providerId: string) => void;
  readonly onReady?: (handle: MarketsGridControllerHandle) => void;
  // ...add the rest as you discover them.
}

export interface MarketsGridControllerHandle {
  readonly profileManager: /* ProfileManager type */ unknown;
  readonly gridApi: GridApi | null;
  readonly activeProfileId: string | null;
  readonly gridLevelData: /* GridLevelData type */ unknown;
  onGridReady(ev: GridReadyEvent): void;
  onCellValueChanged(ev: CellValueChangedEvent): void;
  onProfileSwitch(profileId: string): Promise<void>;
  onProfileClone(): Promise<void>;
  onProfileRename(newName: string): Promise<void>;
  onProfileExport(): Promise<void>;
  onProfileImport(payload: string): Promise<void>;
  onSaveAndSwitch(profileId: string): Promise<void>;
  onDiscardAndSwitch(profileId: string): Promise<void>;
  onSaveGridLevelData(data: /* GridLevelData type */ unknown): Promise<void>;
  onEditProvider(providerId: string): void;
}

export function useMarketsGridController(
  opts: UseMarketsGridControllerOpts,
): MarketsGridControllerHandle {
  // Copy state setup from MarketsGrid.tsx verbatim. The key invariant:
  // every `console.log` and `console.warn` string keeps its EXACT prefix
  // (Session 1.1's tests assert on them).

  // ...
}
```

**Note:** flesh out the type stubs (`/* ProfileManager type */`) by reading the imports at the top of `MarketsGrid.tsx`.

### Step 3 — Move the state in chunks

Move state to the hook in this order. After each chunk, run the characterisation tests; they must pass before the next move:

```sh
npm test -w @starui/markets-grid -- --run MarketsGrid.characterisation
```

**Chunk 1: ProfileManager state**
- `useState` for active profile id
- `useState` for profile list
- The effect that initialises ProfileManager from `gridId` + `storageAdapter`
- The effect that handles `storageAdapter` swap (rebuilds ProfileManager)

After this chunk:
- View calls `const { profileManager, activeProfileId } = useMarketsGridController({...})`
- The state is in the hook; the JSX reads it through the handle
- Tests still green

**Chunk 2: Grid API ref + onGridReady**
- `useRef<GridApi | null>(null)`
- `onGridReady` callback that captures the API
- Fires `onReady` callback (matches Session 1.1 Group C exactly — preserve the `console.log` string)

**Chunk 3: gridLevelData load/save**
- The effect that loads on mount (read line ~485-510 of MarketsGrid.tsx)
- The save handler (read line ~525-535)
- Every `console.log` string preserved verbatim

**Chunk 4: Profile CRUD callbacks**
- save / switch / clone / rename / export / import / save-and-switch / discard-and-switch
- All `console.warn` strings preserved verbatim

**Chunk 5: Cell value changed + remaining lifecycle**
- `onCellValueChanged` if it lives in the file
- Any remaining effects (theme prop reaction, etc.)

### Step 4 — Slim the view

Once all 5 chunks have moved, `MarketsGrid.tsx` should be 400-500 LOC. Replace the body with:

```tsx
export function MarketsGrid(props: MarketsGridProps): ReactNode {
  const ctrl = useMarketsGridController({
    gridId: props.gridId,
    storageAdapter: props.storageAdapter,
    onEditProvider: props.onEditProvider,
    onReady: props.onReady,
    // ...
  });

  return (
    <div data-grid-id={props.gridId} className="...">
      {/* Toolbar — wire to ctrl callbacks */}
      <ProfileSelectorRow
        activeProfileId={ctrl.activeProfileId}
        onChange={ctrl.onProfileSwitch}
        onClone={ctrl.onProfileClone}
        onRename={ctrl.onProfileRename}
        onExport={ctrl.onProfileExport}
        onImport={ctrl.onProfileImport}
      />
      {/* ...other toolbars (FiltersToolbar, FormattingToolbar, etc.) */}
      <AgGridReact
        onGridReady={ctrl.onGridReady}
        onCellValueChanged={ctrl.onCellValueChanged}
        {/* ...other AG-Grid props */}
      />
    </div>
  );
}
```

(Adapt to the actual JSX structure. The point is: no `useEffect`, no `useState`, no business logic — just prop wiring and the hook call.)

### Step 5 — Don't break public API

- The props interface of `MarketsGrid` is unchanged.
- The `onReady` callback handle shape is unchanged (matches Session 1.1 Group C).
- The hook is NOT exported from the package barrel. Internal only:

```sh
# Verify: useMarketsGridController must NOT appear in index.ts
grep "useMarketsGridController" packages/react/widgets/markets-grid/src/index.ts
# Expected: no output
```

## Verification

Strict order:

```sh
# 1. Targeted characterisation tests — every test must still pass
npm test -w @starui/markets-grid -- --run MarketsGrid.characterisation
# Expected: same pass count as Session 1.1

# 2. All markets-grid tests
npm test -w @starui/markets-grid

# 3. Apps still typecheck
npm run typecheck -w @starui/demo-react -w @starui/demo-configservice-react -w @starui/markets-ui-react-reference

# 4. E2E regression — affected suites
npx playwright test e2e/v2-two-grid-isolation.spec.ts e2e/design-system-smoke.spec.ts e2e/v2-profile-lifecycle.spec.ts
# Expected: every test pass

# 5. File size check
wc -l packages/react/widgets/markets-grid/src/MarketsGrid.tsx
# Expected: 400-500 lines (down from 1376)

wc -l packages/react/widgets/markets-grid/src/useMarketsGridController.ts
# Expected: 600-800 lines (most of the bulk moved here)

# 6. Final gate
npx turbo typecheck build test
# Expected: all green
```

## Manual smoke (recommended)

Run the markets-ui-react-reference dev server and click through:

```sh
npm run dev -w @starui/markets-ui-react-reference
# Open http://localhost:5174
# - Open a blotter
# - Switch profile
# - Save current profile
# - Clone the profile
# - Rename the clone
# - Delete the clone
# - Export, then re-import
# Every interaction should feel identical to before.
```

## Commit, push, open PR

```sh
git add packages/react/widgets/markets-grid/src/useMarketsGridController.ts \
        packages/react/widgets/markets-grid/src/MarketsGrid.tsx
git status --short
git commit -m "$(cat <<'EOF'
refactor(markets-grid): extract useMarketsGridController hook

Moves every useState / useEffect / useRef / useCallback / useMemo
from MarketsGrid.tsx (1376 LOC) into a new internal hook
useMarketsGridController. The view component shrinks to ~400-500 LOC
of pure JSX + hook wiring.

Public API unchanged:
  - MarketsGrid props interface identical
  - onReady callback shape identical
  - All `console.log` / `console.warn` prefixes preserved verbatim
    (Session 1.1's characterisation tests assert on them)

The hook is internal-only — not exported from the package barrel.
Future commits may surface it if a headless MarketsGrid use case
appears.

Verification:
  - Session 1.1 characterisation tests: ALL pass
  - npm test -w @starui/markets-grid: green
  - npx playwright test (affected suites): green
  - File sizes: MarketsGrid.tsx 1376 → ~XXX, useMarketsGridController.ts ~YYY
  - Final gate: npx turbo typecheck build test — green

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin feat/marketsgrid-controller-hook
gh pr create --title "refactor(markets-grid): extract useMarketsGridController hook" --body "<see commit message; expand with line counts and verification table>"
```

Report the PR URL.

## Hand-off to Session 1.3

Once merged, Session 1.3 extracts view-only sub-components (`<ProfileBar/>`, `<AdminActions/>`) from the slimmed `MarketsGrid.tsx`. It will need:
- The file size of `MarketsGrid.tsx` after your refactor (so the next session knows the starting point)
- Note any JSX blocks ≥100 LOC that look like good extraction candidates

## Out of scope

- Extracting view sub-components (Session 1.3).
- Removing any `console.log` traces (after Refactor 3).
- Renaming public props.
- Changing the props interface of `MarketsGrid`.
- Exporting `useMarketsGridController` from the barrel.
- Touching `HelpPanel.tsx`, `FiltersToolbar.tsx`, `FormatterPicker.tsx`.
- Touching `ProfileManager` or `ConfigManager` (that's Refactor 3).
