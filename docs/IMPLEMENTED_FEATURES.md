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

### Column Templates (Priority: 1)
- Reusable style templates with name, description, timestamps
- Type defaults: auto-apply by detected data type (numeric, date, string, boolean)

### Column Groups (Priority: 15)
- Group ID, header name, child column IDs
- Open by default toggle, marry children toggle

### Conditional Styling (Priority: 20)
- Rules with: ID, name, enabled flag, priority, scope (cell/row)
- Expression evaluated against row/cell data (context: `x`, `value`, `data`, `columns`)
- Theme-aware styling (separate light/dark CellStyleProperties)
- CSS injection with `.gc-rule-{ruleId}` classes and `cellClassRules`/`rowClassRules`

### Calculated Columns (Priority: 30)
- Virtual columns appended to columnDefs
- Expression-based valueGetter (pre-parsed, evaluated per-cell)
- Lazy evaluation: returns null on expression errors

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

### See also
- `docs/MIGRATION.md` — prop-by-prop guide for switching a consumer app from v1 to v2, including the one-shot legacy-key migration and the E2E selector compatibility matrix.

---

## 17. Summary Statistics

| Category | Count |
|----------|-------|
| Feature Modules | 18 |
| Module Settings Panels | 18 |
| Built-in Expression Functions | 60+ |
| Persistence Adapters | 3 |
| Cell Renderers | 6 |
| Shadcn UI Components | 11 |
| CSS Variables | 50+ |
| E2E Test Suites | 10 (6 v1 + v2-autosave + v2-perf + v2-conditional-styling + v2-conditional-styling-columns) |
| E2E Tests | 130 (114 v1 + 4 v2-autosave + 2 v2-perf + 4 v2-conditional-styling + 6 v2-conditional-styling-columns) |
| v2 Modules Shipped | 5 engines + 1 SettingsPanel UI (conditional-styling) of 20 |
| v2 Total LOC | ~5,400 (core-v2 4,300 + markets-grid-v2 1,100) |
| Expression Token Types | 21 |
| Named Query Operators | 15 |
| Entitlement Types | 3 |
| Row Model Types | 4 |
| Theme Presets | 4 |
| Value Formatter Presets | 7 |
