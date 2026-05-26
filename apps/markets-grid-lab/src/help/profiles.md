# Profiles — pre-baked lenses

A **profile** is a complete, named MarketsGrid configuration: which
columns are shown, their order and widths, formatters, calculated
columns, groups, conditional-styling rules, saved filters, toolbar
visibility, and the native AG Grid state (sort, filter, pinned,
selection).

Each tab in this lab persists its own profiles under its own `gridId`.
Click any preset below to mount a grid pre-configured for that lens.

## Preset gallery

| Preset | Lens | What's distinctive |
| --- | --- | --- |
| **Trader View** | Dense pricing + P&L | Compact 32-px rows, CUSIP + Ticker pinned, losers/winners painted, default formatters override numerics to 3-dp prices and signed P&L |
| **Analytics View** | Wide research lens | Ratings + sub-sectors + risk decomposition + KRD curve visible; pricing reduced to mid-only |
| **Compact** | At-a-glance | 28-px rows, integers only on every numeric column, fewer columns |
| **Grouped** | All columns, nested headers | 8 column groups via the column-groups module; click chevrons to reveal `columnGroupShow: 'open'` children |
| **Calculated-heavy** | Derived columns front-and-centre | Stacks P&L Total · Carry/Risk · Dollar Dur next to their inputs; coloured rules on derived P&L |
| **Alert-heavy** | Conditional signals everywhere | Losers/winners/wide-spreads/junk-ratings/high-yields all painted at once — combine with the live stream to see the grid breathe |
| **Formatter Focus** | Compare formatter presentations | Same `midPrice` rendered 3-dp, 4-dp and integer side-by-side; same `dailyPnL` rendered signed / plain / coloured |
| **Renderer Focus** | Heatmaps, pills, percent bars, sparklines | Visualisations on every column with a sensible chart form |

## How they're built

Each preset is a `ProfilePreset` object exporting:

- `id` — used as `gridId` (separate localStorage scope per preset).
- `name`, `tagline`, `accent` — gallery-card metadata.
- `description` — markdown shown in the help drawer.
- `buildColumns()` — returns the `ColDef[]` (or grouped defs) for this
  preset.
- Optional: `defaultColDef`, `rowHeight`, `toolbars`, `stream`.

The presets show **two configuration strategies**:

1. **Build-time** (these presets) — column defs and renderer params are
   declared in TypeScript and fed straight into MarketsGrid.
2. **Profile-state** (the Overview / Conditional Styling / Formatting
   tabs) — column-customization, conditional-styling, and
   calculated-columns module state is seeded into the platform store
   on first mount via [`useSeed`](src/data/useSeed.ts) and persisted
   via `handle.saveAll()`.

In a real product, presets would also be exported from the customizer
via `profiles.exportProfile()` and imported via
`profiles.importProfile(json)` — that route round-trips the same
`ProfileSnapshot` shape that `saveAll()` writes.

## Where the seed lives

[src/profiles/presets.ts](src/profiles/presets.ts) — all 8 presets.
