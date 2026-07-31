# Profiles — pre-baked lenses

> **This is the Perspective lab.** The grid below runs on
> `rowModel="perspective"`: the book lives once as a Table in the SharedWorker
> and this window reads only the blocks its viewport asks for. Sorting,
> filtering, grouping and aggregation are answered by the worker, not by rows
> in this page. The CSRM twin of this tab is in `markets-grid-lab` on :5300 —
> run both to see what the engine changes. Read
> [the lab README](../../README.md) for the differences that matter.

A **profile** is a complete MarketsGrid configuration: columns, module
state (CS, calc, groups, alerts, …), toolbars, and AG Grid state.

## Preset gallery (14 layouts)

| Preset | Lens |
| --- | --- |
| **Trader View** | Dense pricing + P&L, pinned IDs |
| **Analytics View** | Wide research + risk decomposition |
| **Compact** | 28 px rows, integer formatters |
| **Grouped** | Eight nested column groups |
| **Calculated-heavy** | `valueGetter` derivations in code |
| **Alert-heavy** | CS rules on every semantic column |
| **Formatter Focus** | Same field, multiple formatters |
| **Renderer Focus** | Heatmaps, pills, sparklines, flags |
| **Execution desk** | Liquidity + spread, 400 ms stream |
| **Credit research** | Grouped issuer / spreads / risk / P&L |
| **Renderer lab** | **6** cell-renderer profiles in selector |
| **Formatter toolbar lab** | **6** pre-painted style profiles + floating toolbar |
| **CS rule lab** | **6** conditional-styling profiles in selector |
| **Calc column lab** | **5** virtual-column profiles in selector |

Click a card to mount that preset (`gridId` = preset `id`). Presets with
`demoProfiles` wire the same catalog installer as feature tabs.

## Two configuration strategies

1. **Build-time** (most presets) — `buildColumns()` returns `ColDef[]`
   directly.
2. **Profile-state** (Overview, CS, Formatting, … tabs + lab presets) —
   module snapshots installed via
   [`useLabDemoProfiles`](../../src/data/useLabDemoProfiles.ts).

Export/import in production: `profiles.exportProfile()` /
`profiles.importProfile(json)` — same shape as `saveAll()`.

## Where the code lives

[`src/profiles/presets.ts`](../../src/profiles/presets.ts) ·
[`src/profiles/catalogs/`](../../src/profiles/catalogs/) ·
importable JSON [`public/lab-profiles/`](../../public/lab-profiles/).
