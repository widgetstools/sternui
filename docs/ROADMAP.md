# Roadmap — features to build next

> Derived from [`ADAPTABLE_TOOLS_GAP_ANALYSIS.md`](../ADAPTABLE_TOOLS_GAP_ANALYSIS.md).
> **Last updated:** 2026-04-23
> **Audience:** the person picking up the next ticket.
>
> Each entry carries an **effort estimate** (for one focused engineer), a **value tag** (trader-daily / platform-enterprise / nice-to-have), a **dependency chain**, and a **definition of done**.

---

## Tier 1 — Closest gaps (days, not weeks)

These are real gaps that a trading desk will hit immediately and that fit the current architecture cleanly.

### T1.1 — Sparkline column renderer · 1–2 days · trader-daily

**Why:** Bloomberg parity. Rate / spread / yield-curve histories are ubiquitous on an FI blotter.

**Shape:**
- New `packages/core/src/ui/cellRenderers/Sparkline.tsx`
- Accepts an array-valued column (`number[]`) and renders a tiny inline SVG line
- Props: `width`, `height`, `stroke`, `fillGradient`, `trendColor` (up / down / flat)
- Register via `components: { sparklineRenderer: Sparkline }` on the grid
- Surface authoring in `column-customization` → add a `cellRendererName: 'sparklineRenderer'` pick in the Column Settings panel with a preview

**DoD:** sparkline visible in the demo against a pre-seeded `yieldHistory: number[]` column; unit test on the renderer; demo screenshot.

**Dependencies:** none.

---

### T1.2 — Percent-bar + gradient styled columns · 2 days · trader-daily

**Why:** Two more of the AdapTable "Styled Columns" set. Pure CSS renderers; they slot next to the Sparkline.

**Shape:**
- `PercentBar` — horizontal progress bar rendered via `linear-gradient` on the cell background; domain clamp via `min` / `max` props
- `Gradient` — heatmap background colour interpolated from value across `min`→`max` via `color-mix(in oklch, ...)`
- Both wire through `cellRenderer` + take params from `cellRendererParams` on the assignment
- Settings panel exposes both in the renderer picker (shared with Sparkline)

**DoD:** both renderers visible in demo (percent-bar on `filled / quantity`, gradient on `yield`); unit tests.

**Dependencies:** T1.1 (share the renderer-authoring UI).

---

### T1.3 — Smart Edit + Bulk Update + Plus/Minus on selection · 2–3 days · trader-daily

**Why:** Traders change 10 prices by +0.25 all the time. Today that's 10 cell edits.

**Shape:**
- New `packages/core/src/modules/editing/` module (priority 12)
- Context-menu items: "Bulk update…" (prompts a value) · "Smart edit…" (prompts a formula like `*1.1`, `+5`, `=<expr>`)
- Keyboard: `+` / `-` on numeric selection increments / decrements by tick-size (configurable per column)
- Uses AG-Grid `applyTransaction({ update: [...] })` so all changes land in one undo frame
- Integrates with the existing `useUndoRedo` so one Ctrl-Z reverts the whole bulk edit

**DoD:** E2E that selects 5 cells, runs `*1.1`, asserts all 5 moved; keyboard +/- test; unit tests on the formula parser.

**Dependencies:** none (expression engine already handles the arithmetic).

---

### T1.4 — Quick Search with highlight · 1 day · trader-daily

**Why:** "Show me anything with AAPL" is a constant ask. AG-Grid has `quickFilterText` but no UI and no visible highlight.

**Shape:**
- New toolbar input — `<QuickSearch />` — wires `api.setGridOption('quickFilterText', ...)`
- "Highlight" mode renders a cellRenderer overlay that wraps matching substrings in `<mark>`
- "Filter" mode hides non-matching rows (AG-Grid default behaviour)
- Toggle between modes; persist in `toolbar-visibility` module

**DoD:** toolbar chip wired; toggling highlight mode visibly marks substrings; E2E.

**Dependencies:** none.

---

### T1.5 — Weighted-average aggregation (`WAVG`) · 1 day · trader-daily

**Why:** YTM weighted by notional. The workhorse aggregation on an FI desk.

**Shape:**
- Add `WAVG(value, weight)` to `packages/core/src/expression/functions.ts` with `aggregateColumnRefs: true`
- Computes `sum(value * weight) / sum(weight)` across matching rows
- Document in the function palette of the Expression Editor

**DoD:** unit tests on the function; demo shows `WAVG([yield], [notional])` as a Grand Total Row.

**Dependencies:** T3.1 (Grand Total Rows) to make it user-visible end-to-end — but the function itself is shippable standalone.

