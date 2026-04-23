# AdapTable for AG Grid — Complete Feature Reference

> Collated from https://www.adaptabletools.com/docs (v22 documentation tree).
> AdapTable is a commercial layer that sits on top of AG Grid and adds enterprise/trading-desk features. It is the closest off-the-shelf equivalent to what a bank would build internally on top of AG Grid — which makes it directly relevant for MarketsUI / FI Trading Terminal work.

---

## 1. Framework Support & Installation

| Framework | Notes |
|---|---|
| **Vanilla / TypeScript** | Default in all docs/demos; forkable to Sandpack |
| **React** | Dedicated `@adaptabletools/adaptable-react-aggrid` with custom components (Toolbar, Tool Panel, Settings Panel, Popups), React Hooks, and React No-Code mode |
| **Angular** | Same component surface (Toolbar, Tool Panel, Settings Panel, Popups) |
| **Vue** | Newest supported framework; same component surface |

**Integration primitives:** Adaptable ID, AG Grid Modules, Primary Key, State Key, License Key, Adaptable Ready event, User Name, AdapTable & AG Grid container div setup.

---

## 2. Layouts (Column State Management)

AdapTable treats "layouts" as first-class persisted objects — not just column order.

### Table Layouts
- Column Order, Visibility, Sizing, Pinning, Sorting
- Column Headers customization
- Filtering and Grouping as part of layout
- Row Selection state persisted in layout
- Layouts Wizard UI

### Pivot Layouts
- Defining, Formatting, Filtering, Sorting, Sizing, Selecting
- Pivot Result Columns, Pivot Column Groups, Pivot Total Columns
- Pivot Layouts Wizard

### Layout Lifecycle
- Updating, Saving, Extending, Default Layouts
- **Synchronising layouts** (across tabs/views — relevant for OpenFin multi-window)
- Monitoring layouts

### Row Groups
- Expand/collapse behaviour, formatting/styling, filtering, sorting, grouped rows

### Aggregations
- Grand Total Rows
- Weighted Averages (key for FI — YTM weighted by notional, etc.)
- "Only" aggregation, formatting aggregations

### Column Groups
- Expand/collapse, formatting

### Master-Detail & Tree Data
- Both supported as layout primitives

---

## 3. AdapTable UI Surfaces

| Surface | Purpose |
|---|---|
| **Settings Panel** | Central config UI; supports custom settings panel and wizards |
| **Dashboard** | Top-bar tabs & toolbars, custom toolbars, dashboard buttons, multiple dashboard modes |
| **Tool Panel** | Module tool panels, custom tool panels, tool panel buttons |
| **Status Bar** | Configurable cells; shows counts, selected cell summaries, etc. |
| **Column Menu** | Configurable; supports custom menu items |
| **Context Menu** | Configurable; default structure documented; custom items supported |
| **Theming** | Built-in themes, custom themes, CSS variable system, AG Grid theme integration |

### UI Tutorials / Guides Published
- Toast Notifications
- AdapTable Wizards
- Styling editable vs read-only cells (very relevant for trading blotters)
- Rendering custom popups
- Supplying an Adaptable Style
- Displaying AdapTable Buttons
- Configuring AdapTable Forms
- Creating Adaptable Icons
- Configuring Loading Screen
- Displaying Progress Indicators
- Hiding AdapTable
- Choosing American English
- Custom Colour Palette

---

## 4. Core Features

### Calculated Columns
- **Standard** (per-row expressions)
- **Aggregated** (roll-ups)
- **Cumulative** (running totals)
- **Quantile** (percentile/bucketing)
- Calculated-column-to-calculated-column referencing

### Alerts
- **Data Change Alerts** — fires on cell edits
- **Relative Change Alerts** — threshold movements (price up X%, spread widens by Y bps)
- **Row Change Alerts** — add/delete/update
- **Aggregation Alerts** — portfolio-level thresholds
- **Observable Alerts** — reactive/streaming
- **Validation Alerts** — on rejected edits
- Configurable notification, alert message, alert behaviours
- `alertFired` event for programmatic listening

### Action Columns
- In-row action buttons with command system
- Configurable per-row (so different commands per row state)

### Charting
- Built-in charts
- External chart library integration (bring your own — Highcharts, etc.)

