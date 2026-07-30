# Perspective grid — CSRM parity worklog

Tracks the remaining work to make `rowModel="perspective"` behave exactly like
the CSRM AG Grid. Design, measured engine numbers and the non-optional
View-lifecycle rules live in
[`packages/react-grid/perspective-grid/ARCHITECTURE.md`](../packages/react-grid/perspective-grid/ARCHITECTURE.md);
this file is the task list and the verification record.

**Branch:** `feat/perspective-grid` · **Last verified:** 2026-07-30 · all work committed and pushed

**The unifying pattern.** The row engine is done. Every remaining gap is one
instance of the same thing: *code that assumed the client holds the whole book*.
When triaging anything new, ask that question first — it has predicted every
gap found so far.

## How to reproduce and verify

Production builds only. Never the Vite dev server: it serves hundreds of
modules per window and a 3rd window never loads.

```bash
npm run dev:stomp
npm --prefix apps run build -w @starui/minimal-perspective-table
npm --prefix apps run preview -w @starui/minimal-perspective-table
```

**Always run the CSRM twin side by side.** `apps/demos/stomp-marketsgrid-minimal`
is the same app minus three lines (worker asset, provider, `rowModel`), so it is
the control that separates a Perspective bug from demo configuration or a
harness artifact:

```bash
npm --prefix apps run build -w @starui/stomp-marketsgrid-minimal
npm --prefix apps run preview -w @starui/stomp-marketsgrid-minimal
```

Reach the grid api, engine and Table by walking `__reactFiber$` up from
`.ag-root-wrapper`; the platform is the `{platform, engineKind}` context value
on the same path. Note `.ag-center-cols-container .ag-row` does not exist in
this AG Grid 36 DOM — query `.ag-row`.

### Traps that produced false findings

- **Synthetic `PointerEvent` clicks do not drive the formatting-toolbar `Pill`
  handlers — on either surface.** Menu items respond, toolbar buttons do not.
  Two "the formatter is broken" findings evaporated against the control. The
  buttons' `disabled` state is a trustworthy signal; their actions are not
  testable this way.
- **Any cross-window comparison must be timing-immune.** The broker's full-book
  sweep rewrites every column every few seconds, so a value written in window 1
  is gone before a read in window 2 lands. Two "the windows don't share a Table"
  findings came from this. Use an *insert* (`table.update` with a new
  `positionId`, then compare `size()`) instead of a mutation.
- **A green unit test can pin a spelling the engine does not have.** Two of
  them did. The `?:`-vs-`if()` one was harmless (both forms work); the `not(`
  one was not — `not()` does not exist in 4.5.2 for any argument type, and
  nested inside `and`/`or`/`if` it evaluates wrong while `validate_expressions`
  reports it clean. Assert against a probe, not against what the compiler
  currently emits.
- **`avg("col")` is row-wise and looks like an aggregate.** It parses, never
  errors, and answers the column's own values — so `"col" > avg("col")` is
  false for every row, silently. There is no cross-row aggregate in the
  expression language at all.
- **A null matches `>` and `>=`.** In JavaScript — i.e. on CSRM — `null > 95`
  is false. Any rule compiled to the worker needs an `is_null` guard or it
  paints rows the control does not.
- **Walking `__reactFiber$` up from a DETAIL grid reaches the MASTER grid.**
  `.return` goes up the tree, so a detail grid read that way reports the
  master's row count and every book in the book — it looked exactly like
  master/detail ignoring its match clause. Use `api.forEachDetailGridInfo()`,
  AG's own registry of live detail grids.
- **A `host-data` source change is invisible to a running app until the worker
  asset is rebuilt.** It is a prebuilt esbuild bundle, so `vite build` on the
  app copies whatever `packages/data/host-data/dist/assets/` already holds. A
  full measure-and-diagnose cycle was spent on an unchanged worker before this
  was spotted; `npm run build --workspace=@starui/host-data` first.
- **A wide window sampled mid-feed is a montage of instants.** Blocks are read
  at different ticks, so grid rows 250–262 can be offset by one row from a
  single instantaneous truth read. Each block is internally correct. Not a
  mis-sort.

