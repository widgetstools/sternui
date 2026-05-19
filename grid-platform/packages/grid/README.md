# @stargrid/grid (Phase 3 stub)

Merged MarketsGrid product surface — combines legacy `@starui/markets-grid` +
`@starui/grid-react` into one package with subpath exports.

## Planned exports

```
@stargrid/grid              MarketsGrid root component
@stargrid/grid/modules/*    Module pipeline panels
@stargrid/grid/primitives/* Settings-panel primitives
@stargrid/grid/styles.css   Widget stylesheet
```

## Host integration

MarketsGrid accepts `host: GridHostContext` instead of wiring providers externally.

## Source

- `../../packages/react/widgets/markets-grid/`
- `../../packages/react/widgets/grid-react/`

Remove duplicate shadcn copy; consume `@stargrid/ui` instead.
