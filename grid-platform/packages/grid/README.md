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
- `@stargrid/ui`, `@stargrid/design-system` — design system + primitives

## Host integration

Pass an optional `host: GridHostContext` prop to wire runtime identity, storage,
data, and config without the legacy provider stack:

```tsx
<MarketsGrid
  host={createGridHostContext({ runtime, storage, data, config })}
  gridId="blotter"
  rowData={rows}
  columnDefs={cols}
/>
```

Explicit `appId`, `userId`, `storage`, and `appData` props override host defaults.