### Fixture properties that look like bugs

- **Totals will never match the CSRM grid.** `stomp-view-server` gives every
  subscription its own `structuredClone` of the book
  (`src/stomp/connection.ts` ~616/~651) and random-walks it independently
  (`touchPosition`, ±3%/tick). Measured: two *CSRM* windows disagree with each
  other by 20.0M — the same magnitude as the CSRM-vs-Perspective gap. To
  compare aggregation for real, run with live updates off.
- **An edit survives ~6.5 s.** The sweep overwrites it. A raw `table.update()`
  bypassing all our code is erased identically.
- **The broker is slow and erratic.** A cold snapshot takes 18 s–2 min and
  sometimes wedges. Check the hub before concluding anything is broken.

### Decisions taken

- **Set-filter value lists are all-or-nothing, ceiling 50,000.** CSRM shows
  every distinct value — AG virtualises the list and offers a mini-filter — so
  a lower cap would itself be a parity gap; `positionId` really does return
  20,000 and works. Above the ceiling `distinctValues` answers null and the
  filter is left EMPTY with one warning, because a truncated list has no "there
  are more" affordance: it renders as the whole domain and its Select All
  silently excludes the rest.

- **Quick search covers TEXT columns only by default.** MEASURED: the compiled
  expression costs one `match()` per column per token and is recomputed on every
  Table update while the View lives — 26 columns x 2 tokens was 2,408ms in Node
  and effectively unusable in the browser against the live sweep. Text is what a
  typed search aims at; `quickFilterAllColumns` opts back in to AG's
  every-column behaviour.
- **Quick-search input is SANITIZED, not escaped.** `match()` takes a regex and
  a lone `(` aborts the View build even backslash-escaped, so every character
  with regex or quoting meaning becomes `.`. Slight over-matching (`3.5` also
  finds `3x5`) in exchange for never throwing.
- **An export refuses rather than truncating.** Past 200,000 rows
  `readAllRows` answers null and the caller reports it, because a short
  spreadsheet is indistinguishable from a complete one once opened. The file is
  written through a detached client-side grid so AG's own Excel writer still
  produces the formatters and style colours.
- **A calculated column is validated before it is published.** One bad
  expression makes `table.view()` throw and blanks the WHOLE grid, not just its
  own column, so `validate_expressions` pre-flights the map and the failures are
  dropped and reported rather than allowed to take everything down.

## Done