---

### T1.6 — Toast / banner notifications primitive · 1 day · enabler

**Why:** Needed as the substrate for the alerts system. Also useful standalone for "profile saved" / "export complete" confirmations.

**Shape:**
- New `<ToastProvider />` + `useToast()` hook in `packages/core/src/ui/`
- Supports levels (info / success / warning / danger); positioned bottom-right; auto-dismiss with pause-on-hover
- Shares the `--fx-*` formatter tokens so it's visually cohesive with the rest of the design system

**DoD:** provider wired at the `<MarketsGrid />` root; basic unit tests; visible in the demo on profile save.

**Dependencies:** none.

---

### T1.7 — Data Change History (audit log) · 3–4 days · platform-enterprise

**Why:** Regulatory / compliance requirement for banks. Also a natural extension of the undo stack.

**Shape:**
- New `packages/core/src/modules/data-history/` module
- Subscribes to `cellValueChanged` + module state changes
- Persists entries `{ ts, user, profileId, colId, rowId, before, after, reason? }` to the storage adapter
- New Settings Panel: searchable / filterable log with "jump to cell" + "revert" per entry
- Configurable retention (default 500 entries)

**DoD:** panel mounts in SettingsSheet; edits + revert + search E2E; configurable retention verified.

**Dependencies:** T1.6 (toast on revert).

---

### T1.8 — Named queries / Data Sets · 2 days · trader-daily

**Why:** Traders want to save "today's widener list" or "IG-CDX deals > 5M" as named queries. Today the closest we have is `saved-filters` which is filter-model-only.

**Shape:**
- Generalize `saved-filters` — rename to `saved-views`, persist `{ filters + layout + formatters }` as one named bundle
- Applying a saved view resets those three module states atomically (one undo frame)
- New Settings Panel section

**DoD:** create / apply / delete / rename saved views; E2E; migration for existing `saved-filters` state.

