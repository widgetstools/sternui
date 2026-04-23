# widgetstools/fi-trading-terminal — ARCHIVED

> **This repository has been consolidated into  
> [widgetstools/marketsui-platform](https://github.com/widgetstools/marketsui-platform).**
>
> Active development, issues, and pull requests happen there.  
> This repo is preserved as a read-only snapshot of pre-consolidation history.

## Where did everything go?

The design-system tokens, Tailwind config, and terminal palette moved into
a dedicated `@marketsui/design-system` package. The React + Angular
cockpit reference apps are preserved under `apps/fi-trading-reference/`
so the exact terminal UX stays runnable for regression.

Git history is preserved via `git-filter-repo` — `git blame` on any
design-system token or cockpit file still points at its original commits
here.

| Old location (this repo) | New location |
|---|---|
| `react-app/src/design-system/` | [`packages/design-system/src/`](https://github.com/widgetstools/marketsui-platform/tree/main/packages/design-system) — `@marketsui/design-system` |
| `react-app/` (cockpit reference) | [`apps/fi-trading-reference/`](https://github.com/widgetstools/marketsui-platform/tree/main/apps/fi-trading-reference) |
| `angular-app/` | Parity preserved in the Angular demo + framework packages |
| `docs/` | Merged into [`docs/`](https://github.com/widgetstools/marketsui-platform/tree/main/docs) |

## Key design decisions preserved

- **Terminal palette** (dark + light variants) — unchanged, relocated
- **Tailwind 3.4.1** pinning (NOT v4) — enforced monorepo-wide via
  [`docs/DEPS_STANDARD.md`](https://github.com/widgetstools/marketsui-platform/blob/main/docs/DEPS_STANDARD.md)
- **Cockpit styles** (dense trading surfaces) — live in the same
  `@marketsui/design-system` package

## If you have an open branch here

Don't push to it. Instead:

1. Rebase your commits onto `main` in
   [`widgetstools/marketsui-platform`](https://github.com/widgetstools/marketsui-platform).
2. Move files into `packages/design-system/` or
   `apps/fi-trading-reference/` per the table above.
3. Open the PR against `widgetstools/marketsui-platform`.

See [`docs/MIGRATION_NOTES.md`](https://github.com/widgetstools/marketsui-platform/blob/main/docs/MIGRATION_NOTES.md)
in the consolidated repo for the full migration map.
