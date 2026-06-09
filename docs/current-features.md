# Current Features — `starui` MarketsUI Platform

> **Living inventory** of every implemented capability across `packages/`,
> grouped by architecture bucket and then by functional area. Update this file
> in the same change that adds, modifies, or removes a feature — same rule as
> `docs/IMPLEMENTED_FEATURES.md`. Treat omissions as a code-review blocker.
>
> Last reconciled: 2026-05-22 (sourced directly from `packages/` source.)

## Document conventions

- **Granular bullets** — one bullet per distinct capability (component, hook,
  manager, util, IPC topic, transport, schema, etc.). If a class exposes
  several public APIs that callers consume independently, list them
  individually.
- **Sub-headings** group features inside a package by functional area.
- **Public subpath exports** (`package.json` `exports`) are called out per
  package so consumers can find the public surface at a glance.
- **Status tags** (`scaffold`, `deprecated`) appear inline where applicable.
- **Skip tests/fixtures**. Skip private implementation details that aren't
  importable.

---

## Bucket index

1. [UI Design System](#1-ui-design-system) — `packages/design-system/`
2. [React UI Controls](#2-react-ui-controls) — `packages/react-ui/`
3. [React Grid](#3-react-grid) — `packages/react-grid/`
4. [React Core](#4-react-core) — `packages/react-core/`
5. [Shared / Core](#5-shared--core) — `packages/shared/`
6. [Data Utilities](#6-data-utilities) — `packages/data/`
7. [OpenFin Utils](#7-openfin-utils) — `packages/openfin/`
8. [Angular UI Controls](#8-angular-ui-controls) — `packages/angular-ui/` *(scaffold)*
9. [Angular Grid](#9-angular-grid) — `packages/angular-grid/` *(scaffold)*
10. [Angular Core](#10-angular-core) — `packages/angular-core/` *(scaffold)*

---

## 1. UI Design System

### 1.1 `@starui/design-system`

**Path:** `packages/design-system/design-system`
**Purpose:** Design tokens, theme runtime, CSS variable generation, and framework adapters for the MarketsUI platform.

**Public exports:**

- `.` — root (tokens, adapters, `applyTheme`, cell renderers)
- `./css` — bundled theme stylesheet
- `./tailwind` — Tailwind preset
- `./primeng` — PrimeNG theme preset
- `./shadcn` — shadcn token generator
- `./adapters/ag-grid` — AG Grid Quartz themes (`iconSetQuartzLight`); STARUI token-driven chrome (JetBrains Mono headers/cells, Inter chrome, 2px radii, 12px cell padding)
- `./tokens`, `./tokens/primitives`, `./tokens/semantic`, `./tokens/components`, `./tokens/controls`
- `./cell-renderers` — bundled AG Grid cell renderer classes

#### Primitive tokens

- Color palettes: paper, ink, graphite, teal, rose, amber, brand, cyan, purple, CVD-safe variants
- Typography: font families, sizes, weights, letter-spacing, line-heights
- Spacing scale, border radius, opacity scale, transition tokens, elevation/shadow scale
- Stockflux Slate palette in hex, shadcn-compatible HSL, and AG Grid formats
- **STARUI canonical packs** (`tokens/staruiHex.ts`) — Graphite dark, clinical light, paper light; cyan signature accent; mint-teal buy / rose sell
- Legacy `--sf-*` / `stockfluxSlate*` export names retained; new `--st-*` namespace emitted in unified CSS

#### Semantic tokens

- `ColorScheme` interface — primary, surface, text, border, accent, trade, action, state, overlay, chart, sidebar, CVD groups
- `dark`, `light` (clinical), `lightPaper` (warm cream) schemes
- Component tokens — per-component theming overrides
- Control tokens — `ControlSize` and `ControlTier` for form-control variants

#### Theme runtime

- `applyTheme()` — toggle dark/light + CVD accessibility mode + light variant, persists to `localStorage`
- `getTheme()` — read persisted theme with legacy key migration
- `ThemeOptions` — `{ theme, cvd?, variant? }` shape; `variant`: `'clinical' | 'paper'` (light only; default `clinical`)
- DOM: `data-theme="dark|light"`, optional `data-variant="clinical|paper"`, optional `data-cvd="on"`
- Storage keys: `starui:theme` (canonical), `starui:cvd`, `starui:variant`, with `@starui/theme` legacy migration

#### CSS generation

- `generateUnifiedCSS()` — emit CSS custom properties from semantic tokens (dark + clinical + paper blocks)
- Dynamic CSS injection utility for theme switching
- WCAG contrast validation helpers

#### Framework adapters

- Tailwind preset — `darkMode: ['selector', '[data-theme="dark"]']`, HSL channel variables, surface scale 50–950, radius, font families
- shadcn adapter — Radix/shadcn color-name unification + `--st-*` STARUI bridge
- PrimeNG adapter — PrimeUI-compatible color mapping via `var(--ds-*)`
- AG Grid adapters — `dark`, `light`, `comfort`, `blotter` variants; STARUI token colors (JetBrains Mono headers/cells, Inter chrome, 2px radii, 12px cell padding)

#### AG Grid cell renderers

Vanilla TS classes implementing `ICellRendererComp` — framework-agnostic
(React + Angular), CSS-variable themed. Registered by string id in
`cellRendererRegistry.ts` and wired into AG Grid via
`gridOptions.components` (see `cellRendererComponents` map). The
column-customization band 10 ("Cell Renderer") in the React grid lets
end users pick any of these per column and author the config for the
configurable ones.

Zero-config built-ins:

- `SideCellRenderer` (id `side`) — Buy/Sell badges
- `StatusBadgeRenderer` (id `status-badge`) — Filled / Partial / Pending / Cancelled
- `ColoredValueRenderer` (id `colored-value`) — sign-coloured numbers
- `OasValueRenderer` (id `oas-value`) — threshold-driven (>80 = warning)
- `SignedValueRenderer` (id `signed-value`) — always-show `+/-` prefix
- `TickerCellRenderer` (id `ticker`) — bold cyan ticker symbols
- `RatingBadgeRenderer` (id `rating-badge`) — credit/risk rating badges
- `PnlValueRenderer` (id `pnl-value`) — P&L colouring + formatting
- `FilledAmountRenderer` (id `filled-amount`) — fill qty / % rendering
- `BookNameRenderer` (id `book-name`) — order-book identity
- `ChangeValueRenderer` (id `change-value`) — price/rate delta
- `YtdValueRenderer` (id `ytd-value`) — year-to-date performance
- `RfqStatusRenderer` (id `rfq-status`) — RFQ state

Configurable renderers (read `cellRendererParams` for user-authored
config; theme-aware via `ThemeAwareColor = { dark?, light? }` slots
with auto re-paint on `data-theme` change via `MutationObserver`):

- `PillCellRenderer` (id `pill`) — exact-string-match rules
  (value → bg / fg / border) with fallback style + pill/square shape
- `HeatmapCellRenderer` (id `heatmap`) — numeric value → 2- or 3-stop
  colour gradient, optional explicit domain
- `PercentBarCellRenderer` (id `percent-bar`) — proportional horizontal
  bar; `max` may be a literal or a sibling-field reference; optional
  percent/value overlay
- `TrendArrowCellRenderer` (id `trend-arrow`) — up/down/flat arrow with
  delta value, configurable threshold dead-band and decimals
- `SparklineCellRenderer` (id `sparkline`) — inline SVG line / area /
  bar chart from an array-of-numbers cell value
- `MultiLineCellRenderer` (id `multi-line`) — primary value + secondary
  text from a sibling field (configurable size + colour)
- `IconTextCellRenderer` (id `icon-text`) — leading or trailing icon
  (full SVG markup resolved at write time from
  `@starui/icons-svg/all-icons`) + cell text
- `CountryFlagCellRenderer` (id `country-flag`) — 2-letter ISO code →
  regional-indicator emoji flag + optional label
- `RatingDeltaCellRenderer` (id `rating-delta`) — credit-rating cell
  with up/down arrow vs. a previous-rating sibling field; configurable
  ordered scale (defaults to S&P)
- `TimeSinceCellRenderer` (id `time-since`) — auto-refreshing relative
  time ("5m ago"); refresh cadence + future-colour override
- `AllocationBarCellRenderer` (id `allocation-bar`) — stacked
  horizontal bar with key→colour map and optional legend

Per-renderer config types (`PillRendererConfig`,
`HeatmapRendererConfig`, …) plus the discriminated-union
`CellRendererConfig` envelope (`{ kind, config }`) live in
`cellRendererRegistry.ts` and are exported from the package root.

---

### 1.2 `@starui/icons-svg`

**Path:** `packages/design-system/icons-svg`
**Purpose:** Framework-agnostic SVG icon catalogue (≈90 icons) for trading UIs.

**Public exports:**

- `.` — `ICON_PATHS`, `ICON_META`, helpers
- `./react` — SVGR-generated React components
- `./angular` — `@lucide/angular` bindings: re-exports the standalone `LucideComponent` + `provideLucideIcons` and the per-icon standalone components (aliased to friendly names, e.g. `FileText`, `Home`)
- `./all-icons` — full enumeration of icon IDs
- `./svg/*` — direct SVG file access

#### Catalogue (grouped by domain)

- **Trading (21):** bond, candlestick, coupon, credit-rating, duration, execute-trade, interest-rate, IPO, live-feed, market-depth, maturity, order-book, portfolio, position, price-alert, spread, stock, ticker, trade-ticket, watchlist, yield-curve
- **Blotters (18):** allocation, audit, block-trade, cash, commodities, derivatives, equity, execution, FI, FX, order, pending, P&L, position, rejected, risk, settlement, trade
- **Charts (6):** area-chart, bar-chart, blotter, heatmap, line-chart, waterfall
- **Risk (11):** compliance, counterparty, drawdown, exposure-map, hedging, limits, risk, risk-gauge, scenarios, stress-test, volatility
- **General (16):** alert, analytics, bank, calculator, clock, currency, dashboard, globe, market-data, notifications, percentage, P&L, reports, settings, trending-down, trending-up
- **System (8):** code, download, eye, moon, refresh, sun, upload, wrench
- **Trading actions (14):** buy, sell, execute, new-order, cancel-order, fill-report, options, futures, FX, crypto, equity, commodity, settlement, trades, algo
- **Extended risk (9):** exposure, VaR, loss, profit, take-profit, stop-loss, liquidity, greeks, positions
- **Extended general (6):** audit, export, filter, search, news, connectivity
- **Extended charts (3):** depth-chart, indicator, volume

#### Metadata APIs

- `ICON_PATHS` — id → SVG path map
- `ICON_META` — id → `{ name, category }`
- `ICON_CATEGORIES` — grouped by category
- `getIconsByCategory()` — category filter

#### SVG conventions

- 24×24 viewBox, `currentColor` strokes/fills, no hardcoded colour, framework-neutral.

---

## 2. React UI Controls

### 2.1 `@starui/ui`

**Path:** `packages/react-ui/ui`
**Purpose:** shadcn/Radix React primitives themed via `@starui/design-system`. Mandatory for any React UI in the monorepo (`<input>`/`<select>`/`<textarea>` forbidden — use these instead).

**Public exports:**

- `.` — all components except `Chart`
- `./chart` — lazy-loaded Recharts wrapper
- `./tailwind-config` — Tailwind preset to consume in app `tailwind.config`

#### Layout & containers

- `Accordion`, `AspectRatio`, `Card`, `Collapsible`, `Resizable` (PanelGroup), `ScrollArea`, `Separator`, `Sheet`, `Tabs`

#### Navigation

- `Breadcrumb`, `DropdownMenu`, `Menubar`, `NavigationMenu`, `Pagination`, `ContextMenu`, `Command` (palette/combobox)

#### Forms & inputs

- `Button` (variants: default, outline, ghost, link, destructive)
- `ButtonGroup` (with toggle support)
- `Checkbox`, `Form` (`useForm`, `useFormField`, `FormProvider`)
- `Input`, `InputOTP`, `Label`, `RadioGroup`, `Select`, `Slider`, `Switch`, `Textarea`
- `Toggle`, `ToggleGroup`

#### Data display

- `Avatar`, `Badge`, `Calendar` (react-day-picker)
- `Carousel` (Embla)
- `Progress`, `Skeleton`, `Table` (semantic HTML rows/cells/headers/footers)
- `Chart` (lazy via `@starui/ui/chart`)

#### Feedback & overlays

- `Alert`, `AlertDialog`, `Dialog`, `Drawer` (vaul), `HoverCard`, `Popover`
- `Toast`, `Toaster`, `useToast` (Radix/sonner)
- `SonnerToaster` — sonner provider

#### Trading-specific composites

- `CollapsibleToolbar` — sectioned toolbar with collapse
- `ToolbarContainer` — toolbar layout wrapper
- `VirtualizedList` — virtualised scroller

#### Utilities & providers

- `cn()` — clsx + tailwind-merge classname helper
- `ThemeProvider` + `useTheme` — `next-themes` integration
- `PortalContainerProvider`, `usePortalContainer`, `useResolvedPortalContainer` — popout/OpenFin portal targeting

---

## 3. React Grid

### 3.1 `@starui/grid`

**Path:** `packages/react-grid/grid`
**Purpose:** Merged MarketsGrid product surface — AG Grid-backed React grid with the full customizer (formatters, conditional styles, calculated columns, saved filters, templates) and profile management.

**Public exports:**

- `.` — `MarketsGrid` component, toolbars, storage helpers, types
- `./customizer` — hooks (`useEditJournal`, `useModuleState`, `useProfileManager`, …),
  module definitions, settings-panel primitives, editing helpers (`recordEdit`,
  `journalUndoRedo`), `ChromeButton` (shadcn `Button` with chrome CSS resets for
  legacy `.ds-*` / `.fx-*` styling)
- `./styles.css` — widget stylesheet
- `./runtime/openfin` — OpenFin popout helpers

#### Core grid

- `MarketsGrid` — main grid component (host integration, column defs, real-time rows)
- `MarketsGridHandle` — imperative ref (grid API + platform methods, `exportVisualExcel`)
- `MarketsGridProps` — host context, storage factory, module overrides, callbacks;
  editing chrome: `showEditingToolbar`, legacy `showSmartEditToolbar` /
  `showBulkUpdateToolbar` / `showEditHistoryToolbar`, `showVisualExcelExport`,
  `headerExtras`, `toolbarDate` / `onToolbarDateChange`, `showToolbarDatePicker`,
  `toolbarDateHistoryEnabled` (when `false`, only today is selectable)
- `DEFAULT_MODULES` — ordered customizer-module pipeline
- `gridSurfaceOptions` — AG Grid defaults, DOM options, row styling, cell renderers
- `MarketsGridSurface` — folds the effective `rowHeight`/`headerHeight` (host
  override or general-settings pipeline) into the theme via `theme.withParams`,
  keeping `--ag-row-height` in sync with the live row height so cell text stays
  vertically centered at any height (parameter-based; no CSS overrides)
- `useGridHost`, `useMarketsGridController` — imperative grid control hooks
- `useFilterModel` — filter-model persistence + mutation
- `useGridTheme` — resolves AG Grid theme from `data-theme`
- `grid-chrome.css` — container/toolbar layout

#### Storage & persistence

- `createMarketsGridLocalStorageStorage()` — browser localStorage adapter factory
- `isMarketsGridLocalStorageStorageFactory()` — type guard
- `StorageAdapter` — load/save profile + grid-level data contract
- `StorageAdapterFactory` — runtime-injectable factory pattern

#### Toolbars

- `PrimaryToolbar` — actions, admin, export/import, Visual Excel spreadsheet export,
  settings sheet toggle, optional inline caption (`tabsHidden`), editing-toolbar pencil toggle,
  secondary actions in ⋯ overflow menu by default (`toolbarActionsLayout`: `overflow` | `inline`); shadcn `ToolbarDatePicker` on the right edge (defaults to today; `showToolbarDatePicker`; `historyEnabled` gates past dates)
- `QuickSearch` — primary-toolbar search icon that expands into a compact field on hover/focus (or click-to-pin via `data-open`) and drives AG-Grid's quick filter across all columns (`setGridOption('quickFilterText')`); self-contained (reaches `GridApi` via `useGridApi`, like `AlertsBadge`); Escape clears + collapses, an inline ✕ clears, and an active term keeps the field open and lights the icon (`data-has-text`)
- `FiltersToolbar` — quick filter, saved filter recall, server-side expression
  (shadcn `ChromeButton` / `Input` / `Textarea` controls)
- `FormattingToolbar` — cell/header styling, conditional formats, value formatters (with popout); horizontal strip is **two rows** — row 1: Scope / Type / Paint; row 2: Format / Edit / Templates / Clear (Format moved off row 1 so the wide format cluster no longer wraps alone onto a third line)
  formatter pills use shadcn `Button` via `Pill` / `PillButton`; enum pickers use shadcn `Select` via `ToolbarSelect`; horizontal strip uses flat labeled groups (no enclosing boxes around control clusters)
- `EditingToolbar` — unified editing row (history undo/redo, Smart Edit ops, Bulk Update apply, keyboard hints dropdown); primary-row pencil toggle (`editing-toolbar-toggle`); segments gated by `resolveEditingToolbarAllow()` + module `settings.enabled`; `editingToolbar.css` + shadcn ghost pills aligned with formatter toolbar (labeled clusters, hairline separators, no boxed button groups)
- `EditingToolbarKeyboardMenu` — read-only dropdown listing active plus/minus nudges and letter shortcuts (keys handled by module runtime, not the menu)
- `SmartEditToolbarBody` — operand input, op buttons (× ÷ + −), **Set…** dialog, preview confirm/cancel
- `BulkUpdateToolbarBody` — text input for custom values, optional distinct-value picker (fills input), check-icon apply control
- `EditHistoryToolbarBody` — global undo/redo + stack entry count
- `SmartEditToolbar` — legacy standalone toolbar export (superseded by `EditingToolbar` segment)
- `providerGridHost` prop — optional runtime API for data-provider controls in the grid customizer → Custom Settings panel (`MarketsGridContainer` wires live/historical pickers, refresh, reload, edit)
- `resolveEditingToolbarAllow()` — maps `showEditingToolbar` and legacy per-segment props to host allow-list
- `AdminActionButtons` — admin grid operations (shadcn `ChromeButton`)
- `GridInfoButton` — grid identity popover trigger (`ChromeButton`)
- `PrimaryToolbarOverflowMenu` / `PrimaryToolbarInlineActions` — secondary toolbar actions (`ChromeButton` triggers); overflow ⋯ menu includes dark/light theme toggle (`applyTheme` + `useActiveThemeMode`) and grid info

#### Profile management UI

- `ProfileSelector` — switch/create/rename/delete profiles
- `TemplateManager` — column-template library (save/apply/manage)
- `UnsavedSwitchDialog` — guard for dirty profile switch
- `SettingsSheet` — shadcn right-rail `Drawer` host for all customizer modules;
  opens on **Grid Options** (`general-settings`) by default; header module
  dropdown (Grid Options, Alerts, Style Rules, …) portals above the drawer
  via `.ds-settings-module-popover` / `.ds-sheet-v2` z-index in `grid-chrome.css`;
  flat `SettingsPanel` modules (Grid Options) fill the editor pane without an
  outer `ds-editor-scroll` so the band sidebar stays fixed while only the
  right-hand fields scroll

#### Help, status & overlays

- `HelpPanel` — sections for Overview, Expressions, Excel, Trading, Traffic-light, Emoji
- `GridInfoButton` — contextual help popover trigger
- `DraggableFloat` — draggable/resizable popout (used by FormattingToolbar)
- `EditableCaption` — inline-editable grid title
- `StaleDataBanner` — data-staleness indicator (real-time disconnect / asOfDate)

#### Floating filters (toolbar)

- `streamSafeFloatingFilter` — base floating-filter bridge
- `streamSafeNumberFloatingFilter` — number variant
- `streamSafeDateFloatingFilter` — date-range variant with calendar
- `filtersToolbarLogic` — filter parsing + AG Grid model translation
- `agGridSetFilterValidateGuard` — set-filter dataset-size guard

#### Formatting pipeline

- `Formatter` — orchestrator (toolbar or panel orientation)
- `ModuleType` — data-type picker (number, date, duration, currency, percentage, …)
- `ModuleFormat` — format-string editor with preset picker + example preview
- `ModulePaint` — cell background/text colour editor
- `ModuleLibrary` — preset library, add-to-library, delete
- `ModuleEditorFilter` — column-target picker
- `ModuleContext` — applied-column summary + copy-to-all
- `ModuleClear` — clear formatting (with confirm)
- `formatterPresets` — built-in numeric, date, currency, %, traffic-light, emoji presets
- `formattingToolbarHooks` — `useFormatter` state + actions; `resolveToolbarPickerDataType()` maps `dateString` / `dateTimeString` (and `date` columns whose sample values include time) to datetime FormatterPicker presets so **Date + time** tiles (ISO with time, US short) appear in the toolbar

#### Customizer modules (under `./customizer`)

- **General settings** — grid behaviour toggles; **Default ColDef** band includes
  flash-on-change with theme-aware colour swatches (shown when enabled)
- **Column templates** — reusable column-state bundles
- **Column customization** — 10 bands per column: Header, Layout,
  Templates, Cell Style, Header Style, Value Format, Filter,
  Row Grouping, Cell Editor, **Cell Renderer** (band 10 — picks any
  registered renderer from `@starui/design-system/cell-renderers-registry`
  and authors its per-renderer config)
- **Conditional styling** — themed style rules (dark/light); per-rule bands for cell/row style, **flash on match** (`FlashConfig` — colour/mode/duration), **indicator** badge (`RuleIndicator`), value formatter, and **animate value** (`AnimationConfig` — `spin` / `spin-reverse` / `pulse`, cell-scope only). Animate spins the matching cell's value glyph via CSS keyframes scoped to `.ag-cell-value` (shipped once as `ds-anim-*`), e.g. an Excel value format maps `1 → 🔄` and a `value = 1` rule spins it — the no-code "in progress" spinner
- **Visual Excel** — WYSIWYG `.xlsx` export preserving display formatters and
  conditional style-rule colours. Engine: `buildVisualExcelStyles`,
  `applyFormatExcelClasses`, `exportVisualExcel` (via `api.exportDataAsExcel` +
  `processCellCallback`). Primary toolbar spreadsheet icon when enabled.
  Settings panel: **Visual Excel**. Lab: **Visual Excel** tab (`lab-visual-excel-v1`).
- **Editing family (overview)** — five customizer modules share a cell-patch
  journal (`EditJournal` in `@starui/engine`). React wiring: `recordEdit.ts`
  (`resolveEditRecording`), `useEditJournal`, `journalUndoRedo`,
  `journalApplyGuard`, `editJournalScope`. Unified **`EditingToolbar`** row
  composes edit-history, smart-edit, and bulk-update segments plus
  `EditingToolbarKeyboardMenu` hints; plus/minus and shortcuts are keyboard-only
  (settings panels, no toolbar segment). Host opt-in: `showEditingToolbar`
  (all three segments) or legacy `showSmartEditToolbar` /
  `showBulkUpdateToolbar` / `showEditHistoryToolbar` (per-segment allow-list;
  row visible when any legacy prop is true). Default module pipeline order in
  `DEFAULT_MODULES`: … → smart-edit → bulk-update → plus-minus → shortcuts →
  data-change-history → alerts → … → grid-state (last). E2e: 45 Playwright
  specs (`e2e/v2-editing-family.spec.ts`, `v2-editing`, `v2-smart-edit`,
  `v2-bulk-update`, `v2-edit-history`, `v2-plus-minus`, `v2-shortcuts`);
  shared helpers in `e2e/helpers/labEditing.ts` and `e2e/helpers/editingToolbar.ts`.
- **Smart Edit** — bulk update, arithmetic across cell selections (× ÷ + −),
  toolbar **Set…** dialog, +/- keyboard increment, and K/M/B magnitude shortcuts
  via `valueParser` on editable numeric columns. Single-column guard, optional
  preview-before-apply, and cell-patch journal recording for undo (via shared
  `EditJournal`). Framework-agnostic ops in `@starui/engine`; React module +
  `SmartEditToolbarBody` in `@starui/grid`. Settings panel: **Smart Edit**.
  Lab: unified **Editing** tab (`lab-editing`, 12 profiles); focused Smart Edit
  profiles under `public/lab-profiles/smart-edit/`.
- **Edit History** — session-scoped undo/redo journal consumed by all editing
  modules. Monitor panel lists entries (time, source, label, cell count) with
  per-entry undo in a fixed-height virtualized scroll rail pinned to the bottom
  of the settings sheet (cascade-undoes that entry and all newer edits; Undo
  disabled for entries already reversed via toolbar); `EditHistoryToolbarBody`
  exposes global Undo/Redo and an undo-stack entry count (decrements on toolbar
  or monitor undo, increments on redo).
  Settings: suspend recording, max stack depth, unify undo (disables AG Grid
  `undoRedoCellEditing`), per-source record toggles (cell editor on by default).
  In-cell edits are journaled via wrapped `valueSetter` on editable columns (AG Grid
  35 may omit `cellValueChanged` on inline commit); `cellValueChanged` remains a
  fallback listener when the event fires.
  Settings panel: **Edit History**. Lab: **Editing** tab (`lab-editing`);
  Smart Edit–only history demo in `public/lab-profiles/smart-edit/se-04-history.json`.
- **Bulk Update** — replace all selected cells in one column with the same
  value (text, number, date). Distinct-value dropdown, confirm threshold,
  single-column guard, journal integration. Settings panel: **Bulk Update**.
  Lab: **Bulk Update** tab (`lab-bulk-update`) and unified **Editing** tab.
- **Plus / Minus** — keyboard +/- nudge rules with per-column increment/decrement
  steps and optional expression gates. Takes over +/- keys from Smart Edit when
  enabled; `suppressKeyboardEvent` on editable numeric columns prevents inline
  edit from consuming +/- keys. Keyboard only — no toolbar segment. Journal
  integration via `recordHistory`. Settings panel: **Plus / Minus**.
  Lab: **Plus / Minus** tab (`lab-plus-minus`).
- **Shortcuts** — letter-key arithmetic (× ÷ + −) with per-shortcut operand and
  column scope. Distinct from Smart Edit K/M/B magnitude parsing in the cell editor.
  Keyboard only — no toolbar segment. Journal integration via `recordHistory`.
  Settings panel: **Shortcuts**. Lab: **Shortcuts** tab (`lab-shortcuts`).
- **Alerts** — expression-driven notifications (dataChange / relativeChange /
  rowChange triggers) with toast, toolbar bell badge, and OpenFin Notification
  Centre channels. Runtime evaluates on `cellValueChanged` and on
  `modelUpdated` / `rowDataUpdated` cell diffs (host `rowData` streams).
  Customizer editor: collapsible **Global settings** band in a two-column
  layout (Alerts + Frequency | Channels + History) plus per-rule editor with
  fixed RESET/SAVE header (`ds-editor-header`) and scrollable rule body.
  Per-rule editor uses `useModuleDraft` and reuses the shared `ExpressionBand`
  / Monaco editor for `dataChange` triggers. OpenFin channel auto-detects
  `window.fin` and dynamic-imports `@openfin/workspace/notifications` so
  non-OpenFin apps pay zero runtime cost. `AlertsBadge` mounts in
  `PrimaryToolbar` (shadcn `Popover` + `ScrollArea`; history list scrolls
  with theme-aware dividers/scrollbar via `ds-sheet-v2`); `useAlertsToastBridge` + `useAlertsOpenFinBridge`
  auto-wire when the badge is present. Demo: `apps/demos/markets-grid-lab`
  (`npm run dev:markets-grid-lab`) — Overview, Conditional Styling, Calculated Columns,
  Formatting, Column Groups, Quick Filters (saved filter pills + `FiltersToolbar`),
  Live Updates, Alerts, **Visual Excel** (styled `.xlsx` export), **Editing** (Smart Edit + Bulk Update + Plus/Minus + Shortcuts +
  History), Bulk Update, Plus / Minus, Shortcuts, Cell Renderers, and Formatter Toolbar tabs. Each feature tab ships multiple toolbar profiles (catalogs in
  `apps/demos/markets-grid-lab/src/profiles/catalogs/`, importable JSON under
  `apps/demos/markets-grid-lab/public/lab-profiles/`). **Demo console** right rail
  (`LabScenarioRail`, `LabDemoProvider`, `useLabRows`) injects scenario patches
  (bid spike, P&L loss, mid ticks, OAS heat, etc.) and shared stream controls
  (pause/play, tick interval) across all grid tabs;   mock ticks use
  `applyTransactionAsync` after the initial snapshot (not per-tick `rowData`
  swaps) via `useMockStream` / `applyLabStreamDelta`; scenario overlays apply
  sparse field patches per tick and `clearScenario` forces a provider refresh;
  feature tabs share `LabFeatureTab` + `labFeatureConfigs` with lazy-loaded tab
  chunks in `App.tsx`; parity doc:
  `docs/MARKETSGRID_VS_ADAPTABLE_GAP_ANALYSIS.md` §2.
- **Calculated columns** — virtual cols from expressions
- **Saved filters** — named filter-model presets
- **Toolbar visibility** — show/hide toolbar items
- **Grid state** — serialise/restore AG Grid state

---

## 4. React Core

### 4.1 `@starui/app`

**Path:** `packages/react-core/app`
**Purpose:** Declarative StarGridApp root — composes `GridHostContext` and provides React context for the grid + plugins.

- `StarGridApp` — root component (providers, host context, children)
- `StarGridAppProvider` — context provider for host, state, persistence, plugins, theme
- `useStarGridApp` — read app state, plugins, instance metadata
- `useStarGridHost` — read host context (runtime, storage, data, config)
- `buildGridHostContext` — compose host context from `{ runtime, storage, data, config }`
- `createGridHostContext` — explicit factory (re-export from `@starui/host`)
- `GridHostContext` — shared shape (appId, userId, instanceId, storage, data, config managers)
- `defineStarGridPlugin` — plugin registration with `onMount`, `onReady`, `onThemeChanged`, `onMessage`
- `StarGridAppState` — persisted app state (profile, layout, theme, toolbar, settings)
- `StarGridAppOptions` — init config (appId, userId, host, storage, persistence mode, plugins)
- `StarGridPersistence` + `storageFactoryForPersistence` — pluggable persistence adapters

---

### 4.2 `@starui/widgets-react`

**Path:** `packages/react-core/widgets-react`
**Purpose:** MarketsUI React widgets — v2 blotter framework, hosted grid containers, data-provider editor.

**Public exports:**

- `.` — blotter components, hooks, provider, theme
- `./v2/markets-grid-container` — `MarketsGridContainer`
- `./v2/provider-editor` — `DataProviderEditor`
- `./v2/data-provider-selector` — `DataProviderSelector`
- `./hosted` — `HostedMarketsGrid` (legacy wrapper)

#### Blotter framework (v2)

- `BlotterProvider` — DI container for `IDataProvider`, actions, state
- `BlotterDependencies` — actions/data/state contract
- `useBlotterDI` — access injected dependencies
- `BlotterToolbar` — layout selector + bulk actions + custom buttons
- `LayoutSelector` — load/save/delete layouts
- `BlotterSlots` — extension points (header, toolbar, footer, etc.)

#### Data-provider container & editor

- `MarketsGridContainer` — grid + two-provider picker + mode toggle (`Alt+Shift+P` /
  grid-level provider persistence; provider pickers live in grid customizer → Custom Settings (`providerGridHost`)
- `MarketsGridContainer` — hub data via `useDataProvider` + `applyProviderToGrid` (no direct `client.subscribe` / cfg pass-through); optional `defaultLiveProviderId` for single-provider demos
- `applyProviderToGrid` — live-tick add/update split with pending-add dedup (`createApplyProviderToGridState`, `splitProviderRowsForGrid`); extracted from `MarketsGridContainer` for `IDataProvider.onTick` wiring
- `buildColumnDefs` — maps a provider's persisted `ColumnDefinition[]` to AG Grid `ColDef[]` for `MarketsGridContainer`. Per column: a `valueGetter` DSL expression compiles (once, cached) to a CSP-safe `@starui/engine` getter; a dotted `field` keeps the nested-path default getter (`getValueByPath`); a flat field stays on AG Grid's native path. Expression getters never throw — parse errors fall back to the field binding, runtime errors to the field value; a legitimate null result is preserved
- Custom Settings panel (`toolbar-date-settings` module) — four sections: Toolbar Date (historical date → AppData config), Data Provider (live/historical pickers, mode, as-of date) when `providerGridHost` is wired, Event Callbacks (event→handler bindings) when `gridEventBindingsHost` is wired, and Row Filter (row-exclusion expression). All settings are staged and applied only on the panel's explicit Save (Reset reverts); imperative actions (refresh/reload/edit) stay immediate
- Row exclusion (`toolbar-date-settings` module) — a multiline Monaco `ExpressionEditor` (free-text, column autocomplete, live valid/invalid feedback, one-click example chips + Clear) authors an EXCLUDE-when-true DSL predicate (column refs `[field]`, nested optional-chaining paths `[a.b.c]`, e.g. `[ccy] == "INR"`, `[active] == false`); keystrokes stage into the panel draft (applied on Save). `transformGridOptions` installs it as AG Grid's external filter (`isExternalFilterPresent` / `doesExternalFilterPass`) and the module's `activate` calls `api.onFilterChanged()` on cell edits, expression edits, and first ready. Rows are hidden, not removed — they reappear when the offending value changes; the callbacks read the live expression so they never go stale, and a parse/eval failure excludes nothing (`rowExclusionFilter.ts`, fails open)
- `ProviderEditorDialog` — modal hosting `DataProviderEditor`
- `DataProviderEditor` — connection + tabs (Connections, Fields, Columns, Diagnostics). Sidebar **Import** button creates a brand-new persisted provider from an exported JSON config (`configStore.save` mints a fresh `providerId`, owned by the current user — or `system` when the config is public), then selects and opens it for editing; footer **Export** button downloads the current working config — including unsaved edits — as JSON
- `providerConfigIo` — `exportProviderConfig` (downloads a `{ kind, version, exportedAt, provider }` envelope with `providerId`/`userId`/`isDefault` stripped so bundles are portable), `parseProviderConfigImport` (accepts the wrapped envelope or a bare provider object; validates `providerType`/`config`, defaults a missing name, re-strips identity), `toPortableProviderConfig`
- `DataProviderSelector` — compact provider dropdown with quick-add
- `useChordHotkey` — chord keybinding helper; `PROVIDER_TOOLBAR_TOGGLE_CHORDS`
  (`Alt+Shift+P`, `Meta+Shift+P`); matches letter keys via `event.code` for macOS
  Option remaps; listens in capture phase so focused AG-Grid cells cannot swallow
  the chord; `PROVIDER_TOOLBAR_TOGGLE_HINT` for docs/footers

#### Provider editor tabs

- `ConnectionTab` — connection string, auth, transport selection; "Test Connection" button (STOMP/REST) drives `useProviderProbe.test()`. STOMP runs a pure socket connect (`connectStomp` — handshake only, no subscribe/trigger/rows) and shows "Connected"; row-fetching transports (REST/mock) show "Connected — received N rows"
- `FieldsTab` — discover provider fields, map to columns, infer types
- `ColumnsTab` — derive AG Grid column defs from schema; collapsible Key Column + Add Custom Column panels and a scrollable body keep the columns table at a usable minimum height in short containers. A "Clear all columns" button (confirm dialog) wipes the column list and the now-stale key column in one action. Per-row ƒx button opens a Monaco `ExpressionEditor` (from `@starui/grid/customizer`) to author a column `valueGetter` DSL expression (column refs `[field]`, nested optional-chaining paths `[a.b.c]`, live-validated); persists onto `ColumnDefinition.valueGetter`, applied at runtime by `buildColumnDefs`
- `DiagnosticsTab` — probe, request/response logging, debug

#### Transport-specific editors

- `RestFields` — URL, headers, auth, body template
- `StompFields` — broker URL, login, subscribe topics, parsing
- `MockFields` — seed data, latency, mutation playback
- `AppDataFields` — read from `@starui/host-data` AppData
- `BehaviourFields` — per-transport behaviour knobs; STOMP: reconnect initial delay, realtime throttle (on/off switch + ms) + conflation (on/off switch + conflate-by-key), snapshot chunk size (all written to `cfg`, also settable in code)

#### Hosted integration (legacy)

- `HostedMarketsGrid` — hosted wrapper; accepts `platform` (hub bundle) or legacy `dataServices`; composes `MarketsGridContainer`. Opt-in `contextLink` prop wires grid-to-grid linking (see `useGridContextLink`)
- `useHostedView` — window identity & lifecycle
- `useHostedIdentity` — resolve current view identity
- `useFdc3Channel` — FDC3 channel subscription
- `useOpenFinChannel` — OpenFin IAB subscription
- `useIab` — generic Inter-App Bus pub/sub
- `useColorLinking` — workspace colour-linking membership (`{ color, linked }`); flat peer group, no parent/child
- `useGridContextLink` — grid-to-grid context linking over colored "Link" groups: publishes the selection and filters rows on peer selections. Two modes: `'rowId'` (default) broadcasts AG-Grid `getRowId` values (`node.id` = `composeRowId` over the provider key fields) and applies them as an external filter — no `rowIdField` config needed; `'fields'` broadcasts key-field values (or grouped colId + key) and applies a per-column set-filter. Pure helpers `buildRowIdContext` / `applyRowIdExternalFilter` / `buildSelectionContext` / `defaultGridLinkResolver` / `applyGridLinkContext` (`gridContextLink.ts`); `resolve` / `buildContext` overridable
- `useTabsHidden` — tab visibility detection
- `useWorkspaceSaveEvent` — workspace save callback
- `windowOptionsSubscription` — `window.options` reactivity
- `useAgGridTheme` — AG Grid theme resolution

#### Shared hooks

- `IBlotterDataProvider` — deprecated alias of `IDataProvider`
- `useBlotterDataConnection` — `IDataProvider` grid wiring (`onSnapshotData` / `onTick`); optional hub resolve via `useDataProvider`
- `useGridStateManager` — load/save grid state (cols, filter model, sort)

---

### 4.3 `@starui/widget-sdk`

**Path:** `packages/react-core/widget-sdk`
**Purpose:** Star Widget SDK — React extensibility over `@starui/widget`.

#### Widget host runtime

- `WidgetHost` — lifecycle + slot rendering provider
- `useWidgetHost` — access host instance + methods
- `WidgetRegistry` — lazy-load registry for component discovery
- `WidgetConfig` — id, name, icon, description, settings schema

#### Widget integration hooks

- `useWidget` — read config, context, props, send messages
- `useSettingsScreen` — declare settings UI
- `SettingsScreenDefinition` — declarative settings-form contract

#### Extensibility

- `SlotContent` — named-slot render function
- `WidgetEnhancer` — lifecycle-wrapping HOC
- `WidgetExtensionConfig` — extension config (target, slots, enhancers)
- `renderSlot` — render slot with context + children
- `createExtendedWidget` — HOC factory
- `compose` — enhancer composition helper

#### Config + layout persistence

- `createConfigClient` — factory for `ConfigClient` (delegates to `@starui/host-config`)
- `ConfigClient` — CRUD over app/user/role configs
- `getLayouts`, `saveLayout`, `loadLayout`, `deleteLayout`

---

### 4.4 `@starui/host-wrapper-react`

**Path:** `packages/react-core/host-wrapper-react`
**Purpose:** React seam (Seam #2) — bridges `RuntimePort` + `ConfigManager` into React context.

- `HostWrapper` — top-level component providing runtime, config, theme
- `HostContext` — React context (`runtime, configManager, instanceId, theme, onThemeChanged`)
- `useHost` — hook to read host context
- Reactive theme propagation from `RuntimePort`
- Lazy-init `ConfigClient` for app/user config CRUD
- `test-bridge` subpath — testing utilities for host-context mocking

---

### 4.5 `@starui/config-browser`

**Path:** `packages/react-core/config-browser`
**Purpose:** Configuration-browser dev tool — view/search/import/export configs.

**Public exports:**

- `.` — `ConfigBrowserPanel`, `useConfigBrowser`, types
- `./icons` — icon catalogue

#### Panels & dialogs

- `ConfigBrowserPanel` — master table UI with sidebar (AppConfig, UserProfile, Role, Blotter)
- `ConfigBrowser` — root container (toolbar, search, drawer, import/export)
- `Toolbar` — search bar, import, delete-all, export
- `DataGrid` — AG Grid table with inline editing
- `TableSidebar` — table selector, CRUD buttons, row counts
- `RowDrawer` — JSON/form editor with validation
- `DeleteAllDialog` — destructive-action confirmation
- `ImportPreviewDialog` — pre-apply import bundle preview

#### State, helpers, theming

- `useConfigBrowser` — table state, filters, mutations; `exportDeploy()` full deploy seed bundle (unfiltered `appConfig`) + validation via `@starui/host-config` `buildDeployExport()`
- `DeployExportPreviewDialog` — pre-download validation summary (errors block; warnings require acknowledge)
- `buildDeployExport()`, `validateDeployExport()`, `parseSeedJson()` (`@starui/host-config`) — deploy export includes every `appConfig` row (unfiltered read); normalize `appId` / `userId` drift; reject wrong `seed.json` shapes (e.g. `kind: starui.dataProvider`); emit `DeployExportWarning` codes (`MISSING_INSTANCE_ROW`, `EMPTY_PROFILE_STATE`, `UNREFERENCED_ROWS`, …)
- `readProfileSetPayload()` (`@starui/host-config`) — storage adapter reads profile-set bytes even when row `appId` drifted, so `gridLevelData` / profile saves do not wipe `profiles: []`; re-stamps correct scope on write
- `resolveDefaultPlatformScope()` / `resolveBootstrapManifestScope()` (`@starui/openfin-platform`) — `initWorkspace` and child-window `getConfigManager()` read manifest / `app-config.json` `appId` instead of hard-coded `TestApp`; `readHostEnv()` uses the same bootstrap before dev fallback; `migrateRegistryAppIdDrift()` relocates and deletes stale `component-registry::TestApp::system` rows
- `TABLES` — table enumeration
- `createConfigBrowserAction` — wire config browser as OpenFin context-menu action
- `agGridTheme` — AG Grid theme adapter
- `editorStyles` — inline styles for editors
- Format conversion, validation, clipboard helpers

---

### 4.6 `@starui/workspace-setup-react`

**Path:** `packages/react-core/workspace-setup-react`
**Purpose:** OpenFin workspace setup UI — dock config, registry, component picker.

#### Workspace shell

- `WorkspaceSetup` — 3-pane editor (Dock / Inspector / Components+Registry)
- `ImportConfig` — standalone import-config utility window
- `ComponentsPane` — browse registered components, drag to dock; per-row hover actions: configure (test-launch), **clone**, delete. Clone (`WorkspaceSetup.handleClone`) duplicates a registry entry into a fresh draft — deep-copies all definition fields, gives it a de-duplicated `(copy)` display name and a unique `componentSubType` (`<sub>-copy`) so its derived `${type}-${subtype}` id can't collide with the source on save, resets `id`/`configId` (re-derived at save), and selects it for immediate editing in the inspector
- `DockPane` — dock toolbar editor (buttons, folders, menus, icons, actions)
- `InspectorPane` — selected dock-item property editor
- `IconPicker` — themed icon selector with search

#### Dock editor state & icons

- `useDockEditor` — dock-config state manager
- `iconIdToSvgUrl` — icon id → data URL
- `parseIconUrl` — parse SVG/PNG/asset-library URLs
- `iconIdToThemedUrls` — dark/light icon URLs
- `ICON_OPTIONS`, `findIconByName`, `IconOption` — icon library + lookup

#### Registry editor

- `useRegistryEditor` — component-registry state manager
- Registry browser + property editor + config validation
- `RegistryEntry` — registered component instance metadata

---

## 5. Shared / Core

### 5.1 `@starui/shared-types` & `@starui/types`

**Paths:** `packages/shared/shared-types`, `packages/shared/types`
**Purpose:** Shared type contracts for StarGrid host ports and runtime. (Both packages mirror each other during the consolidation transition.)

#### Runtime constants

- `LOGGED_IN_USER_ID` (`'dev1'`)
- `THEME_STORAGE_KEY`, `THEME_BROADCAST_CHANNEL`
- `Theme` (`'light' | 'dark'`)
- `Unsubscribe` — cleanup function type

#### Identity

- `IdentitySnapshot` — `instanceId, appId, userId, componentType, componentSubType, isTemplate, singleton, roles, permissions, customData`
- `SurfaceKind` — `'popout' | 'modal' | 'inpage'`
- `SurfaceSpec` — window-creation spec
- `SurfaceHandle` — runtime window handle (close/focus/onClosed)

#### Persistence

- `ProfileSnapshot` — `id, gridId, name, state, createdAt, updatedAt`
- `AppDataLookup` — `(name, key) => unknown`
- `AppDataSnapshot` — revision counter + lookup

#### Row-path utilities

- `COMPOSITE_KEY_SEPARATOR`
- `composeRowId()` — join composite-key values
- `getPathAccessor()` / `getPathSetter()` — nested-field access
- `getValueByPath()` — extract value by dotted path
- `normalizeKeyColumns()` — standardise key column defs
- `__resetPathAccessorCaches()` — test reset

#### Re-exports

- DataProvider type contracts
- FieldSelector types
- Configuration types

---

### 5.2 `@starui/engine`

**Path:** `packages/shared/engine`
**Purpose:** Framework-agnostic vanilla TS grid runtime engine — store, event bus, expression engine, customizer logic.

#### Platform runtime

- `GridPlatform` — per-grid singleton (store, api, events, rows, resources, pipeline)
- `EventBus<T>` — typed pub-sub (`emit`, `on`, `off`)
- `ApiHub` — reactive `GridApi` (`attach`, `whenReady`, event subscriptions; `on` forwards the AG event object)
- `RowChangeBus` (`platform.rows`, type `RowChangeSignal`) — shared, timer-coalesced row-change emitter. Reads the exact changed nodes from AG `asyncTransactionsFlushed` and emits one `RowChange` (`added`/`updated`/`removed` deltas, or `full` for sort/filter/`setRowData`) per frame, so data-reactive modules (alerts, conditional-styling, filter counts) evaluate only changed rows instead of walking the whole grid on every streaming tick
- `ResourceScope` — `CssInjector` + `ExpressionEngine` + WeakMap caches
- `PipelineRunner` — cached transform pipeline for `colDef` + `gridOptions`
- `topoSortModules()` — topological module-dependency sort
- `CssInjector` — dynamic CSS injection
- `GridPlatformOptions` — `gridId, modules, rowIdField, appData`

#### Store & state

- `createGridStore()` — Zustand vanilla store factory
- `Store` — grid state container
- `startAutoSave()` — debounced persistence
- `AutoSaveHandle`, `AutoSaveOptions`

#### Persistence adapters

- `StorageAdapter` — profile CRUD interface
- `MemoryAdapter` — in-memory ephemeral storage
- `LocalStorageBundleAdapter` — localStorage JSON blobs (in-memory bundle
  cache keyed on the raw stored string: reads skip re-parsing unless the
  blob changed, so a profile save no longer re-parses the whole bundle twice)
- `createMarketsGridLocalStorageStorage()` — MarketsGrid-specific factory
- `RESERVED_DEFAULT_PROFILE_ID`
- `activeProfileKey()` — localStorage key generator

#### Profile manager

- `ProfileManager` — framework-agnostic profile orchestration
- `ProfileManagerState` — `activeId, profiles, isLoading, isDirty`
- `ProfileManagerOptions` — `platform, adapter, autoSave, activeIdSource`
- `ActiveIdSource` — pluggable active-profile pointer
- `ProfileMeta` — metadata
- `ExportedProfilePayload` — JSON export format; `schemaVersion: 2` bundles
  the grid-level data blob (provider selection, caption, event bindings)
  alongside the profile so an export/import is a complete grid-view
  snapshot. `import()` re-applies it via the adapter's `saveGridLevelData`
  and emits a `gridLevelData:imported` platform event; v1 files (no
  grid-level data) still import unchanged.

#### Security policy

- `configureExpressionPolicy()` — set CSP mode (`'strict' | 'permissive'`)
- `getExpressionPolicy()` — runtime policy lookup
- `ExpressionPolicy`, `ExpressionPolicyMode`
- `sanitizeExpressionFormatters()` — drop unsafe expression formatters

#### History (undo/redo)

- `HistoryStack` — vanilla undo/redo (module state snapshots)
- `HistoryStackOptions` — `maxSize`
- **Editing core** — `EditJournal`, `CellPatch`, `EditSource`, `buildPatchesFromTargets`,
  `applyForwardPatches`, `previewPatches`, `assertSingleColumnSelection`,
  `BuildNudgePatchesOptions` — cell-patch journal for row data edits (one user
  action = one undo step)
- **Smart edit** — `applyNumericOp`, `parseMagnitudeSuffix`, `collectTargetCells`,
  `applySmartEditColDefTransforms`, `deserializeSmartEditState`, `INITIAL_SMART_EDIT`
- **Data change history** — `DataChangeHistorySettings`, `recordSourceKey`,
  `deserializeDataChangeHistoryState`, `INITIAL_DATA_CHANGE_HISTORY` — profile
  settings for the edit-history module (session-only stacks; settings-only persistence)
- **Bulk update** — `BulkUpdateSettings`, `collectBulkUpdateTargets`,
  `buildBulkUpdatePatches`, `resolveColumnDistinctValues`, `parseBulkUpdateValue`,
  `deserializeBulkUpdateState`, `INITIAL_BULK_UPDATE` — replace-all-selected with one value
- **Plus / minus** — `buildNudgePatches`, `resolveNudgeForCell`,
  `applyPlusMinusColDefTransforms`, `deserializePlusMinusState`, `INITIAL_PLUS_MINUS`
- **Shortcuts** — `buildShortcutPatches`, `matchShortcutForCell`, `collectShortcutKeys`,
  `applyShortcutsColDefTransforms`, `deserializeShortcutsState`, `INITIAL_SHORTCUTS`
- **Visual Excel** — `buildVisualExcelStyles`, `applyFormatExcelClasses`,
  `formatExcelClassId`, `cssToExcelColor`, `cellStyleToExcelStyle`,
  `defaultVisualExcelFileName`, `deserializeVisualExcelState`, `INITIAL_VISUAL_EXCEL`

#### Expression engine

- `ExpressionEngine` — CSP-safe parser/evaluator. `parse()` memoizes the AST by
  source string (immutable ASTs shared across calls), so the per-cell/per-tick
  `parseAndEvaluate` hot path is a Map lookup, not a re-tokenize+re-parse
  (benchmarked ~7x faster for a conditional-styling-heavy frame: ~23ms → ~3ms)
- `tokenize()`, `parse()`, `Evaluator`
- `compile()` / `compileToFunction()` — compile an AST once into a reusable
  `(ctx) => value` closure (cached by source); `evalOps` holds the shared
  operator/resolution semantics both the interpreter and the compiler call, so
  the two paths are behaviourally identical (parity-tested). Prefer `compile()`
  at rule/column setup on hot paths (conditional-styling cell/row predicates use it)
- `tryCompileToAgString()` — transpile to AG Grid `valueFormatter` string
  (still the FIRST choice — zero per-cell JS; the closure is the fallback)
- `ExpressionNode`, `EvaluationContext`, `ValidationResult`, `FunctionDefinition`
- `migrateExpressionSyntax()` — legacy migration
- Conditional sugar (both desugar to short-circuiting ternaries at parse time, so
  they compose with everything and the `IF`/`IFS`/`SWITCH`/`CASE(...)` functions
  still work): SQL-style `CASE WHEN cond THEN result [WHEN …] [ELSE e] END` and
  JS-style `if (cond) { [return] expr } [else if (…) {…}] [else {…}]` (single-value
  blocks, optional `return`/`;`). Contextual keywords (`WHEN`/`THEN`/`ELSE`/`END`/
  `RETURN`) are case-insensitive and only reserved inside these forms; legacy
  `{col}` refs and column names like `[end]` are unaffected

#### Column-def helpers

- `valueFormatterFromTemplate()` — conditional formatting from template
- `excelFormatter()` — Excel-style numeric formatting
- `excelFormatColorResolver()` — conditional cell background colours
- `isValidExcelFormat()` — Excel format-string validation
- `tickFormatter()` — tick-mark formatting
- `presetToExcelFormat()` — preset id → Excel format
- `cellStyleToAgStyle()` — themed style → AG Grid style
- `getActiveTheme()`, `mergeThemedStyle()`, `migrateThemedStyle()`
- `patchActiveStyle()`, `resolveActiveStyle()` (own-slot read, divergence-only)
- `resolveEffectiveStyle()` — render-time fold: dark renders its own slot;
  light inherits the dark slot and overrides it per-leaf
- `mergeCellStyleOverrides()` — per-leaf `CellStyleOverrides` merge (top wins;
  borders per-side), shared by template resolution + dark→light inheritance
- `nestedField()` — nested-field accessor
- `defaultNullSafeComparator()` — null-safe sort comparator
- `ColumnAssignment`, `CellStyleOverrides`, `ThemedCellStyleOverrides`
- `ValueFormatterTemplate`, `PresetId`, `TickToken`

#### Style editor model

- `StyleEditorValue`, `StyleEditorSection`, `StyleEditorVariant`
- `StyleEditorDataType` — data-type-aware styling
- `TextAlign`, `FontWeight`

#### Customizer module logic

- **Calculated columns:** `buildVirtualColDef`, `getAllRowsSnapshot`, `invalidateAllRowsCache`
- **Column customization:** `applyAssignments`, `reinjectCSS`, `cssEscapeColId`, `applyFilterConfigToColDef`, `applyRowGroupingConfigToColDef`
- **Column groups:** `composeGroups`, `collectGroupIds`, `collectAssignedColIds`, `groupHeaderBorderOverlayCSS`, `groupHeaderStyleToCSS`
- **Column templates:** `resolveTemplates`, snapshot/restore
- **Conditional styling:** `toStyleEditorValue`, `fromStyleEditorValue`, `INDICATOR_ICONS`
- **General settings, grid state:** serialize/deserialize helpers

#### Filter toolbar logic

- `makeId()` — filter-id generator
- `generateLabel()` — humanise filter condition
- `formatFilterModel()` — AG Grid filter-model formatter
- `doesValueMatchFilter()`, `doesRowMatchFilterModel()` — predicate testing
- `filterModelsEqual()` — comparison
- `mergeFilterModels()`, `subtractFilterModel()` — set operations
- `isNewFilter()` — new-filter detection
- `SavedFilterShape` — persistence format

#### Shared CSS/column types

- `CellStyleProperties` — CSS property whitelist
- `ThemeAwareStyle` — dark/light variants
- `injectEditorStyles()` — editor CSS injection

---

### 5.3 `@starui/host`

**Path:** `packages/shared/host`
**Purpose:** Host port interfaces and `GridHostContext` factory.

- `RuntimePort` — theme, surface management, identity broadcast
- `StoragePort`, `StoragePortFactory` — profile persistence backend
- `DataPort` — data provider integration
- `ConfigPort` — app configuration service
- `createGridHostContext()` — factory
- `buildGridHostContext()` — compose from ports
- `GridHostContext` — unified host API
- `GridHostScope` — per-grid scope
- `GridHostContextOptions` — init options
- `storageFactoryForPersistence()` — adapt `StoragePort` to `ProfileManager`
- `defineStarGridPlugin()` — declare a host plugin
- `StarGridPlugin` — plugin interface (`activate`, module exports)

---

### 5.4 `@starui/host-browser`

**Path:** `packages/shared/host-browser`
**Purpose:** Browser `RuntimePort` implementation.

- `BrowserRuntime` — browser-based `RuntimePort` (theme, surface, identity)
- `BrowserRuntimeOptions` — `window` target, broadcast channel
- `resolveBrowserIdentity()` — read identity from URL/attributes
- `IdentityOverrides` — override identity values

---

### 5.5 `@starui/widget`

**Path:** `packages/shared/widget`
**Purpose:** Framework-agnostic widget contract.

- `PlatformAdapter` — abstract widget platform adapter
- `ParentIdentity` — parent-window identity
- `WidgetConfig` — id, type, props
- `WidgetProps` — runtime widget props
- `WidgetContext` — widget execution context
- `SettingsScreenContext`, `SettingsScreenDefinition` — settings UI contract
- `ActionContext` — action handler context
- Layout persistence: `getLayouts`, `saveLayout`, `loadLayout`, `deleteLayout`

---

### 5.6 `@starui/widget-browser`

**Path:** `packages/shared/widget-browser`
**Purpose:** Browser `PlatformAdapter` implementation.

- `BrowserAdapter` — DOM + localStorage + postMessage-based adapter

---

## 6. Data Utilities

### 6.1 `@starui/host-config`

**Path:** `packages/data/host-config`
**Purpose:** Dual-mode configuration service — Dexie/IndexedDB local store with optional REST backend sync. Backs all profile, role, permission, and app-config persistence.

#### Configuration client

- `createConfigClient()` — factory choosing `LocalConfigClient` (Dexie) or `RestConfigClient` (HTTP) by `baseUrl`
- `ConfigClient` — single interface for both backends
- `LocalConfigClient` — Dexie-only persistence
- `RestConfigClient` — HTTP backend with Dexie cache + offline queue
- Seed-data JSON loading for first-run init
- `ConfigFilter`, `PageOptions`, `PaginatedResult` — query API
- `CreateConfigInput`, `UpsertConfigInput`, `UpdateConfigOptions` — mutation API
- `BulkUpdateEntry`, `BulkDeleteResult` — batch operations
- `HealthStatus` — backend health check

#### ConfigManager (deprecated lower-level API)

- CRUD for 6 tables: `appConfig`, `appRegistry`, `userProfile`, `roles`, `permissions`, `pendingSync`
- `getConfigsByComponentTypesUnfiltered(types)` — fetch only the given `componentType`s via the `[componentType+componentSubType]` index (O(matching) not O(all rows)). Used by the data-provider / AppData stores so listing providers reads only provider rows instead of materialising every grid profile in `appConfig`
- Dev mode (default) — all data in Dexie/IndexedDB
- REST mode — writes sync to backend with Dexie as local cache
- Failed REST writes → `PENDING_SYNC` table, auto-retry every 10 s (max 10 retries)
- Impersonation via `setImpersonatedUser()` for admin previews
- `ApplicationContext` tracking signed-in vs impersonated user
- `getEffectiveUser()` — single source of truth for effective identity

#### CRUD breadth

- Single: `create`, `get`, `update`, `upsert`, `delete`
- Bulk: `bulkCreate`, `bulkUpdate`, `bulkDelete`
- Query: `queryConfigs`, `queryConfigsPaginated`
- Specialised lookups: `findByCompositeKey`, `findByAppId`, `findByUserId`, `findByComponentType`, `cloneConfig`

#### Auth tables

- `AppRegistryOps` — registered apps (CRUD + list)
- `UserProfileOps` — user ↔ app ↔ role mappings
- `RoleOps` — role definitions
- `PermissionOps` — fine-grained permissions (+ `listByCategory`, `getForUser`, `checkForUser`)

#### Visibility & access control

- `isVisible()` — pure predicate for visibility rules
- `VisibilityContext` — evaluation context (roles, permissions, impersonation)
- `getEffectiveUser()` — impersonation-aware identity resolver

#### MarketsGrid profile storage

- `createConfigServiceStorage()` — `StorageAdapter` factory for `MarketsGrid` profile sync
  (per-scope in-memory cache of the raw `AppConfigRow`: collapses a save's redundant
  `getConfig` reads to one, fed into the shared helpers; invalidated on every local write
  and on `subscribeToChanges` notifications so cross-tab writes never serve a stale row)
- `migrateProfilesToConfigService()` — one-shot legacy migration
- Bundling: one `AppConfigRow` per `(appId, userId, instanceId)` with all profiles in payload
- `loadProfileSet()` / `saveProfileSet()` accept an optional pre-fetched-row box so a
  caller holding the row (the adapter cache) can skip a redundant `getConfig`
- `MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE`
- `CONFIG_SERVICE_ADAPTER_BRAND` + `getConfigServiceAdapterBrand()` — adapter detection
- `ProfileStorageFactory`, `ProfileStorageFactoryOpts`
- `RegisteredComponentIdentity`

#### Profile-state consolidation

- `ConfigManager.profiles` namespace — first-class profile-set API
- `ProfilesNamespace` — reactive `subscribe()` via `BroadcastChannel`
- `ProfilesSaveOptions` — durable save options
- `ProfileSetVersionConflictError` — version-conflict detection
- `migrateLegacyProfilesIfNeeded()` — migrate from old Dexie DB
- `PROFILE_MIGRATION_V1_FLAG`, `LEGACY_PROFILES_DB_NAME`

#### Data layer

- `SeedData` — first-run seed shape; optional `appConfig[]` lets a Config
  Browser "Export ALL" bundle serve as a full-restore `seed.json` (data
  providers, component registry, dock, workspaces, profile-sets).
  `normalizeSeedData()` re-stamps mismatched `appConfig[].appId` / `userId`
  (and `userProfiles[].appId`) to match `appRegistry` / `userProfiles` before
  `seedIfEmpty()` writes (fixes stale exports such as `TestApp` / `dev1`
  against a `star-demo` / `k151344` deployment). `ConfigManager.saveConfig()`
  enforces the same deployment `appId` / seeded `identity.userId` on every
  runtime write (global catalogue rows keep `userId: system`). `seedIfEmpty()` runs only
  on an empty DB (gated on appRegistry **or** appConfig count) so it never
  clobbers a bootstrapped app.
- `ConfigDatabase` — Dexie wrapper with schema versioning
- Compound indexes: `[componentType+componentSubType]`, `[userId+appId]`
- v1→v2 unified schema migration (`config→payload`, `createdAt→creationTime`, `updatedAt→updatedTime`)
- Cross-window sync via Dexie's IndexedDB locking
- `ChangeNotifier` — cross-tab BroadcastChannel event bus

#### Error & concurrency

- `ConfigNotFoundError`, `ConfigClientHttpError`, `OptimisticLockError`
- Optimistic concurrency control (`If-Match` / `expectedUpdatedTime`)
- `PendingSyncRow` — failed-write retry tracking

#### Adapters & utilities

- `createConfigPort()` — `ConfigClient` → `StoragePort` adapter
- `ConfigPortOptions`
- `CONFIG_BROWSER_TABLES`, `TABLES` — config-browser metadata
- `ConfigBrowserTableKey`, `ConfigBrowserTableMeta`

---

### 6.2 `@starui/host-data`

**Path:** `packages/data/host-data`
**Purpose:** SharedWorker-backed data services — real-time provider orchestration, connection management, stream subscriptions, AppData.

**Public exports:**

- `.` — runtime types + probes
- `./runtime` — protocol types + main-thread helpers
- `./runtime/client` — `SharedWorkerDataServicesClient`
- `./runtime/sharedWorker` — `installSharedWorkerHub`, `SharedWorkerDataServicesHub`
- `./runtime/worker/defaultEntry` — default worker entry
- `./assets/data-services-worker.mjs` — bundled worker asset

#### Runtime architecture

- `SharedWorkerDataServicesClient` — main-thread client routing events to listeners; catalog RPC (`waitForCatalogReady`, `getProviderConfig`, `listProviderConfigs`, `invalidateConfig`, `getHubIntrospect`); **Deprecated.** passing `cfg` on `attach` / `subscribe` for catalogued providers — use cfg-free attach
- `SharedWorkerDataServicesHub` — worker state machine (providers, cache, fan-out); **`hydrateCatalog()`** preloads `ConfigCatalogCache` after ConfigManager init; **`buildIntrospectSnapshot()`** / `hub-introspect` RPC for live provider + AppData diagnostics
- `ConfigCatalogCache` — worker-side in-memory data-provider catalog (`loadAll`, `get`, `getProviderConfig`, `list`, `invalidate`, `upsert`); used by hub before cfg-free attach (Phase 1)
- `DataProviderConfigStore` / `AppDataConfigStore` — persist provider rows with `ConfigManager.getAppId()` (no hard-coded `TestApp`); re-stamps `appId` on every save so drifted rows realign to the deployment scope
- `AppDataMirror` — synchronous main-thread view of AppData
- `WorkerAppDataStore` — worker-side IndexedDB persistence

#### Provider primitives

- `IDataProvider` — uniform client contract (`start` / `stop` / `refresh` / `restart`, sync getters, event registrars); types + `ProviderClientAdapter` hub adapter (Phase 3)
- `IDataProviderFactory` — `getProvider(providerId)` factory surface
- `ProviderClientAdapter` — client-side `IDataProvider`; cfg-free subscribe, `SnapshotReassembler` snapshot assembly, `getProvider()` on hub bundle
- `resolveProviderCapabilities()` — transport capability flags for STOMP / REST / mock / appdata
- `DataServicesHubBundle` / `ResolvedDataServicesHubBundle` — hub bundle from `ensurePlatformReady` / `ensureDataServicesHub` (`ready` = AppData + catalog, `stopProvider`, `dispose`, legacy client handles)
- `ProviderCapabilities` — streaming / realtime / refresh / restart flags per transport
- `ProviderHandle` — `stop()` + `restart()` lifecycle
- `ProviderEmit` — callback for rows / status / byte-size / rowsReceived events
- `ProviderEmitEvent` — structured event union (`rows`, `status`, `byteSize`, `rowsReceived`)
- `registerProvider()` — runtime/test factory registration

#### Transports

- **STOMP** (`startStomp()`)
  - WebSocket via `@stomp/stompjs`
  - Worker-side `{{name.key}}` resolution on every connect/restart via `appDataLookup` (SharedWorker AppData mirror); `restart({ asOfDate })` overlay **wins** for historical date keys (`asOfDate`, `position-asofdate`) so toolbar reload is deterministic
  - Fail-closed gates before broker wire: `assertAppDataResolved()` on full resolved cfg; `validateStompWireReady()` on subscribe/publish destinations + `requestBody` (no `{{...}}` downstream); `validateStompPathContract()` rejects historical listeners paired with live-style `/rate/batch` triggers
  - Unresolved `{{...}}` or invalid wire paths → `status: error` (no subscribe/publish; no silent infinite loading)
  - Snapshot phase → `snapshotEndToken` → buffered `{ rowsReceived }` progress, then chunked cache replace
  - Live phase → keyed deltas via `applyTransactionAsync`
  - Snapshot flush chunking (`cfg.snapshotChunkSize`, default `SNAPSHOT_CHUNK_SIZE = 500`) to stay under 50 ms long-task budget — configurable in code or the provider editor
  - Live conflation + trailing-edge throttle (`cfg.throttleMs` window; `cfg.conflateByKey` upsert key, defaults to `keyColumn`) via `bufferedDispatch()` — coalesces same-key ticks in the worker before fanout; `throttleMs` unset = immediate passthrough; probe path bypasses it. Two explicit master switches (default ON): `cfg.throttleEnabled: false` fans out every delta immediately while keeping the `throttleMs` value; `cfg.conflateEnabled: false` disables conflation even when `keyColumn` could supply a key (the off-switch the `?? keyColumn` fallback otherwise prevented)
  - Restart overlay (`extra`) for historical `asOfDate`
  - `connectStomp()` — pure socket connection test for the editor's "Test Connection" button: opens the WebSocket + STOMP session and resolves on the broker handshake (`onConnect`) without subscribing, publishing a trigger, or waiting for rows (`reconnectDelay: 0` so a failed test fails fast)
  - `probeStomp()` — one-shot data probe (subscribe + trigger + collect up to `maxRows`); backs the editor's Infer Fields flow, which needs real rows to sample
- **REST** (`startRest()`)
  - One-shot HTTP (GET/POST), snapshot-only — no live tail after `ready` (IDataProvider: no `onTick`)
  - Restart overlay merged into POST body
  - `probeRest()` — one-shot probe for editor flows
- **Mock** (`startMock()`)
  - Synthetic data with tunable row count + emit rate
  - `probeMock()` — one-shot probe

#### Stream subscription

- Two-phase: snapshot promise + `onUpdate`/`onReset`/`onStatus`/`onRowsReceived`/`onSnapshotCommit`
- `SnapshotReassembler` — client-side chunk assembly (head `replace: true` + tail `replace: false` → full snapshot on loading→ready; `onRowsReceived` progress; post-settle `onReset` / live `onTick`)
- Late-joiner: immediate cache replay + current status on attach
- Restart attach (`attach.extra`): posts `loading` only — skips stale cache replay so reload/restart waits for the fresh upstream snapshot
- `onSnapshotCommit` — fires on every loading→ready assembly (initial + hub restarts on an existing subId)
- `LATE_JOIN_CHUNK_SIZE = 500` chunking for popouts
- Buffering between snapshot-resolve and update registration
- Lazy provider create on first attach, reuse on subsequent attaches
- `refresh-provider` RPC — replay hub cache to one subscriber without upstream I/O; `SubscribeHandle.refresh()` / `IDataProvider.refresh()`
- `attach.extra` → `restart(extra)` on running provider; when the attach also carries `cfg` (editor Restart button), the slot is **rebuilt from the new cfg** (`recreateProvider`) so the reconnect picks up edited connection/column/behaviour settings instead of the stale config the slot was created with
- `stop` keeps a provider's **stats listeners** registered (pushes one zeroed snapshot, doesn't drop the subscription) so the diagnostics pane survives a Stop and resumes automatically on the next Restart

#### Wire protocol (v2)

- Client→worker requests: `AttachRequest`, `DetachRequest`, `StopRequest`, `HubReadyRequest`, `GetConfigRequest`, `ListConfigsRequest`, `ConfigInvalidateRequest`, `RefreshProviderRequest`, `HubIntrospectRequest`, `AppDataRequest` (attach/detach/set/upsert/remove); `AttachRequest.cfg` optional when `providerId` is in worker catalog
- Worker→client catalog events: `catalog-ready`, `config-snapshot` (responses for hub-ready/get/list/invalidate/hub-introspect)
- Worker→client events: deltas (`{ rows, replace? }`), status, `rows-received` (upstream snapshot buffer progress), byte-size, stats, AppData (snapshot/delta/ack)

#### Statistics

- `ProviderStats` — `rowCount, byteCount, msgCount, msgPerSec, publishPerSec, publishPerMin, snapshotFetchMs, subscriberCount, startedAt, lastMessageAt, errorCount, lastError`
- 1 Hz sampler with 5 s upstream + 60 s publish windows
- Self-disabling when no stats listeners
- Per-provider cache (`Map<rowKey, row>` keyed by `cfg.keyColumn`)
- keyColumn-mismatch diagnostics: rows whose `composeRowId(row, cfg.keyColumn)` resolves null (name/case mismatch, e.g. `POSITIONID` vs `positionId`) are dropped from the cache + fan-out; the hub now warns once per (re)start cycle in the SharedWorker console (naming the key + sample row fields) and exposes `keyDropCount` on the `hub-introspect` row so "provider fetched data but the grid is empty" is no longer silent

#### AppData system


- `AppDataRow` — `configId, name, description, isPublic, values, userId`
- `AppDataMirror`:
  - Synchronous `get(name, key)`
  - Async `set`, `upsertConfig`, `remove` (post to hub)
  - Two-index tracking (`byConfigId`, `byName`)
  - Pending-ack handler for durability
  - `ready()` promise + `subscribe()` reactivity
- Worker is sole IndexedDB writer
- `SharedWorkerDataServicesHub.resyncAppDataFromStore()` — reload AppData provider rows from IndexedDB on mirror re-attach and after catalog `config-invalidate` (AppData editor saves)

#### Template resolution

- `{{name.key}}` — AppData token substitution (React `useResolvedCfg` for column defs; worker `startProvider({ appDataLookup })` + STOMP `onConnect` for wire destinations)
- `findUnresolvedAppDataTokens()` / `assertAppDataResolved()` — scan cfg for remaining `{{name.key}}` tokens; non-STOMP providers throw at `startProvider` when lookup is wired; STOMP fails on connect before wire
- `validateStompWireReady()` / `validateStompPathContract()` — STOMP subscribe/publish + historical vs live path contract (mirrors `stomp-view-server` wire rules)
- `[identifier]` — session-unique bracket tokens (worker-side)
- `resolveBracketCfg()` — per-attach cache so same token reuses same value
- `traceStompProviderCfg()` / `traceStompWireDestinations()` — opt-in console audit (`globalThis.__STARUI_TEMPLATE_TRACE__ = true`)

#### Platform bootstrap (Phase 0.5)

- `PlatformBootstrapConfig` — unified `appId`, `userId`, REST/seed URLs from manifest or `app-config.json`
- `validatePlatformBootstrapConfig()` — require non-empty identity; warn when `useRest` without REST URL
- `DEV_PLATFORM_BOOTSTRAP` — shared test/dev fallback (`TestApp` / `dev1`)
- `resolvePlatformBootstrapFromJson()` — fetch `/app-config.json` for web apps
- `resolvePlatformBootstrapFromObject()` — parse inline/test bootstrap objects
- `PlatformBootstrapConfigError` — validation / fetch failures
- `ensurePlatformReady()` — ConfigManager init + SharedWorker hub bootstrap (singleton per `appId`)
- `ensureDataServicesHub()` — lazy per-`appId` hub singleton; `createDataServicesWorker` + `bootstrapDataServices` + catalog preload (`waitForCatalogReady`); returns `ResolvedDataServicesHubBundle`
- `ResolvedDataServicesHubBundle` — hub bundle + legacy `client` / `appData` / `configManager` handles

#### Bootstrap

- `bootstrapDataServices()` — coordinate client + worker
- `createDataServicesClient()`, `createDataServicesWorker()`
- `bootstrapWithWorkerAsset()` — load bundled worker
- `createDataPort()` — `DataPort` factory for app startup

#### DataProvider configuration service

- `DataProviderConfigService` — CRUD wrapper for DataProvider configs
- REST mode (default) — UnifiedConfig REST API
- Local mode — routes through injected `DataProviderLocalBackend` (e.g., `ConfigManager`)
- `DataProviderLocalBackend` — `upsert`, `delete`, `getById`, `listByUser`
- Mapping: `DataProviderConfig` ↔ `UnifiedConfig` with `componentType='data-provider'`
- `configure(apiBase)`, `configureLocal(backend)`, `expectLocalBackend()`

#### Inference

- `inferFields()` — schema inference from row sample
- `InferOptions` — inference behaviour controls
- Used by editor Test-Connection / Infer-Fields flows

---

### 6.3 `@starui/host-data-react`

**Path:** `packages/data/host-data-react`
**Purpose:** React bindings for `@starui/host-data` — provider + focused hooks for data subscriptions.

- `DataHubProvider` / `PlatformProvider` — hub-first provider; `platform` from `ensurePlatformReady()` or self-bootstrap via `bootstrapConfig` + `workerScriptUrl`; optional `hubInspector` mounts **Alt+Shift+S** dev drawer (default on in development)
- `DataServicesProvider` — legacy wrapper over `DataServices` bootstrap result; exposes `appId` + `userId` React context
- `usePlatformIdentityOrNull()` — read bootstrap `appId`/`userId` from `DataHubProvider` / `DataServicesProvider`

- `DataServicesProvider` — `configStore` calls `client.invalidateConfig()` after editor `save`/`remove`

**Public exports:** `.`, `./runtime`

#### Provider

- `DataServicesProvider` — context wrapper
- Lazy mode (default) — children render with `loaded:false` first
- Eager mode — suspend until `services.ready` resolves
- `userId` override for AppData ownership

#### AppData hooks

- `useAppDataStore()` — reactive snapshot + version counter
- `useAppData(providerName)` — scoped per-provider view, `get/set/setMany`

#### DataProvider config hooks

- `useDataProviderConfig(providerId)` — single config lookup
- `useDataProvidersList(opts?)` — list user + public configs (`subtype`, `includeAppData`, `refresh()`)

#### Stream & template hooks

- `useResolvedCfg(cfg)` — apply `{{name.key}}` templates, returns stable cfg
- `useProviderStream(providerId, cfg, listener, opts?)` — auto-detaching subscription **Deprecated.** use `useDataProvider` for catalogued providers; keep cfg only for unsaved editor drafts
  - Listener: `onDelta(rows, replace)`, `onStatus(status, error)`
  - `refresh(extra)` re-attaches with overlay

#### Statistics hook

- `useProviderStats(providerId, listener)` — 1 Hz stats with auto-detach

#### Hub inspector (dev)

- `HubInspectorDrawer` / `HubInspectorHost` — shadcn drawer listing running + idle catalog providers (display name + id, status, subscribers, cache row counts, expandable worker-loaded `cfg` JSON) and AppData rows (expandable `values`); polls `getHubIntrospect()` while open
- `useChordHotkey` — minimal chord listener for Alt+Shift+S toggle

#### Escape hatch

- `useDataServices()` — raw access to `client`, `appData`, `configStore`

#### Types & re-exports

- `AppDataView`, `AppDataHandle`, `DataProviderConfigView`, `DataProvidersListView`, `ProviderStreamHandle`
- Re-exports of `DataListener`, `StatsListener`, `AttachOpts`, `SubId`, client, stats, status, `HubIntrospectSnapshot`

#### Bootstrap helper

- `createAppDataServices()` — simplified factory
- `CreateAppDataServicesOpts`

---

### 6.4 `@starui/host-data-angular`

**Path:** `packages/data/host-data-angular`
**Status:** **Scaffold.** Angular twin of `host-data-react` — implementation deferred. Exposes the marker `HOST_DATA_ANGULAR_SCAFFOLD = true`.

---

## 7. OpenFin Utils

### 7.1 `@starui/host-openfin`

**Path:** `packages/openfin/host-openfin`
**Purpose:** OpenFin `RuntimePort` plugin (Seam #1) — only this package may import `@openfin/core`.

#### Runtime integration

- `OpenFinRuntime` — `RuntimePort` wrapping `fin.*` APIs (window, view, app identity, messaging)
- `OpenFinRuntimeOptions` — parent window name, container name, custom settings
- `resolveOpenFinIdentity()` — current window/view identity (name, uuid, instance id)
- `isOpenFin` — environment detection boolean
- `getCurrentView()` — current view/window reference
- `OpenFinIdentitySources` — identity priority (localStorage → URL → window name → defaults)

#### Popout lifecycle

- `openFinWindowOpener` — popout factory (formatting toolbar, providers editor, help)
- `popoutWindow` — `window.open` bridge spanning browser + OpenFin
- `popoutLifecycle` — popout position, sizing, close-on-parent-close
- `isOpenFinWindow` — OpenFin window type guard

#### Window options subscription

- `subscribeWindowOptions` — listen for `fin.me.getWindowOptions()` changes
- `windowOptionsSubscription` — reactive subscription manager

---

### 7.2 `@starui/openfin-platform`

**Path:** `packages/openfin/openfin-platform`
**Purpose:** OpenFin workspace shell — dock, home, notifications, child windows, config import/export.

**Public exports:**

- `.` — main platform API (workspace init, config, dock, launch)
- `./config` — config-only entry (no runtime deps, browser-safe)
- `./plugin` — plugin interface + lifecycle
- `./test-bridge` — test utilities
- `./dock-editor` — dock editor UI components + state

#### Workspace initialization

- `initWorkspace()` — bootstrap dock + home + context menu + notifications. `WorkspaceConfig.dock.excludeTools?: string[]` hides built-in Tools-menu items by action ID (e.g. `[ACTION_EXPORT_CONFIG, ACTION_IMPORT_CONFIG]`); applies to both dock2 and dock3, default shows all.
- `WorkspacePlatformOverrideCallback` — workspace lifecycle hooks
- `workspace.options` — platform settings (name, icon, theme, notifications, dock)
- `workspacePersistence` — save/load workspace (pinned windows, dock, layouts)
- `workspaceGc` — cleanup stale view/window instances

#### Launch

- `launchApp()` — launch registered app by id (config overrides supported)
- `launchRegisteredComponent()` — create registered-component instance in new view
- `LaunchRegisteredComponentOptions` — instance config (layout, properties, parent)

#### Dock management

- `updateDockButtons()` — add/remove/reorder dock items
- `getDefaultEditorConfig()` — default dock editor config
- `recolorDockIcons()` — theme-aware icon recolour
- `shutdownDock()` — graceful dock teardown
- `setExcludedDockTools(actionIds?)` — hide built-in Tools-menu items by action ID (normally driven via `initWorkspace({ dock: { excludeTools } })`)
- `ACTION_EXPORT_CONFIG` / `ACTION_IMPORT_CONFIG` — Tools-menu action IDs (pass to `dock.excludeTools` to hide Export/Import Config)
- Dock button types: action, dropdown, folder
- `DockEditorConfig`, `DockButtonConfig`, `DockActionButtonConfig`, `DockDropdownButtonConfig`, `DockMenuItemConfig`
- Top-level dropdowns render on the dock bar as icon-bearing folders (dock3 path) — `toDock3Favorites` emits each `DropdownButton` (and the system "Tools" group) as a `DockEntry` folder with its icon, linked by id to the matching content-menu folder that owns the children. Works around OpenFin's `ContentMenuEntry` folder shape having no icon field; the dock-bar `DockEntry` folder does.
- Dock implementation toggle — `customSettings.dockVersion: "dock2" | "dock3"` (default `"dock2"`). `"dock2"` uses the classic `Dock.register` API: top-level DropdownButtons render directly on the dock bar as icon dropdowns whose options carry icons, with a normal flyout (no two-column content menu). `"dock3"` uses `Dock.init` with the content-menu/favorites model. Both read the same dock config; only the registration + rendering differ. Classic button clicks dispatch through the same `buildCustomActions` platform actions (including the theme toggle).
- `toDock2Buttons` / `toDock2Option` — convert `DockEditorConfig` to classic `Dock2Button[]` (action buttons + nested icon dropdowns), theme-resolved.

#### Inter-App Bus topics

- `IAB_DOCK_CONFIG_UPDATE`
- `IAB_RELOAD_AFTER_IMPORT`
- `IAB_THEME_CHANGED`
- `IAB_REGISTRY_CONFIG_UPDATE`
- `ACTION_OPEN_REGISTRY_EDITOR`
- `ACTION_OPEN_CONFIG_BROWSER`
- `ACTION_LAUNCH_COMPONENT`
- `ACTION_RENAME_VIEW_TAB`

#### Persistence (config service backed)

- `saveDockConfig` / `loadDockConfig` / `clearDockConfig`
- `saveRegistryConfig` / `loadRegistryConfig` / `clearRegistryConfig`
- `getConfigManager` — resolve `ConfigClient` for current scope
- `setConfigManager` — override `ConfigClient`
- `setPlatformDefaultScope` — set default `(appId, userId)` scope
- `migrateLegacyPlatformScope` — v1 → v2 scope migration
- `realignAllConfigsToPlatformScope` — batch-realign configs

#### Config import/export

- `importConfigBundle()` — multi-table bundle import (AppConfig, UserProfile, Role, Blotter, Dock)
- `ImportBundle` — bundle shape
- `ImportMode` — replace | merge
- Validation, conflict detection, batch commit

#### Registry

- `RegistryEditorConfig` — registered-component list with instance configs
- `RegistryEntry` — `id, componentId, name, properties`
- `deriveTemplateConfigId`, `mintRegisteredInstanceId` — id generators
- `validateEntry` — runtime config validation
- `validateSingletonUniqueness` — duplicate detection
- `ValidationError` — reporting

#### Migration

- `migrateRegistryToV2` — v1 → v2 schema migration
- `RegistryEntryV1`, `RegistryEditorConfigV1`
- `readHostEnv` — read host env (`USER_ID`, `APP_ID`, `ROLE`, …)
- `isHostEnvMissing`
- `DEFAULT_USER_ID`

#### Configuration types

- `AppConfigRow` — `id, name, icon, url, launch settings`
- `UserProfileRow` — `id, theme, layout, toolbar visibility`
- `RoleRow` — `id, name, permissions`
- `WorkspaceConfig` — workspace metadata
- `PlatformSettings` — dock position, home visibility, notifications
- `CustomSettings` — per-app key/value

#### Manifest / host URL

- `manifestConfig` — OpenFin manifest (app, runtime, preload)
- `resolveRestUrl()` / `getConfigServiceRestUrlFromManifest()` — REST mode gate from `customSettings`
- `resolvePlatformBootstrapFromManifest()` — full `PlatformBootstrapConfig` from manifest (`./config` export)
- `resolvePlatformBootstrapFromCustomSettings()` — pure mapper for tests
- `CustomSettings.appId` / `CustomSettings.userId` — deployment identity fields
- `resolveHostUrl()` — environment-aware host URL (dev/staging/prod)

#### Home (launcher)

- `home.ts` — Home integration (search, favourites, recent apps)
- `homeResults` — custom search-provider results

#### Notifications

- OpenFin notifications API integration (toast + notification center)

#### Child windows

- `openChildToolWindow` — config-browser / workspace-setup in child; windows are inspectable (`contextMenuSettings: { enable, devtools, reload }` → right-click Inspect / Reload)
- `openDataProvidersToolWindow` — provider selector child window

#### Context menu / custom actions

- `injectRenameMenuItem` — inject "Save Tab As…" into context menu
- `createRenameViewTabAction` — tab-rename handler
- `ACTION_RENAME_VIEW_TAB`
- `RENAME_VIEW_TAB_WINDOW_NAME`

#### Dock editor UI (subpath `./dock-editor`)

- `dockEditor/iconUtils` — SVG → data URL, theming
- `dockEditor/icons` — icon library (SVG, metadata, categories)
- `dockEditor/index` — editor component + hooks

#### Icon library

- `MARKET_ICON_SVGS` — SVG sprite (markets, tools, actions)
- `svgToDataUrl`, `marketIconToDataUrl`
- `ICON_META`, `ICON_NAMES`, `ICON_CATEGORIES`
- `getIconsByCategory`
- `MarketIconName`, `IconCategory`, `IconMeta`

#### Plugin system

- `plugin.ts` — plugin discovery, loading, lifecycle hooks
- `StarGridPlugin` — `onMount`, `onReady`, `onThemeChanged`, `onMessage`, `onClose`

---

## 8. Angular UI Controls

**Path:** `packages/angular-ui/`
**Status:** **Scaffold only** — README placeholder, no source. PrimeNG-themed primitives + `@starui/tokens-primeng` integration deferred. Use React UI controls (`@starui/ui`) for any React surface; no cross-bucket import allowed.

---

## 9. Angular Grid

### 9.1 `@starui/grid-angular`

**Path:** `packages/angular-grid/grid`
**Status:** **Scaffold.** Angular twin of `@starui/grid`. Single marker export `GRID_ANGULAR_SCAFFOLD = true`. Peer-deps already pinned to `ag-grid-angular`, `ag-grid-community`, `ag-grid-enterprise` 35.1.0. Implementation deferred.

---

## 10. Angular Core

### 10.1 `@starui/app-angular`

**Path:** `packages/angular-core/app`
**Status:** **Scaffold.** Angular twin of `@starui/app`. Marker export `APP_ANGULAR_SCAFFOLD = true`. Depends on `@starui/engine`, `@starui/grid-angular`, `@starui/host`, `@starui/host-browser`, `@starui/host-config`, `@starui/types`.

### 10.2 `@starui/widgets-angular`

**Path:** `packages/angular-core/widgets`
**Status:** **Scaffold.** Angular twin of `@starui/widgets-react`. Marker export `WIDGETS_ANGULAR_SCAFFOLD = true`. Depends on `@starui/grid-angular`, `@starui/host-config`, `@starui/host-data-angular`, `@starui/openfin-platform`, `@starui/types`.

### 10.3 `@starui/config-browser-angular`

**Path:** `packages/angular-core/config-browser`
**Status:** **Scaffold.** Angular twin of `@starui/config-browser`. Marker export `CONFIG_BROWSER_ANGULAR_SCAFFOLD = true`. Depends on `@starui/engine`, `@starui/host-config`, `@starui/openfin-platform`.

---

## Repo tooling

### `@starui/mcp-scaffold`

**Path:** `tools/mcp-scaffold`
**Deliverable:** `libs/starui-mcp-scaffold-*.tgz` (via `npm run pack:mcp`)
**Purpose:** StarUI Platform MCP stdio server — scaffold apps, wire STOMP, author grid layouts (config-first), diagnose data plane, OpenFin routes, design compliance.

**MCP tools (44):**

- **Templates:** `starui_list_templates`, `starui_recommend_template`, `starui_scaffold_app`, `starui_upgrade_scaffold`
- **Grid:** `starui_list_grid_features`, `starui_explain_grid_feature`, `starui_suggest_grid_features`, `starui_add_grid_module`, `starui_generate_column_defs`, `starui_layout_recipe`
- **Layouts (config-first):** `starui_config_or_code`, `starui_generate_layout`, `starui_validate_layout`, `starui_import_layout_pack`, `starui_explain_layout_module`
- **Providers / STOMP:** `starui_list_provider_types`, `starui_generate_stomp_config`, `starui_validate_provider_config`, `starui_add_provider_to_project`, `starui_setup_stomp_dev`, `starui_test_stomp_connection`, `starui_diagnose_data_plane` (empty grid), `starui_explain_provider_toolbar`, `starui_provider_config_from_csv`
- **Tarballs:** `starui_check_tarball_versions`, `starui_refresh_libs`, `starui_explain_import_alias`, `starui_bucket_dependency_graph`
- **OpenFin:** `starui_explain_component_registration`, `starui_add_blotter_route`, `starui_generate_view_manifest`, `starui_openfin_launch_checklist`
- **UI / design:** `starui_list_ui_components`, `starui_add_ui_component`, `starui_audit_app_design`, `starui_add_shell_layout`, `starui_theme_playground_snippet`, `starui_shadcn_component_picker`, `starui_validate_design_compliance`
- **Validation:** `starui_validate_scaffold`, `starui_smoke_test_app`, `starui_validate_stomp_e2e`, `starui_snapshot_grid_config`, `starui_print_install_config`

**MCP resources:** `starui://design-rules`, `starui://guides/stomp-marketsgrid`, `starui://guides/wire-stomp`, `starui://troubleshooting/empty-grid`, `starui://recipes/provider-stomp-positions`, `starui://recipes/openfin-blotter-route`

**Run:** `npx -y @starui/mcp-scaffold` or `npx -y ./libs/starui-mcp-scaffold-*.tgz`

---


### Apps — platform bootstrap pilot

- `apps/demos/demo-stomp-markets-grid` — minimal STOMP + MarketsGrid demo (web + OpenFin); programmatic provider seed + `defaultLiveProviderId`; `npm run dev:demo-stomp-markets-grid`; OpenFin: `npm run dev:openfin:demo-stomp-markets-grid`
- `apps/demos/stomp-marketsgrid-minimal` — workspace dev track; lean STOMP → MarketsGrid (`STARUI_DEV_SOURCE=1`); `npm run dev:stomp-marketsgrid-minimal`
- `apps/demos/markets-grid-lab` — workspace dev track; grid lab tabs + profiles (`STARUI_DEV_SOURCE=1`); `npm run dev:markets-grid-lab`
- `apps/demos/*` — single tree of consumer/reference demos; each runs in two modes via one folder (installed `file:libs/*.tgz` vs source `STARUI_DEV_SOURCE=1`; see `apps/demos/README.md`)
- `docs/BUILD.md` + `apps/README.md` — three-layer build matrix: `build:packages` → `propagate` → `build:apps` (installed) / `build:apps-source` (source)
- `scripts/build-app-track.mjs` — runs every app's `build` / `typecheck` in one mode (`installed` | `source`); root turbo does not include the nested `apps/` workspace
- `npm run verify:consumer` — CI parity: packages + propagate + `build:apps` (installed-mode production bundles)
- `apps/demos/markets-ui-react-reference` — migrated to `ensurePlatformReady` + `DataHubProvider`; removed `dataServices.mainThread.ts`
- `apps/demos/e2e-browser-blotter` — `standalone` (in-app rows) + `provider`/`config`/`full` hub modes via `DataHubProvider`
- `apps/demos/e2e-openfin-workspace` — blotter view uses `HostedMarketsGrid` + hub mock provider
- `apps/demos/{stomp,mockdata-provider,dataprovider-editor}` — migrated to `ensurePlatformReady` + `DataHubProvider`; legacy `dataServices.ts` removed
- `apps/demos/{stomp,mockdata-provider,dataprovider-editor}` — mirror of workspace bootstrap pattern; mockdata `DataServicesGridPanel` uses `useDataProvider`
- MCP scaffold templates (`stomp`, `mockdata-provider`, `dataprovider-editor`, `openfin-platform`) — emit `platformBootstrap.ts` + `public/app-config.json` (web) or manifest `customSettings.appId` (OpenFin)

### Consumer documentation

- `docs/MARKETSGRID_USAGE_GUIDE.md` — scenario matrix for MarketsGrid (`MarketsGrid` / `MarketsGridContainer` / `HostedMarketsGrid`), hub bootstrap, OpenFin vs browser, persistence, customizer UI (§22), troubleshooting; PDF at `docs/MARKETSGRID_USAGE_GUIDE.pdf` (`npm run docs:marketsgrid-usage-pdf`)
- `docs/guides/platform-hooks-demo.md` — AppData bootstrap hooks + grid event callback bindings (`apps/demos/platform-hooks-demo`, port 5214)
- `docs/EXPRESSION_DSL.md` — authoritative reference for the `@starui/engine` expression DSL (grammar, operator semantics, the full 44-function catalog, coercion/null rules, conditional sugar) plus an explicit JavaScript→DSL conversion guide written for an AI agent to translate JS expressions into DSL correctly

## Cross-cutting architecture notes

These aren't a single feature, but they are platform invariants worth remembering when reading the inventory:

- **Seam #1 — RuntimePort** (`@starui/host-openfin` vs `@starui/host-browser`). Only OpenFin packages may import `@openfin/core`.
- **Seam #2 — React host bridge** (`@starui/host-wrapper-react`). All React features consume the host via `useHost()`.
- **Customizer pipeline** — `DEFAULT_MODULES` runs general-settings →
  column-templates → column-customization → calculated-columns → column-groups →
  conditional-styling → visual-excel → smart-edit → bulk-update → plus-minus → shortcuts →
  data-change-history → alerts → saved-filters → toolbar-visibility → grid-state
  (grid-state last so replay sees the finalized column set).
- **Storage adapter pattern** — `StorageAdapter` is the single contract. localStorage, IndexedDB, ConfigService (REST + Dexie), and in-memory all implement it.
- **Provider selection** — `MarketsGridContainer` exposes live/historical provider pickers in grid customizer → Custom Settings with grid-level persistence (`gridLevelData`). Primary toolbar still offers refresh/reload admin actions. Bare `MarketsGrid` hosts use parent-controlled `rowData`.
  - **Save-and-switch** — a provider/mode change alters `activeId`, part of the `<MarketsGrid>` key, so the grid remounts and re-hydrates the customizer from disk. The container flushes the working set via `gridHandle.saveAll()` BEFORE applying the selection, so other tabs' in-memory per-card "Save"s (e.g. a Grid Options status-bar edit) survive the remount instead of being discarded.
- **Expression engine** — CSP-safe parser/evaluator drives calculated columns, conditional rules, and filter expressions; `tryCompileToAgString()` transpiles to AG Grid `valueFormatter` strings.
- **Theme integration** — reactive dark/light switching via `RuntimePort` + `data-theme` attribute; AG Grid theme + StarUI tokens stay in lockstep.
- **Extensibility surfaces** — slot-based widget extensions in `@starui/widget-sdk`; OpenFin plugin hooks (`onMount`, `onReady`, `onThemeChanged`, `onMessage`, `onClose`) in `@starui/openfin-platform`.

---

## How to maintain this file

1. Treat every PR that **adds, modifies, or removes a feature** as also having to update this file. Same commit, or an immediate `docs:` follow-up.
2. Add bullets at the **right granularity** — one bullet per importable capability, not per file.
3. Preserve the **bucket → package → functional-area** structure. New buckets go in the index at top.
4. Mark scaffolds and deprecations inline with **bold tags** (`**Scaffold.**`, `**Deprecated.**`).
5. If a feature is removed, delete its bullet — do not strike it through, do not leave "removed" notes. The git history is the audit trail.
6. Keep wording short and factual. Wire-protocol details, constants, and identifier names belong in the bullets; rationale belongs in `docs/ARCHITECTURE.md`.
