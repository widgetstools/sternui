# Session 1.3 — Extract MarketsGrid view sub-components

You are a fresh agent session. Sessions 1.1 + 1.2 have merged. `MarketsGrid.tsx` is now ~400-500 LOC of JSX wiring around `useMarketsGridController`. Your task is to break that JSX into named view-only sub-components.

## Prerequisites

```sh
git fetch origin main
git log origin/main --oneline -10 | grep -E "characterisation|controller hook"
# Expected: lines for BOTH "test(markets-grid): characterisation..." AND
# "refactor(markets-grid): extract useMarketsGridController..."
```

If either is missing, STOP and ask the user to merge them first.

## Required reading

- [`docs/sessions/session-1-2-marketsgrid-controller-hook.md`](./session-1-2-marketsgrid-controller-hook.md) — what shape the file is in now
- [`packages/react/widgets/markets-grid/src/MarketsGrid.tsx`](../../packages/react/widgets/markets-grid/src/MarketsGrid.tsx) — current state
- [`packages/react/widgets/markets-grid/src/MarketsGrid.characterisation.test.tsx`](../../packages/react/widgets/markets-grid/src/MarketsGrid.characterisation.test.tsx) — the safety net
- [`CLAUDE.md`](../../CLAUDE.md) — naming rules (PascalCase component files in `packages/react/widgets/markets-grid/src/`)

## Setup

```sh
git fetch origin main
git checkout -b feat/marketsgrid-view-components origin/main
npm ci --legacy-peer-deps

npx turbo typecheck build test
# Expected: green baseline
```

## Task

Identify ≥100 LOC chunks of JSX in `MarketsGrid.tsx` and extract each into its own file in the same `src/` directory. Each sub-component receives controller callbacks via props; **no** sub-component touches state, AG-Grid API, or ProfileManager directly.

### Step 1 — Inventory candidate extractions

```sh
wc -l packages/react/widgets/markets-grid/src/MarketsGrid.tsx
# Expected: 400-500. If it's outside that range, Session 1.2 didn't complete cleanly.
```

Read the file. Identify named JSX chunks. Typically:

| Candidate | What it does | Likely LOC |
|---|---|---|
| `<ProfileBar/>` | profile selector + save/clone/rename/export/import buttons | 150-250 |
| `<AdminActions/>` | admin button row (edit provider, etc.) | 50-150 |
| `<GridLevelDataBanner/>` | optional banner when gridLevelData has unsaved changes | 30-80 |
| `<MarketsGridLayout/>` | the outer flexbox / data attributes wrapper | 30-50 |

Pick the chunks ≥100 LOC. Don't extract <100 LOC unless it cleanly belongs (e.g., a `MarketsGridLayout` shell is fine smaller because its job is unambiguous).

### Step 2 — Create sub-component files

For each extracted component, create `packages/react/widgets/markets-grid/src/<Name>.tsx` per CLAUDE.md naming rules:

```tsx
/**
 * ProfileBar — the toolbar row above the grid. Renders the profile
 * selector + save/clone/rename/export/import button group.
 *
 * View-only. All callbacks come from the parent's
 * useMarketsGridController. No direct access to ProfileManager,
 * storageAdapter, or gridApi.
 */

import type { ReactNode } from 'react';
import type { ProfileSnapshot } from '@starui/core';

export interface ProfileBarProps {
  readonly profiles: readonly ProfileSnapshot[];
  readonly activeProfileId: string | null;
  readonly onSwitch: (profileId: string) => void | Promise<void>;
  readonly onClone: () => void | Promise<void>;
  readonly onRename: (newName: string) => void | Promise<void>;
  readonly onExport: () => void | Promise<void>;
  readonly onImport: (payload: string) => void | Promise<void>;
  readonly disabled?: boolean;
}

export function ProfileBar(props: ProfileBarProps): ReactNode {
  // Move JSX from MarketsGrid.tsx here verbatim.
  // Wire the buttons to props.onClone, props.onRename, etc.
  // Don't add new behaviour.
}
```

Adapt to the actual JSX structure. The interfaces above are illustrative.

### Step 3 — Replace JSX in `MarketsGrid.tsx` with the new components

After extraction, `MarketsGrid.tsx` should look like a layout document:

```tsx
export function MarketsGrid(props: MarketsGridProps): ReactNode {
  const ctrl = useMarketsGridController({ /* ... */ });

  return (
    <MarketsGridLayout gridId={props.gridId}>
      <ProfileBar
        profiles={ctrl.profiles}
        activeProfileId={ctrl.activeProfileId}
        onSwitch={ctrl.onProfileSwitch}
        onClone={ctrl.onProfileClone}
        onRename={ctrl.onProfileRename}
        onExport={ctrl.onProfileExport}
        onImport={ctrl.onProfileImport}
      />
      <AdminActions
        onEditProvider={ctrl.onEditProvider}
      />
      {/* Filters / formatting toolbars — UNCHANGED, those are Refactor 2 */}
      <FiltersToolbar {...} />
      <FormattingToolbar {...} />
      <AgGridReact
        onGridReady={ctrl.onGridReady}
        onCellValueChanged={ctrl.onCellValueChanged}
        {/* ... */}
      />
    </MarketsGridLayout>
  );
}
```

