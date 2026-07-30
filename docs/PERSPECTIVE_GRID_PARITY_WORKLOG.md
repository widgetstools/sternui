# Perspective grid — CSRM parity worklog

Tracks the remaining work to make `rowModel="perspective"` behave exactly like
the CSRM AG Grid. Design, measured engine numbers and the non-optional
View-lifecycle rules live in
[`packages/react-grid/perspective-grid/ARCHITECTURE.md`](../packages/react-grid/perspective-grid/ARCHITECTURE.md);
this file is the task list and the verification record.

**Branch:** `feat/perspective-grid` · **Last verified:** 2026-07-30

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

## Done

| item | evidence |
|---|---|
| Surface prop parity (`ref`, `cellSelection`, `maintainColumnOrder`, `aggFuncs`, `getContextMenuItems`, `onGridPreDestroyed`) | tests; cell ranges over 3 columns verified live |
| `engineKind: 'perspective'` + `isServerSideEngine()` | tests |
| Saved-filter count badges (`engine.countMatching`) | 18 tests; live: 6,664 ∧ 10,102 → 3,363, unmappable → `null`, `liveViews` unchanged |
| Cell edits → `table.update()` | 18 tests; live: edit reached the worker-held Table |
| **One grid per platform** (`resolveGridSurface`) — the root cause behind a dead formatting toolbar, auto-formatter, saved-filter "+" and profiles | 6 tests; live: `apiAttached`/`mountedGrid` true, profile round-trip restores hidden column + sort with the top row at the true maximum |
| Set-filter value lists from the Table (`distinctValues` + `withPerspectiveSetFilterValues`) | 25 tests; live: `region` 3 · `desk` 8 · `instrumentType` 20 · `positionId` **20,000**; selecting a value filtered to 6,664 of 20,000 with 0 failed blocks, and the saved-filter pill it enabled reads `region: Americas 6664` |

Also verified live and working: server-side sort and filter, multi-level
grouping with per-level and grand totals, live re-sort on value change (feed-
and edit-driven, DOM and row model, matching ground truth), density, row
height, column hide/move/reorder, right-click Settings / Remove from Grid /
Cut / Copy / Export, status bar, 0 failed blocks throughout.

## Pending

Effort figures are rough.

### 1. Quick search does nothing — blocking · ~0.5 d

`widget/QuickSearch.tsx` calls `api.setGridOption('quickFilterText', …)`, which
AG Grid implements for the **client-side row model only**. `CustomSSRMGrid`
works around it by putting `quickFilterText` + parsed tokens on the grid
`context` and honouring them in its own datasource; the Perspective surface has
no `quickFilterText` reference at all, so typing in the box is a no-op. Maps
onto a Perspective `contains` clause across string columns.

### 2. Excel export exports the wrong rows — blocking · ~0.5 d

`customizer/modules/visual-excel/exportVisualExcel.ts` calls
`api.exportDataAsExcel()`, which under a server row model only sees the loaded
block cache. The user gets a few hundred rows instead of 20,000, with no
warning. Needs a full-book read through a View.

### 3. Calculated columns are absent — blocking · ~1 d

The `expressions` map is plumbed through `toPerspectiveViewConfig` and
expression columns are verified sortable, filterable and groupable, but nothing
populates it from MarketsGrid's calculated-column definitions — so a calculated
column simply is not there. Partly built: `engine/ssrmCalcColumns.ts` already
produces a `perspectiveExpression` plan (one of its cases is in the
pre-existing failing set). Also the first thing to check if sort or filter ever
misbehaves: a column absent from the Table cannot be sorted server-side.

### 4. Alerts have no full-book source · ~0.5 d

`registerAlertsSsrmLeafFetcher` is gated on `useSSRM`
(`widget/useMarketsGridController.ts:287`), so on this path it registers `null`.
Any alert needing rows beyond the viewport evaluates against nothing, silently.
`AlertsPanel`'s `=== 'ssrm'` check was deliberately left alone during the
`engineKind` change and needs revisiting with this.

### 5. Style rules that must materialize worker-side · ~1 d

ARCHITECTURE assigns rules that are filtered/sorted on, or need cross-row
context, to the worker as boolean expression columns. Nothing builds them.
Presentation-only rules already resolve client-side over visible rows and work.

### 6. Master/detail and tree data not wired · niche

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

- **Multi-window timings on the product path are unmeasured.** The whole
  2nd/3rd-blotter thesis (414 ms vs 1135 ms) is measured only in the harness.
- **`getCompiledClientWasm()`** — every window still carries the whole inline
  build (~5 MB), including the server wasm it never runs.
- **No e2e spec** covers the Perspective surface. Worth building the
  click-driven harness once; it would also close the two unverified items above.
- **`StompProviderConfig` cannot send request headers**, so an app only ever
  gets the broker's default 20,000-row sweep, never the sparse profile the
  probes used. Until then the pull path is measured against a feed shape no
  deployment would choose.

## Scope note

This list comes from code reading plus live measurement, not an exhaustive
audit of every customizer module. Only the modules the toolbars touch have been
traced; expect one or two more of the same species (the alerts item was found
exactly that way).
