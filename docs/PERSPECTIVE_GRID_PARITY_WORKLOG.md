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

Also verified live and working: server-side sort and filter, multi-level
grouping with per-level and grand totals, live re-sort on value change (feed-
and edit-driven, DOM and row model, matching ground truth), density, row
height, column hide/move/reorder, right-click Settings / Remove from Grid /
Cut / Copy / Export, status bar, 0 failed blocks throughout.

## Pending

Effort figures are rough.

### 1. Style rules that must materialize worker-side · ~1 d

ARCHITECTURE assigns rules that are filtered/sorted on, or need cross-row
context, to the worker as boolean expression columns. Nothing builds them.
Presentation-only rules already resolve client-side over visible rows and work.

### 2. Master/detail and tree data not wired · niche

Need `isServerSideGroup` / `getServerSideGroupKey` / `detailCellRendererParams`,
which `CustomSSRMGrid` passes and the Perspective surface does not. Skip unless
required. Pagination, row selection and charts are *not* in
`PERSPECTIVE_SURFACE_OWNED_KEYS`, so they should pass through the module
pipeline untouched — **unverified**.

## Unverified — may or may not be gaps

- **Formatting toolbar button actions.** The buttons now enable correctly
  (matching the control), but that clicking one applies and persists is unproven
  — and unproven on CSRM too, because synthetic clicks do not drive those
  handlers on either surface. Needs a real click or an e2e spec.
- **Editing toolbar, smart edit, bulk update end to end.** The plumbing is
  verified and coalesced; the toolbars themselves are not.

## Engineering debt, not parity

Ordered. The e2e spec is first on purpose: it is the only thing that can close
the "Unverified" section above, because every item there failed for the same
reason — synthetic clicks do not drive the real controls, on EITHER surface.

- **Multi-window timings on the product path are unmeasured.** The whole
  2nd/3rd-blotter thesis (414 ms vs 1135 ms) is measured only in the harness.
- **`getCompiledClientWasm()`** — every window still carries the whole inline
  build (~5 MB), including the server wasm it never runs.
- **No e2e spec** covers the Perspective surface — do this FIRST of the debt
  items. A Playwright spec drives real clicks, which is exactly what the
  unverified items need: the formatting-toolbar buttons, the auto-formatter, and
  the alerts "Rescan full book" button (whose settings section will not even
  expand under a synthetic click). `e2e/` already has the harness conventions;
  the container subsuite (`playwright.container.config.ts`) is the closest
  existing shape.
- **`StompProviderConfig` cannot send request headers**, so an app only ever
  gets the broker's default 20,000-row sweep, never the sparse profile the
  probes used. Until then the pull path is measured against a feed shape no
  deployment would choose.

## Scope note

This list comes from code reading plus live measurement, not an exhaustive
audit of every customizer module. Only the modules the toolbars touch have been
traced; expect one or two more of the same species (the alerts item was found
exactly that way).
