# AdapTable Tools — Gap Analysis

> **Baseline:** [`ADAPTABLE_TOOLS_FEATURES.md`](./ADAPTABLE_TOOLS_FEATURES.md) (AdapTable v22)
> **Product under review:** `@grid-customizer/core` + `@grid-customizer/markets-grid`
> **Last updated:** 2026-04-23
>
> **Legend** — ✅ have · 🟡 partial · ❌ missing · ⚪ out of scope (we're a different product)

---

## §1. Framework Support

| Feature | Status | Notes |
|---|---|---|
| Vanilla / TypeScript | ⚪ | React-only by design |
| React | ✅ | Core library shape |
| Angular | ❌ | Would need parallel binding over `ProfileManager` / `useFormatter` |
| Vue | ❌ | Same as Angular |
| Integration primitives (GridId / PK / StateKey / Ready event) | ✅ | `gridId`, `rowIdField`, `platform.events` |

---

## §2. Layouts (Column State Management)

| Feature | Status | Gap / Notes |
|---|---|---|
| Table Layouts: order / visibility / sizing / pinning / sorting | ✅ | `grid-state` + `column-customization` |
| Column Headers customization | ✅ | `headerName` / `headerTooltip` on assignment |
| Filtering & Grouping as layout | 🟡 | Filters persist via `saved-filters`; row-grouping config lives on assignments but isn't promoted to a first-class "layout" |
| Row Selection in layout | 🟡 | AG-Grid selection state exists; not restored on profile load |
| **Layouts Wizard UI** | ❌ | We have a profile selector, not a layout-design wizard |
| **Pivot Layouts** (full sub-system) | ❌ | AG-Grid Enterprise pivot exists; no UI to save/reload pivot configs |
| Default Layouts | 🟡 | Reserved "Default" profile exists; not quite the same semantics as "default for this user/role" |
| **Synchronising layouts across windows** | 🟡 | Popout shares theme + portal context only; profile state is local to the browser |
| Row Groups (expand/collapse/format) | ✅ | AG-Grid handles |
| **Aggregations — Grand Total Rows** | ❌ | AG-Grid pinned rows can do this but we don't surface it |
| **Aggregations — Weighted Averages** | ❌ | High-value for FI (YTM weighted by notional); expression engine could express but no first-class agg kind |
| Column Groups | ✅ | dedicated `column-groups` module |
| Master-Detail & Tree Data | 🟡 | AG-Grid Enterprise handles; we haven't surfaced a UI |

---

## §3. UI Surfaces

| Feature | Status | Notes |
|---|---|---|
| Settings Panel | ✅ | `SettingsSheet` |
| **Dashboard** (configurable tabs / toolbars) | 🟡 | We have FiltersToolbar + FormattingToolbar (fixed); no user-defined dashboard |
| **Tool Panel** (custom panels + buttons) | 🟡 | AG-Grid sidebar exists; custom tool-panel API not exposed |
| **Status Bar** (configurable cells) | 🟡 | Wired in the demo; no customization UI |
| **Column Menu** customization | ❌ | AG-Grid default only |
| **Context Menu** customization | ❌ | AG-Grid default only |
| Theming (tokens + light/dark + AG-Grid theme integration) | ✅ | `--gc-*` token system, `cockpit.ts`, popout-parity fix |
| Toast Notifications | ❌ | No notification primitive |
| Wizards | ❌ | No multi-step form pattern |
| Loading Screen / Progress Indicators | ❌ | No dedicated UI |

---

## §4. Core Features

| Feature | Status | Notes |
|---|---|---|
| **Calculated Columns — Standard** | ✅ | per-row expressions |
| **Calculated Columns — Aggregated (roll-up)** | 🟡 | Expressions can call `SUM/AVG/MIN/MAX([col])` but there's no dedicated aggregated-column type |
| **Calculated Columns — Cumulative** (running total) | ❌ | Big gap for P&L roll-ups |
| **Calculated Columns — Quantile** (percentile bucket) | ❌ | |
| Calculated-column-to-calculated-column refs | 🟡 | Expression engine reads any colId; circular detection unverified |
| **Alerts — Data Change** | 🟡 | `conditional-styling` flashes on `cellValueChanged`; no notification / toast |
| **Alerts — Relative Change** (threshold moves) | ❌ | |
| **Alerts — Row Change** (add / delete / update) | ❌ | |
| **Alerts — Aggregation** (portfolio threshold) | ❌ | |
| **Alerts — Observable** (streaming re-eval) | ❌ | |
| **Alerts — Validation** (on rejected edits) | ❌ | No editing validation at all |
| `alertFired` event | ❌ | |
| **Action Columns** (in-row buttons + commands) | ❌ | |
| **Charting** (built-in + bring-your-own) | ❌ | |

---

## §5. Searching & Filtering

| Feature | Status | Notes |
|---|---|---|
| **Quick Search** (cross-col, highlight / hide) | ❌ | AG-Grid's `quickFilterText` API exists; no UI + no highlight mode |
| Column Filters (per-column) | ✅ | AG-Grid + `saved-filters` |
| 'In' filter (multi-select) | ✅ | AG-Grid set filter |
| System filters (contains / eq / gt / etc.) | ✅ | AG-Grid built-ins |
| Custom filters | 🟡 | AG-Grid custom filter components; we don't expose an authoring UI |
| **Custom floating filters** | ✅ (inherit) | AG-Grid's `floatingFilterComponent` API pass-through — **strictly better than AdapTable**, which replaces AG-Grid's floating filter with a fixed "Filter Bar" |
| Declarative filter config | ✅ | `saved-filters` module persists |
| **Grid Filter** (single cross-grid expression) | ❌ | |
| **Data Sets** (named filter + layout + forms) | ❌ | |
| **Named Queries** (saved reusable queries) | 🟡 | `saved-filters` is close but scoped to AG-Grid filter models, not full AQL |

---

## §6. Cell Rendering

| Feature | Status | Notes |
|---|---|---|
| Numeric / String / Date format | ✅ | Excel formatter (SSF) + presets + tick |
| **Template Format** (token-based) | 🟡 | `column-templates` exists but carries style templates, not string-format templates |
| Custom Format (code) | ✅ | `kind:'expression'` gated by policy |
| Column header formatting | ✅ | `headerStyleOverrides` |
| **Conditional Styling — Predicate** (library of conditions) | ❌ | We only have free-form expressions — no "when status=FILLED then..." predicate builder |
| Conditional Styling — Expression | ✅ | |
| **Styled Columns — Gradient** (heatmap bg) | ❌ | |
| **Styled Columns — Percent Bar** | ❌ | |
| **Styled Columns — Badge** | 🟡 | Rule indicators are close; no explicit badge column type |
| **Styled Columns — Sparkline** | ❌ | **High value for FI** — rate / spread / yield-curve histories |
| Flashing cells / rows | ✅ | configurable duration + colors via conditional-styling flash |

---

## §7. Editing

| Feature | Status | Notes |
|---|---|---|
| **Smart Edit** (formula across selection, e.g. `*1.1`) | ❌ | High value for bulk spread / price moves |
| **Bulk Update** (same value to selection) | ❌ | |
| **Plus/Minus** (keyboard inc/dec on numeric cells) | ❌ | |
| **Shortcuts** (text expand, e.g. `b → BUY`) | ❌ | |
| Styling editable cells | 🟡 | Can express via conditional-styling; no dedicated "editable state" style |
| Custom edit values per column | 🟡 | `cellEditorName` + `cellEditorParams` on assignment; no UI to configure |
| **Validation — Pre-Edit / Client / Server** | ❌ | Entire validation layer is absent |
| **Data Change History** (audit log) | ❌ | **Regulatory-level gap** for banks |
| Cell Editors (Select / Numeric / Percentage / Date) | 🟡 | AG-Grid's built-ins; no custom ones shipped |

---

## §8. Annotating

| Feature | Status | Notes |
|---|---|---|
| Notes (per-row narrative) | ❌ | |
| Comments (threaded) | ❌ | |
| Free Text Columns | ❌ | |

---

## §9. Working with Grid Data

| Feature | Status | Notes |
|---|---|---|
| **Reports** (named export definitions) | ❌ | |
| Excel / Visual Excel / CSV / JSON export | 🟡 | AG-Grid's CSV / Excel exports available if enterprise licensed; no UI, no "visual Excel" (styled), no JSON |
| Custom export destinations | ❌ | |
| Report scheduling | ❌ | |
| Importing | ❌ | |
| Sorting (custom beyond AG-Grid) | 🟡 | AG-Grid handles; no custom sort-function UI |
| Selecting (API + events + checkbox) | ✅ | AG-Grid |
| **Cell Summaries** (of selected cells) | ❌ | |
| **Row Summaries** (across selected rows) | ❌ | Status bar has some; not configurable |
| Transposing | ❌ | |
| Highlighting & Jumping | 🟡 | `api.ensureColumnVisible` exists; no named-anchor UI |

---

## §10. Advanced Features

| Feature | Status | Notes |
|---|---|---|
| **Team Sharing — Active** (push configs) | ❌ | |
| **Team Sharing — Referenced** (subscribe to team config) | ❌ | |
| Custom team-sharing backend | ❌ | **Strategic gap** — profile import / export only, no subscription model |
| **Row Forms** (edit full row via form) | ❌ | |
| **Schedules** (time-based triggers) | ❌ | |
| **Reminders** | ❌ | |
| No-Code mode | 🟡 | Our modules are config-driven; no visual-only authoring surface |
| **FDC3** (Data Mappings, Contexts, Intents, UI Components) | ❌ | OpenFin chrome exists; no FDC3 mapping layer |
| System Status Messages | ❌ | |

---

## §11. Developer APIs

| Feature | Status | Notes |
|---|---|---|
| Initial state | ✅ | `deserializeAll` |
| Persistence (built-in + custom) | ✅ | `MemoryAdapter`, `DexieAdapter`, custom via `StorageAdapter` interface |
| Runtime state management | ✅ | `useModuleState`, reducers, draft hook |
| **Suspending state** (pause persistence for batch ops) | ❌ | Auto-save has debounce but no "pause" API |
| State events | ✅ | `platform.events.on(...)` |
| State migration + `schemaVersion` | ✅ | Per-module `migrate()` hook |
| **Permissions / Entitlements — Module level** | ❌ | |
| **Permissions / Entitlements — Object level** (per profile / query) | ❌ | |
| Default access levels | ❌ | |
| Row / cell data management + transactions | ✅ | AG-Grid transaction API |
| **SSRM — filtering / sort / pivot / group / exports** | 🟡 | AG-Grid Enterprise supports; our module pipeline untested against SSRM |
| **SSRM — server-side formatting / calc cols / search** | ❌ | |
| **Viewport row model** | 🟡 | AG-Grid's; untested with our pipeline |
| **Server Evaluation of expressions** | ❌ | Expression engine is pure client; no push-to-backend story |
| Custom column types | 🟡 | `cellDataType` + `column-templates` typeDefaults cover part of it |
| Column info API | ✅ | `useGridColumns` |
| Array columns | ❌ | |
| Support Tooling — Logging / Profiling / Testing / Monitoring | 🟡 | Unit + E2E tests + perf canary; no DevTools track, structured logging, or telemetry hook |

---

## §12. AdapTable Query Language (AQL)

| Feature | Status | Notes |
|---|---|---|
| Standard (row-local) expressions | ✅ | 44 built-in functions incl. IF / IFS / SWITCH / CASE |
| **Aggregation — base** (SUM / AVG / MIN / MAX / COUNT / DISTINCT_COUNT / MEDIAN / STDEV / VARIANCE) | ✅ | 9 column-aware aggregation functions |
| **Aggregation — Cumulative** | ❌ | |
| **Aggregation — Quantile** | ❌ | |
| **Observable expressions** (reactive re-eval) | 🟡 | Expressions re-eval on module state change; no explicit "observable" primitive |
| **Advanced — QUERY subqueries** | ❌ | |
| **Advanced — VAR named vars** | ❌ | |
| **Advanced — FIELD dynamic access** | ❌ | |
| **Relative Change expressions** | ❌ | |
| **Custom Expression Functions** (user-registered) | ❌ | No registration API |
| Expression Editor (code-style) | ✅ | CodeMirror-based |
| **Query Builder** (visual, drag-to-build) | ❌ | |
| **Predicates** (system + custom library) | ❌ | |
| **Server Evaluation** (push to backend) | ❌ | |

---

## §13. FinTech Partners

| Feature | Status | Notes |
|---|---|---|
| OpenFin / here | ✅ | popout + frameless + alwaysOnTop + drag region |
| **interop.io** (cross-app messaging) | ❌ | |
| **ipushpull** (data distribution / Excel sync) | ❌ | |

---

## §14. Technical Reference

| Feature | Status | Notes |
|---|---|---|
| Options object | ✅ | `MarketsGridProps` |
| Runtime API | ✅ | `platform.api`, hooks |
| Initial state | ✅ | |
| Events catalogue | ✅ | platform + module events |
| **Plugins** (extension mechanism) | 🟡 | Module system is plugin-shaped; no public "register a custom module" story |
| AG-Grid Modules integration | ✅ | `ensureAgGridRegistered` |

---

## Executive summary

### Where we match or beat AdapTable

- **Typography + visual design** of the formatter surface
- **CSP posture** — CSP-safe expression engine by default + runtime policy gate (`configureExpressionPolicy`)
- **Profile lifecycle** — clone + import / export + strict-mode profile-import validation
- **Theming** — `--gc-*` token system + popout-parity
- **Custom floating filters** — strictly better than AdapTable (AG-Grid's `floatingFilterComponent` passes through; AdapTable replaces AG-Grid's floating filter with its own fixed Filter Bar)
- **Column groups, calculated columns (basic), conditional styling, column templates** — feature-complete for everyday use
- **Test discipline** — 298 unit tests + 19 E2E specs, regression coverage on every shipped bug

### Bottom line

**We're ~40 % of AdapTable's feature checklist by volume, but ~70 % of what a real FI trading desk uses day-to-day.** The surface that matters most to a bond trader — layouts, column styling, conditional styling, calculated columns, formatters, templates, popout, profiles — is solid. The surface that matters to Wells Fargo's platform team but that traders rarely touch — team sharing, entitlements, server-side eval, audit — is where the real work remains.

For the prioritized roadmap of what to build next, see [`docs/ROADMAP.md`](./docs/ROADMAP.md).
