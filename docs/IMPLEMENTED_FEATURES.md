# Implemented Features

AG-Grid Customization Platform — an open-source AdapTable alternative for the MarketsUI FI Trading Terminal.

---

## 1. Core Architecture

### Plugin-Based Module System
- 18 feature modules with priority-ordered transform pipeline
- Each module has its own state, settings panel, and column/grid transforms
- Modules: General Settings, Theming, Column Templates, Column Customization, Column Groups, Conditional Styling, Calculated Columns, Named Queries, Cell Flashing, Entitlements, Data Management, Sort & Filter, Editing, Undo/Redo, Export & Clipboard, Performance, Expression Editor, Profiles

### Zustand State Management
- Per-grid store factory (`createGridStore`) with module state slices
- Draft store pattern (`DraftStoreProvider`) for settings panel isolation — edits don't apply until "Apply" is clicked
- Store bindings updated on React strict mode re-mounts via `updateStoreBindings()`
- State includes: all module states, undo/redo stacks (max 50), active profile, dirty flag, settings panel state

### CSP-Safe Expression Engine
- Custom tokenizer, Pratt parser, AST tree-walk evaluator — no `eval()` or `new Function()` for user expressions
- Used by: Conditional Styling, Cell Flashing, Entitlements, Calculated Columns
- 60+ built-in functions across 9 categories:
  - **Math**: ABS, ROUND, FLOOR, CEIL, SQRT, POW, MOD, LOG, EXP, MIN, MAX
  - **Stats**: AVG, MEDIAN, STDEV, VARIANCE
  - **Aggregation**: SUM, COUNT, DISTINCT_COUNT
  - **String**: CONCAT, UPPER, LOWER, TRIM, SUBSTRING, REPLACE, LEN, STARTSWITH, ENDSWITH, CONTAINS, REGEX_MATCH, SPLIT, INDEX, REVERSE, PAD
  - **Date**: TODAY, NOW, YEAR, MONTH, DAY, HOUR, MINUTE, SECOND, DATE, DATEDIFF
  - **Logic**: IF, IFS, COALESCE, NOT, AND, OR, XOR
  - **Type**: TYPE, ISNUMBER, ISTEXT, ISDATE, ISBLANK, ISNA
  - **Lookup**: FIND, IN, LOOKUP
  - **Coercion**: VALUE, TEXT, NUMBER
- Safe `REPLACE` with regex metacharacter escaping
- `SUBSTRING` uses modern `String.prototype.substring()` (not deprecated `substr`)
- Compiler with `tryCompileToAgString()` for fast AG-Grid string expression path
- **Column reference syntax** — `[columnId]` is the canonical form. Parser disambiguates at parse time: `[identifier]` is a column ref, `[1]` / `[1,2]` / `[x>0]` stay as array literals (used by `IN [...]`). Legacy `{columnId}` syntax remains parseable indefinitely via `migrateExpressionSyntax()` in `packages/core/src/expression/migrate.ts` — modules that persist expression strings call this helper on `deserialize` to rewrite stored profiles.

### Monaco-based Expression Editor (v2, `packages/core/src/ui/ExpressionEditor/`)
A reusable `<ExpressionEditor>` component that every v2 module's expression-input site uses in place of the plain `<Input>`. Lives in core so both v2 modules and future callers (formula bar, calculated-columns-v2, etc.) import it from one place.

**Shell:**
- `<ExpressionEditor>` — public, lazy-loads Monaco via `React.lazy`. While Monaco downloads (or if it fails to load), renders the `<FallbackInput>` which preserves the commit-on-blur/Enter UX the settings panels expect. No expression field is ever unresponsive — critical for a trading terminal.
- `<FallbackInput>` — plain input/textarea with the same commit model.

**Language (`language.ts`):**
- Monarch tokens for our DSL — `[col]` (sky), `{col}` (amber italic, deprecated), function calls (purple), keywords `AND OR NOT IN BETWEEN true false null` (yellow), operators, numbers, strings.
- Dark (`gcExpressionDark`) and light (`gcExpressionLight`) themes that follow `<html data-theme>` via a MutationObserver — no prop plumbing needed.

**Autocomplete (`completions.ts`):**
- Single global completion provider (registered once, not per-editor — avoids duplicate suggestions) that reads from a `Set` of active columns/functions providers. Each editor mount pushes its providers; provider merges and dedupes by id before returning suggestions.
- Triggers on `[`, `{`, `(`, `.`, `,`, `space`, and via `Ctrl+Space`.
- Context-sensitive: after an open `[` or `{` with no closer yet, shows **columns only** (the user is authoring a column ref). Otherwise returns a merged, priority-sorted list:
  1. Columns (as `[colId]` with headerName detail)
  2. Keywords (`AND`, `OR`, `NOT`, `IN` → `IN [$0]` snippet, `BETWEEN` → `BETWEEN $1 AND $0` snippet, `true`, `false`, `null`)
  3. Operators (`==`, `!=`, `<>`, `<`, `>`, `<=`, `>=`, `+`, `-`, `*`, `/`, `%`)
  4. Functions (name label, signature detail, description+category in hover docs, inserts as `NAME($0)` snippet)

**Diagnostics (`diagnostics.ts`):**
- Debounced 150 ms `ExpressionEngine.validate()` run on every content change; single `Error` marker at the first parse-error position with the error message on hover.
- `Info` markers for each `{col}` deprecation occurrence when `warnDeprecated` is on (default true).

**Hotkeys (wired via `editor.addCommand` — edit-scope, not global):**
- `Ctrl/⌘+Space` — Monaco's native suggest widget.
- `Ctrl/⌘+Shift+C` — opens the **Column palette**: keyboard-nav modal with filter input, grouped by nothing (flat list), shows `[colId]` + headerName + description. Enter inserts `[colId]` at the cursor.
- `Ctrl/⌘+Shift+F` — opens the **Function palette**: same shell, grouped by category (Aggregation, Date, Logical, Math, Stats, String). Enter inserts `FUNC()` with cursor between the parens.
- `F1` — opens the **Help overlay**: dense cheat sheet of column refs, comparison, logical/set, arithmetic, common functions, and hotkeys. Esc / click-outside dismisses.

**Palettes (`Palette.tsx`, `HelpOverlay.tsx`):**
- React-portal modals rendered into `document.body` so they escape the settings-sheet overflow clipping.
- Shared `<Palette>` component handles filter input + arrow navigation + Enter-to-pick. Column and function palettes pass different `items[]` into the same shell.

**Where it's wired today:** v2 Conditional Styling only — [packages/core-v2/src/modules/conditional-styling/ConditionalStylingPanel.tsx](packages/core-v2/src/modules/conditional-styling/ConditionalStylingPanel.tsx). Future v2 modules (cell-flashing, entitlements, named-queries, calculated-columns) wire it the same way when they land.

### Multi-Grid Support
- Each grid instance has fully isolated state:
  - Separate Zustand store (keyed by `gridId`)
  - Separate `<style>` element via `CssInjector` (`data-grid-customizer={gridId}`)
  - Separate `ExpressionEngine` instance (created in `GridCustomizerCore`, passed via `ModuleContext`)
  - Separate per-grid module context maps (column-customization, cell-flashing, conditional-styling, etc.)
- localStorage keys include gridId: `gc-state:{gridId}`
- Multiple `<MarketsGrid>` components with different `gridId` props can coexist in the same app

### Persistence
- **Explicit save only** — no auto-persist; state saves to localStorage only when user clicks the Save button
- Auto-load from localStorage on initialization (restores previously saved state)
- **Per-grid config storage** — every adapter stores one `GridConfig` document per `gridId`, with all profiles + the default-profile pointer nested inside. This enables atomic per-grid clone / export / import. Adapter API:
  - Per-profile (gridId-scoped): `saveProfile`, `loadProfile`, `deleteProfile`, `listProfiles`
  - Per-grid metadata: `getDefault`, `setDefault`
  - Per-grid blob ops: `loadGridConfig`, `saveGridConfig`, `deleteGridConfig`, `exportGridConfig`, `importGridConfig`, `cloneGridConfig`
  - Per-profile JSON: `exportProfile`, `importProfile`
- **`BaseStorageAdapter`** — abstract class that derives every per-profile op from `loadGridConfig` / `saveGridConfig` / `deleteGridConfig`. Concrete adapters only implement those three primitives.
- Storage adapters:
  - **LocalStorageAdapter** — browser localStorage, key format `gc-grid:{gridId}` (one JSON blob per grid), ~5-10MB capacity. One-time migration from legacy `gc-profile:*` keys.
  - **DexieAdapter** — IndexedDB via Dexie ORM, single `gridConfigs` table keyed by `gridId`. Schema v1→v2 upgrade migrates legacy `profiles`/`defaults` rows into per-grid configs.
  - **RestAdapter** — HTTP API expecting `GET/PUT/DELETE /grids/:gridId` and `GET /grids` endpoints, custom auth headers via `getHeaders()` callback, validates `response.ok`

### Event System
- Typed pub/sub EventBus per grid instance
- Events: `column:defsChanged`, `profile:loaded`, `profile:saved`, `profile:deleted`, `styling:rulesChanged`, `flash:triggered`, `theme:changed`, `filter:applied`, `state:dirty`, `module:stateChanged`

---

## 2. Formatting Toolbar

### Excel-Style Toolbar
- Appears above the grid with grouped tool clusters
- 42px height with `bg-card` background and `border-border` bottom border
- Layout order: Column Context → Templates → Font & Text → Alignment → Number Format → Borders → History + Actions
- All icons from Lucide React with consistent 14px size, 1.75 stroke weight
- Two-state contrast: 55% opacity when no cell selected, 85% when cell selected (1.0 on hover)
- `gc-toolbar-enabled` CSS class toggles contrast on cell selection
- `z-index: 10000` ensures dropdowns/popovers render above AG-Grid
- 16px horizontal padding via inline style (immune to Tailwind/preflight conflicts)
- TGroup containers with `bg-accent/40` background, `rounded-md`, `gap-[3px]` internal spacing
- All custom CSS classes (`gc-tbtn`, `gc-tbtn-active`, `gc-toolbar-sep`) in `@layer components`

### Cell/Header Toggle
- iOS-style segmented control with two side-by-side Shadcn `<Button>` components
- Active segment uses `bg-primary text-primary-foreground`, inactive uses `ghost` variant
- Bold text on both segments for readability
- 14px horizontal padding per button, `h-7` height, `rounded-none` with `rounded-md` on container
- Switches all formatting actions between cell styling and header styling
- Header styles use functional `headerStyle` (excludes floating filters) + `headerClass` for CSS injection
- Cell styles use `cellClass` + CSS injection with `!important`

### Typography Controls
- **Bold** (B): toggles `font-weight: 700` / removes
- **Italic** (I): toggles `font-style: italic` / removes
- **Underline** (U): toggles `text-decoration: underline` / removes
- All write to `cellStyleOverrides` / `headerStyleOverrides` on the `ColumnAssignment` (not templates)

### Text & Background Color
- Color picker with 10-column × 6-row grid (19px rounded swatches, 2px gaps):
  - Row 1: Grayscale (white to black)
  - Row 2: Vivid saturated (rainbow)
  - Row 3: Medium-dark variants
  - Row 4: Light tints
  - Row 5: Pastels
  - Row 6: Very light
- Recent colors section (up to 10, persisted in `localStorage` as `gc-recent-colors`) with "RECENT" label
- Bottom bar with 4 equally-sized 22px controls:
  - Pipette icon: opens native system color picker
  - Hex input: editable text field with `JetBrains Mono` font, validates on blur/Enter
  - × button: clears color
  - ✓ button: confirms selection (foreground/background swap for active state)
- Draft/confirm pattern — select colors without applying until ✓ is clicked
- Selected swatch highlighted with 2px CSS `outline` in `var(--primary)` color
- Container: 8px padding, 8px border-radius, deep shadow (`0 8px 32px rgba(0,0,0,0.3)`)
- All colors via CSS variables — fully theme-aware for light/dark mode
- Shared `ColorPicker` / `ColorPickerPopover` components in `@grid-customizer/core`

