# widgetstools/markets-ui — ARCHIVED

> **This repository has been consolidated into  
> [widgetstools/marketsui-platform](https://github.com/widgetstools/marketsui-platform).**
>
> Active development, issues, and pull requests happen there.  
> This repo is preserved as a read-only snapshot of pre-consolidation history.

## Where did everything go?

Every package and app from this repo now lives under `@marketsui/*` in the
consolidated monorepo. Git history is preserved via `git-filter-repo` —
`git blame` on any file still points at its original commits here.

| Old location (this repo) | New location |
|---|---|
| `packages/config-service` | [`packages/config-service`](https://github.com/widgetstools/marketsui-platform/tree/main/packages/config-service) — `@marketsui/config-service` |
| `packages/component-host` | [`packages/component-host`](https://github.com/widgetstools/marketsui-platform/tree/main/packages/component-host) — `@marketsui/component-host` |
| `packages/openfin-workspace` | [`packages/openfin-platform`](https://github.com/widgetstools/marketsui-platform/tree/main/packages/openfin-platform) — `@marketsui/openfin-platform` |
| `packages/angular-tools` | Split across [`packages/angular`](https://github.com/widgetstools/marketsui-platform/tree/main/packages/angular), [`dock-editor-angular`](https://github.com/widgetstools/marketsui-platform/tree/main/packages/dock-editor-angular), [`registry-editor-angular`](https://github.com/widgetstools/marketsui-platform/tree/main/packages/registry-editor-angular) |
| `packages/react-tools` | Split across [`packages/dock-editor-react`](https://github.com/widgetstools/marketsui-platform/tree/main/packages/dock-editor-react) + [`packages/registry-editor-react`](https://github.com/widgetstools/marketsui-platform/tree/main/packages/registry-editor-react) |
| `apps/reference-react` | [`apps/markets-ui-react-reference`](https://github.com/widgetstools/marketsui-platform/tree/main/apps/markets-ui-react-reference) |
| `apps/reference-angular` | [`apps/markets-ui-angular-reference`](https://github.com/widgetstools/marketsui-platform/tree/main/apps/markets-ui-angular-reference) |
| `docs/MARKETSUI_DESIGN.md` | [`docs/MARKETSUI_DESIGN.md`](https://github.com/widgetstools/marketsui-platform/blob/main/docs/MARKETSUI_DESIGN.md) — 1033-line design authority, unchanged |

## If you have an open branch here

Don't push to it. Instead:

1. Rebase your commits onto `main` in
   [`widgetstools/marketsui-platform`](https://github.com/widgetstools/marketsui-platform).
2. Move files into the new paths per the table above.
3. Rename imports: this repo's packages joined the `@marketsui/*` namespace.
4. Open the PR against `widgetstools/marketsui-platform`.

See [`docs/MIGRATION_NOTES.md`](https://github.com/widgetstools/marketsui-platform/blob/main/docs/MIGRATION_NOTES.md)
in the consolidated repo for the full migration map, namespace rename,
and tooling changes (pnpm → npm workspaces + `--legacy-peer-deps`,
Turborepo 2, unified CI).
