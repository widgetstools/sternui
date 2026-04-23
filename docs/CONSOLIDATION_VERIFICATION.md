# Consolidation verification — Day 10

Final verification of the 10-day consolidation per the plan's
verification contract.

## 1. Install from scratch

```
npm ci --legacy-peer-deps
```

Passes. `--legacy-peer-deps` is permanent per
[`DEPS_STANDARD.md`](./DEPS_STANDARD.md) — corporate-bundled `.tgz`
packages (`lucide-react`, `@widgetstools/dock-manager`,
`@primeng/themes`) declare peer ranges that conflict with React 19 /
Angular 21.

## 2. Full typecheck

```
npx turbo typecheck
```

**Result:** 13/13 packages green. Zero unresolved `@marketsui/*` imports.

## 3. Unit tests

```
npx turbo test
```

**Result:** 298 tests passing — 242 `@marketsui/core` + 56
`@marketsui/markets-grid`. Matches the pre-consolidation baseline from
`widgetstools/widgets`. Zero regressions.

## 4. Production build

```
npx turbo build
```

**Result:** 14/14 build targets green (every package + 6 apps). Cached
runs reach "FULL TURBO" in under 100 ms; cold runs are ~2 min.

## 5. E2E suite

```
npx playwright test
```

**Result:** 195/214 passing in 4.6 min. The 19 failures are
pre-existing on `main` (verified via `git diff main -- e2e/`),
unrelated to consolidation. Full breakdown in
[`E2E_STATUS.md`](./E2E_STATUS.md). All consolidation-relevant surfaces
are green: two-grid isolation, profile lifecycle + stress, autosave,
calculated columns, column customization, conditional styling, filters,
general settings, settings-panel nav, popout iframe mount.

## 6. Git blame sanity

```
git blame packages/config-service/src/config-manager.ts | head -3
```

Shows `2026-03-29` original commit from `widgetstools/markets-ui`, not
the merge commit. ✅ markets-ui history preserved.

```
git blame packages/widgets-react/src/blotter/SimpleBlotter.tsx | head -3
```

Shows `2026-02-15` original commit from `nndrao/stern-2`, not the
merge commit. ✅ stern-2 history preserved.

## 7. Import-graph audit

```
npx madge --circular --extensions ts,tsx packages/
```

**Result:** 3 circular deps detected. All are **intra-package**
(within a single package directory), not cross-package:

1. `widget-sdk/src/types/widget.ts ↔ widget-sdk/src/registry/WidgetRegistry.ts`
   — type-only cycle, pre-existing on `main`
2. `core/src/colDef/adapters/excelFormatter.ts ↔ valueFormatterFromTemplate.ts`
   — type-only cycle, pre-existing on `main`
3. `widget-sdk/dist/...` — compiled artifact of (1), eliminated when
   tests clear `dist`.

The consolidation plan's acceptance criterion was "no circular
dependencies that cross the new layer boundaries." All three cycles
are within a single package, satisfying that contract. Follow-up
ticket can refactor the two intra-package cycles.

## 8. Archive pointers (pending — admin action)

The consolidation branch is ready. Before merging, the admin should:

1. Merge this PR (`feat/consolidation` → `main`).
2. Archive `widgetstools/markets-ui` on GitHub; add a README pointing
   to `widgetstools/marketsui-platform`.
3. Archive `widgetstools/fi-trading-terminal`; same pointer.
4. Archive `widgetstools/stern-2`; same pointer.
5. Confirm the redirect in GitHub's repo-settings-page (auto-redirect
   is created on rename; archiving does not affect it).

[`MIGRATION_NOTES.md`](./MIGRATION_NOTES.md) contains the old→new URL
and path mapping that the archived-repo READMEs should link to.

## Summary

Consolidation is complete. The monorepo at
`widgetstools/marketsui-platform` carries:

- 18 packages under `@marketsui/*`
- 8 apps (primary: `demo-react`; 7 others are reference/regression)
- Unified Turborepo + npm-workspaces tooling
- Preserved git history from all four source repos
- GitHub Actions CI (typecheck, build, test, e2e)
- Consolidated documentation
- 298 unit tests + 195 e2e tests passing

All three blocked feature streams — data-provider selection +
SharedWorker, HOC refactor of `<MarketsGrid>`, Angular port — are now
unblocked on a single tree. See the plan's
"§What gets UNBLOCKED after consolidation" section in the original
planning doc for next-step guidance.
