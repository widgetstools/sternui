# widgetstools/stern-2 — ARCHIVED

> **This repository has been consolidated into  
> [widgetstools/marketsui-platform](https://github.com/widgetstools/marketsui-platform).**
>
> Active development, issues, and pull requests happen there.  
> This repo is preserved as a read-only snapshot of pre-consolidation history.

## Where did everything go?

Every package and app from this repo now lives under `@marketsui/*` in
the consolidated monorepo. During consolidation, stern-2 was also
upgraded to React 19 (from React 18) so it shares one version line with
the rest of the platform. Git history is preserved via `git-filter-repo`
— `git blame` on any file still points at its original commits here.

| Old location (this repo) | New location |
|---|---|
| `packages/widget-sdk` | [`packages/widget-sdk`](https://github.com/widgetstools/marketsui-platform/tree/main/packages/widget-sdk) — `@marketsui/widget-sdk` |
| `packages/widgets` (React blotter/chart/heatmap) | [`packages/widgets-react`](https://github.com/widgetstools/marketsui-platform/tree/main/packages/widgets-react) — `@marketsui/widgets-react` |
| `packages/openfin-platform` | [`packages/openfin-platform-stern`](https://github.com/widgetstools/marketsui-platform/tree/main/packages/openfin-platform-stern) — `@marketsui/openfin-platform-stern` |
| `packages/shared-types` | Merged into [`packages/shared-types`](https://github.com/widgetstools/marketsui-platform/tree/main/packages/shared-types) — `@marketsui/shared-types` |
| `apps/server` | [`apps/config-service-server`](https://github.com/widgetstools/marketsui-platform/tree/main/apps/config-service-server) — `@marketsui/config-service-server` |
| `apps/reference-react` | [`apps/stern-reference-react`](https://github.com/widgetstools/marketsui-platform/tree/main/apps/stern-reference-react) |
| `apps/reference-angular` | [`apps/stern-reference-angular`](https://github.com/widgetstools/marketsui-platform/tree/main/apps/stern-reference-angular) |

## Preserved capabilities

- **`StompDataProvider`** — the concrete `IDataProvider` implementation
  from this repo is now the canonical reference implementation for the
  data-plane work. Unchanged, relocated under `@marketsui/widgets-react`.
- **OpenFin platform bootstrap** — preserved in
  `@marketsui/openfin-platform-stern` alongside the markets-ui flavour
  in `@marketsui/openfin-platform`. Platform shells are the only layer
  allowed to import `@openfin/core`.
- **Widget registry + launch spec** — `@marketsui/widget-sdk` keeps the
  original WidgetContext / registry shape.

## Transfer + consolidation history

This repo was originally at `nndrao/stern-2` and was mirror-pushed to
`widgetstools/stern-2` during the consolidation so the platform team
could administer it uniformly alongside the other three sources. The
mirror happened on the `feat/consolidation` branch of
`widgetstools/marketsui-platform` — see commit `b1cbfb4`
("feat(consolidation): Day 4 — import stern-2 + relocate everything")
for the import record.

## If you have an open branch here

Don't push to it. Instead:

1. Rebase your commits onto `main` in
   [`widgetstools/marketsui-platform`](https://github.com/widgetstools/marketsui-platform).
2. Move files into the new paths per the table above.
3. Rename imports: `@stern/widget-sdk` → `@marketsui/widget-sdk`;
   `@stern/widgets` → `@marketsui/widgets-react`.
4. Bump React to `19.2.5` if your branch still pinned React 18.
5. Open the PR against `widgetstools/marketsui-platform`.

See [`docs/MIGRATION_NOTES.md`](https://github.com/widgetstools/marketsui-platform/blob/main/docs/MIGRATION_NOTES.md)
in the consolidated repo for the full migration map.