| item | evidence |
|---|---|
| Surface prop parity (`ref`, `cellSelection`, `maintainColumnOrder`, `aggFuncs`, `getContextMenuItems`, `onGridPreDestroyed`) | tests; cell ranges over 3 columns verified live |
| `engineKind: 'perspective'` + `isServerSideEngine()` | tests |
| Saved-filter count badges (`engine.countMatching`) | 18 tests; live: 6,664 ∧ 10,102 → 3,363, unmappable → `null`, `liveViews` unchanged |
| Cell edits → `table.update()` | 18 tests; live: edit reached the worker-held Table |
| **One grid per platform** (`resolveGridSurface`) — the root cause behind a dead formatting toolbar, auto-formatter, saved-filter "+" and profiles | 6 tests; live: `apiAttached`/`mountedGrid` true, profile round-trip restores hidden column + sort with the top row at the true maximum |
| Set-filter value lists from the Table (`distinctValues` + `withPerspectiveSetFilterValues`) | 25 tests; live: `region` 3 · `desk` 8 · `instrumentType` 20 · `positionId` **20,000**; selecting a value filtered to 6,664 of 20,000 with 0 failed blocks, and the saved-filter pill it enabled reads `region: Americas 6664` |
| Quick search compiled to an expression column (`toQuickFilterExpression`) | 22 tests + 4 engine probes; live: `Inflation` 3,369 · `Inflation EMEA` 1,136 with both tokens matching every loaded row · `(` 20,000 instead of a crash · cleared 20,000; 0 failed blocks |
| Excel export reads the whole book (`readAllRows` + a detached export grid) | 17 tests; live: the grid held **100** rows of 20,000 (what the old export wrote); now 20,000 x 26 read in 547ms, and 6,669 rows all EMEA correctly sorted under a live filter+sort |
| Calculated columns as Perspective expression columns (`usePerspectiveCalcColumns` + `setCalcExpressions`) | 17 tests + engine probe; live: `currentPrice * quantity` computed in the worker, server-side sort by it, a saved-filter count on it (869 of 20,000), and a broken expression alongside a good one leaving the grid rendering |
| Alerts full-book rescan source | 8 tests; the leaf fetcher now registers for the Perspective path (backed by `readAllRows`) and the panel's rescan block shows for ANY server-side engine, not just `ssrm`. **Live UI click-through not confirmed** — the collapsed settings section does not open under synthetic clicks |
| `NOT` no longer compiles to Perspective's `not()`, which does not exist | 3 tests + 2 engine probes; affected calculated columns on BOTH server-side paths. Nested in `and`/`or`/`if` it validates clean and evaluates wrong, so the pre-flight check could not catch it |
| Tree data + master/detail (`perspectiveTreeFields`, `masterDetail`) | 24 tests; live: 3 region parents → 8 desks under EMEA with path ids → leaf positions with `isServerSideGroup` false, 840 rows, 0 failed blocks; detail grid holding 200 rows all of the master's own book, agreeing exactly with `readMatchingRows`. **New API, not parity** — MarketsGrid had neither on any surface |
| Style rules answered by the worker (`countMatchingExpression` + `aggregateScalar`) | 28 tests + 4 engine probes; live: a rule matching **1 row of 20,000** at a threshold no loaded block reaches lights the header, an impossible rule leaves it unlit, counts exactly match a JS pass over the same book (10,000 unfiltered · 3,339 under `region = EMEA` of 6,669 · 10,000 on clear), 25 counts in 31 ms against 169 ms uncached, live Views unchanged, 0 failed blocks |

Also verified live and working: row selection (3 nodes selected and cleared
through the api), integrated charts (`createRangeChart` → 1 chart model, 1
`.ag-chart`), pagination (201 pages navigable, rows render, 0 failed blocks —
see the one-row note below), server-side sort and filter, multi-level
grouping with per-level and grand totals, live re-sort on value change (feed-
and edit-driven, DOM and row model, matching ground truth), density, row
height, column hide/move/reorder, right-click Settings / Remove from Grid /
Cut / Copy / Export, status bar, 0 failed blocks throughout.

## Pending

Effort figures are rough.

### ~~1. Master/detail and tree data~~ — BUILT (confirmed wanted, 2026-07-30)

Built despite not being a parity gap; the note below is kept because it is why
this is **new MarketsGrid API**, not a restored behaviour. Live evidence and the
design are in the package ARCHITECTURE.md. Reachable on the demo with
`?tree=region,desk` and `?detail=1`.

**MarketsGrid does not expose `masterDetail` or `treeFields` on ANY surface,
CSRM included.** They are `CustomSSRMGrid` props — the hand-rolled surface that
was discarded as buggy — and `MarketsGridProps` has neither. So wiring them into
the Perspective surface is not restoring parity with the CSRM grid; it is adding
new public API to MarketsGrid that the CSRM twin also lacks. That is the fact
that should decide it, and it was not visible from the earlier code read.

Cost if it is wanted anyway:

- **Master/detail · ~0.5 d.** The surface takes a `masterDetail` prop and passes
  `masterDetail` / `isRowMaster` / `detailCellRendererParams` (none are in
  `PERSPECTIVE_SURFACE_OWNED_KEYS`, so nothing is stripping them — nothing
  supplies them). Detail rows need one new engine operation: read the book's
  rows matching a set of field values, which is a transient filtered View and
  close kin to `countMatchingExpression`. `CustomSSRMGrid` gets them from its
  mirror engine (`getDetailRows`), which does not exist here. Low risk — it
  reuses proven machinery.
