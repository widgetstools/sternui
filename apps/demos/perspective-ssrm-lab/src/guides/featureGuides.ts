import type { FeatureGuide, FeatureGuidePropRow } from './types';
import { CONDITIONAL_TAB_CS_RULES, LIVE_TAB_CS_RULES } from '../seeds/conditionalStyling';
import { serializeConfig } from './serializeConfig';

/** Mount props shared by every MarketsGrid in the lab — prepended to each guide's props. */
export const BASE_PROPS: FeatureGuidePropRow[] = [
  { name: 'gridId', type: 'string', note: 'Stable id; scopes the stored profile/config in localStorage.' },
  { name: 'rowData', type: 'TData[]', note: 'Row objects. The mock stream pushes delta updates here.' },
  { name: 'columnDefs', type: 'ColDef[]', note: 'ag-grid column definitions.' },
  { name: 'rowIdField', type: "string | string[]", default: "'id'", note: 'Primary key used for delta updates.' },
  { name: 'storage', type: 'StorageAdapterFactory', note: 'Where profiles persist — localStorage in the lab.' },
  { name: 'onReady', type: '(handle: MarketsGridHandle) => void', note: 'Fires when grid + module platform are ready.' },
];

const showProfileSelector: FeatureGuidePropRow = {
  name: 'showProfileSelector', type: 'boolean', default: 'true', note: 'Profile picker in the toolbar (save/clone/export).',
};
const showSaveButton: FeatureGuidePropRow = {
  name: 'showSaveButton', type: 'boolean', default: 'true', note: 'Explicit Save of the current config to the active profile.',
};
const showSettingsButton: FeatureGuidePropRow = {
  name: 'showSettingsButton', type: 'boolean', default: 'true', note: 'Opens the Settings sheet — the main place you configure modules.',
};

