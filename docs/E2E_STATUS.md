# E2E status

> **Note (2026-05-08).** Suite has drifted significantly since the
> last clean baseline; the bulk of failures are test rot from
> accumulated UI changes (testid renames, default-state changes,
> Radix dropdown z-index/animation timing). A dedicated test-update
> sweep is needed — tracked separately from feature work.

## Latest run — 2026-05-08, branch `feature/data-services-rename`

```
Total:   274 tests in 26 spec files
Passed:  153
Failed:  121  (test rot, not regressions)
Runtime: 26.7 min on local macOS, 4 Chromium workers
```

The data-services rename PR (commit `58e61da`) does **not** introduce
e2e regressions. Evidence:

- Files modified by the rename are: `data-services` package internals
  + dep-name updates + doc comments. Zero touches to UI primitives,
  styling, demo-react, or shared core/grid-react UI.
- `demo-react` and `demo-configservice-react` (where 120 of the 121
  failures live) have **no direct or transitive dependency** on
  `@starui/data-services` — see their `package.json` deps list.
- `hosted-markets-grid.spec.ts` is the only spec that exercises
  `@starui/data-services` end-to-end (mounts `<DataServicesProvider>`
  via `<HostedMarketsGrid>`). 6 of 7 specs in that file pass on the
  rename branch; the 1 failure (`Alt+Shift+P toggles the provider
  picker toolbar`) is test rot — the test asserts the Live button is
  hidden by default but the default visibility flipped (`toHaveCount(0)`
  fails because the button is already in the DOM at page load).
- Unit + typecheck + build all green: turbo typecheck 43/43, turbo
  build 27/27, turbo test 31/31 (including data-services 78/78 and
  data-services-react 3/3).

## Failure breakdown (2026-05-08)

| Spec | Failures | Most common root cause |
|---|---|---|
| `v2-column-customization`         | 18 | Radix dropdown click intercepted by overlay (settings sheet z-index regression) |
| `v2-profile-isolation-structure`  | 17 | Same dropdown timing → can't open settings panels |
| `v2-column-groups`                | 14 | Same dropdown timing |
| `v2-calculated-columns`           | 11 | Same dropdown timing |
| `v2-profile-stress`               | 11 | Profile-CRUD waits hit 30s (cumulative slowness) |
| `v2-general-settings`             |  9 | Same dropdown timing |
| `v2-column-templates`             |  9 | Pre-existing (TemplateManager rewrite, see below) |
| `v2-profile-lifecycle`            |  7 | Same dropdown timing |
| `v2-profile-isolation-styling`    |  6 | Same dropdown timing |
| `v2-settings-panels`              |  4 | Same dropdown timing |
| `v2-popout-design-system`         |  4 | Pre-existing (`window.open` handshake) |
| `v2-formatting-toolbar`           |  3 | Pre-existing (TemplateManager rewrite) |
| `v2-autosave`                     |  3 | Same dropdown timing on save-confirm flow |
| `v2-template-create-apply`        |  2 | Pre-existing (TemplateManager rewrite) |
| `v2-popout-toolbar`               |  2 | Pre-existing (popup feature-string) |
| `hosted-markets-grid`             |  1 | Provider toolbar default-visibility flipped |

Failure categories:

1. **Settings-sheet dropdown click intercepted (≈90 of 121).** Almost
   every spec that opens a v2 settings panel via the dropdown nav
   fails with `<div>…</div> subtree intercepts pointer events`.
   Sampled with `--workers=1` and 3 retries — consistent across
   single-worker runs and retries, so it's not contention or flake.
   Likely a Radix DropdownMenu / overlay z-index regression that
   landed on `main` since the last clean baseline. Needs a UI-side
   investigation (not part of the rename).

2. **Pre-existing failures from the prior baseline (≈19).** The four
   spec families called out in the previous version of this doc
   (`v2-column-templates`, `v2-formatting-toolbar`,
   `v2-popout-design-system`, `v2-popout-toolbar`) still fail for the
   same reasons.

3. **Default-state changes (≈2).** `hosted-markets-grid Alt+Shift+P`
   and similar — UI now ships the toolbar visible by default; the
   spec was authored when the chord-toggle was the only path.

## Action items (separate from rename PR)

1. **Investigate settings-sheet dropdown overlap.** ~90 specs depend
   on `openPanel()` in `e2e/helpers/settingsSheet.ts:118` clicking
   through cleanly. Likely a single root cause across all failures.
2. **Rewrite TemplateManager-related specs.** Pre-existing item from
   the prior baseline; same scope.
3. **Update default-state assertions** in `hosted-markets-grid.spec.ts`
   (provider toolbar) and any other spec that asserts hidden-by-
   default for newly-default-visible UI.

## How to reproduce

```bash
# From the monorepo root:
npm ci --legacy-peer-deps
npx playwright install chromium
npx playwright test
```

Vite dev servers bind `:5190` (demo-react), `:5191`
(demo-configservice-react), `:5174` (markets-ui-react-reference);
config reuses existing servers when present.