### Alignment
- Left / Center / Right alignment buttons
- Cell: applies `text-align` via CSS injection
- Header: converts to `justify-content: flex-start/center/flex-end` on `.ag-header-cell-label` (AG-Grid headers use flexbox)

### Font Size
- Popover dropdown with sizes: 9px, 10px, 11px, 12px, 13px, 14px, 16px, 18px, 20px, 24px
- Active size highlighted in primary (amber) color
- Shows current size in mono font with ChevronDown indicator

### Number Formatting
- **Currency** ($): Popover with USD, EUR, GBP, JPY options using `Intl.NumberFormat`
- **Percentage** (%): Toggles `Intl.NumberFormat` with `style:'percent'`
- **Thousands separator** (#): Formats with `maximumFractionDigits:0`
- **Decimal controls** (←.0 / .0→): Increment/decrement decimal places
- Formatters use `new Function` for `Intl.NumberFormat` expressions (developer-authored presets)
- Written to `ColumnAssignment.valueFormatterTemplate` (per-column override)
- Value formatter presets: USD, EUR, GBP, JPY, Percent, Comma-separated, Basis Points

### Border Editor
- Grid3X3 icon opens border popover (240px wide)
- **Header**: "BORDERS" title in uppercase
- **Cell preview**: inner rectangle showing active borders with dashed inactive borders, "Cell" or "Header" label
- **6 preset buttons** in a row: All, Top, Right, Btm, Left, None
  - Each with a custom `BorderIcon` SVG showing which edge is highlighted
  - Active buttons get `var(--primary)` border + tinted background
  - "None" button in `var(--destructive)` color
- **Bottom bar**: color swatch + style dropdown (Solid/Dashed/Dotted/Double) + width selector (1-4)
- **Implementation**: borders rendered via `::after` pseudo-element with `box-shadow: inset` — does NOT use CSS `border` or `box-shadow` on the cell itself
- AG-Grid cell selection (`box-shadow`) and column separators (`border-right`) remain unaffected
- `inset: 0` positioning (not `-1px`) because AG-Grid cells have `overflow: hidden`

### Template Dropdown
- Appears when cells are selected, between column context and number format groups
- LayoutTemplate icon + `<select>` dropdown listing all templates alphabetically
- Selecting a template assigns it to all selected columns via `templateIds`
- Shows "No templates yet" when empty

### Save As Template (+)
- Plus icon button opens a Popover with name input
- "Save Template" confirm button (primary color)
- Captures the column's merged cell style, header style, and value formatter
- Creates a new template with auto-generated ID (`tpl_{timestamp}_{random}`)
- Flash checkmark feedback on save
- New template immediately appears in the dropdown

### Undo / Redo
- Undo2 / Redo2 icons
- Undo point pushed before every formatting action (cell AND header changes)
- Works for both cell style and header style modifications
- Deep-clone via `JSON.parse(JSON.stringify())` (max 20 history entries)
- Clear All pushes an undo point first (recoverable)

### Clear All
- Trash2 icon — resets all templates, assignments, and CSS rules
- Clears ALL column assignments globally (`assignments: {}`)
- Strips stale `headerStyle` inline properties directly from DOM elements
- Calls `cssInjector.clear()` to remove all injected `<style>` content
- Flash checkmark feedback (400ms)

### Save
- Save icon — serializes all module state to `localStorage`
- Flash checkmark feedback (400ms)
- **Explicit save only** — no auto-persist; styles only save when the user clicks Save
- Auto-persist `useEffect` removed to prevent unintended localStorage writes

---

## 3. Toolbar Stack (User-Toggled Pills + Permanent Filters)

### Layout Rationale
Filters and the profile/save/settings cluster are used on every interaction with the
grid, so they are permanently visible as the **primary row**. Style and Data are
rarer actions — putting them on screen all the time wastes vertical space. An
earlier attempt auto-showed the Style toolbar whenever a cell was focused, but
traders found the layout shifting under them while clicking around the grid was
disorienting. A floating toolbar near the cursor was also rejected: traders are
often typing in cells and don't want a hovering UI near their fingers.

**Solution: explicit user toggles via colored pills.**
- Filters always visible.
- A row of muted pills (one per togglable toolbar) sits at the right of the
  Filters row, just before the profile/save/settings cluster.
- Pills are nearly invisible until the user hovers over the Filters row, at
  which point they fade to full opacity.
- Clicking a pill toggles the corresponding toolbar — the toolbar slides in as
  its own row below Filters (and any other already-open toolbars).
- Each open toolbar reveals an X close button on its extreme right when hovered,
  giving the user two ways to dismiss it (pill or X).
- Visibility state is **persisted with the active profile** so a trader's
  preferred layout follows their profile across sessions and across grids.

### Toolbar Rows (top → bottom, when all toggled on)
1. **Filters + pills cluster + profile/save/settings cluster** (always visible)
2. **Style** (`FormattingToolbar`) — toggled by Style pill (teal accent)
3. **Extra toolbars** (consumer-supplied via `extraToolbars`) — each toggled by
   its own pill, stacked in the order provided

### Persistence (Profile-Bound)
Visibility lives in a hidden state-only module: `toolbarVisibilityModule`
(`packages/core/src/modules/toolbar-visibility/index.ts`).
- Has no `SettingsPanel` — `ModuleNav` filters out modules without a panel, so
  it doesn't appear in the Settings nav.
- State shape: `{ visible: Record<string, boolean> }`, keyed by toolbar id
  (`'style'` for the built-in Style toolbar, plus each `extraToolbar.id`).
- Default state: `{ visible: {} }` — nothing shown until the user toggles a pill.
- Auto-serialized via `core.serializeAll()` into the active `ProfileSnapshot`,
  so save / load / clone / export-import all round-trip the layout for free.
- Old profiles from before this module existed deserialize to the empty
  default — the module's `deserialize` tolerates missing data.

### Pill Styling
- Inactive (default): `opacity: 0.55`, neutral border, muted text.
- On hover of the Filters row: pills fade to `opacity: 1` so the user can see
  what's available without permanently cluttering the chrome.
- On hover of a pill: tinted background using its accent color
  (`color-mix(in srgb, var(--gc-pill-color) 12%, transparent)`).
- Active (`data-active='true'`): tinted background + accent text + colored
  border, indicating the toolbar is currently shown.
- Built-in Style pill uses `--primary` (teal); each extraToolbar's `color`
  prop drives its pill's accent.

### Animation
- CSS `@keyframes gc-slide-down` (apps/demo/src/globals.css) — 4px translate +
  fade-in, 120ms ease-out — applied to each stacked toolbar as it appears.

### ToolbarSlotConfig API (for `extraToolbars`)
```typescript
interface ToolbarSlotConfig {
  id: string;       // Unique ID — also keys the visibility map
  label: string;    // Shown inside the pill
  color?: string;   // Pill accent color (CSS color string); defaults to --bn-blue
  icon?: ReactNode; // Optional icon shown in the pill
  content: ReactNode; // Toolbar element to render — gets its own full-width row
}
```

### Demo Toolbars
- **Filters** (yellow/amber accent) — built-in via `showFiltersToolbar={true}` prop, always visible
- **Style** (teal accent, Brush icon) — built-in `FormattingToolbar`, toggle via Style pill
- **Data** (blue accent, Database icon) — placeholder for data connections, toggle via Data pill

---

## 4. Filters Toolbar

### Saved Filter System
- Captures current AG-Grid filter state as named toggle buttons
- **Add (+) button**: reads `api.getFilterModel()`, creates a `SavedFilter` with auto-generated label
- Auto-labeling: single column → "col: value", 2 columns → "col1 + col2", 3+ → "col1 + N more"
- Toggle buttons activate/deactivate saved filters with visual state (active: tinted primary, inactive: muted + 60% opacity)
- **Per-profile persistence**: saved filters live in the hidden `saved-filters` core module (`packages/core/src/modules/saved-filters/index.ts`), so the pill list auto-roundtrips through the active profile snapshot via `core.serializeAll()` / `deserializeAll()`. Switching profiles swaps the visible pills and immediately re-applies the merged filter model to AG-Grid.
- **Legacy migration**: pre-profile builds wrote to `localStorage["gc-filters:{gridId}"]`. On first mount, if the active profile's `saved-filters` state is empty *and* a legacy entry exists, it is seeded into module state and the legacy key is deleted (one-shot, gated by a `didMigrateRef`).
- Filter list edits flow through `useModuleState<SavedFiltersState>(store, 'saved-filters')`; a single `useEffect` pushes the merged active model into AG-Grid whenever the array changes (covers add / toggle / remove / rename / clear-all *and* profile switch in one place).

### Filter Application Logic (AND)
- **0 active filters**: `setFilterModel(null)` — grid unfiltered
- **1 active filter**: `setFilterModel(savedModel)` — native AG-Grid filtering, floating filters reflect state
- **2+ active filters**: AND combination by merging filter models
  - All active filter models merged into one (later entries override for same column)
  - `setFilterModel(mergedModel)` — native AG-Grid filtering handles intersection
  - All active conditions must match for a row to be displayed

### Filter Evaluator (`filterEvaluator.ts`)
- Pure function module: `doesRowPassFilterModel(filterModel, rowData): boolean`
- Supports AG-Grid filter types:
  - **Text filters**: equals, notEqual, contains, notContains, startsWith, endsWith, blank, notBlank (case-insensitive)
  - **Number filters**: equals, notEqual, lessThan, lessThanOrEqual, greaterThan, greaterThanOrEqual, inRange, blank, notBlank
  - **Set filters**: values array with string membership check
- Combined filter models (`ICombinedSimpleModel`) with AND/OR operators
- Type inference fallback when `filterType` is missing

### Hover Action Icons
- Hovering over a filter pill reveals edit (pencil) and remove (trash) icons at the right edge
- Icons appear with 150ms opacity transition via Tailwind `group-hover:opacity-100`
- **Rename (pencil)**: click opens inline `<input>` with Enter/blur to confirm, Escape to cancel
- **Remove (trash)**: click deletes the filter and re-applies remaining active filters
- Icons are 9px Lucide icons in 16×16 hit areas with hover backgrounds

### Filter Pill Styling
- Min width: 60px, max width: 180px — labels truncate with ellipsis via `truncate` class
- Tooltip shows full label on hover (via Shadcn `<Tooltip>`)
- 10px left/right padding inside each pill
- 20px gap between pills
- Active state: `bg-primary/15 text-primary border-primary/30`
- Inactive state: `bg-transparent text-muted-foreground border-border opacity-60`

### SavedFilter Interface
```typescript
interface SavedFilter {
  id: string;          // "sf_{timestamp}_{random}"
  label: string;       // User-editable label
  filterModel: Record<string, any>; // AG-Grid getFilterModel() snapshot
  active: boolean;     // Toggle state
}
```

---

## 5. Styling Architecture

### Cell Styling
- Uses `cellClass` with CSS injection (NOT `cellStyle` inline)
- All properties applied with `!important` to override theme defaults and renderer inline styles
- Inheritable properties (color, font-*, text-*) applied to both `.gc-col-c-{colId}` and `.gc-col-c-{colId} *`
- Non-inheritable properties (background-color, padding) applied to cell only
- `cellClassRules` reserved for conditional styling module

### Header Styling
- Functional `headerStyle` for inline properties (excludes floating filters via `params.floatingFilter`)
- `headerClass` for CSS injection targets (alignment, border overlays)
- Reset function returns `{ fontWeight: '', fontStyle: '', ... }` to clear AG-Grid's cached inline styles

### Border Implementation
- `::after` pseudo-element overlay with `box-shadow: inset`
- `pointer-events: none` so AG-Grid selection works through it
- `z-index: 1` above cell content
- Separate CSS rule from main styling (injected via `col-bo-{colId}`)
- AG-Grid cell selection (`box-shadow` on cell) and column separators (`border-right`) unaffected

### Per-Column Overrides vs Templates
- Toolbar writes to `ColumnAssignment.cellStyleOverrides` / `headerStyleOverrides` / `valueFormatterTemplate`
- Templates are only created explicitly via "Save As Template" button or Settings panel
- `resolveColumn()` merges: type defaults → templates (sorted by `updatedAt`) → per-column overrides (highest precedence)

### CellStyleProperties
- Typography: `backgroundColor`, `color`, `fontWeight`, `fontStyle`, `fontSize`, `fontFamily`, `textAlign`, `textDecoration`
- Borders (per-side): `borderTop/Right/Bottom/LeftColor`, `borderTop/Right/Bottom/LeftWidth`, `borderTop/Right/Bottom/LeftStyle`
- Spacing (per-side): `paddingTop/Right/Bottom/Left`

---

## 6. Template System

### Multi-Template Composition
- Each column has `templateIds: string[]` — ordered list of templates to compose
- Styles merge property-by-property: newer `updatedAt` wins for each key
- Per-column `cellStyleOverrides` / `headerStyleOverrides` override all templates

### Template Management (Settings Panel)
- Templates tab: create, edit, delete templates with full style editor
- Each template card shows assigned column count and column names (amber badges)
- Template editor shows "Applied to N columns" with column name badges
- "Apply to columns..." bulk apply modal with column picker
- Value formatter presets: Integer, Number (1-4 dp), USD/EUR/GBP/JPY, Percentage, Basis Points, Date/Time, Boolean, Custom expression

### Column Management (Settings Panel)
- Columns tab: per-column configuration (header name, width, pinning, visibility)
- Shows all assigned template names as amber badges in the column list
- "Add Template" dropdown to assign additional templates
- Individual template remove button per column
- "Edit" button navigates to Templates tab

---

## 7. Module Details

### General Settings (Priority: 0)
- **Grid Options**: row height, header height, row selection mode (single/multi), checkbox selection, row dragging, animate rows, suppress row hover, enable cell text selection, suppress drag leave, suppress column move animation
- **Default Column Definitions**: resizable, sortable, filterable, editable flags; default min/max width; wrap header text; suppress movable columns
- **Pagination**: enable/disable, page size, auto page size, suppress pagination panel

### Theming (Priority: 5)
- **Theme Presets**: quartz, alpine, balham, material
- **Custom Parameters**: accent/background/foreground/border/header colors, row hover/selected colors, font sizes, spacing

### Column Customization (Priority: 10)
- Per-column assignments: header name/tooltip, width, hidden, pinned, cell/header style overrides, cell editor/renderer, value formatter, sortable/filterable/resizable
- Template composition via `templateIds` array
- CSS injection with `.gc-col-c-{colId}` classes
- **Value formatter — three variants via `ValueFormatterTemplate` discriminated union:**
  - `kind: 'preset'` — CSP-safe Intl-based: currency (USD/EUR/GBP/JPY with decimals), percent, number, date, duration. Rendered via the toolbar's icon buttons.
  - `kind: 'expression'` — legacy JS expression compiled with `new Function()` (CSP-unsafe; kept for v1 profile compatibility).
  - `kind: 'excelFormat'` — Excel format strings like `#,##0.00`, `$#,##0;(#,##0)`, `[Red]#,##0`, `0.00%`, `yyyy-mm-dd`, `[hh]:mm:ss`. Parsed via `ssf` (SheetJS format, ~15 KB gzipped) — full Excel parity including conditional sections, color tags, negatives-in-parens, fractions, scientific, elapsed time.
- **Inline Excel-format editor on the FormattingToolbar** ([packages/markets-grid-v2/src/FormattingToolbar.tsx](packages/markets-grid-v2/src/FormattingToolbar.tsx)): text input next to the number-format icon buttons. Select a cell, type any Excel format string, press Enter or blur — the column reformats. Invalid formats show `aria-invalid` (red border) and don't commit. Empty string clears the formatter. When a preset is currently applied, the input shows its Excel equivalent (via `presetToExcelFormat`) so the user can click in and immediately tweak. Seed/commit model matches the other toolbar inputs: local draft state, commit-on-blur/Enter, Escape reverts.
- SSF adapter ([packages/core-v2/src/modules/column-customization/adapters/excelFormatter.ts](packages/core-v2/src/modules/column-customization/adapters/excelFormatter.ts)) caches compiled formatters by format string so per-cell renders pay only one SSF call; malformed formats fall back to identity + single console warn.

### Column Templates (Priority: 1)
- Reusable style templates with name, description, timestamps
- Type defaults: auto-apply by detected data type (numeric, date, string, boolean)

### Column Groups (Priority: 15, v1)
- Group ID, header name, child column IDs
- Open by default toggle, marry children toggle

### Column Groups v2 (Priority: 18, `packages/core-v2/src/modules/column-groups/`)
v2 implementation — nestable column groups authored in a settings-sheet panel, persisted per profile, with runtime expand/collapse memory.

- **State shape**: `{ groups: ColumnGroupNode[], openGroupIds: Record<groupId, boolean> }`. Each `ColumnGroupNode` has `groupId` (stable, reused as AG-Grid `ColGroupDef.groupId` — required for expand/collapse retention across columnDefs updates per AG-Grid v35 docs), `headerName`, `openByDefault?`, `marryChildren?`, and a `children[]` whose entries are either `{ kind: 'col', colId }` or `{ kind: 'group', group: ColumnGroupNode }` — **arbitrary nesting depth**.
- **Transform**: `composeGroups` at [composeGroups.ts](packages/core-v2/src/modules/column-groups/composeGroups.ts) flattens the incoming column defs into a `Map<colId, ColDef>`, recursively builds `ColGroupDef`s from the authored tree, and appends any ungrouped columns at the end in their original order. Tolerates missing colIds (skip the child), duplicate colIds across groups (first occurrence wins), empty groups (omit — AG-Grid warns on them).
- **Priority 18** — after column-customization (10) and calculated-columns (15) so groups see finalized per-col customizations AND can include virtual columns, before conditional-styling (20) so styling rules can still target grouped columns.
- **Runtime open/closed persistence**: subscribes to AG-Grid's `columnGroupOpened` event in `onGridReady`; each user chevron-click writes `openGroupIds[groupId] = isExpanded` via `setModuleState` (closure captured from `onRegister`'s `ModuleContext`). `composeGroups` applies the stored value as `ColGroupDef.openByDefault`, so reloading the app restores the exact layout the user left. No-op write guard prevents feedback loops.
- **Stale-id pruning on deserialize**: `openGroupIds` entries whose `groupId` no longer exists in the tree are stripped when a profile loads — prevents orphaned entries from accumulating across rename/delete cycles.
- **Settings panel** ([ColumnGroupsPanel.tsx](packages/core-v2/src/modules/column-groups/ColumnGroupsPanel.tsx)): recursive `GroupCard` component renders the tree with indentation by depth. Each card has inline header-name edit, up/down arrow reorder (within parent's subgroup list), delete, and a settings expando (`openByDefault` + `marryChildren` switches). Column chips are removable; a filtered `<select>` adds from unassigned columns only. Subgroups nest arbitrarily; a warning chip surfaces at depth ≥ 3.
- **Per-column `columnGroupShow`** (AG-Grid native, v35): each column chip in the panel carries a cycle button that toggles the child's visibility mode — `always` (eye icon, neutral color) → `open` (EyeOff, teal — visible only when parent group is expanded) → `closed` (Lock, amber — visible only when parent group is collapsed, typical for a stand-in aggregate column like "Total"). Stored on the state as `{ kind: 'col', colId, show?: 'always' | 'open' | 'closed' }`. `composeGroups` maps `'always'` to AG-Grid's default (no `columnGroupShow`) and `'open'` / `'closed'` to the corresponding native value on the emitted `ColDef`.
- **Group header formatting**: each group carries an optional `headerStyle` object with `bold`, `italic`, `underline`, `fontSize`, `color`, `background`, `align`. Rendered via a per-grid `CssInjector` that emits `.gc-hdr-grp-{groupId} { … }` rules; the class is attached to the ColGroupDef's `headerClass` only when at least one facet is set, so unstyled groups render at the theme default. Settings panel surfaces the controls in the existing settings expando (B/I/U toggles, align select, font-size number, text/background `PropColor` pickers with Clear).
- **Correct composition order**: `composeGroups` emits each top-level group at the position of its FIRST child's leaf in the base defs (not at the end). AG-Grid v35 preserves each column's prior position across `columnDefs` updates; emitting groups separately from ungrouped columns would cause AG-Grid to yank ungrouped columns back to their original slots, splitting our groups apart. First-leaf placement keeps the diff happy. [Regression test: "Two groups each with one child do not get split apart by ungrouped columns"]
- **Border-overlay fix**: column-customization's `borderOverlayFromOverrides` previously emitted `position: relative` on the target selector to anchor its `::after` box-shadow overlay. That selector also matches AG-Grid's absolute-positioned header cells (`.gc-hdr-c-{colId}`), which clobbered the column's computed `left`/`width` positioning — leading to "grouped column disappears + group header gap" when any per-column border was configured. Fix: drop the `position: relative` emission; AG-Grid's native cell/row positioning already provides a positioned ancestor for the `::after`. Same fix pattern was applied to conditional-styling earlier in the session. [Regression test: "Applying a 1px bottom border to columns inside a group does not break layout"]
- **Interop verified**: virtual columns from `calculated-columns` are included in the unassigned list and can be dropped into groups; conditional-styling rules keep targeting columns correctly when they're inside groups.

### Conditional Styling (Priority: 20)
- Rules with: ID, name, enabled flag, priority, scope (cell/row)
- Expression evaluated against row/cell data (context: `x`, `value`, `data`, `columns`)
- Theme-aware styling (separate light/dark CellStyleProperties)
- CSS injection with `.gc-rule-{ruleId}` classes and `cellClassRules`/`rowClassRules`
- Per-side borders rendered via `::after` + inset `box-shadow` overlay (avoids clipping under `overflow: hidden` and column separator conflicts). Does NOT emit `position: relative` on the target — relies on AG-Grid's built-in positioned cells/rows, so row-scope rules don't override `.ag-row-position-absolute` and break virtual-scroll layout

### Calculated Columns (Priority: 30, v1)
- Virtual columns appended to columnDefs
- Expression-based valueGetter (pre-parsed, evaluated per-cell)
- Lazy evaluation: returns null on expression errors

### Calculated Columns v2 (Priority: 15, `packages/core-v2/src/modules/calculated-columns/`)
New in v2 and the canonical implementation going forward. Virtual derived columns only — cell-level `=FORMULA` entry and custom `formulaFuncs` are intentionally out of scope (AG-Grid's `FormulaModule` caches its function resolver at init and doesn't reliably refresh after, making runtime custom functions unreliable without a grid remount — revisit when AG-Grid exposes the internal `IFormulaService.refreshFormulas` on the public API).

- **State**: `{ virtualColumns: VirtualColumnDef[] }` — each def has `colId`, `headerName`, `expression` (our DSL), optional `valueFormatterTemplate`, optional `position`/`initialWidth`/`initialHide`/`initialPinned`.
- **Transform**: appends virtual columns to the column defs after column-customization (priority 10) so renames/resizes flow through, before conditional-styling (priority 20) so rules can target the new colIds. Sorts by `position` for predictable ordering.
- **Expression compilation**: AST parsed ONCE per transform via the shared per-grid `ExpressionEngine`, closure-captured by the generated `valueGetter`. Bad expressions fall back to `null` — never crash the grid. Same safety pattern applies to `valueFormatterTemplate`.
- **Read-only**: virtual columns are `editable: false` — derived values would be immediately overwritten by the next render.
- **Reactivity**: edits to any source column automatically flow through to the computed value via AG-Grid's valueGetter pipeline (no explicit recompute subscription needed).
- **Settings panel**: one section with per-column cards — `<ExpressionEditor>` (Monaco) for the expression and formatter, column id + header name text inputs, delete button. Uses the same column-autocomplete provider pattern as conditional-styling.
- **Demo seed**: `Gross P&L = [price] * [quantity] / 1000` appears by default at position 20 so the feature is visible on first load; users can delete it via the panel.

### Cell Flashing (Priority: 25)
- Flash rules: target columns, conditional expression, duration/fade timing
- Up/down/neutral colors (light/dark aware)
- Scope: cell or row
- Global overrides for flash/fade duration

### Named Queries (Priority: 55)
- Query definitions with conditions: column, operator (15 types including equals, contains, startsWith, inRange, blank, etc.), value
- Combinator: AND/OR
- Expression mode for advanced queries
- Active query IDs (multiple simultaneous)

### Entitlements (Priority: 60)
- Three rule types: row-value (expression), role-based (user roles), REST (external endpoint with caching)
- Cache TTL, fallback allow/deny
- Disables editing via colDef.editable callback

### Sort & Filter (Priority: 50)
- Multi-sort: key (ctrl/shift), sorting order cycle, accented sort
- Filtering: floating filters, quick filter text, cache toggle, advanced filter

### Editing (Priority: 45)
- Edit type: cell or fullRow
- Single-click edit, stop on focus loss, enter moves down
- Undo/redo cell editing with configurable limit

### Data Management (Priority: 70)
- Row model types: clientSide, serverSide, infinite, viewport
- Async transaction wait, cache block size, max blocks, row buffer

### Export & Clipboard (Priority: 65)
- CSV: file name, separator (comma/semicolon/tab/pipe), include headers
- Excel: file name, sheet name

### Undo/Redo Module (Priority: 75)
- Enabled toggle, history limit (20 default)
- Automatic state snapshots on module changes, full state rollback

### Performance (Priority: 80)
- Suppress column virtualisation, row buffer, debounce vertical scrollbar
- Suppress animation frame, suppress row hover, group default expanded level

### Profiles (Priority: 85)
- Profile management: list, active ID, default ID
- Save/load all module state as snapshots via StorageAdapter

### Expression Editor (Priority: 100)
- Custom functions registry (name, category, description, signature)
- Recent expressions history (max 20)
- Service module — no transforms, provides UI for expression authoring

---

## 8. Settings Panel

### Settings Sheet
- Right-side slide-in panel (680px max width), z-index: 10002
- Slide-in animation (200ms cubic-bezier) with overlay backdrop blur
- Module navigation sidebar with icons
- Draft store pattern — edits are isolated until "Apply" or "Apply & Close"
- ESC key closes with discard
- Reset button to revert to initial state

### Module Panels
- All native HTML controls replaced with Shadcn UI components (Button, Input, Select, Switch, Label)
- Figma-style collapsible property sections
- Column picker with search and multi-select
- Expression field with syntax validation, examples, error display

---

## 9. Theme Support

### Dark/Light Mode Toggle
- Sun/Moon toggle button in app header (top right)
- Theme preference persisted in `localStorage` (`gc-theme`)
- `data-theme="light"` attribute on `<html>` element

### Dark Theme (Default)
- FI Trading Terminal palette: `#0b0e11` ground, `#161a1e` surfaces, `#eaecef` text
- Accent colors: teal (#2dd4bf positive), red (#f87171 negative), amber (#f0b90b primary), blue (#3da0ff info), cyan (#22d3ee highlight)
- AG-Grid `themeQuartz.withParams()` with matching colors

### Light Theme
- Clean palette: `#f8f8f8` ground, `#ffffff` surfaces, `#3b3b3b` text
- Accent colors: teal (#0d9488), red (#dc2626), amber (#d97706), blue (#2563eb), cyan (#0891b2)
- AG-Grid `themeQuartz.withParams()` with matching colors

### Theme-Aware Components
- All toolbar buttons use CSS variables (`--foreground`, `--muted-foreground`, `--accent`, `--primary`, `--border`, `--card`)
- `gc-tbtn`, `gc-tbtn-active`, `gc-toolbar-sep` CSS classes in `@layer components` (proper cascade order)
- Color picker, border editor, settings panel — all use CSS vars, no hardcoded hex values
- Shadcn `<Button>` components used for CELL/HDR toggle, border presets, save-as-template
- Base CSS reset moved to `@layer base` to avoid overriding Tailwind utilities

### AG-Grid Scrollbar Styling
- Dark/light mode compatible custom scrollbar styling
- `scrollbar-width: thin` with `scrollbar-color` for Firefox
- WebKit scrollbar: 6px width/height, rounded 3px thumb, transparent track
- Hover state: thumb changes to brighter color
- Targets all AG-Grid scrollable containers: `ag-body-viewport`, `ag-center-cols-viewport`, `ag-side-bar`, `ag-virtual-list-viewport`, `ag-sticky-top-viewport`, etc.
- Dark theme: `#4a5568` thumb, `#7a8494` hover
- Light theme: `#c4c4c4` thumb, `#a0a0a0` hover

### AG-Grid Header Button Collapse
- Column header menu/filter buttons hidden by default (width: 0, opacity: 0)
- Appear on hover with 150ms CSS transition (width, opacity, padding, margin)
- Space fully collapses when hidden (not just visual — uses `min-width: 0 !important`)
- Floating filter buttons follow same pattern

---

## 10. AG-Grid Integration

### Grid Compatibility
- `cellClass` for static styling, `cellClassRules` reserved for conditional styling
- `headerStyle` (functional) + `headerClass` for header styling
- `getRowId` defined outside component for stable reference
- No `{...gridOptions}` spread (prevents row vanishing during fast scroll)
- `ModuleRegistry.registerModules([AllEnterpriseModule])` called once globally
- `cellSelection={true}` enabled for range selection

### React Strict Mode Compatibility
- `CssInjector.destroy()` resets `dirty` flag so `scheduleFlush()` works after re-initialization
- `CssInjector.ensureStyleElement()` recreates detached style elements
- `GridCustomizerCore.updateStoreBindings()` syncs store references on re-mount
- Module context maps not deleted in `onGridDestroy` (core instance reused)

---

## 11. Markets-Grid Package

### MarketsGrid Component
- Drop-in AG-Grid wrapper with built-in customization
- Props: `rowData`, `columnDefs`, `theme`, `gridId`, `rowIdField`, `modules`, `showToolbar`, `showSettingsButton`, `persistState`, `extraToolbars`, `showFiltersToolbar`, `rowHeight`, `headerHeight`, `animateRows`, `sideBar`, `statusBar`, `defaultColDef`, `onGridReady`, `className`, `style`
- Auto-registers AG-Grid Enterprise modules
- Integrates FormattingToolbar + ToolbarSwitcher + FiltersToolbar
- Settings button opens SettingsSheet

### Cell Renderers (6 specialized)

| Renderer | Purpose | Details |
|----------|---------|---------|
| **SideRenderer** | BUY/SELL badges | Teal (#2dd4bf) for Buy, Red (#f87171) for Sell; 600 weight, 9px |
| **StatusRenderer** | Order status badges | OPEN (blue), PARTIAL (amber), FILLED (teal), CANCELLED (red) with background + text color |
| **FillBarRenderer** | Horizontal progress bar | Filled/quantity percentage; green (100%), amber (>0%), gray (0%); 300ms animation |
| **CurrencyRenderer** | USD formatting | `Intl.NumberFormat` with 2 decimal places |
| **NumberRenderer** | Decimal formatting | `Intl.NumberFormat` with 3 decimal places |
| **QuantityRenderer** | Integer formatting | Thousands separator, no decimals |

---

## 12. UI Component Library

### Shadcn Components (in `@grid-customizer/core`)
- **Button**: 7 variants (default, secondary, outline, ghost, destructive, link) + sizes (xs, sm, md, lg, icon, icon-sm)
- **Input**: text field with consistent styling
- **Select**: dropdown with proper z-indexing
- **Switch**: toggle with primary color active state
- **Popover**: floating panel for color pickers, border editor, font size, etc.
- **Tooltip**: hover text for button descriptions
- **Separator**: visual divider
- **Label**: form labels
- **ToggleGroup / ToggleGroupItem**: segmented button groups (used for CELL/HDR toggle)
- **ColorPicker / ColorPickerPopover**: shared color picker with swatch grid, hex input, recent colors, system pipette

### Property Panel Components
- `PropertySection`: collapsible group with header
- `PropRow`: labeled control wrapper
- `PropSwitch`, `PropSelect`, `PropNumber`, `PropText`, `PropColor`: form field helpers
- `FieldRow`, `SwitchField`, `NumberField`, `TextField`, `SelectField`, `ColorField`, `ExpressionField`: alternative form field set

### Column Picker
- `ColumnPickerSingle`: dropdown select one column
- `ColumnPickerMulti`: multiselect with search
- `useGridColumns()`: hook to get live column list from grid API

---

## 13. Design System

### FI Trading Terminal Tokens
- Sourced from `/Users/develop/projects/fi-trading-terminal/design-system/`
- Surface layers: ground → primary → secondary → tertiary
- Text hierarchy: primary → secondary → muted → faint
- Accent colors: teal (positive), red (negative), amber (warning/primary), blue (info), cyan (highlight), purple (tertiary)
- Typography: JetBrains Mono (data/monospace), Geist (UI/sans-serif), 9/11/13/18px scale
- Tailwind CSS v4 with `@theme inline` block mapping CSS variables

### CSS Variable System (50+ variables)
- **Surface**: `--background`, `--card`, `--popover`, `--secondary`, `--muted`, `--accent`
- **Text**: `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground`, `--muted-foreground`, `--accent-foreground`
- **Brand**: `--primary`, `--primary-foreground`, `--destructive`, `--destructive-foreground`
- **Borders**: `--border`, `--input`, `--ring`
- **FI Aliases**: `--bn-bg` through `--bn-bg3`, `--bn-t0` through `--bn-t3`, `--bn-border`, `--bn-green/red/yellow/blue/cyan`
- **Typography**: `--fi-mono`, `--fi-sans`, `--fi-font-xs/sm/md/lg`
- **Spacing**: `--space-0` through `--space-8` (4px base scale)
- **Radius**: `--radius-none/sm/md/lg/xl/full` (0-9999px)

---

## 14. Testing

### E2E Tests (114 total across 6 suites)
- **Playwright** with Chromium, auto-starts dev server on port 5190
- `clickToolbarBtn` helper uses exact text match to avoid "Save" matching "Save as template"
- React fiber tree walking to programmatically call AG-Grid API (`setFilterModel()`) in filter tests

### Test Suites

| Suite | File | Tests | Coverage |
|-------|------|-------|----------|
| Border Selection | `e2e/border-selection.spec.ts` | 6 | Border overlay via `::after`, cell selection coexistence, column separator preservation |
| Toolbar Features | `e2e/toolbar-features.spec.ts` | 23 | All toolbar features including clear-all header styles |
| Toolbar Buttons | `e2e/toolbar-buttons.spec.ts` | 27 | Every button on cells AND headers, cell/header independence |
| Templates | `e2e/templates.spec.ts` | 13 | Template dropdown, apply, save-as, persistence, composition |
| Extended Coverage | `e2e/extended-coverage.spec.ts` | 33 | Text/bg color, currencies (EUR/GBP/JPY), borders, header templates, multi-column, undo chains, persistence, settings panel |
| Filters Toolbar | `e2e/filters-toolbar.spec.ts` | 10 | Empty toolbar, no-op capture, capture filter, toggle off/on, AND logic, hover icons, rename, remove, save/persist |

### Feature Test Matrix

| Feature | Cell Tests | Header Tests |
|---------|-----------|-------------|
| Bold | on/off | on/off |
| Italic | on/off | apply |
| Underline | apply | apply |
| Alignment L/C/R | 3 tests | 3 tests |
| Font Size | apply | apply |
| Text Color | 3 tests | — |
| Background Color | 3 tests | — |
| Borders All/None | 2 tests | 1 test |
| Border Width/Presets | 5 tests | — |
| Currency USD/EUR/GBP/JPY | 4 tests | — |
| Percent/Thousands | 2 tests | — |
| Decimal ←/→ | 2 tests | — |
| Clear All | cells | headers + cells |
| Save + Persist | 1 test | — |
| State Persistence | 4 tests | — |
| Undo/Redo | 2 tests + 3 chains | — |
| Template Dropdown | 4 tests | header mode |
| Save As Template | 5 tests | — |
| Template Composition | 2 tests | — |
| Multi-Column Selection | 3 tests | — |
| Settings Panel | 1 test | — |
| Header Number Format Disabled | 2 tests | — |
| Color Picker Edge Cases | 2 tests | — |

---

## 15. Monorepo Structure

```
aggrid-customization/
├── packages/
│   ├── core/                    # @grid-customizer/core
│   │   └── src/
│   │       ├── core/            # GridCustomizerCore, EventBus, CssInjector, BatchProcessor, lifecycle
│   │       ├── expression/      # Tokenizer, Parser, Evaluator, Compiler (60+ built-in functions)
│   │       ├── persistence/     # StorageAdapter, DexieAdapter, LocalStorageAdapter, RestAdapter
│   │       ├── modules/         # 18 feature modules (each: index.ts, state.ts, Panel.tsx)
│   │       ├── stores/          # Zustand store factory, useModuleState
│   │       ├── hooks/           # useGridCustomizer, useProfileManager
│   │       ├── ui/              # SettingsSheet, ModuleNav, PropertyPanel, FormFields, ColumnPicker
│   │       │   └── shadcn/      # Button, Input, Select, Switch, Popover, Tooltip, ColorPicker, etc.
│   │       └── types/           # TypeScript interfaces (common, module, profile, events)
│   └── markets-grid/            # @grid-customizer/markets-grid
│       └── src/
│           ├── MarketsGrid.tsx       # Drop-in AG-Grid wrapper
│           ├── FormattingToolbar.tsx  # Excel-style formatting toolbar
│           ├── ToolbarSwitcher.tsx    # Multi-toolbar pill switcher
│           ├── FiltersToolbar.tsx     # Saved filter capture/toggle toolbar
│           ├── filterEvaluator.ts    # Pure filter model evaluator for OR logic
│           ├── renderers/            # 6 cell renderers (Side, Status, FillBar, Currency, Number, Quantity)
│           ├── types.ts              # MarketsGridProps, ToolbarSlotConfig, SavedFilter
│           └── index.ts              # Public API exports
├── apps/demo/                   # Demo app (thin consumer)
│   └── src/
│       ├── App.tsx              # Demo with 500 orders, dark/light toggle, extra toolbars
│       ├── data.ts              # Order data generator
│       └── globals.css          # FI design system tokens, toolbar CSS, scrollbar styling
├── e2e/                         # Playwright E2E tests (114 tests across 6 suites)
├── playwright.config.ts
└── package.json                 # npm workspaces
```

---

## 16. v2 Clean Rewrite (`@grid-customizer/core-v2` + `@grid-customizer/markets-grid-v2`)

A parallel v2 platform lives alongside v1 on the `v2-rewrite` branch. v2 is a clean-room rewrite of the core + 5 essential modules that fixes four architectural seams that had accreted debt in v1. Consumer apps opt in per mount — v1 and v2 can coexist indefinitely, each with its own IndexedDB database and its own module registry.

### What v2 delivers
- **Single source of truth** — profile snapshots in IndexedDB (`gc-customizer-v2` db) are the only persisted form. The `gc-state:<id>` and `gc-grid:<id>` localStorage keys v1 used for caching are deleted on first v2 mount.
- **Per-module schema versioning** — every module declares `schemaVersion: number` and an optional `migrate(raw, fromVersion)` hook. Snapshots are wrapped as `{ v: N, data: ... }` so a field rename in any module no longer corrupts every old profile.
- **Explicit save API** — `profiles.saveActiveProfile()` is a direct function call. The `activeFiltersRef` mutation pattern and the `gc:save-all` window event are gone; the Save All button, the auto-save subscriber, and any other caller all converge on the one function.
- **Auto-save** — a 300ms-debounced subscriber writes to the active profile snapshot on every store change. The Save All button is retained as a visible-confirmation flush, not a correctness requirement. E2E specs that required `await page.click('button[title*="Save all settings"]')` before every reload can drop those clicks.
- **Enforced module dependencies + topological registration** — `core.registerModule(m)` throws if any declared dependency isn't yet registered, and registration order = a topological sort of the dependency graph.

### v2 module scope (shipping in v2.0)
- `general-settings`, `column-customization`, `conditional-styling`, `saved-filters`, `toolbar-visibility` (state-only; pills/stacked-toolbar UI pending in v2.1)

Remaining modules (cell-flashing, calculated-columns, column-groups, column-templates, data-management, editing, entitlements, export-clipboard, expression-editor, named-queries, performance, profiles-panel, sort-filter, theming, undo-redo) stay at v1 and will be ported one at a time in v2.1 / v2.2. Consumer apps that need any deferred module continue mounting v1 until those ports land.

### v2 demo mount
`apps/demo` reads a `?v=2` query-string flag and conditionally mounts `MarketsGrid` from `@grid-customizer/markets-grid-v2` (with the v2 `DexieAdapter`) instead of the v1 equivalent. v1 remains the default at `/`; the v2 mount is opt-in at `/?v=2`.

### v2 verification at ship-time
- **Unit tests**: core-v2 Vitest suite — 142 tests passing.
- **v1 regression guard**: all 24 in-scope E2E tests (profiles, default-profile, saved-filters-per-profile, toolbar-visibility) stay green against the v1 mount with v2 packages installed.
- **v2 auto-save contract**: `e2e/v2-autosave.spec.ts` — 4 tests covering Default-profile auto-seed, user-profile persistence without Save All, filter-pill persistence without Save All, and Save All remaining available as a flush affordance.
- **v2 conditional-styling UI**: `e2e/v2-conditional-styling.spec.ts` — 4 tests covering Settings drawer open/close, rule add → cells styled, disable → styling cleared, delete → rule + styling removed, plus rule-survives-reload via auto-save.
- **v2 conditional-styling against real columns**: `e2e/v2-conditional-styling-columns.spec.ts` — 6 tests exercising real blotter conditions (`x == 'BUY'` on Side, `x == 'FILLED'` on Status, `x > 1000` on Quantity, `x > 50` on Spread, row-scope `data.status == 'FILLED'`, multi-rule survival across reload). Each test asserts both the painted DOM and the IndexedDB snapshot of the Default profile (`__default__`), proving the rules round-trip via auto-save with no Save All click.
- **v2 perf parity**: `e2e/v2-perf.spec.ts` — v2 mount median 321ms vs v1 363ms (0.884 ratio, v2 is ~12% faster); v2 auto-save observable in IndexedDB within 84ms of the trigger (target 300ms debounce + 1s margin).

### v2.1 — first deferred-module port (conditional-styling SettingsPanel UI)
v2.0 shipped the conditional-styling **engine** (state, transforms, ExpressionEngine wiring, CssInjector) but no UI to author rules. v2.1 adds:
- `packages/core-v2/src/ui/GridContext.tsx` — `<GridProvider>` + `useGridStore()` / `useGridCore()` hooks. Lets module SettingsPanels reach the live store/core without prop-drilling, mirroring v1's `GridCustomizerContext`.
- `packages/core-v2/src/modules/conditional-styling/ConditionalStylingPanel.tsx` — port of the v1 panel adapted to v2's `useModuleState(store, id)` API. No draft layer (v2 has none — every edit lands in the live store and auto-saves on a 300ms debounce). Includes a chip-style multi-select column picker that reads columns live from `core.getGridApi()`, replacing v1's `ColumnPickerMulti` which couples to v1 context.
- `packages/markets-grid-v2/src/SettingsSheet.tsx` — drawer host that enumerates `modules.filter(m => m.SettingsPanel)`, renders a left-rail nav, and slots the active module's panel into the body. Wraps content in `<GridProvider>`. Reuses v1's `gc-settings-styles` CSS string for visual continuity.
- New `Settings` toolbar button in `MarketsGrid` v2 (`data-testid="v2-settings-open-btn"`) opens the sheet; ESC or `Done` closes. No Apply/Reset buttons — auto-save makes them obsolete.

### v2.1 follow-up — `transformGridOptions` pipeline wiring
The conditional-styling row-scope path exposed a v2 gap: `useMarketsGridV2` was building `columnDefs` via `core.transformColumnDefs` but never invoking `core.transformGridOptions`, so module outputs that live on `GridOptions` (`rowClassRules`, `pagination`, `rowSelection`) never reached AG-Grid. v2.1 closes this:
- `useMarketsGridV2` now memoizes a `gridOptions` value from `core.transformGridOptions({})`, recomputed on every store tick.
- `MarketsGrid` v2 spreads that `gridOptions` onto `<AgGridReact>` BEFORE explicit host props, so consumer-supplied `rowHeight` / `headerHeight` / etc. still win on conflict, but module-only outputs flow through unchanged.
- Critically, `gridOptions` is also pushed imperatively via `api.setGridOption(key, value)` in a `useEffect` keyed on the memo. AG-Grid's React adapter does **not** reactively forward grid-options-shaped props to the live grid instance — those have to be re-pushed via the API. Followed by `api.redrawRows()` so already-rendered viewport rows pick up freshly-applied predicates instead of keeping stale classes.

### v2 code size
| Package                              | LOC   |
|--------------------------------------|-------|
| `packages/core-v2` (core + 5 modules + tests + v2.1 UI) | ~4,300 |
| `packages/markets-grid-v2` (incl. SettingsSheet)        | ~1,100 |
| **Total v2 (v2.0 + v2.1)**                              | **~5,400** |

Within the planned 4,500–5,500 LOC envelope (v1 is 14,107 LOC across 20 modules).

### Column Templates (v2 sub-project #2)

- New `column-templates` module in `@grid-customizer/core-v2` — passive state
  store of `Record<id, ColumnTemplate>` plus `typeDefaults` keyed by
  AG-Grid `cellDataType`.
- Pure `resolveTemplates(assignment, templatesState, cellDataType)` resolver:
  composes a chain of templateIds + an optional typeDefault fallback into a
  composite assignment; assignment fields always win last.
- Per-field merge for `cellStyleOverrides` / `headerStyleOverrides` (typography,
  colors, alignment, borders); last-writer-wins for everything else.
  `cellEditorParams` replaced wholesale (opaque-object semantic).
- `column-customization` module bumped to `schemaVersion: 3` with three new
  optional fields on `ColumnAssignment` (`cellEditorName`, `cellEditorParams`,
  `cellRendererName`) and a new `dependencies: ['column-templates']`
  declaration — first real exercise of the v2 core's dep enforcement.
- `GridContext` extended with `getModuleState<T>(moduleId)` so cross-module
  reads work from inside `transformColumnDefs`.
- 22 resolver unit tests + 9 column-customization integration tests + module
  metadata + serialize/deserialize round-trip + dep-enforcement test.
- UI surface deferred to sub-project #4 (FormattingToolbar v2 port).

### FiltersToolbar v2 — scroll chrome + parity sweep (v2 sub-project #3)

- Restored v1's scroll-overflow caret chrome on `packages/markets-grid-v2/src/FiltersToolbar.tsx`:
  left/right chevrons appear when the pill row's `scrollWidth` exceeds its
  `clientWidth`, click-to-scroll by 150px increments, ResizeObserver +
  scroll listener keep the caret state live. Pure UI — no coupling to
  `rowData` or grid api state.
- New `e2e/v2-filters-toolbar.spec.ts` (13 tests) mirrors v1's
  `filters-toolbar.spec.ts` for every preserved feature: empty state,
  capture, toggle on/off, AND across columns, OR within a set-filter
  column, hover icons, rename, remove, clear-all, auto-save persistence
  through reload (no Save All click), and the new scroll-overflow chrome.
- `docs/MIGRATION.md` documents the three deliberate v1→v2 cuts:
  `activeFiltersRef` (replaced by `useModuleState('saved-filters')`),
  per-pill row-count badges (would re-couple to `rowData`), and legacy
  `gc-filters:<gridId>` migration (v2 is greenfield).

### FormattingToolbar v2 — inline cell/header formatting (v2 sub-project #4)

Port of v1's 1,008-LOC `FormattingToolbar` to v2's structured state shape.
Lives at `packages/markets-grid-v2/src/FormattingToolbar.tsx` and is wired
through a new `showFormattingToolbar` prop on `MarketsGrid` v2 (default
`false`; demo opts in for both versions).

Features (12 of 14 ported; 2 deferred):

- Templates dropdown + Save-as popover — writes to `column-templates.templates`
  and sets `assignments[colId].templateIds = [tplId]` on apply
- Bold / Italic / Underline — write `cellStyleOverrides.typography.{bold|italic|underline}`
- Font-size dropdown (10 presets, 9-24px) — writes `typography.fontSize` as a number
- Text + background color pickers — write `colors.{text|background}`
- Alignment L / C / R — writes `alignment.horizontal`
- Currency presets (USD/EUR/GBP/JPY) — `valueFormatterTemplate.kind = 'preset'`
  with `preset: 'currency'` and the matching ISO code
- Percent / Thousands — preset `percent` / preset `number` with `decimals: 0`
- BPS — falls back to `kind: 'expression'` because there's no `bps` preset
- Decimal precision ± — reads / increments `valueFormatterTemplate.options.decimals`
- Borders popover — All / per-side / None buttons + width (1-3) + style (solid/
  dashed/dotted) + color picker. Each side stored as a `BorderSpec`; the
  flattener (`cellStyleToAgStyle`) emits `border-{top|right|bottom|left}` shorthands
- Clear all — resets `assignments[colId] = { colId }`, dropping every override
  and template reference
- Cell / Header target toggle — local component state; writes route to
  `cellStyleOverrides` or `headerStyleOverrides`

Deferred:

- Save All — already exists in `MarketsGrid` v2 toolbar; no duplicate added
- Undo / Redo — v2 has no undo-redo module yet; buttons render disabled with
  a "deferred to v2.2" tooltip for layout parity

The v2 column-customization walker (`cellStyleToAgStyle.ts`) and template
resolver (`resolveTemplates.ts`) shipped with sub-project #2 already convert
the structured shapes into AG-Grid CSS / colDef fields, so this port did not
need any module-internal changes. The only core-v2 change was to re-export
the structured types (`BorderSpec`, `CellStyleOverrides`, `ValueFormatterTemplate`,
`PresetId`) from the package root so the toolbar can reach them without
deep-importing module internals.

**Template-apply UX deviation from v1 (intentional):** v1's "apply template"
appended the new id to the existing chain (`templateIds: [...existing, tplId]`).
v2's toolbar replaces the chain instead (`templateIds: [tplId]`). Rationale:
v2's resolver supports stacking, but exposing that through a single dropdown
click is non-obvious to users — clicking "Bold" then "BlueAccent" should result
in the column showing BlueAccent, not the union of both. Templates that should
compose are still applied programmatically by setting `templateIds: [a, b]`
directly through `setModuleState`.

### SettingsSheet + ConditionalStylingPanel (v2 sub-project #2.5)

- New `SettingsSheet` drawer in `@grid-customizer/markets-grid-v2` — auto-discovers
  any module that exposes a `SettingsPanel` slot on its `Module<S>` definition
  and renders it in a left-rail nav. Live editing with ~300ms auto-persist; no
  Save/Cancel dance. ESC closes.
- New `GridProvider` / `useGridStore` / `useGridCore` context in
  `@grid-customizer/core-v2` so SettingsPanel components reach the live store
  and core without prop-drilling. Mirrors v1's `GridCustomizerContext` on v2
  types.
- First SettingsPanel wired: `conditional-styling` now ships
  `ConditionalStylingPanel` as its `SettingsPanel`. Subsequent module ports
  (v2.1+) register their own panels the same way — no SettingsSheet changes
  needed per new module.
- `MarketsGrid` v2 gains a `showSettingsButton` prop (default `true`) and a
  Settings toolbar button.
- `useMarketsGridV2` now exposes aggregated `gridOptions` from the module
  pipeline (rowClassRules, pagination, rowSelection) so the host can spread
  them onto `AgGridReact` under explicit prop overrides.
- 2 new v2 E2E specs: `v2-conditional-styling.spec.ts` (drawer lifecycle +
  rule CRUD) and `v2-conditional-styling-columns.spec.ts` (FI-trading-desk
  scenarios with reload-persistence proof). Total v2 E2E: 16 passing.
- Also fixed a latent bug from sub-project #2: commit `d284044` exported
  `GridContext` from `core-v2`'s barrel while the file was untracked, making
  the clean committed state unbootable. Landing the `ui/GridContext.tsx` file
  in this bundle closes that gap.

### See also
- `docs/MIGRATION.md` — prop-by-prop guide for switching a consumer app from v1 to v2, including the one-shot legacy-key migration and the E2E selector compatibility matrix.

---

## 17. v2 Post-2.5 Feature Pipeline

The work below landed after the v2.5 Settings Sheet shipped. It builds the full
Cockpit editor surface — shared primitives, a new settings shell, every module's
panel, and a pile of correctness + UX fixes that made v2 production-ready for
the FI blotter use case. Organised by area rather than chronologically.

### 17.1 Figma-inspired Format Editor primitives

A shared set of primitives used by every v2 editor that authors cell / header
styling. All live in `packages/core/src/ui/format-editor/` and are promoted
through the package barrel so both v1 and v2 can import them.

- **`FormatPopover`** — Radix-Popover wrapper. Portal-based (escapes
  `overflow: hidden`), collision-detected (flip + shift), registered with
  a shared popover stack so nested popovers (border-editor → color-picker →
  thickness dropdown) don't close each other on outside-click.
- **`FormatColorPicker`** — saturation-value square + hue slider + alpha
  slider + hex input + recent-swatch strip. One component replaces every
  earlier colour picker in v1.
- **`FormatSwatch`** / **`FormatDropdown`** — compact colour swatch with
  drill-in picker, dropdown primitive that portals its menu.
- **`BorderSidesEditor`** — 5-row table (All / Top / Bottom / Left / Right)
  with colour + thickness (1-5px) + style (solid/dashed/dotted) per side.
  Emits `BorderSpec` shapes consumed by both column-customization and
  conditional-styling.
- **`ExcelReferencePopover`** — dark-mode-aware scrollable panel listing the
  8 categories of Excel format string tokens, accessible from every format
  input via an info icon. Theme-aware scrollbar colours (fixed a white-bar
  bug when portaled out of the gc-sheet scope).
- **Responsive popover height** — every `FormatPopover` caps content at
  `--radix-popover-content-available-height` with `overflowY: auto`, so a
  tall popover (e.g. the FormatterPicker's preset grid) scrolls internally
  instead of clipping off the viewport edge on short windows.

### 17.2 Cockpit SettingsPanel primitive kit

New in `packages/core-v2/src/ui/SettingsPanel/` — every v2 editor composes
from these instead of rolling its own chrome.

| Primitive | Purpose |
|---|---|
| `PanelChrome` | Panel-frame shell with grip, title, status, close |
| `Band` | Numbered section header (`01 EXPRESSION`…) + hairline rule |
| `FigmaPanelSection` | Collapsible grouping of Rows with header + actions |
| `SubLabel` | 11px uppercase subsection label |
| `ObjectTitleRow` | 18px object-title row with action pills |
| `TitleInput` | Inline rename input sized for object titles |
| `ItemCard` | Single-item shell: title + dirty-dot + Save pill + delete |
| `PairRow` | 2-column paired field (Size/Weight, Top/Right border) |
| `IconInput` | 30px input pill with left icon + right suffix, commit-on-blur |
| `PillToggleGroup` + `PillToggleBtn` | Butt-joined sharp-corner toggles |
| `SharpBtn` | 26px rectangular action button (4 variants: default/action/ghost/danger) |
| `Stepper` | Narrow numeric field for up/down |
| `TGroup` / `TBtn` / `TDivider` | Flat-tray toolbar buttons used by toolbars + editors |
| `MetaCell` | Cell for the 4-column meta strip (SCHEMA / OVERRIDES / DIRTY / …) |
| `GhostIcon` | Transparent icon button for row-end actions |
| `DirtyDot` / `LedBar` | Pulsed indicators for unsaved state |
| `Caps` / `Mono` | Typography primitives |
| `TabStrip` | Sub-tabs under chrome (Rule / Preview) |
| `Band` index scaffold | Consistent `01 ESSENTIALS` band-numbering style |

All primitives consume the `--ck-*` token system scoped to `.gc-sheet-v2`:
`--ck-bg / --ck-card / --ck-border / --ck-green / --ck-t0..t3 / --ck-font-sans /
--ck-font-mono`. Dark is the default; a `[data-theme='light']` variant remaps
everything.

### 17.3 Unified `<StyleEditor>` (shared across every panel)

One component edits the style of any AG-Grid element (cell, header, group
header). Lives at `packages/core-v2/src/ui/StyleEditor/`. Composes:
- **TextSection** — PillToggleGroup for B / I / U / S + alignment, Size +
  Weight pair via shadcn Select.
- **ColorSection** — two `CompactColorField`s (Text / Background).
- **BorderSection** — reuses `BorderSidesEditor` unchanged.
- **FormatSection** — `FormatterPicker` driven by `dataType`.

Value shape is `StyleEditorValue` with `bold / italic / underline /
strikethrough / align / fontSize / fontWeight / color / backgroundColor /
backgroundAlpha / borders / valueFormatter`. Consumers pass `sections={[…]}`
to opt into subsets (e.g. column-groups uses `['text', 'color']` only).

### 17.4 Compact `<ColorPicker>` (`CompactColorField` + `ColorPickerPopover`)

Replaces every swatch + custom hex input scattered through v1 / early v2
editors. `CompactColorField` is the 30px inline field (swatch + hex +
alpha + eye / clear). `ColorPickerPopover` is the full Figma popover:
Custom / Libraries tabs, fill-type strip, saturation square, hue + alpha
sliders, eyedropper, hex + mode dropdown, recent swatches.

### 17.5 Radix Popover migration

Every popover in the app (ColorPicker, FormatPopover, shadcn `<Popover>`,
`<Select>`, `<AlertDialog>`, AG-Grid menus adjacencies) now routes through
Radix primitives. Handles portal rendering, collision detection, focus
management, Escape dismiss, and accessibility out of the box.

### 17.6 ExpressionEditor hardening (Monaco-based)

- **Suggest widget body-mount** — the settings sheet uses `transform:
  translate(-50%, -50%)` which creates a containing block for `position:
  fixed`. Monaco's suggest widget was drifting hundreds of px below the
  cursor. Fix: body-mounted `data-gc-monaco-overflow` container with
  `overflowWidgetsDomNode` pointing to it; sheet-scoped `--ck-*` tokens
  rebound on the host so the widget paints with a solid background.
- **Live draft propagation** — both the calc-column editor and the
  conditional-styling rule editor now wire `<ExpressionEditor onChange>`
  into `useDraftModuleItem.setDraft`. Previously only `onCommit`
  (blur / Ctrl+Enter) fed the draft, so typing a new expression left the
  SAVE pill greyed out until the user explicitly blurred. Users filed
  this as "SUM doesn't work" because they never saw the button light up.

### 17.7 Conditional Styling — rich rule editor

Full rewrite of the Style Rules panel on the Cockpit primitives:
- Expression field (Monaco `<ExpressionEditor>`) with live column / function
  autocomplete and `[col]` hints.
- Scope pill (cell vs row) + target-columns chip picker + priority +
  APPLIED-rows live counter.
- `<StyleEditor>` embedded with all four sections enabled.
- Flash config band — target (row / cells / headers / cells+headers),
  duration, fade, continuous-pulse toggle.
- **Rule indicator badges** — per-rule icon (20+ Lucide glyphs) + color +
  position (top-left / top-right) + target (cells / headers / both).
  Renders via CSS `::before` on the `gc-rule-{id}` class so paint stays
  cheap; no per-cell React work. Indicators now explicitly exclude
  `.ag-floating-filter` so they don't double-paint on the filter row.
- **Per-rule value formatter** — a rule can carry a `valueFormatter` that
  wraps the column's existing formatter; the highest-priority matching
  rule wins. Same `ValueFormatterTemplate` shape every other format-aware
  module uses.
- Per-card Save + Dirty LED pattern via `useDraftModuleItem`.

### 17.7b Column Settings — per-column master-detail editor

New entry in the settings-sheet header dropdown: **Column Settings**
(module id `column-customization`, renamed from the earlier internal
"Columns" label). Replaces the hidden per-column editing surface that
previously only lived inside the Formatting Toolbar. Now every column
is addressable from one screen.

- **ListPane** — reads the live column set from
  `api.getColumns()` (re-subscribed on `columnEverythingChanged /
  displayedColumnsChanged / columnVisible / columnPinned / columnResized`)
  so the left rail always lists every column the grid currently has,
  including virtual / calculated cols. Internal columns with ids
  starting `ag-Grid-` (e.g. the auto-selection column) are filtered
  out — they're configured globally via Grid Options. Each row
  carries a dirty-state LED (via the shared `gc-dirty-change` custom
  event) and a green `•` marker when the column has any stored
  overrides.

- **EditorPane** — seven bands, all driven by `useDraftModuleItem`
  scoped to `state.assignments[colId]`:

  | Band | Controls |
  |---|---|
  | 01 HEADER | header name override, tooltip |
  | 02 LAYOUT | initial width, pinned (OFF/LEFT/RIGHT), initial hide, sortable/resizable as tri-state Selects (DEFAULT/ON/OFF) |
  | 03 TEMPLATES | **chip list of applied `column-templates`** with per-chip × to remove + shadcn-Select picker to add any unapplied template. Caption clarifies "APPLICATION ORDER — LATER TEMPLATES LAYER OVER EARLIER" since resolution is order-dependent. |
  | 04 CELL STYLE | embedded `<StyleEditor sections={['text','color','border']}>` wired through a local `CellStyleOverrides ↔ StyleEditorValue` bridge (typography / colors / alignment / per-side borders) |
  | 05 HEADER STYLE | same editor, scoped to `headerStyleOverrides`. Caption: "Blank alignment = follow the cell. Explicit value overrides." — matches the header-follows-cell fallback in reinjectCSS. |
  | 06 VALUE FORMAT | shared `FormatterPicker` in compact popover mode — same Figma-style preset grid the Formatting Toolbar + Style Rule editor + Calculated Column editor all use. |
  | 07 FILTER | rich per-column filter config (schemaVersion 4): master enable tri-state, kind picker (`agTextColumnFilter` / `agNumberColumnFilter` / `agDateColumnFilter` / `agSetColumnFilter` / `agMultiColumnFilter`), floating-filter Switch, button multi-select (apply/clear/reset/cancel), debounce, closeOnApply. When kind = `agSetColumnFilter`: mini-filter, select-all, alphabetical sort, Excel-mode Windows/Mac, default-to-nothing-selected. When kind = `agMultiColumnFilter`: ordered sub-filter list with per-row display-mode (inline / subMenu / accordion) + remove. The transform composes AG-Grid `filter` / `filterParams` / `floatingFilter` ColDef fields. |

- **Save semantics** — explicit SAVE pill (draft / dirty pattern). A
  commit that clears every override deletes the assignment entry
  outright rather than leaving a `{ colId }`-only stub. Auto-save
  picks the commit up on the usual 300ms debounce.

- **Works for virtual columns** — calculated columns land in
  `api.getColumns()` once `calculated-columns.transformColumnDefs`
  has run at priority 15, so they show in the list automatically.
  Header-follows-cell alignment + the Excel-colour cellStyle
  resolver already cover the styling pipeline end-to-end for
  virtual cols (see 17.8).

- **Back-compat** — module id / schemaVersion / serialise contract
  unchanged. Existing profile snapshots round-trip without a
  migration bump; the rename is display-only.

Test IDs: `cols-item-{colId}`, `cols-editor-{colId}`, `cols-save-{colId}`,
`cols-discard-{colId}`, `cols-{colId}-header-name`,
`cols-{colId}-header-tooltip`, `cols-{colId}-width`,
`cols-{colId}-hide`, `cols-{colId}-sortable-default|on|off`,
`cols-{colId}-templates`, `cols-{colId}-template-{tplId}`,
`cols-{colId}-template-remove-{tplId}`, `cols-{colId}-template-picker`,
`cols-{colId}-cell-style`, `cols-{colId}-header-style`, `cols-{colId}-fmt`,
`cols-{colId}-filter-enabled`, `cols-{colId}-filter-kind`,
`cols-{colId}-filter-floating`, `cols-{colId}-filter-debounce`,
`cols-{colId}-filter-closeonapply`, `cols-{colId}-filter-btn-{apply|clear|reset|cancel}`,
`cols-{colId}-setfilter-minifilter` / `-selectall` / `-sorting` / `-excel` / `-dtn`,
`cols-{colId}-multi-add`, `cols-{colId}-multi-{idx}-kind` / `-display` / `-remove`.

Verified end-to-end in preview: 21 columns listed for the demo
blotter, selecting a column opens the full 6-band editor, applied
templates show as removable chips, × on a chip drops the template
from the draft and lights the SAVE pill.

### 17.8 Calculated Columns — full port + first-class citizenship

- Native v2 module with per-grid `ExpressionEngine`, schema v1, module
  dependencies enforced by the core.
- Master-detail panel (`CalculatedColumnsList` + `CalculatedColumnsEditor`)
  using the Cockpit primitives.
- Expression field with live column / function palette + diagnostics.
- **Value formatter** via the shared compact `FormatterPicker` (same
  popover the Formatting Toolbar uses; one picker everywhere).
- **First-class styling pipeline** — virtual columns honour every toolbar /
  style-rule / column-group write:
  - Typography, alignment, colours, borders from `column-customization`
    flow into `.gc-col-c-{colId}` and `.gc-hdr-c-{colId}` classes on the
    virtual colDef (parity with base columns).
  - Excel colour tags (`[Red]` / `[Green]`) inside formatters produce a
    `cellStyle` function via `excelFormatColorResolver`, mirroring the
    base-column path.
  - Header alignment follows cell alignment automatically — the
    `effectiveHeaderAlign` fallback chain (`headerStyleOverrides →
    cellStyleOverrides`) applies to virtual cols too.
  - Column groups composer (`composeGroups`) walks the full column tree by
    colId and picks virtual columns up naturally.
- **Column-wide aggregations** — `SUM([price])` now sums every row's
  `price`, not the current row's scalar. Implementation:
  - `EvaluationContext.allRows?: ReadonlyArray<Record<string, unknown>>`
    populated from a per-GridApi WeakMap cache that invalidates on
    `rowDataUpdated / modelUpdated / cellValueChanged`.
  - `FunctionDefinition.aggregateColumnRefs?: boolean` opts each function
    in. SUM, COUNT, DISTINCT_COUNT, AVG, MEDIAN, STDEV, VARIANCE, MIN,
    MAX are all flagged; a direct `[col]` arg is replaced with the full
    column array before the function runs. Falls back to scalar
    resolution when `allRows` isn't supplied (tests, server-side).
- **Aggregate-refresh on edits** — `cellValueChanged` / `rowValueChanged`
  / `rowDataUpdated` trigger `api.refreshCells({ columns: virtualColIds,
  force: true })` so column-wide aggregates re-evaluate across every
  visible row, not just the edited one.

### 17.9 Expression Engine extensions

- **Multi-branch conditionals** — `IFS(cond1, val1, cond2, val2, …,
  default?)`, `SWITCH(expr, case1, val1, …, default?)`, and a `CASE`
  alias. Trailing default is optional (odd arg count); no-match returns
  `null` when absent.
- Column-aggregation semantics (see 17.8).
- Existing `IF` / chained ternary unchanged for back-compat.

### 17.10 Grid State Persistence (new `grid-state` module)

Captures the native AG-Grid state (column order / widths / pinning /
sort / filters / column-group open-closed / pagination / sidebar / focus
/ selection / row-group expansion) plus a viewport anchor + quick filter
**on explicit Save only** — every other module keeps its auto-save
cadence, but native grid state is explicit-save-only to match the user's
expectation that Save is a commit, not a keystroke write.

- Replayed on `onGridReady` (cold mount) and `profile:loaded` events
  (profile switch).
- Wire format matches the standalone `agGridStateManager.ts` reference
  (SavedGridState envelope, schema v3) so snapshots from either side
  are interchangeable.

Correctness fixes layered on top:
- **Blank-slate new profile** — `createProfile` now calls `core.resetAll()`
  before serializing, and the grid-state module resets the live grid
  (`api.setState({})` + clear quickFilterText) when the loaded profile
  has no saved state. Creating a new profile no longer inherits the
  previous profile's layout / rules / calc-cols / filters.
- **Delete doesn't resurrect** — `deleteProfile` cancels the pending
  auto-save debounce before erasing the record and passes `skipFlush:
  true` when falling back to Default, so the outgoing profile can't be
  rewritten by a post-delete flush.
- **Selection column position + pinning** — `api.setState` silently
  drops the auto-generated `ag-Grid-SelectionColumn`'s position AND
  pinning on reload. Fix: emit `selectionColumnDef: { suppressMovable:
  false, lockPosition: false, initialPinned: 'left' }` from
  `general-settings` so the column is a first-class participant, then
  re-apply order + pinning post-setState via `applyColumnState({ state:
  mergedOrder, applyOrder: true })` deferred to `queueMicrotask` +
  `firstDataRendered`. Each entry carries its `pinned` value derived
  from the saved `columnPinning` sets, so pinning round-trips.
- **Stale saved order doesn't hide new columns** — when a calc column
  is added after the last save, the reorder merges the live column set
  into the saved order: saved IDs first, then live IDs not in the
  snapshot appended at the end. Without this, adding a new virtual
  column made it disappear on reload because the stale `orderedColIds`
  list didn't reference it.
- **Save doesn't jolt the selection column** — stable-reference memo on
  `gridOptions` + diff-then-push in the setGridOption effect ensure
  the `rowSelection` + `selectionColumnDef` props aren't re-issued on
  every store tick. Previously every Save click fired setGridOption
  for both, which made AG-Grid regenerate the auto-injected selection
  column and lose its pinned / reordered position.

### 17.11 Grid Options Settings Panel (module renamed `general-settings`)

New dedicated editor at `Settings → Grid Options`. Dropdown label
`"Grid Options"` (renamed from `"General Settings"`); schema bumped v1 →
v2 with additive migrate.

**State coverage** — every user-actionable scalar / toggle / enum from the
curated Top-40 AG-Grid v35 options spec (`ag-grid-customizer-input-controls.md`)
plus the full Row Grouping surface:

| Band | Controls |
|---|---|
| **01 ESSENTIALS** | rowHeight, headerHeight, animate, rowSelection, checkbox + cellSelection, flash / fade duration, pagination (+auto-page + hide-panel), quickFilterText |
| **02 ROW GROUPING** | groupDisplay, defaultExpanded, rowGroupPanel (+ no-sort), hideOpenParents, hideColumnsUntilExpanded, showOpenedGroup, single-child flatten (bool \| leafGroupsOnly), allowUnbalanced, maintainOrder, stickyGroups, lockGroupColumns, dragLeaveHides, suppressGroupChangesColumnVisibility (4-way enum), refreshAfterGroupEdit, ssrmExpandAllAffectsAllRows |
| **03 PIVOT · TOTALS · AGGREGATION** | pivotMode, pivotPanel, grandTotalRow, groupTotalRow, suppressAggFuncInHeader |
| **04 FILTER · SORT · CLIPBOARD** | enableAdvancedFilter, includeHiddenColumnsInQuickFilter, multiSortMode (compound → suppressMultiSort + alwaysMultiSort + multiSortKey), accentedSort, copyHeadersToClipboard, clipboardDelimiter |
| **05 EDITING · INTERACTION** | singleClickEdit, stopEditingWhenCellsLoseFocus, enterNavigation (compound → enterNavigatesVertically + …AfterEdit), undoRedoCellEditing + limit, tooltipShowDelay, tooltipShowMode |
| **06 STYLING** | suppressRowHoverHighlight, columnHoverHighlight |
| **07 DEFAULT COLDEF** | 7 subsections: SIZING (resizable, min/max/width/flex, suppressSizeToFit, suppressAutoSize), SORT & FILTER (sortable, filter, unSortIcon, floatingFilter), EDITING (editable, suppressPaste, suppressNavigable), HEADER (wrapHeaderText, autoHeaderHeight, suppressHeaderMenuButton), MOVEMENT & LOCKING (suppressMovable, lockPosition enum, lockVisible, lockPinned), CELL CONTENT (wrapText, autoHeight, enableCellChangeFlash), GROUPING · PIVOT · VALUES (enableRowGroup, enablePivot, enableValue) |
| **08 PERFORMANCE (ADVANCED)** | rowBuffer (live), suppressScrollOnNewData (live), + 5 initial-only flags (suppressColumnVirtualisation, suppressRowVirtualisation, suppressMaxRenderedRowRestriction, suppressAnimationFrame, debounceVerticalScrollbar) |

**UI pattern** — every multi-option enum is a shadcn `<Select>` dropdown
(replaced earlier overlapping pill groups). Readable Title Case labels
(e.g. "Only when grouping" instead of "WHEN GROUPING"). `boolean |
'literal'` unions encode/decode through string sentinels at the
SelectControl boundary so TypeScript keeps the union typed while the
native select stays in string-value land.

**Header with explicit SAVE** — the panel has its own `<ObjectTitleRow>`
header with a teal SAVE pill (action when dirty, ghost when clean) and
a RESET pill. Runs through `useDraftModuleItem` treating the whole
state as the "item"; every control edits a local draft and the grid
doesn't re-render until the user clicks SAVE.

60 total controls on one panel.

### 17.12 Formatter Toolbar + FormatterPicker

- **Shared FormatterPicker** — one component (`packages/core-v2/src/ui/
  FormatterPicker/`) used by the Formatting Toolbar, the Style Rule
  editor, AND the Calculated Column editor. `compact` variant renders
  the Figma-style popover with preset tile grid grouped by DECIMALS /
  NEGATIVES / SCIENTIFIC / BASIS POINTS + CUSTOM EXCEL FORMAT row with
  currency quick-insert.
- **Value formatter presets** — Integer, 2 decimals, 4 decimals, parens-neg,
  red-parens-neg, Green / Red (no sign) with $ / € / £ / ¥ / ₹ / CHF
  variants, Scientific, Basis points, 5 tick formats (TICK32, TICK32_PLUS,
  TICK64, TICK128, TICK256) for fixed-income bond prices.
- **Tick button denominator** — the toolbar tick button shows the
  denominator (`32` / `32+` / `64` / `128` / `256`), not the ticks
  numerator portion of the sample string. Previously applying TICK32
  flipped the button label from `32` → `16` which was the numerator.
- **Currency quick-insert row** — $, €, £, ¥, ₹, CHF buttons smart-
  replace the currency symbol in the current custom format while
  leaving the rest of the pattern intact.
- **SSF-safe symbol handling** — £ / ¥ / ₹ / CHF wrapped in quoted
  literals (`"£"` etc.) because SSF rejects bare non-dollar/euro
  currency glyphs. Fixed a round-trip bug where INR failed
  `isValidExcelFormat` on the second click.
- **ISO date coercion** — Date objects + ISO-8601 strings (starts with
  `yyyy-mm-dd`) get parsed to Date before being handed to SSF so date
  formats like `dd-mm-yyyy` render, not raw ISO text.
- **Excel color resolver** — `[Red]` / `[Green]` tags in format
  strings produce a per-value `cellStyle` resolver that paints the
  cell colour. Now applies to virtual columns too.
- **Cell-datatype auto-detection** — on first data render, sample the
  first 20 rows of each column to infer `cellDataType` so the
  FormatterPicker filters its preset list by column type (number /
  date / string / boolean). Host-provided `cellDataType` wins.
- **Header alignment follows cell** — aligning cells via "Cell" target
  applies the same alignment to the column header by default; the user
  can override by explicitly selecting the "Header" target in the
  toolbar. Implementation: a fallback chain in `reinjectCSS`
  (`headerStyleOverrides → cellStyleOverrides`) + header-class
  attachment whenever either is set.

### 17.12b Floating / draggable Formatting Toolbar

- **Floating panel** — the Formatting Toolbar is no longer pinned
  inline below the main toolbar. It renders inside a position-fixed
  `DraggableFloat` wrapper (`packages/markets-grid-v2/src/DraggableFloat.tsx`)
  at `z-index: 9999` so it floats above the grid but below its own
  Radix popovers (`z-[2147483647]`).
- **Drag handle** — a 22px-tall bar at the top of the panel with the
  `GripVertical` icon, "FORMATTING" label, and a close (X) button. A
  single `pointerdown` on the handle starts a drag tracked on the
  window via `pointermove`/`pointerup`; position is clamped to the
  viewport so the handle can never be stranded offscreen.
- **Close any time** — the X button in the handle dismisses the panel
  instantly. Re-open via the `STYLE` pill (see below) — the panel
  returns at its last-dragged position (local state).
- **Style pill on the FiltersToolbar** — the toggle button was moved
  from the primary `gc-toolbar-primary` bar (where it lived alongside
  Save/Settings) to the inline filter pill row (`FiltersToolbar`).
  Styled as a teal pill with a `Brush` icon and "STYLE" label,
  matching the filter pill vocabulary. Test id `style-toolbar-toggle`.
- **Width** — the panel clamps to `min(1180px, 100vw - 32px)` so the
  toolbar's horizontal-scroll chrome inside keeps working on narrow
  viewports.
- **Window-resize clamp** — on `window.resize` the panel re-clamps
  its (x, y) back into the new viewport so a shrunk browser window
  can't leave the handle unreachable.

### 17.13 Column Reorder + Horizontal Scroll Chrome

- `maintainColumnOrder: true` on the AgGridReact props preserves the
  user's drag-reordered column positions when `columnDefs` re-derive
  (happens on every module-state change). Without this, applying a
  toolbar format would reset the column order to the base `columnDefs`
  sequence.
- Toolbar slot horizontal overflow contained (`min-w-0 overflow-x-auto
  overflow-y-visible`) so applying a formatter doesn't push the page
  into horizontal scroll.
- AG-Grid `theme` adjustments: `iconSize: 10` on shared params (both
  light + dark). Vertical column borders re-enabled in the demo theme.

### 17.14 Header / floating-filter icon hover chrome

- Menu button + filter funnel + floating-filter button render with
  `opacity: 0` + `pointer-events: none` in the idle state instead of
  collapsing `width` to zero. Hover / `:focus-within` /
  `[aria-expanded='true']` restore `opacity: 1` + `pointer-events:
  auto`. No layout thrash — previously every cursor pass reflowed the
  column header by ~32px.

### 17.15 Profile UX

- **Per-profile auto-save** — debounced 300ms. Explicit Save button
  flushes the debounce immediately.
- **New profile starts blank** — `resetAll()` runs before snapshotting
  in `createProfile`; the grid-state module handles `saved: null` by
  calling `api.setState({})` to clear AG-Grid-native state that lives
  outside module transforms.
- **Delete safety** — cancels pending auto-save before erasing the
  record, uses `skipFlush: true` when falling back to Default.
- **Shadcn AlertDialog** — replaced native `window.confirm` for delete
  confirmation with a proper modal (`@radix-ui/react-alert-dialog`).
  Adds `AlertDialog` / `AlertDialogContent` / `AlertDialogHeader` /
  `AlertDialogFooter` / `AlertDialogTitle` / `AlertDialogDescription`
  / `AlertDialogAction` (primary / destructive variants) /
  `AlertDialogCancel` to the shadcn primitive set.

### 17.16 SettingsSheet chrome cleanup

- Removed the `PROFILE=<gridId>` status pill from the header — duplicated
  what the main toolbar's profile selector already shows.
- DIRTY counter stays.

### 17.17 Demo app

- **Price column is editable** (`editable: true` + `agNumberCellEditor`
  with 4-digit precision) — drives the cell-edit → aggregate-refresh
  flow in the Calculated Columns module.
- **Grid API debug hook** (opt-in, not committed by default) for
  preview-based E2E / manual testing of column-state APIs.

---

## 18. Summary Statistics

### v1 (legacy / reference)

| Category | Count |
|----------|-------|
| v1 Feature Modules | 18 |
| v1 Module Settings Panels | 18 |
| v1 Persistence Adapters | 3 |
| v1 Cell Renderers | 6 |
| v1 Theme Presets | 4 |
| v1 Total LOC | ~14,100 |

### v2 (current — post-2.5 feature pipeline)

| Category | Count |
|----------|-------|
| **v2 Shipped Modules** | **9** — general-settings (Grid Options), column-templates, column-customization, calculated-columns, column-groups, conditional-styling, saved-filters, toolbar-visibility, grid-state |
| **v2 Settings Panels** | **7 full editors** — Grid Options, Column Settings, Calculated Columns, Column Groups, Style Rules, Column Customization (via toolbar), Profile Selector |
| Built-in Expression Functions | **65+** across Math / Stats / Aggregation / String / Date / Logic / Type / Lookup / Coercion |
| → column-aware aggregation functions | 9 (SUM, COUNT, DISTINCT_COUNT, AVG, MEDIAN, STDEV, VARIANCE, MIN, MAX) |
| → multi-branch conditional functions | 4 (IF, IFS, SWITCH, CASE) |
| **Grid Options controls** | **60** across 8 bands (+ 7 subsections in DEFAULT COLDEF) |
| Value Formatter Presets | **14** (Integer / 2dp / 4dp / parens-neg / red-parens-neg / green-red-nosign / green-red-$, + 5 tick formats + Scientific + BPS) |
| Currency quick-insert symbols | 6 ($, €, £, ¥, ₹, CHF) |
| Cockpit SettingsPanel Primitives | 20+ |
| Shared `StyleEditor` sections | 4 (text / color / border / format) |
| Format Editor popover primitives | 6 (FormatPopover, FormatColorPicker, FormatSwatch, FormatDropdown, BorderSidesEditor, ExcelReferencePopover) |
| Shadcn UI Components (incl. AlertDialog) | 12 |
| Rule Indicator Icons (Lucide) | 20+ |
| Tick-format denominations | 5 (32, 32+, 64, 128, 256) |
| Profile Auto-save debounce | 300ms |
| v2 E2E Test Suites | 10+ |
| v2 Approximate LOC | ~9,000 (core-v2 ~7,200 + markets-grid-v2 ~1,800) |

### Architecture invariants held across the v2 work

- Single source of truth: IndexedDB profile snapshots (`gc-customizer-v2` db).
- Per-module `schemaVersion` with optional `migrate(raw, fromVersion)`.
- Auto-save path: store → 300ms debounce → serializeAll → persist → `profile:saved` event.
- `grid-state` module is the one deliberate exception — captures on explicit Save only so AG-Grid native state isn't touched on every keystroke.
- Module ordering (priority): `general-settings (0)` → `column-templates (1)` → `column-customization (10)` → `calculated-columns (15)` → `column-groups (18)` → `conditional-styling (20)` → `grid-state (200)`.
- Every cross-module read goes through `ctx.getModuleState<T>(moduleId)` — no direct imports between modules.