export const FEATURE_GUIDES: Record<string, FeatureGuide> = {
  overview: {
    id: 'overview',
    category: 'getting-started',
    summary: 'The kitchen-sink grid: filters, formatting, editing, and a profile per "lens".',
    whatWhy:
      'The Overview tab mounts MarketsGrid with most toolbars on and ships several **profiles** — each a saved snapshot of columns, styles, filters and grouping. Switch lenses from the profile selector to see how one grid serves many views. Start here to get the lay of the land, then drill into a focused tab.',
    trySteps: [
      { text: 'Open the profile selector in the toolbar and switch between the shipped lenses.' },
      { text: 'Click the Settings (gear) button to see the module list that backs the current profile.' },
      { text: 'Use the Demo Console on the right to fire a scenario and watch cells react.' },
    ],
    props: [
      { name: 'showFiltersToolbar', type: 'boolean', default: 'false', note: 'Saved-filter pill carousel.' },
      { name: 'showFormattingToolbar', type: 'boolean', default: 'false', note: 'Cell/header style + number-format toolbar.' },
      { name: 'showEditingToolbar', type: 'boolean', default: 'false', note: 'Smart-edit / bulk-update / history controls.' },
      { name: 'sideBar', type: "{ toolPanels: string[] }", note: "ag-grid side panels, e.g. ['columns','filters']." },
      { name: 'statusBar', type: '{ statusPanels: [] }', note: 'Row counts + aggregation footer.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  formatting: {
    id: 'formatting',
    category: 'formatting-display',
    summary: 'Number, date, percent and currency formatters with themed overrides.',
    whatWhy:
      'Display formatting is configured per column through the **Formatting toolbar** and persisted in the profile — no `valueFormatter` code required. Decimals, thousands separators, percent/bp scaling, and date/time patterns are all UI-driven, with separate light/dark overrides where needed. Use it whenever raw values need human-readable presentation.',
    trySteps: [
      { text: 'Select a numeric column header, then pick a format preset from the Formatting toolbar.' },
      { text: 'Export to Visual Excel — formatters are baked into the .xlsx.', hint: 'Use the export button in the toolbar.' },
    ],
    props: [
      { name: 'showFormattingToolbar', type: 'boolean', default: 'false', note: 'The format/style editor surface.' },
      { name: 'showVisualExcelExport', type: 'boolean', default: 'false', note: 'WYSIWYG styled .xlsx export button.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  renderers: {
    id: 'renderers',
    category: 'formatting-display',
    summary: 'Visual cell renderers: pills, heatmaps, sparklines, percent bars, flags.',
    whatWhy:
      'Renderers turn a cell value into a visual: a rating pill, a heatmap fill, an inline KRD sparkline, a percent bar, a country flag. They are assigned per column in the column settings and travel with the profile. Reach for them when a glance should convey magnitude or category faster than digits.',
    trySteps: [
      { text: 'Open Settings → column customization and inspect which renderer each visual column uses.' },
      { text: 'Switch profiles to compare a renderer-heavy lens against a plain one.' },
    ],
    props: [
      { name: 'defaultColDef', type: 'ColDef', note: 'Renderers tab sets autoHeight:false so bars/sparklines size cleanly.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  conditional: {
    id: 'conditional',
    category: 'formatting-display',
    summary: 'Expression-driven cell/row styling, flashes, indicators and diff rules.',
    whatWhy:
      'Conditional styling paints cells or rows from boolean **expressions** (`value < 0`, `[ask] - [bid] > 0.1`, `[mid.new] > [mid.old]`). Each rule can add colour, a one-shot or pulsing flash, and an indicator badge. Rules are authored in the Settings sheet and persisted per profile. Use them to make risk, P&L direction and ticks pop without touching grid code.',
    trySteps: [
      { text: 'Open Settings → Conditional styling and toggle a rule on/off; watch the grid update live.' },
      { text: 'Fire a price-tick scenario from the Demo Console to see diff rules (`mid.new` vs `mid.old`) flash.' },
    ],
    props: [showProfileSelector, showSaveButton, showSettingsButton],
    extraConfig: [
      {
        label: 'Conditional styling rules',
        lang: 'json',
        code: serializeConfig(CONDITIONAL_TAB_CS_RULES),
      },
    ],
  },

  toolbar: {
    id: 'toolbar',
    category: 'formatting-display',
    summary: 'The floating Formatting toolbar — paint cells and headers live.',
    whatWhy:
      'The Formatting toolbar is a floating palette for ad-hoc cell/header styling: font weight, colour, fills, borders and alignment applied to the current selection. Changes are captured into the profile so they survive reloads. It is the fastest way to demonstrate the config-driven styling pipeline interactively.',
    trySteps: [
      { text: 'Select a range of cells, then apply a fill and bold weight from the floating toolbar.' },
      { text: 'Select a column header and paint it; note cell vs header targeting.' },
      { text: 'Save the profile, reload, and confirm the styling persisted.' },
    ],
    props: [
      { name: 'showFormattingToolbar', type: 'boolean', default: 'false', note: 'Enables the floating palette.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  'visual-excel': {
    id: 'visual-excel',
    category: 'formatting-display',
    summary: 'WYSIWYG .xlsx export — formatters and style rules baked into the sheet.',
    whatWhy:
      'Visual Excel export writes an .xlsx that mirrors what is on screen: number formats, rule-generated colours, fonts and fills are all carried into Excel cells, not just raw values. Configure formatting/styling as usual, then export. Use it when stakeholders want the grid as a spreadsheet that still looks like the grid.',
    trySteps: [
      { text: 'Apply a couple of formatting and conditional-style rules.' },
      { text: 'Click the Visual Excel export button and open the downloaded file to compare.' },
    ],
    props: [
      { name: 'showVisualExcelExport', type: 'boolean', default: 'false', note: 'The export button.' },
      { name: 'showFormattingToolbar', type: 'boolean', default: 'false', note: 'So you can author the styles that get exported.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  groups: {
    id: 'groups',
    category: 'columns-layout',
    summary: 'Nested column header groups with open/closed presets.',
    whatWhy:
      'Column groups nest related columns under labelled, collapsible headers (Pricing, Yields, Risk, P&L…). Groups, their labels, styling and expand/collapse state are authored in Settings and saved per profile. Use them to tame wide blotters into scannable sections.',
    trySteps: [
      { text: 'Collapse and expand a header group directly in the grid.' },
      { text: 'Switch between the open and closed group presets via the profile selector.' },
    ],
    props: [showProfileSelector, showSaveButton, showSettingsButton],
  },

  calc: {
    id: 'calc',
    category: 'columns-layout',
    summary: 'Virtual columns computed from expressions over row fields.',
    whatWhy:
      'Calculated columns add **virtual** columns from expressions (`[ask] - [bid]`, nested `IF`, cross-field math) without changing the data source. They behave like any column — styled, grouped, aggregated, flashed. Authored in Settings → Calculated columns and saved per profile. Use them for derived analytics the feed does not provide.',
    trySteps: [
      { text: 'Open Settings → Calculated columns and read one expression.' },
      { text: 'Switch profiles to add more virtual columns; watch cell-change flash on recompute.' },
      { text: 'Select profile “05 · Traffic light (RAG)” — midPrice bands paint 🟢/🟡/🔴; Asset Class is grouped with trafficLight agg.' },
      { text: 'Check Use SSRM, then expand a group — leaf and group cells should both show the emoji fold.' },
    ],
    props: [
      { name: 'defaultColDef', type: 'ColDef', note: 'This tab sets enableCellChangeFlash:true so recomputes flash.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  filters: {
    id: 'filters',
    category: 'filtering-data',
    summary: 'Saved filter pills — capture, toggle, and stack filter sets.',
    whatWhy:
      'Quick filters are named filter models pinned to the toolbar as pills (High Yield, Wide Spreads, BB-rated…). Capture the current filter state into a pill, then toggle pills to stack them with AND logic. Saved per profile. Use them to give users one-click access to the views they reach for daily.',
    trySteps: [
      { text: 'Set a column filter, then capture it as a new pill from the Filters toolbar.' },
      { text: 'Toggle two pills and confirm the row count reflects the AND of both.' },
    ],
    props: [
      { name: 'showFiltersToolbar', type: 'boolean', default: 'false', note: 'The saved-filter pill carousel.' },
      { name: 'defaultColDef', type: 'ColDef', note: 'floatingFilter:true so per-column quick filters show.' },
      { name: 'sideBar', type: "{ toolPanels: ['filters'] }", note: 'ag-grid filters panel.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  live: {
    id: 'live',
    category: 'filtering-data',
    summary: 'High-frequency streaming with tick flashes and direction styling.',
    whatWhy:
      'The Live tab drives MarketsGrid with a fast mock stream (tick interval set in the Demo Console) using ag-grid delta transactions, so only changed cells repaint. Conditional rules flash ticks and colour winners/losers. Use it to see how the grid behaves under load and how flash/diff rules read in real time.',
    trySteps: [
      { text: 'Drag the tick-interval slider in the Demo Console down to ~150ms.' },
      { text: 'Watch price cells flash and P&L cells colour by direction.' },
    ],
    props: [showProfileSelector, showSaveButton, showSettingsButton],
    extraConfig: [
      {
        label: 'Live tick + direction rules',
        lang: 'json',
        code: serializeConfig(LIVE_TAB_CS_RULES),
      },
    ],
  },

  alerts: {
    id: 'alerts',
    category: 'filtering-data',
    summary: 'Expression alerts across toast, badge and OpenFin channels.',
    whatWhy:
      'Alerts watch cell values with expressions and fire on change to one or more channels (toast, bell badge, OpenFin notification), with debounce and rate limiting. Rules are authored in Settings → Alerts and saved per profile. Use them to surface threshold breaches without users staring at the grid.',
    trySteps: [
      { text: 'Open Settings → Alerts and read a rule\'s expression and channels.' },
      { text: 'Fire a matching scenario from the Demo Console and watch the toast/badge.' },
    ],
    props: [showProfileSelector, showSaveButton, showSettingsButton],
  },

  editing: {
    id: 'editing',
    category: 'editing',
    summary: 'The full editing family: smart-edit, bulk-update, +/- and history.',
    whatWhy:
      'The Editing tab turns on the editing toolbar so you can apply arithmetic across a selection (smart-edit), replace a range with one value (bulk-update), and step changes with undo/redo history. Editable columns are configured per column. Use it to see the complete write path in one place.',
    trySteps: [
      { text: 'Select a numeric range and apply a smart-edit operation (e.g. ×1.1).' },
      { text: 'Undo it from the edit-history controls and confirm the values revert.' },
    ],
    props: [
      { name: 'showEditingToolbar', type: 'boolean', default: 'false', note: 'Smart-edit + bulk-update + history surface.' },
      { name: 'showFormattingToolbar', type: 'boolean', default: 'false', note: 'On here so edits and styling demo together.' },
      { name: 'showFiltersToolbar', type: 'boolean', default: 'false', note: 'Filter before bulk editing a subset.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  'bulk-update': {
    id: 'bulk-update',
    category: 'editing',
    summary: 'Replace a whole selection with one value — text, number or date.',
    whatWhy:
      'Bulk update writes a single value (or formula) across a rectangular selection in one action, with a confirmation step. Column editability and data type (text/number/date) are set per column. Use it for fast corrections across many rows — re-book a desk, restamp a maturity, zero a field.',
    trySteps: [
      { text: 'Select a range in an editable column.' },
      { text: 'Enter a value in the Bulk Update toolbar and apply; confirm the dialog.' },
    ],
    props: [
      { name: 'showBulkUpdateToolbar', type: 'boolean', default: 'false', note: 'The replace-selection control.' },
      { name: 'showEditHistoryToolbar', type: 'boolean', default: 'false', note: 'Undo/redo of the bulk write.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  'plus-minus': {
    id: 'plus-minus',
    category: 'editing',
    summary: 'Keyboard +/- nudges with per-column steps and expression gates.',
    whatWhy:
      'Plus/Minus binds the + and - keys to nudge the focused cell by a configured step (qty ±100, mid ±0.01), optionally gated by an expression so only valid rows respond. Rules are authored in Settings and saved per profile. Use it for fast keyboard-driven adjustments on a trading blotter.',
    trySteps: [
      { text: 'Focus an editable numeric cell and press + a few times.' },
      { text: 'Press - to nudge back down; undo from the history controls.' },
    ],
    props: [
      { name: 'showEditHistoryToolbar', type: 'boolean', default: 'false', note: 'Undo/redo of nudges.' },
      { name: 'showFiltersToolbar', type: 'boolean', default: 'false', note: 'Scope before nudging.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  shortcuts: {
    id: 'shortcuts',
    category: 'editing',
    summary: 'Letter-key arithmetic shortcuts on the focused cell.',
    whatWhy:
      'Shortcuts map letter keys to arithmetic operations on the focused numeric cell (e.g. H = ×100, M = +1000, L = −500). Distinct from K/M/B input parsing — these are operations, not units. Authored in Settings and saved per profile. Use them for power-user keyboard workflows.',
    trySteps: [
      { text: 'Focus an editable numeric cell and press a configured letter key.' },
      { text: 'Open Settings → Shortcuts to see the full key→operation map.' },
    ],
    props: [
      { name: 'showEditHistoryToolbar', type: 'boolean', default: 'false', note: 'Undo/redo of shortcut ops.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  profiles: {
    id: 'profiles',
    category: 'profiles',
    summary: 'Pre-baked configuration "lenses" you can clone, export and import.',
    whatWhy:
      'A profile is an atomic snapshot of everything you configured — columns, styles, filters, grouping, module state — saved under a `gridId`. Clone, rename, export to JSON, and import them. This tab is a gallery of ready-made lenses (Trader, Analytics, Compact, Grouped). Profiles are the unit of persistence the whole lab is built on.',
    trySteps: [
      { text: 'Pick a preset lens from the gallery and open it.' },
      { text: 'Tweak a setting, Save, reload — confirm it persisted under the profile.' },
    ],
    props: [
      showProfileSelector,
      showSaveButton,
      { name: 'appId / userId / instanceId', type: 'string', note: 'Scope keys when persisting via a ConfigService instead of localStorage.' },
    ],
  },

  stress: {
    id: 'stress',
    category: 'performance',
    summary: '50k rows × 120 REAL columns with grouping, conditional styling, and high-tick live updates on the Perspective pull path.',
    whatWhy:
      'Stress Test mounts a **50,000 × 120** blotter with row grouping (Class → Sector), aggregations, conditional styling, Excel/preset formatters, calculated columns, column groups, and quick-filter pills. **Live ticks run at ~200 ms** so you can watch the pull path under continuous deltas.  **Every one of the 120 columns is a real field of the book.** It used to mount 400, of which 366 were `valueGetter` columns computed in the window — so AG reported 404 columns while a block carried 56, and every wide-book measurement taken here was measuring the grid rather than the book (a 284x read-cost figure was withdrawn because of it). Column count, Table width and block width are now one number, verified by `columnPayloadProbe.mjs`.  The client-side baselines (plain AG Grid, the FINOS viewer) are gone: the widest of them idled at 2.6 GB against the ~4 GB Chrome allows a renderer and loaded itself whenever anyone stepped through the variant list. Add `?columnWindow=1` to the URL to run with column-window fetching on. Pause Live ticks in the Demo Console if you only want first-paint / layout stress.',
    trySteps: [
      { text: 'Wait for the 50k snapshot, then expand an Asset Class group and scroll the synthetic columns.', hint: 'Groups start collapsed — expand gradually.' },
      { text: 'Leave Live ticks on (~200 ms) and watch cell updates; toggle Use SSRM and compare tick cost.', hint: 'Pause ticks in Demo Console for load-only stress.' },
      { text: 'Toggle Use SSRM and remount — compare first paint, expand, and horizontal scroll.' },
      { text: 'Activate a Quick Filter pill (Rates / Corp IG) and check status-bar counts.' },
      { text: 'Switch to profile “01 · Flat wide” for pure column-virtualisation pressure.' },
    ],
    props: [
      { name: 'stream.rowCount', type: 'number', default: '50000', note: 'Mock FI positions snapshot size.' },
      { name: 'stream.enableUpdates', type: 'boolean', default: 'true', note: 'High-tick stress (Phase 4c).' },
      { name: 'stream.updateIntervalMs', type: 'number', default: '200', note: 'Tick interval; Demo Console can override.' },
      { name: 'useSSRM', type: 'boolean', default: 'false', note: 'Header toggle — remounts MarketsGrid on SSRMGrid.' },
      { name: 'rowModel', type: "'client' | 'server'", default: "'client'", note: 'Alias for useSSRM (server ≡ true).' },
      { name: 'sideBar', type: "{ toolPanels: ['columns','filters'] }", note: 'Columns + Filters tool panels.' },
      showProfileSelector, showSaveButton, showSettingsButton,
    ],
  },

  'ssrm-engine': {
    id: 'ssrm-engine',
    category: 'performance',
    summary:
      '`@starui/ssrm-engine` over a worker-held 20k × 120 book, with four CALCULATED columns that sort, filter, group, aggregate and tick like stored ones.',
    whatWhy:
      'The `calc_*` columns are **expressions, not fields** — authored as strings, parsed by `@starui/engine`, planned by the customizer\'s `planSsrmCalcColumns(..., { backend: "ssrm-engine" })`, and sent across the SharedWorker port as an **AST**. The AST is the only thing that crosses: a compiled closure is not structured-cloneable, and the value has to be produced where the book is.  **This tab exists because the capability is invisible both ways.** `sortIndex`, `compileFilter` and `aggregateMembers` each used to open by skipping a column the store did not have — and a calculated column is not a field — so sorting or filtering one was a **silent no-op**: no error, no effect, a grid that looked like it ignored the click. A demo that asks you to notice an absence is not a demo, so the toolbar buttons DO the thing and the strip above the grid reports what the engine says rather than what the screen suggests.  It mounts a plain `AgGridReact`, and that is scope rather than oversight: the MarketsGrid surface (set-filter values served from the engine, quick search bridged through `modelUpdated`, status-bar panels, cell-edit commit, export) is the next session\'s work and each piece was a separate bug on the Perspective path. The Stress tab is untouched and still defaults calc columns OFF, because every documented boundary figure (2.40 ms median per block) was taken that way.',
    trySteps: [
      {
        text: 'Press "Sort by P&L %" — a calculated column — then scroll to the bottom.',
        hint: 'Rows whose guard failed hold a calculated NULL and sort LAST IN BOTH DIRECTIONS. AG\'s own comparator puts nulls first ascending; this engine does not, because a NaN price above the best bid is worse.',
      },
      {
        text: 'Press "Filter > 500" and watch "AG displays" drop while "Book" stays 20,000.',
        hint: 'The expression is evaluated over the whole book in the worker, not over the block in view.',
      },
      {
        text: 'Press "Group by band" — grouping by a calculated STRING, aggregating a calculated number.',
        hint: '`calc_band` is an IFS over midPrice; `calc_notional` is summed per group. Neither is stored.',
      },
      {
        text: 'Leave it running and watch which calculated cells move.',
        hint: '`calc_notional` depends on midPrice so it ticks; `calc_dollarDur` does not and stays put. A tick re-stamps only the calculated cells whose inputs it names, because AG flashes a cell it is told changed.',
      },
      {
        text: 'Open the filter menu on a calc_ column — it is a TYPED filter, never a bare `filter: true`.',
        hint: 'A bare `true` resolves to AG\'s set filter, which under a server row model builds its list from the one block the client holds. Serving it from the engine\'s `distinctValues` is next session.',
      },
    ],
    props: [
      { name: 'book', type: '20,000 × 120', note: 'Held in a SharedWorker; this window has a port, a datasource and AG\'s block cache.' },
      { name: 'calc columns', type: 'StarUI expression AST', note: 'Compiled once per expression to a closure over the columnar store, evaluated by row OFFSET.' },
      { name: 'calc_pnlPct', type: 'number | null', note: 'IF([marketValue] > 0, ([dailyPnL] / [marketValue]) * 100, null) — the shape that yields a real calculated null.' },
      { name: 'calc_band', type: 'string', note: 'IFS over midPrice. Group by this one.' },
      { name: 'calc_notional', type: 'number', note: 'Depends on midPrice, so it moves on every price tick.' },
      { name: 'tickMs', type: 'number', default: '200', note: 'Applied in the worker; the delta is pushed, not re-pulled.' },
    ],
  },

};

export function getFeatureGuide(id: string): FeatureGuide | undefined {
  return FEATURE_GUIDES[id];
}