Final `MarketsGrid.tsx` should be **under 400 LOC**.

### Step 4 — Keep sub-components unexported (or export deliberately)

By default:
- Sub-components stay file-local; only `MarketsGrid` is exported from the package barrel
- If a sub-component is genuinely reusable (e.g., `ProfileBar` might want to mount on other AG-Grid hosts), discuss in the PR description and export from `index.ts` deliberately

Default to NOT exporting. The fewer entry points, the less surface to maintain.

### Step 5 — Optional unit tests on sub-components

These are pure view components — small unit tests are cheap and useful:

```sh
# Optional: create packages/react/widgets/markets-grid/src/ProfileBar.test.tsx
# Tests:
#   - Renders all profile names
#   - Disabled prop hides the action buttons
#   - Clicking each button calls the right callback exactly once
```

Skip if time-pressed; the characterisation tests cover end-to-end behaviour through `MarketsGrid`.

## Verification

Strict order:

```sh
# 1. Session 1.1 characterisation tests — every test must still pass
npm test -w @starui/markets-grid -- --run MarketsGrid.characterisation
# Expected: every test passes (split is pure code rearrangement)

# 2. All markets-grid tests
npm test -w @starui/markets-grid

# 3. Apps typecheck
npm run typecheck -w @starui/demo-react -w @starui/demo-configservice-react -w @starui/markets-ui-react-reference

# 4. E2E FULL regression (last MarketsGrid step — run the whole suite)
npx playwright test
# Expected: 193/193 pass (matches baseline) — or current main's pass count

# 5. File size verification
wc -l packages/react/widgets/markets-grid/src/MarketsGrid.tsx
# Expected: UNDER 400 LOC

ls packages/react/widgets/markets-grid/src/*.tsx
# Expected: includes new ProfileBar.tsx, AdminActions.tsx, etc.

# 6. Final gate
npx turbo typecheck build test
# Expected: 55/55 typecheck, 33/33 build, 42/42 test
```

## Manual smoke test (recommended — last MarketsGrid step)

Run the markets-ui-react-reference dev server and click through every grid interaction:

```sh
npm run dev -w @starui/markets-ui-react-reference
```

Open http://localhost:5174 and exercise:
- Open a blotter
- Switch between profiles
- Save the active profile (changes column widths, click save, reload, verify state)
- Clone the profile (verify the clone appears with `(copy)` suffix or whatever the convention is)
- Rename the clone
- Export the profile to JSON
- Import a profile from JSON
- Delete the clone (verify fallback to a sibling profile)
- Edit provider (clicks `onEditProvider` callback — popout should open)

Every interaction must feel identical to before. Stutters, double-renders, or stale UI all indicate a controller-vs-view ordering bug.

## Commit, push, open PR

```sh
git add packages/react/widgets/markets-grid/src/
git status --short
git commit -m "$(cat <<'EOF'
refactor(markets-grid): extract ProfileBar + AdminActions view components

Final step of the MarketsGrid split (Sessions 1.1 + 1.2 + 1.3).
MarketsGrid.tsx is now under 400 LOC and reads like a layout
document — header + grid + footer, no logic.

New view-only sub-components:
  - ProfileBar.tsx
  - AdminActions.tsx
  - (+ any others extracted; list them)

Each takes plain callback props from useMarketsGridController; none
touch state, AG-Grid API, or ProfileManager directly. Sub-components
are file-local (not exported from the barrel) so the package
surface stays minimal.

Verification:
  - Characterisation tests: ALL pass
  - npm test -w @starui/markets-grid: green
  - npx playwright test: 193/193 (full regression)
  - File sizes:
      MarketsGrid.tsx     1376 → XXX
      useMarketsGridController.ts (Session 1.2): YYY
      ProfileBar.tsx      ZZZ
      AdminActions.tsx    AAA
  - Final gate: npx turbo typecheck build test — green

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin feat/marketsgrid-view-components
gh pr create --title "refactor(markets-grid): extract ProfileBar + AdminActions view components" --body "<see commit message; add file size table>"
```

Report the PR URL.

## Hand-off

Refactor 1 (MarketsGrid split) is **complete** after this PR merges. The file is under 400 LOC, the controller is a hook, and the view is small named components.

Next available work:
- Refactor 2 (toolbar splits) — any of Sessions 2.1 / 2.2 / 2.3, any order, parallel ok
- Refactor 3 (profile state) — Session 3.1 design doc can start now

## Out of scope

- `HelpPanel.tsx`, `FiltersToolbar.tsx`, `FormatterPicker.tsx` — those are Refactor 2
- `ProfileManager` / `ConfigManager` consolidation — Refactor 3
- Removing `console.log` traces — post-Refactor 3 cleanup
- Changing the `MarketsGrid` public API
- Exporting sub-components from the package barrel without justification
- Adding new dependencies
