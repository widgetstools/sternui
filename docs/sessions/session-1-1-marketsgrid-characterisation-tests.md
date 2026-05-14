# Session 1.1 — Characterisation tests for `MarketsGrid`

You are a fresh agent session. Your task is to lock down the current behaviour of `packages/react/widgets/markets-grid/src/MarketsGrid.tsx` with a comprehensive test file. You will **not** modify production code. The tests you write become the safety net for Sessions 1.2 and 1.3 which refactor the file.

## Required reading before any code

- [`CLAUDE.md`](../../CLAUDE.md) — repo conventions
- [`docs/WORKLOG-DEFERRED-REFACTORS.md`](../WORKLOG-DEFERRED-REFACTORS.md) — the full plan; this is session 1.1
- [`packages/react/widgets/markets-grid/src/MarketsGrid.tsx`](../../packages/react/widgets/markets-grid/src/MarketsGrid.tsx) — the target. Read end-to-end. 1376 lines.
- [`packages/react/widgets/markets-grid/src/marketsGrid.caption.test.tsx`](../../packages/react/widgets/markets-grid/src/marketsGrid.caption.test.tsx) — existing test, **copy its AG-Grid mocking style**

## Setup

```sh
# At the repo root
git fetch origin main
git checkout -b feat/marketsgrid-characterisation-tests origin/main
npm ci --legacy-peer-deps
```

Verify the baseline before you start:

```sh
npx turbo typecheck build test
# Expected: 55/55 typecheck, 33/33 build, 42/42 test — all green
```

If any are red, stop. Don't start the session on a broken baseline.

## Task

Create `packages/react/widgets/markets-grid/src/MarketsGrid.characterisation.test.tsx`. The file must lock down **every observable behaviour** of `MarketsGrid` so the next two sessions (which restructure the file) can verify nothing regressed.

### Step 1 — Inventory the current behaviour

Read `MarketsGrid.tsx`. Make a private list (in your scratchpad, not in code) of:

1. **Every public prop** the component accepts. Note required vs optional.
2. **Every `useEffect` / `useMemo` / `useCallback`** — these are the seams between state and view.
3. **Every external call**, in order of when it can fire:
   - `profileManager.*` (clone, rename, exportProfile, importProfile, save, switch, list)
   - `storageAdapter.*` (loadGridLevelData, saveGridLevelData)
   - `gridApi.*` (setColumnDefs, setRowData, etc.)
   - `console.log` / `console.warn` — treat the **exact string** as the signal; the tests will assert on these
4. **Every imperative ref handle** exposed via `onReady`, `gridRef`, or similar.

Use `grep` to be sure you catch everything:

```sh
grep -n "console\." packages/react/widgets/markets-grid/src/MarketsGrid.tsx
grep -n "profileManager\." packages/react/widgets/markets-grid/src/MarketsGrid.tsx
grep -n "storageAdapter\." packages/react/widgets/markets-grid/src/MarketsGrid.tsx
grep -n "useEffect\|useCallback\|useMemo" packages/react/widgets/markets-grid/src/MarketsGrid.tsx
```

### Step 2 — Set up the test file

Create `packages/react/widgets/markets-grid/src/MarketsGrid.characterisation.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MarketsGrid } from './MarketsGrid';
import type { StorageAdapter } from '@starui/core';

afterEach(() => cleanup());

// Pattern: copy the AG-Grid mock from marketsGrid.caption.test.tsx.
// Don't import from 'ag-grid-react' directly — the real grid won't
// mount cleanly in jsdom.

// Helper: build a storageAdapter test double whose methods are
// individually spy-able.
function makeStorageAdapter(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    listProfiles: vi.fn(async () => []),
    saveProfile: vi.fn(async () => {}),
    deleteProfile: vi.fn(async () => {}),
    // Add loadGridLevelData and saveGridLevelData if MarketsGrid expects them
    // — read the current code to be sure of the shape.
    ...overrides,
  } as unknown as StorageAdapter;
}

describe('MarketsGrid — characterisation', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  // ...test groups below
});
```

### Step 3 — Write each test group

Each group is 1-3 tests. Add them in this order so failures cascade meaningfully.

