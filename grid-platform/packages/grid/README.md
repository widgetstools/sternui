# @stargrid/grid

Merged MarketsGrid product surface (Phase 3).

## Layout

```
src/
├── widget/       MarketsGrid chrome, toolbars, formatter (was @starui/markets-grid)
├── customizer/   Module pipeline UI, hooks, editors (was @starui/grid-react)
└── runtime/      OpenFin popout helpers (removed from @stargrid/engine)
```

## Exports

| Import | Surface |
|---|---|
| `@stargrid/grid` | `MarketsGrid`, storage helpers, types |
| `@stargrid/grid/customizer` | Hooks, modules, settings-panel primitives |
| `@stargrid/grid/styles.css` | Widget stylesheet |
| `@stargrid/grid/runtime/openfin` | `isOpenFin`, `openFinWindowOpener` |

## Dependencies

- `@stargrid/engine`, `@stargrid/types`, `@stargrid/host` — StarGrid platform
- `@starui/ui`, `@starui/design-system` — **removed** (Phase 4: use `@stargrid/ui`, `@stargrid/design-system`)

## Phase 3 follow-ups

- [ ] Wire `host: GridHostContext` prop on `MarketsGrid`
- [ ] Port `@starui/ui` + `@starui/design-system` → `@stargrid/*` (Phase 4)
- [ ] Remove duplicate shadcn copy in `customizer/ui/shadcn/`