- **Tree data · ~1–1.5 d.** Needs `isServerSideGroup` / `getServerSideGroupKey`
  plus rows carrying a group flag and a tree key. `toPerspectiveGroupLevel`
  already maps AG's one-level-at-a-time pull onto `group_by` + ancestor filter
  clauses, which is the shape treeData wants, so the row engine is most of the
  way there — but a self-referencing hierarchy (parent id → child id) is a
  different query from `group_by` over columns, and `CustomSSRMGrid`'s
  `treeFields` is really just fixed-order grouping. Higher risk, mostly in
  deciding which of the two it should mean.

### Verified: pagination, row selection and charts DO pass through

Measured live on the 20,000-row book, with the CSRM twin alongside.

- **Row selection — passes through, works.** The pipeline already supplies
  `rowSelection: { mode: 'multiRow', checkboxes: true, headerCheckbox: true }`
  and it arrives identically on both surfaces. Selecting three nodes gave
  `getSelectedRows().length === 3`; `deselectAll()` cleared it.
- **Charts — pass through, work.** `enableCharts` sets, `createRangeChart` over
  a 20-row × 2-column range built a chart: 1 chart model, 1 `.ag-chart` in the
  DOM, 0 failed blocks.
- **Pagination — passes through and works, with a one-row discrepancy.** 201
  pages against the control's 200, and `paginationGetRowCount()` reads **20,001**
  against 20,000. The cause is measured, not inferred: turning `grandTotalRow`
  off drops it to exactly 20,000 / 200 pages and turning it back on restores
  20,001. **AG counts the SSRM grand-total row as a store row**, where on the
  client-side row model the same `grandTotalRow: 'pinnedBottom'` sits outside
  the row model entirely. The datasource reports the exact 20,000 and
  `getDisplayedRowCount()` is 20,000; only the store count and pagination see
  the extra row. Left as a recorded divergence rather than chased — pagination
  is off by default here, and the fix would be working around AG internals.

### Open decision left by the style-rule work

**Cross-row context is a new capability, not restored parity.** The mechanism is
built and verified (measure the aggregate, substitute the literal), but the
client-side evaluator never passes `allRows` to a style rule, so
`[price] > AVG([price])` is false for every row on CSRM as well. The Perspective
surface now answers it correctly and CSRM still does not — a divergence, in the
direction of correct. Either bring CSRM up to it or decide the divergence is
wanted; today it is neither, just noted.

## ~~Unverified~~ — CLOSED by the e2e spec

`e2e/perspective-surface.spec.ts` (`npm run e2e:perspective`) — **7 tests, green
twice in a row**. Playwright drives real input, which is the one thing that
could settle these; every item here had failed for the same reason and it was
never the feature.

- **Formatting toolbar button actions — VERIFIED.** Bold applies `font-weight`
  700, Right applies `text-align: right`, and a change **survives a reload**,
  which is the claim that actually matters for a blotter and was the weaker of
  the two.
- **Auto Format — VERIFIED**, as a *restore*. Two wrong premises had to go
  first: the demo's numeric columns already carry the catalog's format on load,
  so a bare click has nothing to change; and AG virtualises columns, so at the
  default viewport only the seven leading TEXT columns are in the DOM and no
  numeric column is measurable at all. The spec widens the viewport to the
  grid's full 5,050 px, breaks one column's alignment through the toolbar, and
  requires Auto Format to put it back.
- **Alerts full-book rescan — VERIFIED.** The collapsed settings band DOES open
  under a real click, the full-book block is offered (so the
  `isServerSideEngine` gating works here), and the button reaches its handler
  and answers. The count is legitimately 0: `seedAlertBaselinesFromRows`
  returns early with no enabled dataChange/relativeChange rule and this demo
  seeds none.
- **Editing toolbar, smart edit, bulk update end to end.** Still not covered —
  the plumbing is verified and coalesced, the toolbars are not. The spec is now
  the place to add it.

Two traps the spec had to encode, both of which cost time:

- **`.ag-body-viewport .ag-row` and `.ag-center-cols-container .ag-cell` match
  ZERO elements** in this AG Grid 36 DOM. The shared demo specs use those forms
  and would hang here forever. Query `.ag-row` / `.ag-cell`; the element that
  scrolls is `.ag-grid-viewport`.
- **`v2-settings-nav-alerts` is a 1×1 px `opacity-0` shim** sitting under the
  settings sheet header, so clicking it is intercepted forever. The real path is
  the group trigger (`v2-settings-nav-group-styling`) then the menu item it
  reveals (`v2-settings-nav-menu-alerts`). The sheet's nav also needs a viewport
  taller than 800 px or it is clipped under its own header.

## Engineering debt, not parity

Ordered. **The e2e spec is done** — see the closed section above; what remains:

- ~~Multi-window timings on the product path are unmeasured.~~ **MEASURED**
  (`scripts/multiWindowTimingProbe.mjs`, two consecutive runs). Cold window to
  first rows 2,297 ms; windows 2 and 3, 1,056 ms and 1,248 ms. The headline
  1.8x understates it and the decomposition says why: **mount — bundle fetch,
  parse, React boot — is ~865–976 ms and is paid identically by every window**,
  cold or not, so it is not the row engine's cost at all. Strip it and a later
  blotter attaches and paints in **191–315 ms against 1,370 ms cold, 4.3x**.
  The thesis holds on the product path, and the remaining per-window cost is
  the 5 MB bundle — which is precisely the next item. All three windows read
  20,000 rows with 0 failed blocks and agreed exactly.
- **`getCompiledClientWasm()`** — every window still carries the whole inline
  build (~5 MB), including the server wasm it never runs. **Now the largest
  single cost on the path**: the timing measurement above puts ~900 ms of every
  window's ~1.1 s open squarely on bundle boot, against 191–315 ms for
  everything the row engine does.

  **ATTEMPTED AND REVERTED — read this before retrying.** Most of it checks
  out and the blocker is narrow. The slim build is **47.70 kB** against
  5,070 kB and exports everything needed; the compiled Module is a real one
  (103 exports) and **survives a round trip through a Worker**, so the
  transfer is not the risk. What failed is calling `getCompiledClientWasm()`
  **inside the SharedWorker**: the attach never replied, and the window sat at
  0 rows over a full Table with nothing logged. A 1.5 s `Promise.race` did NOT
  rescue it — which says it blocks the worker's event loop rather than merely
  taking a long time. Next step is a probe answering "can the compiled module
  be obtained in a SharedWorker at all, and from which scope" — not more
  plumbing, which was written and worked. Full write-up in the package
  ARCHITECTURE.md. Also: the worker asset is a prebuilt esbuild bundle, so
  `npm run build --workspace=@starui/host-data` is required before any
  host-data change is visible to a running app.
- ~~`StompProviderConfig` cannot send request headers.~~ **DONE.**
  `requestHeaders?: Record<string, string>` is published on the trigger frame
  (`sanitizeRequestHeaders` drops the three headers stompjs owns —
  `destination`, `content-length`, `receipt` — rather than let them corrupt
  the frame). Omitted entirely when empty, so a provider that sets none
  produces a byte-identical frame to before. 15 tests.

  **Proved end to end with a header that could not be mistaken.** The first
  attempt measured Table churn with `live-mode: sparse` and got ~186 rows/s —
  but the CONTROL, with the header removed, gave ~235 rows/s. No difference:
  the running fixture instance was already sparse-like, so churn could not
  tell treatment from control and the reading meant nothing. Swapping to
  `snapshot-rows` settled it — the book went from **20,000 rows to 1,000**.
  (Not the literal 500 requested; the fixture resolves the count against the
  destination path too. The point is the unmistakable change.) That is the
  control-vs-treatment difference the churn measurement failed to produce.
  `minimal-perspective-table` now ships the sparse headers.

## Scope note

This list comes from code reading plus live measurement, not an exhaustive
audit of every customizer module. Only the modules the toolbars touch have been
traced; expect one or two more of the same species (the alerts item was found
exactly that way).