---

## 5. Searching & Filtering

### Quick Search
- Cross-column text search
- Matching-style highlighting
- Can act as filter (hide non-matching rows) or highlighter
- Configurable

### Column Filters
- Filter Components per column type
- **'In' filter** (multi-select)
- System filters (contains, equals, >, <, between, blank, etc.)
- Custom filters
- Define filters declaratively
- Manually apply filters via API

### Grid Filter (new)
- Single cross-grid filter expression (in addition to per-column filters)
- Uses full AdapTable Query Language

### Data Sets
- Named filter+layout combinations with associated forms
- Data Set Forms for parameterized queries

### Named Queries
- Saved, reusable queries

---

## 6. Cell Rendering (Formatting & Styling)

### Formatting & Display Formats
- **Numeric Format** (decimals, separators, scaling)
- **String Format**
- **Date Format**
- **Template Format** (new — token-based templating)
- **Custom Format** (code)
- Configurable per column; column header formatting

### Conditional Styling
- **Predicate Conditions** (built-in comparison library)
- **Expression Conditions** (full query language)

### Styled Columns (rich cell renderers)
- **Gradient Style** (heatmap-style background)
- **Percent Bar Style** (inline progress bar)
- **Badge Style** (pill/chip)
- **Sparkline Column Style** (new — inline mini-charts, very useful for rate/spread histories)

### Flashing
- Flashing cells (tick-up/tick-down highlight)
- Flashing rows
- Configurable duration/colors

---

## 7. Editing

### Data Entry Features
- **Smart Edit** — edit multiple selected cells with a formula (add 5, multiply by 1.1, etc.)
- **Bulk Update** — set same value across selection
- **Plus/Minus** — keyboard increment/decrement
- **Shortcuts** — text shortcuts expand to values (e.g. "b" → "BUY")
- Styling editable cells
- Custom edit values per column

### Data Validation
- **Pre-Edit Validation** (before editor opens)
- **Client Validation** (on commit)
- **Server Validation** (async round-trip)

### Data Change History
- Full audit log of cell edits
- Actions on history (revert, jump-to-cell)
- Configurable retention/display

### Cell Editors
- Select Editor, Numeric Editor, Percentage Editor (new), Date Picker

---

## 8. Annotating

- **Notes** — per-row narrative text
- **Comments** — threaded comments on cells/rows
- **Free Text Columns** — user-maintained free-text fields persisted in state

---

## 9. Working with Grid Data

### Exporting
- **Reports** (named export definitions) + **Custom Reports**
- **Format Types:** Excel, Visual Excel (preserves styling), CSV, JSON
- **Destinations:** built-in + custom destinations (e.g. push to API, S3, etc.)
- Formatting, processing, scheduling reports
- Full configuration API

### Importing
- Import external data into the grid; configurable

### Sorting
- Custom sorting beyond AG Grid defaults

### Selecting
- Programmatic selection API
- Selection-changed events
- Checkbox column selection

### Summarising (new)
- **Cell Summaries** — summary of currently selected cells
- **Row Summaries** — summary row across selected rows

### Transposing
- Flip rows ↔ columns (useful for single-bond deep-dive views)

### Highlighting & Jumping
- Navigate to specific cells/rows programmatically

---

## 10. Advanced Features

### Team Sharing
- **Active** — push configs to teammates
- **Referenced** — subscribe to canonical team config
- Custom team sharing backend
- This is effectively "git for grid config"

### Row Forms
- Edit a full row via generated form instead of cell-by-cell

### Schedules
- **Schedules** — time-based triggers
- **Reminders** — user-facing scheduled prompts

### AdapTable No Code
- Build config-driven AdapTable instances without code (relevant contrast to what MarketsUI does)

### FDC3 Integration
- FDC3 Data Mappings, Contexts, Intents, UI Components
- Custom FDC3 handlers
- Worked examples — this is the OpenFin interop path

### System Status Messages
- Dismissible banners/toasts driven by state

---

## 11. Developer-Facing APIs

### AdapTable State
- Providing initial state
- Persisting (built-in + custom backends)
- Managing at runtime
- Customising
- **Suspending state** (pause persistence during batch ops)
- State events
- State migration between versions

