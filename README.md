# AG-Grid Customization Platform

A plugin-based grid customization layer on top of AG-Grid Enterprise 35. Built for
the Wells Fargo FI trading terminal (MarketsUI) as an AdapTable alternative —
every module is a first-class plugin with its own persistence schema, settings
panel, and transform pipeline.

## Stack

- **React 19** + TypeScript, Vite bundled
- **AG-Grid Enterprise 35** (`themeQuartz`, `iconSetMaterial`)
- **Zustand** for runtime module state
- **Dexie** (IndexedDB) for per-profile persistence
- **Radix UI** + shadcn-ui primitives (AlertDialog, Popover, Switch, Select, Tooltip…)
- **CodeMirror 6** for inline expression editing (+ Monaco for the "Advanced" dialog)

## Monorepo layout

| Package | What it does |
|---|---|
| `packages/core` | Shared shadcn primitives, the CSP-safe ExpressionEngine, SSF Excel formatter adapter |
| `packages/core-v2` | Module system + 9 built-in modules, profile manager, drag/drop primitives, Cockpit settings-panel kit |
| `packages/markets-grid-v2` | MarketsGrid host component, FormattingToolbar, FiltersToolbar, ProfileSelector, SettingsSheet, HelpPanel |
| `apps/demo` | Vite demo app |
| `e2e/` | Playwright specs (`v2-*.spec.ts`) |

## Modules (9 shipped)

| Module | Priority | Purpose |
|---|---|---|
| `general-settings` | 0 | Grid-level options (60 controls in 8 bands: grouping, pivot, editing, selection, pagination, clipboard, accessibility, export) |
| `column-templates` | 1 | Named style templates you can apply to many columns |
| `column-customization` | 10 | Per-column settings — header, layout, style, format, **filter**, **row grouping** |
| `calculated-columns` | 15 | Virtual columns computed from expressions; first-class citizens for styling + aggregation |
| `column-groups` | 18 | Header group hierarchy |
| `conditional-styling` | 20 | Expression-driven row / cell painting |
| `saved-filters` | 30 | Quick-filter pills with per-pill row counts |
| `toolbar-visibility` | 40 | Which toolbars show on the grid |
| `grid-state` | 200 | Round-trips AG-Grid's native state (column order / width / sort / filter / pagination / selection) on explicit Save |

## Features

### Expressions

One CSP-safe engine used by 3 editors:
- **Conditional Styling** — rule predicates
- **Calculated Columns** — virtual column valueGetters
- **Column Settings → Row Grouping → Custom Aggregation** — `SUM([value]) * 1.1` etc.

65+ built-in functions across Math / Aggregation / Logical / String / Date /
Type / Lookup / Coercion. Column-aware aggregations (`SUM([price])` sums the
whole column, not the current row). Multi-branch `IFS` / `SWITCH` / `CASE`.

### Formats

Full Excel-format parity via SSF (SheetJS Format) + bond tick-price support
(TICK32 / TICK32_PLUS / TICK64 / TICK128 / TICK256). Conditional sections,
color tags (`[Red]`, `[Green]`), currency quick-insert for $ / € / £ / ¥ / ₹ / CHF.

### Profiles

Per-profile state for all 9 modules. 300ms debounced auto-save. Explicit Save
snapshots AG-Grid's native state. **Export / Import as JSON** — full grid
config round-trips through a single `.json` file.

### Floating formatter toolbar

Draggable panel anchored to the top edge of the viewport. Responsive width
(clamps to viewport, scrolls internally on narrow screens). Pinned drag
handle + close button. Toggle via Brush icon on the filters toolbar.

### Traffic light pattern

Classify → render emoji → aggregate upward. See **Part 4** of
[FORMATS_AND_EXPRESSIONS.md](./docs/FORMATS_AND_EXPRESSIONS.md) for the full
walkthrough, or click the **? icon** in the top-right of the Settings sheet
inside the app.

## Getting started

```bash
pnpm install
pnpm --filter demo dev
# http://localhost:5190/
```

## Documentation

- [**FORMATS_AND_EXPRESSIONS.md**](./docs/FORMATS_AND_EXPRESSIONS.md) — full
  reference for the Excel format + expression mini-languages, trading-specific
  recipes, and the traffic-light walkthrough. Also available in-app via the
  `?` icon inside the Settings sheet.
- [**IMPLEMENTED_FEATURES.md**](./docs/IMPLEMENTED_FEATURES.md) — every
  feature currently shipped, kept in lockstep with the code (updated on
  every commit that adds / modifies / removes a feature).

## Theme

Dark/light mode compatible — every surface defers to theme tokens
(`--background`, `--card`, `--popover`, `--border`, `--foreground` …). Toggle
via the Sun/Moon icon in the demo's top-right corner.

## Testing

- Unit tests: Vitest (`pnpm test`)
- E2E: Playwright (`pnpm --filter e2e test`)

## Copyright

Internal Wells Fargo Capital Markets project. Not open-source.
