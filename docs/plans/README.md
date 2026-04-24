# Forward-looking plans — post-consolidation feature streams

The plans in this directory cover the feature streams that were
blocked behind the 4-repo → 1-repo consolidation and are now unblocked
on `main`.

| Plan | Est. duration | Blocked by | Unblocks |
|---|---|---|---|
| [`DATA_PLANE.md`](./DATA_PLANE.md) | 3 weeks | — | AppData bindings, cross-app data story, MarketsGrid `dataBinding` prop |
| [`SHELL_AND_REGISTRY.md`](./SHELL_AND_REGISTRY.md) | 2-3 weeks (parallelizable with DATA_PLANE weeks 2-3) | DATA_PLANE week 1 (context types) | App instantiation at scale, Angular shell |
| [`MARKETS_GRID_API.md`](./MARKETS_GRID_API.md) | ~3 days | — | Consumer programmatic access, Angular parity on MarketsGrid |
| [`ANGULAR_PORT.md`](./ANGULAR_PORT.md) | 6-8 weeks | DATA_PLANE + SHELL_AND_REGISTRY frozen API surfaces, MARKETS_GRID_API handle shape | Angular teams building real MarketsUI apps |

## Reading order

1. **`DATA_PLANE.md`** — foundational. Every other stream references it.
2. **`SHELL_AND_REGISTRY.md`** — how apps are instantiated, registered, and launched. Introduces `OpenFinHostContext` which `ANGULAR_PORT` implements.
3. **`MARKETS_GRID_API.md`** — how consumers get a programmatic handle to a `<MarketsGrid>` instance. Supersedes the HOC idea mentioned in the consolidation plan.
4. **`ANGULAR_PORT.md`** — the longest single pole. Per-week deliverables + gates.

## Critical path

```
Week 1   2   3   4   5   6   7   8   9   10  11  12
        ├───DATA_PLANE──────┤
          ├─SHELL_AND_REGISTRY─┤
         ├─MARKETS_GRID_API ─┤   (~3 days, can drop anywhere in the first 2 weeks)
            ├──────────ANGULAR_PORT──────────┤
```

- Week 1-3: data plane ships
- Week 2-4: shell + registry ship
- Any time in weeks 1-2: MarketsGrid API handle lands (small, additive, unblocks Angular port spec)
- Week 2-10: Angular port (starts against frozen APIs at end of week 1)
- Week 10-12: hardening, parity tests, production readiness

## Related reading

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — current layer model + import rules these plans extend
- [`../MARKETSUI_DESIGN.md`](../MARKETSUI_DESIGN.md) — 1033-line design authority; these plans operationalize pieces of it
- [`../DEPS_STANDARD.md`](../DEPS_STANDARD.md) — must be updated alongside ANGULAR_PORT (new Angular 21 deps)
- [`../MIGRATION_NOTES.md`](../MIGRATION_NOTES.md) — where the code imported from each source repo now lives
- [`../CONSOLIDATION_VERIFICATION.md`](../CONSOLIDATION_VERIFICATION.md) — the green baseline these plans build on

## Status

All plans are **drafts.** They're grounded in the actual monorepo
layout (`packages/*`, `apps/*`) and existing code (`StompDatasourceProvider`
in `widgets-react`, skeletal `@marketsui/angular`, the existing
`shared-types/dataProvider.ts` enum, etc.) rather than invented from
scratch. Edit freely — the point is that there's now a shared document
per stream to argue over instead of tribal knowledge.

## Superseded ideas

- **HOC refactor of `<MarketsGrid>`** — mentioned in the consolidation plan's §"What gets UNBLOCKED" list. Superseded by [`MARKETS_GRID_API.md`](./MARKETS_GRID_API.md): imperative handle via `forwardRef` + `onReady` is simpler, has an Angular mirror, and matches AG-Grid's own idiom.