### Permissions / Entitlements
- Module-level permissions
- Object-level permissions (per saved layout/query/alert)
- Default access levels

### Handling Grid Data
- Loading data, managing rows (add/update/delete)
- Cell-level updates
- Listening to data changes
- Full transaction API

### Server-Side Row Model (major section)
- SSRM filtering, exporting, sorting, pivoting, grouping, row management
- Server-side formatting, calculated columns, searching
- **Viewport row model** also supported
- Server Evaluation of expressions (push query language to backend — **very relevant for your ViewServer work**)

### Managing Columns
- Providing column types
- Setting AG Grid cell data types
- Managing ColDefs at runtime vs design time
- Array columns
- Column scope
- Column info API, column headers, hiding columns
- Adaptable Column object

### Configuring AG Grid Through AdapTable
- GridOptions, ColDefs, cell rendering, pagination

### Developer Tutorials
- Cell editability
- Holiday calendars (settlement-date aware)
- Providing adaptable context
- Containers
- Hotkeys

### Support Tooling
- Logging
- Profiling with custom DevTools tracks
- Testing
- Monitoring
- Performance guidance

---

## 12. AdapTable Query Language (AQL)

This is essentially a domain-specific language for trading-grid queries.

### Expression Categories
- **Standard** — row-local expressions
- **Aggregation** — across rows
  - Cumulative expressions
  - Quantile expressions
- **Observable** — reactive, re-evaluate on change
- **Advanced** functions:
  - `QUERY(...)` — subqueries
  - `VAR(...)` — named variables in expressions
  - `IF` / `CASE` logic
  - `FIELD(...)` — dynamic field access
  - Guidance on reducing complexity
- **Relative Change** expressions (delta / % change)

### Expression Functions
- Standard, Aggregated, Relative Change, Observable, Advanced function libraries
- **Custom Expression Functions** — user-registered functions
  - Custom Standard / Aggregated variants
  - Scoping

### UI for Expressions
- Expression Editor (code-style)
- Query Builder (visual — new)

### Predicates
- System predicates
- Custom predicates
- Used wherever a condition is needed (filters, alerts, styles)

### Server Evaluation
- Evaluate expressions server-side (for SSRM)

---

## 13. FinTech Partner Integrations

| Partner | Purpose |
|---|---|
| **OpenFin / here** | Workspace, multi-window, context sharing |
| **interop.io** | Cross-app messaging |
| **ipushpull** | Data distribution / Excel sync |

---

## 14. Technical Reference Surface

- **Adaptable Options** — single config object for entire grid
- **Adaptable API** — full runtime programmatic API
- **Initial Adaptable State** — declarative bootstrap
- **Adaptable Events** — full event catalog
- **Plugins** — extension mechanism
- **AdapTable & AG Grid Modules** — modular consumption

---

## Notes for MarketsUI Benchmarking

Areas where AdapTable overlaps most directly with work you've been doing:

| AdapTable feature | MarketsUI equivalent / gap |
|---|---|
| Layouts with full state persistence | MarketsUI ConfigService (Dexie dev / REST prod) — comparable |
| Team Sharing (active + referenced) | Not yet in MarketsUI — worth designing before shipping |
| AQL + Query Builder + Server Evaluation | ViewServer's `SUBSCRIBE` SQL is the data-plane equivalent; AQL is the UI-expression equivalent — distinct concerns |
| Alerts (data-change, relative-change, observable) | You have styling rules via `cellClassRules`; real alert engine is a separate build |
| Styled Columns (gradient / percent-bar / badge / sparkline) | Partial via AG-Grid custom renderers; sparkline column is worth cloning |
| Data Change History / audit | Natural fit with undo/redo work you already did |
| FDC3 + OpenFin integration | You already have the OpenFin primitives; FDC3 mapping layer is additive |
| No Code mode | MarketsUI is already config-driven — this is a philosophical match |
| Server-Side Row Model support | Your Ignite + MongoDB change-streams pipeline serves the same role |

The commercial pitch of AdapTable is that it's AG Grid Enterprise + ~120 pre-built modules aimed at trading desks. For a bank UI platform team, it's useful as a **feature checklist** even if you're building in-house.