#### Group A — Mount with no active profile

- Renders the toolbar + empty grid (assert via existing `data-testid` attributes — DO NOT invent new ones)
- ProfileManager is initialised with the supplied `gridId`
- No `console.warn` fires

#### Group B — Mount with active profile

- Renders the toolbar with the profile selected
- `captureGridStateInto` / restore call sequence matches today (read the source — what's the exact order?)
- No theme flicker (no double `setColumnDefs` call)

#### Group C — `onReady` callback contract

- Fires exactly once after the grid is alive
- Payload shape is `{ gridApi, profileManager }` (verify against the actual export)
- `console.log` fires the **exact** string at MarketsGrid.tsx:599: `[v2/markets-grid] handle delivered to onReady (gridApi alive — consumer can now subscribe)`

#### Group D — Profile switch lifecycle

Test the full `<ProfileSelector>` change-event flow. Read the production code to confirm the order. Likely sequence:
1. `saveActiveProfile` called first
2. `switchProfile` called next
3. Re-applies state via `captureGridStateInto`

Assert on the spy call order using `vi.fn().mock.invocationCallOrder`.

#### Group E — saveActiveProfile failure path

- Mock `profileManager.save` to reject
- Assert `console.warn` fires with exact prefix `[markets-grid] saveActiveProfile failed:`
  (string lives at MarketsGrid.tsx:663)

#### Group F — Profile CRUD handlers

For each of clone / rename / export / import, assert:
- Successful path calls the right ProfileManager method
- Failure path fires the right `console.warn` with the exact prefix:
  - clone: `[markets-grid] profile clone failed:` (line 845)
  - rename: `[markets-grid] profile rename failed:` (line 853)
  - export: `[markets-grid] profile export failed:` (line 878)
  - import: `[markets-grid] profile import failed:` (line 888)

#### Group G — `onEditProvider` prop

- Provided as a callback prop
- Fires when the edit-provider button is clicked
- Argument is the active `providerId` (find the click target in the toolbar JSX)

#### Group H — `gridLevelData` save / load

- On mount, `storageAdapter.loadGridLevelData(gridId)` called exactly once
- If adapter has no `loadGridLevelData`, fires `console.log` exact: `[v2/markets-grid] gridLevelData: adapter has no loadGridLevelData method (using null)` (line 489)
- On call, fires `console.log` `[v2/markets-grid] gridLevelData: load → adapter.loadGridLevelData(...)` (line 495)
- On success, fires `console.log` `[v2/markets-grid] gridLevelData: loaded` (line 502)
- On failure, fires `console.warn` `[v2/markets-grid] gridLevelData: load failed` (line 509)
- On save call, fires `console.log` `[v2/markets-grid] gridLevelData: save` (line 528)

#### Group I — Save-and-switch / discard-and-switch

- `save-and-switch` failure: `console.warn` prefix `[markets-grid] save-and-switch failed:` (line 727)
- `discard-and-switch` failure: `console.warn` prefix `[markets-grid] discard-and-switch failed:` (line 743)

#### Group J — storageAdapter swap mid-flight

This is the fragile path. The component must:
1. Tear down the old ProfileManager
2. Build a new one with the new adapter
3. Reload the profile list

Assert via:
- Rerender with a fresh `storageAdapter` prop reference
- `profileManager.dispose()` called on the old instance
- A new `profileManager` instance is constructed (track via the test double)
- `listProfiles` called once on the new adapter

#### Group K — Theme prop changes

- Rerender with `theme="dark"` → `theme="light"`
- AG-Grid theme variant updates **without** grid remount (verify `gridApi.setColumnDefs` is NOT called again)

### Step 4 — Lint-check yourself

Each test must:
- Use selectors that match existing `data-testid` attributes (don't add new ones)
- Spy on console output and assert on EXACT string prefixes (not regex unless the production log has a dynamic suffix)
- Mock external calls (no real Dexie, no real AG-Grid)
- Clean up after itself (`afterEach(() => cleanup())` is already at file top)

### Step 5 — Sanity check

Run twice to ensure non-flakiness:

```sh
npm test -w @starui/markets-grid -- --run MarketsGrid.characterisation
npm test -w @starui/markets-grid -- --run MarketsGrid.characterisation
```

Both runs: every test passes.

### Step 6 — Mutation check (prove tests are real)

Hand-mutate one production line to verify the test catches it:

```sh
# Example: change line 663 in MarketsGrid.tsx from
#   console.warn('[markets-grid] saveActiveProfile failed:', err);
# to
#   console.warn('[markets-grid] saveActiveProfile DID NOT fail:', err);
# Then run:
npm test -w @starui/markets-grid -- --run MarketsGrid.characterisation
# Expected: Group E fails because the prefix no longer matches.
# Revert the change.
git diff packages/react/widgets/markets-grid/src/MarketsGrid.tsx  # should show your test edit
git checkout packages/react/widgets/markets-grid/src/MarketsGrid.tsx
```

If the mutation didn't trigger a failure, your assertion isn't strict enough — fix the test.

## Verification

In strict order — stop at the first failure and fix before continuing:

```sh
# 1. Targeted tests pass
npm test -w @starui/markets-grid -- --run MarketsGrid.characterisation
# Expected: all new tests pass

# 2. Full package tests still pass (no test name collision, no shared-state leak)
npm test -w @starui/markets-grid
# Expected: existing tests still pass + your new tests pass

# 3. Final gate — full turbo across every package
npx turbo typecheck build test
# Expected: 55/55 typecheck, 33/33 build, 42/42 test — all green
```

## Commit, push, open PR

```sh
git add packages/react/widgets/markets-grid/src/MarketsGrid.characterisation.test.tsx
git status --short  # ONLY the test file should be staged; no production changes
git commit -m "$(cat <<'EOF'
test(markets-grid): characterisation tests for MarketsGrid controller surface

Locks down current behaviour of MarketsGrid.tsx so Sessions 1.2
(controller hook extraction) and 1.3 (view sub-component extraction)
can refactor without regression.

Covers:
  A. Mount with no active profile
  B. Mount with active profile
  C. onReady callback contract
  D. Profile switch lifecycle (save → switch → reapply)
  E. saveActiveProfile failure path
  F. Profile clone / rename / export / import (success + failure)
  G. onEditProvider callback dispatch
  H. gridLevelData save / load (5 console.log assertions)
  I. save-and-switch / discard-and-switch failure paths
  J. storageAdapter swap mid-flight (ProfileManager rebuild)
  K. Theme prop change (no grid remount)

Assertions use exact `console.log` / `console.warn` prefixes from the
production code so the tests catch silently-rewritten log lines.

Verification: `npx turbo typecheck build test` — all green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin feat/marketsgrid-characterisation-tests
```

Then create the PR:

```sh
gh pr create --title "test(markets-grid): characterisation tests for MarketsGrid" --body "$(cat <<'EOF'
## Summary

Adds a comprehensive characterisation test for MarketsGrid before
Sessions 1.2 / 1.3 restructure it. No production code changes.

## Test plan

- [x] Targeted: `npm test -w @starui/markets-grid -- --run MarketsGrid.characterisation`
- [x] Package: `npm test -w @starui/markets-grid` — no regressions
- [x] Final gate: `npx turbo typecheck build test` — green

## Why this lands before the split

The next two sessions extract a controller hook + view sub-components
from MarketsGrid.tsx. Without these tests, behaviour regressions would
only surface in e2e — and e2e doesn't exercise every failure path
(profile clone failure, gridLevelData adapter shape, etc.). The
characterisation tests catch them at unit scope.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Report the PR URL back to the user.

## Hand-off to Session 1.2

Once this PR is merged on `main`, Session 1.2 can begin. It will reference the test file you created as the safety net — every refactor step in 1.2 must keep all tests passing.

## Out of scope

- Splitting `MarketsGrid.tsx`. That's Session 1.2.
- Removing `console.log` traces. Tests assert on them; they stay until after Refactor 3.
- Renaming public props.
- Inventing new `data-testid` attributes.
- Adding new dependencies.
- Touching `HelpPanel.tsx`, `FiltersToolbar.tsx`, `FormatterPicker.tsx`.
