# Cell Renderers — visual cell components

Cell **renderers** swap the default text node for a visual component.
The design system ships a registry of theme-aware renderers, all
auto-registered on `MarketsGrid` via `@starui/design-system`'s
`cellRendererComponents` map. A column opts into one by setting
`cellRenderer: '<id>'` (string lookup, not a class reference).

## Renderers wired up in this tab

This tab uses **direct ColDef configuration** rather than seeding a
profile — each column carries its own `cellRenderer` + `cellRendererParams`
inline so the wiring is easy to read.

| Column | Renderer | Why |
| --- | --- | --- |
| **Rating** | `pill` | 15-rule rating ladder, AAA → CCC; each rule sets its own dark+light bg/fg pair |
| **Sector** | `pill` | A handful of sector → colour rules; falls back to neutral pill for unmapped sectors |
| **Country** | `country-flag` | Renders the flag emoji from `issuerCountryCode` (ISO-3166 alpha-2) |
| **Ccy** | `country-flag` | Currency code drives the flag (USD → 🇺🇸, EUR → 🇪🇺, JPY → 🇯🇵, …) |
| **Δ %** | `trend-arrow` | Up/down arrow + magnitude, threshold at 0, themed colour scale |
| **Mod Dur** | `percent-bar` | Proportional bar inside the cell, max 30 years |
| **OAS** | `heatmap` | Three-stop gradient (green → amber → rose) over `[20, 600]` bps |
| **KRD curve** | `sparkline` | Inline mini-chart from `[krd1Y, krd2Y, krd5Y, krd10Y, krd30Y]` |
| **Mkt Value** | `percent-bar` | Bar with `max: $50,000,000` so the row width is comparable across positions |
| **Unreal / Daily / YTD P&L** | `pnl-value` | Coloured signed P&L with built-in light/dark theming |
| **Updated** | `time-since` | Auto-refreshing "5m ago" relative time |

## How a renderer is configured

```ts
{
  field: 'compositeRating',
  cellRenderer: 'pill',
  cellRendererParams: {
    rules: [
      { value: 'AAA', bg: { dark: '#103418', light: '#d6f4dd' }, fg: { dark: '#7fdf9b', light: '#1f5d34' } },
      // …
    ],
    fallback: { bg: { dark: '#1f2733', light: '#e8edf2' } },
  },
}
```

All colour values use the `ThemeAwareColor` shape (`{ dark?, light? }`)
so authored colours survive a dark/light theme flip.

## Sparkline source

The sparkline reads a `number[]` from the cell value. We don't store a
price history per row — instead the `krdSparkline` column uses a
`valueGetter` that returns `[krd1Y, krd2Y, krd5Y, krd10Y, krd30Y]`,
which the renderer happily charts. Same pattern works for any array of
numbers you can derive from the row.

## Source

[src/tabs/RenderersTab.tsx](src/tabs/RenderersTab.tsx) — every renderer
wired with explicit `cellRendererParams`. Registry definition lives
in
[`@starui/design-system/cell-renderers-registry`](../../packages/design-system/design-system/src/cellRendererRegistry.ts).
