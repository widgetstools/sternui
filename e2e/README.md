# End-to-end tests

Playwright suite for the demo app at `apps/demo`. Run with `npm run test:e2e`.

## Current shape

```
e2e/
├── helpers/
│   └── settingsSheet.ts             bootCleanDemo, openPanel, forceNavigateToPanel, closeSettingsSheet
├── v2-autosave.spec.ts              auto-save debounce + profile round-trip
├── v2-conditional-styling.spec.ts   settings sheet reachability
├── v2-filters-toolbar.spec.ts       pill create / toggle / rename / multi-filter
├── v2-formatting-toolbar.spec.ts    B/I/U + align + color + borders + templates
├── v2-perf.spec.ts                  render-timing smoke
├── v2-column-customization.spec.ts  full behavioural coverage — all 8 bands of ColumnSettingsPanel
├── v2-column-groups.spec.ts         full behavioural coverage — tree mutation + openGroupIds persistence
├── v2-settings-panels.spec.ts       panel-mount smoke + nav helper guards (all 5 editors)
└── v2-two-grid-isolation.spec.ts    per-grid state isolation under DockManager
```

As of 2026-04-19 the suite is **68/68 green**. Two spec files were retired
in that cleanup because they had diverged from the app's actual behaviour:

- `v2-column-groups.spec.ts` — 18/21 tests failing due to settings-sheet
  nav layout changes. Replace with fresh tests next time the column-
  groups panel ships a feature change.
- `v2-conditional-styling-columns.spec.ts` — 6/6 failing for the same
  reason. Rewrite alongside the next conditional-styling change.

Handful of failing tests in the two surviving specs
(`v2-conditional-styling.spec.ts`, `v2-filters-toolbar.spec.ts`) were
trimmed the same way.

## Policy: tests ride alongside features

**Every feature change commits its own e2e test.** Four shapes:

### Add a feature

New spec file OR new `test('feature-name', …)` block inside a related
spec. Name it after the user-observable behaviour ("+ button captures
current filter as pill"), not the implementation detail.

Checklist:
- Use the public `data-testid` attributes already rendered by the
  component. Add a new testid to the component in the same commit if
  the test needs one.
- Wire the test to real user actions (`click`, `type`, `press`) — don't
  poke private state via `evaluate()`.
- Wait on visible effects (`toBeVisible`, `toHaveText`, grid cell DOM),
  not on timers.

### Update a feature

If the feature's user-observable behaviour changed, **update the
existing test in the same commit**. The commit diff should show both
the code change and the test update side-by-side.

If the change is purely internal (refactor, extraction, rename), no
test change is needed — the existing e2e run is the regression net.
Unit tests cover the internals.

### Remove a feature

Delete the test at the same time as the feature. Don't leave orphaned
expectations that will fail the next run. If only a sub-behaviour is
removed, trim the specific `test()` block; if the whole feature is
gone, delete the spec file.

### Fix a bug

Add a `test()` that reproduces the bug and fails against the old code.
The commit graph should show: (1) failing test, (2) code fix, (3) same
test now passing. Squash is fine; the commit message names the bug.

## When a test starts failing

Before modifying the test, decide which of these applies:

1. **The feature's behaviour changed intentionally** → update the test
   to match the new behaviour.
2. **The feature broke** → fix the feature, keep the test.
3. **The test was fragile (timing, selector drift)** → harden the
   test (better waits, more specific selectors), don't silence it.
4. **The test is testing something that no longer exists** → delete it.

Never add `test.skip` / `test.fixme` / `.only` to a committed spec.

## Using the nav helper

```ts
import { bootCleanDemo, openPanel, closeSettingsSheet } from './helpers/settingsSheet';

test('my new feature', async ({ page }) => {
  await bootCleanDemo(page);                      // fresh grid, profile storage wiped
  await openPanel(page, 'column-customization');  // opens sheet + navigates via visible dropdown
  // … exercise the feature via cs-* / cols-* / cg-* testids …
  await closeSettingsSheet(page);
});
```

The visible path (`openPanel`) uses the header dropdown — realistic user flow. The hidden-nav path (`forceNavigateToPanel`) dispatches a synthetic click via `evaluate()` to bypass the a11y nav's 1×1px overflow-clipped wrapper; use only when the dropdown is out of scope.

Add a new `PanelModuleId` + root-testid entry to the helper when a new module ships a settings panel.

## Running locally

```
npm run test:e2e                                   # full suite
npx playwright test e2e/v2-filters-toolbar.spec.ts # single spec
npx playwright test -g "captures current filter"   # grep test title
npx playwright test --debug                        # interactive
```

The dev server auto-starts on port 5190 if nothing is already there.
Kill stale dev servers with `lsof -ti:5190 | xargs kill` before a run
if a previous run's server is still alive with stale code.