**Dependencies:** none (schema migration handled in the module's `migrate()` hook).

---

### T1.9 — Hash-tracked URL state (deep links) · 0.5 day · nice-to-have

**Why:** "Send me your view" should be one URL paste.

**Shape:**
- Encode active profile id + active saved view into the URL hash
- Read on mount, write on profile / view change
- Opt-in via `<MarketsGrid enableUrlState />`

**DoD:** open URL with hash, see the view; unit test on the encoder.

**Dependencies:** T1.8.

---

## Tier 2 — Medium gaps (1–4 weeks each)

### T2.1 — Alerts engine · 2 weeks · trader-daily + platform

**Why:** The single biggest feature gap vs AdapTable. Data-change, relative-change, observable, row-change, aggregation alerts.

**Shape:**
- New `packages/core/src/modules/alerts/` module
- Declarative rule shape:
  ```ts
  {
    id, name, enabled,
    trigger: 'dataChange' | 'relativeChange' | 'rowChange' | 'aggregation' | 'observable',
    predicate: Expression,     // core expression engine
    scope: { columns?: string[]; rowFilter?: Expression },
    behaviour: 'toast' | 'banner' | 'flash' | 'callback',
    suppressDuplicatesFor?: number, // ms
  }
  ```
- Subscribes to `cellValueChanged`, `rowDataUpdated`, module-state deltas
- Emits `alertFired` event for programmatic listening
- Settings panel: rule CRUD + test / fire button
- UI sinks: toast (via T1.6), banner (above toolbar), cell flash (existing `conditional-styling` flash path)

**DoD:** all five trigger kinds testable via a demo fixture; observer + predicate eval correctness; E2E per trigger kind.

**Dependencies:** T1.6 (toast).

---

### T2.2 — Validation layer · 1 week · platform-enterprise

**Why:** Every editable column in a trading blotter needs pre-commit + commit validation. Today we have none.

**Shape:**
- Per-column `validator` field on `ColumnAssignment`: `pre: Expression, commit: Expression, server?: () => Promise<Result>`
- Expression result `true | string` — string is the rejection message
- UI: inline error chip anchored to the editing cell; entire edit rejected if `pre` fails (blocks editor from opening); `commit` validates post-edit (rolls back + toast on failure)
- Server validation is async, optimistic, rolls back on failure

**DoD:** three validator kinds round-trip; E2E per kind; rejection UI visually polished.

**Dependencies:** T1.6 (toast for rejections).

---

### T2.3 — Reports / export system · 1–2 weeks · platform

**Why:** Traders email CSVs. Compliance archives PDFs.

**Shape:**
- New `packages/core/src/modules/reports/` module
- Report definition = `{ name, columns, rowFilter, format: 'csv' | 'xlsx-visual' | 'json', destination: 'download' | 'clipboard' | custom }`
- "Visual Excel" preserves styles via `ag-grid-enterprise`'s `excelStyles`
- Custom destinations registered via `registerDestination(name, handler)`
- Scheduling — wire `@types/node-schedule` equivalent for browser: `requestIdleCallback` + stored cron strings
- Report list + run / schedule UI in Settings Panel

**DoD:** CSV + XLSX export of a demo report; scheduled re-export (every 5 min) posts to a mock endpoint; E2E.

**Dependencies:** none.

---

### T2.4 — Query Builder (visual expression authoring) · 2 weeks · trader-daily

**Why:** Traders don't want to type `[spread] > AVG([spread]) + 2 * STDEV([spread])`. They want to build it by clicking.

**Shape:**
- New `<QueryBuilder />` component in `packages/core/src/ui/`
- Drag-from-palette tree editor rendering nodes (function, operator, field, literal)
- Emits the same AST the `ExpressionEngine` consumes (so QueryBuilder output is serialization-compatible with hand-written expressions)
- Mounts alongside the existing `<ExpressionEditor />` as a toggle (Advanced ⇄ Visual)

**DoD:** build a 3-operand expression visually; round-trip through text → AST → visual tree; E2E.

**Dependencies:** none.

---

### T2.5 — Predicate library · 1 week · trader-daily

**Why:** Most conditional styles don't need expressions — "status equals FILLED" is a two-dropdown choice. Free-form expressions are overkill for 80 % of rules.

**Shape:**
- New `{ kind: 'predicate', column: string, operator: PredicateOp, value: unknown }` shape in `conditional-styling`
- System predicates: `eq / neq / gt / lt / gte / lte / between / in / contains / startsWith / isBlank / matches`
- Custom predicate registration: `registerPredicate({ name, matches, authoringComponent })`
- Panel defaults to predicate mode; "Advanced" toggle reveals the expression editor for anything not expressible as a predicate

**DoD:** create rule via predicates end-to-end; toggle to expression mode preserves semantics; E2E.

**Dependencies:** none (new rule kind — backwards-compatible).

---

### T2.6 — Custom Expression Functions registration · 3–4 days · platform

**Why:** Desks have their own helpers (`daysToMaturity`, `isFederalHoliday`). Today they'd need to fork the core.

**Shape:**
- Public API: `ExpressionEngine.register({ name, category, signature, minArgs, maxArgs, evaluate, validate? })`
- Also `registerAggregate(...)` for column-aware helpers
- Registrations are process-global and persist; function palette in ExpressionEditor picks them up via a `getRegisteredFunctions()` hook
- Add test coverage for the registration flow + collision handling

**DoD:** register a function at boot, use it in a conditional style, see it in the palette; E2E.

**Dependencies:** none.

---

### T2.7 — Custom tool panels + column menu + context menu · 1 week · nice-to-have

**Why:** AG-Grid's extension points are there; we just don't expose them.

**Shape:**
- `<MarketsGrid toolPanels={[...]} columnMenuItems={[...]} contextMenuItems={[...]} />`
- Each accepts a React component + config — wrapped in the `--gc-*` design-system primitives so visuals stay cohesive
- Default set mirrors AG-Grid defaults; host can extend or replace

**DoD:** three custom panels / items in the demo; E2E.

**Dependencies:** none.

---

### T2.8 — SSRM compatibility audit · 1 week · platform-enterprise

**Why:** The Wells Fargo terminal uses server-side rows. Our module pipeline has never been tested against it.

**Shape:**
- Spin up a mock SSRM datasource in the demo
- Run every module through it: column-customization, conditional-styling, calculated-columns, column-groups, saved-filters
- Document which transforms break and why (e.g. aggregate-column expressions can't work without server-eval)
- Fix what's fixable; document the rest as "client-row-model only"

**DoD:** SSRM demo tab in the apps/demo app; compatibility matrix in `docs/SSRM_COMPATIBILITY.md`.

**Dependencies:** none (but informs T3.3).

---

## Tier 3 — Strategic gaps (architectural decisions first)

These need a design doc + stakeholder sign-off before implementation.

### T3.1 — Grand Total Rows / Row Summaries · 1 week build · platform

**Why:** "Total notional across all visible rows" is a status-bar requirement. AdapTable has this; AG-Grid's pinned-bottom-rows can host it.

**Decisions needed:**
- Where do aggregates live? Separate module or extension of `calculated-columns`?
- Configurable per saved-view, or per profile?
- Interaction with filtering (total over visible vs all)?

---

### T3.2 — Team Sharing (active + referenced) · 2–3 weeks · platform

**Why:** AdapTable's "push to team" and "subscribe to team config" are enterprise differentiators.

**Decisions needed:**
- Backend protocol — REST, WebSocket, or file-sync? Start with REST + polling for simplicity.
- Authority model — one team lead writes, everyone reads? Git-style branching?
- Conflict resolution — last-write-wins, manual merge, append-only?
- Integration with permissions (T3.4)

---

### T3.3 — Server Evaluation of expressions · 2 weeks · platform-enterprise

**Why:** SSRM means the server needs to evaluate filter expressions. Push our expression AST down instead of round-tripping every row.

**Decisions needed:**
- Target language — SQL? IMDG query (Ignite / Hazelcast)? Both?
- Compiler surface — `ExpressionEngine.compile(node, target: 'sql' | 'ignite')`
- Fallback strategy for functions without a server equivalent
- Partial push-down when only part of an expression compiles cleanly

---

### T3.4 — Permissions / Entitlements · 1 week · platform-enterprise

**Why:** "Trader Alice can't edit Trader Bob's profiles." Nobody in prod will accept a trading tool without this.

**Decisions needed:**
- Module-level entitlements first (hide the Calculated Columns panel for role X) — cheap.
- Object-level (user A can't open profile B) — needs a persistence + lookup story.
- Custom resolver or declarative rules?
- Interaction with Team Sharing (T3.2).

---

### T3.5 — FDC3 mapping layer · 2 weeks · platform

**Why:** OpenFin interop. "Select a row → broadcast its CUSIP as fdc3.instrument." Today our OpenFin integration is just popout chrome.

**Decisions needed:**
- Which FDC3 contexts to support natively? Start with `fdc3.instrument` and `fdc3.organization`.
- Mapping config shape — per-grid or per-column?
- Intents we surface from the context menu (ViewChart, ViewNews, ViewAnalysis)?

---

### T3.6 — Pivot Layouts · 2 weeks · nice-to-have

**Why:** AG-Grid Enterprise supports pivoting; no UI surface to save / load pivot configs.

**Decisions needed:**
- Separate profile type or extension of existing profiles?
- Pivot result columns as dynamically-materialized assignments or a parallel state tree?

---

### T3.7 — Angular / Vue bindings · 1 week each · only on demand

**Why:** Parity with AdapTable. Only if there's a real consumer.

**Shape:**
- Thin wrappers over `ProfileManager` + `useFormatter` + `useModuleState`
- Reuse all core modules as-is (they're framework-agnostic)
- Share the cockpit CSS verbatim

---

## Explicitly NOT building

- **Vanilla-JS binding** — we're React-first by design
- **Charting (built-in)** — integrate a real chart library instead; provide selection + formatter bridges only
- **ipushpull integration** — Excel-as-live-surface is a specific trader workflow; integrate only on demand
- **No-Code visual authoring** — our module config IS the no-code layer; a second surface would be waste

---

## Sequencing — the first 12 weeks

A realistic ordering that maximises trader-visible progress per week while unblocking the heavier Tier 2 items.

| Week | Tier 1 | Tier 2 | Tier 3 / Strategic |
|------|--------|--------|--------------------|
| 1 | T1.6 Toast + T1.5 WAVG | | |
| 2 | T1.1 Sparkline | | |
| 3 | T1.2 Percent-bar + Gradient | | |
| 4 | T1.4 Quick Search | | |
| 5 | T1.3 Smart Edit + Bulk Update | | |
| 6 | T1.8 Named Queries | | |
| 7 | T1.7 Audit log (start) | T2.5 Predicates (spec) | |
| 8 | T1.7 Audit log (finish) | T2.5 Predicates (build) | |
| 9 | T1.9 URL state | T2.2 Validation (start) | T3.1 Grand Total design |
| 10 | | T2.2 Validation (finish) | |
| 11 | | T2.1 Alerts (start) | |
| 12 | | T2.1 Alerts (finish) | |

By end of week 12: ~70 % of AdapTable's trader-visible surface at ~100 % quality, with validation + alerts + audit closing the biggest compliance gaps.

---

## Updating this file

Every PR that closes a roadmap item must:
1. Move its entry from the Tier list to `docs/IMPLEMENTED_FEATURES.md`
2. Update the gap-analysis status column in `ADAPTABLE_TOOLS_GAP_ANALYSIS.md`
3. Bump the "Last updated" date at the top of this file

Keep the three files in lockstep — that's the single-source-of-truth contract.
