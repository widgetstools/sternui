# Migration notes — four repos → `widgetstools/marketsui-platform`

If you followed a link or a README badge to one of these repositories:

| Old URL | Status | Where it lives now |
|---|---|---|
| `widgetstools/widgets` | **Renamed** to `widgetstools/marketsui-platform` (this repo) | You're already here |
| `widgetstools/markets-ui` | Archived | `packages/config-service`, `packages/component-host`, `packages/openfin-platform`, `packages/angular`, `apps/markets-ui-{react,angular}-reference` |
| `widgetstools/fi-trading-terminal` | Archived | `packages/design-system`, `apps/fi-trading-reference` |
| `nndrao/stern-2` → `widgetstools/stern-2` | Archived (pushed via mirror) | `packages/widget-sdk`, `packages/widgets-react`, `packages/openfin-platform-stern`, `apps/config-service-server`, `apps/stern-reference-{react,angular}` |

Git history is preserved via `git-filter-repo` history-preserving merges:
`git blame` on any file imported from the old repos points at the
original commits, not the merge commit.

## Namespace changes

Every package was renamed to the `@marketsui/*` namespace during
consolidation:

| Old package | New package |
|---|---|
| `@grid-customizer/core` | `@marketsui/core` |
| `@grid-customizer/markets-grid` | `@marketsui/markets-grid` |
| `@stern/widget-sdk` | `@marketsui/widget-sdk` |
| `@stern/widgets` | `@marketsui/widgets-react` |
| markets-ui `packages/config-service` | `@marketsui/config-service` |
| markets-ui `packages/component-host` | `@marketsui/component-host` |
| markets-ui `packages/openfin-workspace` | `@marketsui/openfin-platform` |
| stern-2 `packages/openfin-platform` | `@marketsui/openfin-platform-stern` |
| markets-ui `packages/react-tools` + stern-2 React hooks | merged — see `packages/widgets-react` / `packages/dock-editor-react` / `packages/registry-editor-react` |
| markets-ui `packages/angular-tools` | `@marketsui/angular` / `@marketsui/dock-editor-angular` / `@marketsui/registry-editor-angular` |

## Repo layout mapping (old → new)

```
OLD: widgetstools/widgets
  packages/core              → packages/core
  packages/markets-grid      → packages/markets-grid
  apps/demo                  → apps/demo-react
  e2e/                       → e2e/
  docs/                      → docs/

OLD: widgetstools/markets-ui
  packages/config-service    → packages/config-service
  packages/component-host    → packages/component-host
  packages/openfin-workspace → packages/openfin-platform
  packages/angular-tools     → split into packages/angular,
                               packages/dock-editor-angular,
                               packages/registry-editor-angular
  packages/react-tools       → split into packages/dock-editor-react,
                               packages/registry-editor-react
  apps/reference-react       → apps/markets-ui-react-reference
  apps/reference-angular     → apps/markets-ui-angular-reference
  docs/MARKETSUI_DESIGN.md   → docs/MARKETSUI_DESIGN.md

OLD: widgetstools/fi-trading-terminal
  react-app/src/design-system/
                             → packages/design-system/src
  react-app/                 → apps/fi-trading-reference
  angular-app/               → apps/fi-trading-reference (Angular variant preserved for reference)

OLD: nndrao/stern-2 → widgetstools/stern-2
  packages/widget-sdk        → packages/widget-sdk
  packages/widgets           → packages/widgets-react
  packages/openfin-platform  → packages/openfin-platform-stern
  apps/server                → apps/config-service-server
  apps/reference-react       → apps/stern-reference-react
  apps/reference-angular     → apps/stern-reference-angular
```

## Tooling changes

| Concern | Old | New |
|---|---|---|
| Package manager | pnpm (varied across repos) | **npm 10 workspaces** |
| Install flag | — | **`--legacy-peer-deps` required** (corporate `.tgz` peer conflicts — see `docs/DEPS_STANDARD.md`) |
| Build | varied (tsc, vite, rollup) | **Turborepo 2** uniformly |
| CI | per-repo workflows | single matrix in `.github/workflows/{ci,e2e}.yml` |
| PR template | varied | `.github/pull_request_template.md` |
| Dep versions | drifted | pinned per [`DEPS_STANDARD.md`](./DEPS_STANDARD.md) |

## If you're opening a PR against one of the archived repos

Don't. Open it here against `widgetstools/marketsui-platform`. The
archived repos are read-only snapshots of pre-consolidation history.

If you had an open branch on one of the archived repos:

1. Rebase the commits onto `main` here.
2. Move files into the new target paths per the mapping table above.
3. Rename any `@grid-customizer/*` / `@stern/*` imports to `@marketsui/*`.
4. Open the PR.

If you need help with the mechanical port, ping the platform team —
`tools/scripts/normalize-deps.mjs` handles most of the dep-version
churn automatically.

## Why this consolidation happened

Four repos made atomic changes impossible. Cross-cutting types drifted
silently (the `IDataProvider` spec in `markets-ui` did not match the
concrete `StompDataProvider` in `stern-2`). Onboarding required four
`git clone`s and four `npm link` dances. Dependency versions drifted
(React 18 vs 19, TypeScript 5.5 vs 5.9, AG-Grid 33 vs 35). Three new
feature streams — data-provider selection + SharedWorker, HOC refactor
of `<MarketsGrid>`, Angular port — all hit this wall simultaneously.

Consolidation happened across ten days on the `feat/consolidation`
branch. See the commit graph for per-day checkpoints:

- Day 1: audit + dep standard
- Day 2: monorepo skeleton + `@marketsui/*` rename
- Day 3: import `widgetstools/markets-ui` (history-preserving)
- Day 4: import `widgetstools/fi-trading-terminal` + `widgetstools/stern-2`
- Day 5a: cross-package dep standardization
- Day 5b: stern-2 upgrade to React 19
- Day 5: whole monorepo green (40/40 turbo tasks, 298 tests)
- Days 6-7: GitHub Actions pipeline
- Day 8: E2E baseline
- Day 9: docs consolidation (this file)
- Day 10: archive sources + final verification + merge
