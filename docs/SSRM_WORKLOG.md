# SSRM pull-path — worklog

**Purpose:** let this work be picked up cold in a fresh session without
re-deriving context. Update status inline as tasks land.

**Read first (in order):**
1. [SSRM_REPLACEMENT_ANALYSIS.md](./SSRM_REPLACEMENT_ANALYSIS.md) — what exists, what breaks, why replace
2. [ADR-ssrm-worker-hosted-engine.md](./ADR-ssrm-worker-hosted-engine.md) — the target architecture + measured results

**Status:** `TODO` · `WIP` · `DONE` · `BLOCKED` · `PARKED`

---

## Goal

Blotters currently hold the whole dataset per window. Measured: 5.85 s per
attach for 20k rows, and production datasets reach ~250 MB, so N blotters cost
N × dataset. Move to a pull model: the dataset lives once in a Perspective table
in a SharedWorker; windows read viewports. Measured on the live feed: **0.8–1.3 ms**
block reads, second window attaching with **zero** dataset copy and **zero**
STOMP connections.

**Decision (settled):** use Perspective. The filter/expression layer is already
Perspective-shaped (`ssrmFilters.ts` compiles AG filter models to Perspective
plans; `calcExpressions` are Perspective expressions). Do **not** re-litigate.

---

## Ground truth — verify before trusting

Commands a new session should run to confirm the baseline still holds
(numbers as of 2026-07-19 end of session — T1–T3, T5–T7 + T8 partial landed):

```bash
# host-data: expect 484 passing, 0 failing
cd packages/data/host-data && npx vitest run

# ssrm-grid: expect 149 passing, 0 failing
cd packages/react-grid/ssrm-grid && npx vitest run

# grid: expect 729 passing, 0 failing
cd packages/react-grid/grid && npx vitest run

# engine: 297 · widgets-react: 222 (+1 skipped)
# Repo-wide gate: `npx turbo typecheck build test` — 67/67 green.
```

`cd` matters — running vitest from the repo root picks up the wrong config and
every file fails with `Cannot read properties of undefined (reading 'config')`.

---

## Done

| ID | Task | Where |
|---|---|---|
| D1 | Perspective validated in a SharedWorker; 2 windows, 1 table | `apps/demos/markets-grid-lab/perspective-spike.html` (delete when superseded) |
| D2 | `createPerspectiveEngine` + `PerspectiveViewCache` | `ssrm-grid/src/engine/` — 22 tests |
| D3 | `ProviderTableBridge` (conflating writer) | `host-data/src/runtime/perspective/` — 11 tests |
| D4 | `perspectiveWorkerLink` + `PerspectiveAttachHandler` + `connectPerspectivePort` | same — 31 tests |
| D5 | `createSsrmTableProvider` — sink adapter over existing transports | `host-data/src/runtime/providers/ssrmTableProvider.ts` — 10 tests |
| D6 | `@finos/perspective` 3.8.0 as a real dep of host-data + ssrm-grid; engine worker asset ships in `dist/assets` | `buildWorker.mjs` |
| D7 | `ssrm-grid/aggregations` subpath — pure helpers no longer drag in `CustomSSRMGrid` + AG module registration | `ssrm-grid/src/ssrm/aggregations.ts` |
| D8 | `ag-grid-enterprise` mock fixed via `importOriginal` (4 grid test files) | revealed 42 dead tests → T2 |

Commits: `e7914d88`, `389ad391`, `acec0995`, `6a88b496` (earlier data-plane work).
D5–D8 and the analysis docs are **uncommitted** at time of writing.

---

## Tasks

### T1 — Close the `SsrmEngine` seam · `DONE`

Landed: optional sync capabilities on `SsrmEngine` — `trySyncRows`,
`tryLeafAt`, `tryFindById`, `invalidateView` — implemented by `customEngine`
from the mirror; async-only engines omit them. All four RowMirror channels
removed: the datasource sync path calls `engine.trySyncRows`
(`CustomDatasourceExtras.rowMirror` deleted), the loading-cell stub reads an
engine-agnostic `SsrmStubLeafReader` (singleton `setActiveStubLeafReader` +
`context.ssrmLeafAt`), and the agg patchers became
`patchGrandTotalFromEngine` / `patchLoadedGroupAggregatesFromEngine`.
`engineRef` in `CustomSSRMGrid` is typed as `SsrmEngine` — compile-time proof
the component takes either engine. `getMirror` exists only inside
`customEngine.ts`.

Also fixes **B2** in passing: the agg patchers now receive
quick-filter/absSort/rowKeepExpression/idField extras at the call site.

Verified: ssrm-grid **145** passing (141 baseline + 4 new capability tests);
`tsc --noEmit` clean.

### T2 — Revive the 43 dead MarketsGrid tests · `DONE`

Landed: the four widget test files drifted because `MarketsGridHost` consumes
`useGridPlatform` via the **relative** module
(`../customizer/hooks/GridProvider.js`), which the tests'
`@wellsfargo-starui/grid/customizer` package mock cannot intercept — the real
hook then threw outside a real provider. Each file now also mocks the relative
module, and every platform stub carries the members the current controller
touches (`setDataTransactionApplier`, `rows`, `store.getModuleState`,
`events.on` → unsubscribe, `gridId`). `ssrmCalcColumns.test.ts` updated: IFS
lowers to nested Perspective `if()` (ternary output was dropped).

Verified: `grid` suite **724 passing, 0 failing** (was 681/43).

### T3 — Wire the provider worker to host a table · `DONE`

Landed:

- `installProviderHub` routes `psp-attach` → `PerspectiveAttachHandler`
  ahead of the hub protocol (SharedWorker and dedicated paths).
- Row routing is a **tee, not a replacement** (per the ADR, the cache stays
  the loader + push-compat authority): the hub's new `pullSinkFor` hook feeds
  every frame into `bridgeFor(providerId)` (`replace` → `snapshot`, live →
  `push`, thin deltas included); on link the table is seeded from
  `getCachedRows`. `createSsrmTableProvider` remains the standalone sink for
  non-hub hosts.
- Real `connect` = `createProviderPerspectiveConnect` over
  `connectPerspectivePort`: WASM fetched as siblings of the worker bundle,
  **stage-0 self-extracting packaging unwrapped** (both artifacts), and the
  **standalone** `dist/wasm/perspective-js.js` module initialised (the root
  bundle's inlined glue copy is a split-brain trap — `__wbindgen_*` dies if
  you mix them). `buildWorker.mjs` copies both `.wasm` next to
  `provider-worker.mjs`; new export
  `@wellsfargo-starui/host-data/assets/perspective-server.worker.mjs`.
- Table schema: `PerspectiveAttachRequest.schema` (window-supplied) or
  row-inference from the first cached rows (waits up to 30s for the
  snapshot); key column injected if absent; schema-less create acks a
  retryable error.

**Acceptance verified live** (`dev:stomp`, `SWEEP_ROWS_PER_SEC=2000`,
headless Chromium driving `apps/demos/markets-grid-lab/pull-path-spike.html`
— the REAL `provider-worker.mjs` bundle):
`{linked: true, tableSize: 20000, blockMs: 1.1, updatesSeen: 42}` — STOMP
runs inside the provider worker, the table lives in `starui-psp:*`, the page
only performs the port hand-off and reads viewports. Snapshot at this sweep
rate takes ~35 s to assemble; the link waits for it (schema inference) and
seeds in one `replace`.

Unit: `installProviderHub.pullPath.test.ts` (tee, seeding, routing, dedupe)
+ attach-handler schema tests. host-data suite: **484 passing, 0 failing**
(the `__refresh` client test — backlog B8 — was updated to the `__reload`
contract in passing).

### T4 — New SSRM surface · `TODO` · depends on T1, T2 (both `DONE`)

> **State after this session:** every prerequisite is in place and the swap
> is smaller than when this task was written. T1 made `CustomSSRMGrid`
> engine-polymorphic (typed against `SsrmEngine`; zero RowMirror channels).
> T2 restored the MarketsGrid mount-contract safety net (grid suite green).
> T5 removed the props whitelist (the new surface must keep the
> `gridOptions` three-tier precedence). T6 added `exportAll` to the handle
> (now 11 methods). The component is ~1,150 LOC — still over the 800
> ceiling; the extraction seams are visible in-file (dirty-handler effect,
> configureAndLoad, datasource memo, handle, agGridProps tiers).

Replaces `CustomSSRMGrid` (1,086 LOC, **zero tests**, over the 800 LOC ceiling).
Built on the reusable layer (~2,600 LOC, all tested). **Delete `CustomSSRMGrid`
in the same change** — no parallel implementations (CLAUDE.md).

Must reproduce — see analysis §8 for the full list:
- the 10-method `CustomSSRMGridHandle`
- sync block serving (no stub paint on fling) + block cache with fingerprinting
  and generation invalidation
- the 1 s scroll-quiet window and its three effects; 250 ms agg patch throttle
- `context` publication (`rowMirror`, `ssrmConfigured`, `ssrmCountMatching`,
  `totalRowCount`, `filteredRowCount`, `totals`, `aggregates`, `quickFilterTokens`)
- `getRowId` encodings: group `g:`, tree `t:`/`tl:`, `GRAND_TOTAL_ROW_ID`
- tree data, master-detail, set-filter values, cell-edit write-back,
  export/chart context-menu overrides, alerts leaf-fetcher registration

Use `ssrm-grid/src/ssrm/refreshScheduler.ts` (already written + 12 tests) as the
refresh policy rather than reinventing inline throttling.

**Do not** attempt customizer parity — the customizer stays in `grid` and is
row-model agnostic. This is a surface, not a product re-implementation.

### T5 — Fix the general-settings whitelist · `DONE`

Landed: the SSRM surface now forwards the module-pipeline gridOptions instead
of a prop whitelist, mirroring the CSRM surface's precedence:

- `CustomSSRMGrid` gained a `gridOptions` pass-through prop, applied in three
  tiers — SSRM defaults the pipeline may override (`rowSelection`,
  `cellSelection`, pagination, `rowGroupPanelShow`, `undoRedoCellEditing`, …)
  → pipeline options → SSRM-structural wiring that always wins
  (`ssrmGridOptionsPassthrough.ts` strips row-model wiring, block/scroll
  tuning, component-owned handlers, surface-prop keys, and
  client-row-model-only options like `pivotMode` / `rowDragManaged` /
  `quickFilterText`).
- `SsrmMarketsGridSurface` accepts `gridOptions` + `hostOverrideKeys`, strips
  surface-managed keys (`stripSurfaceManagedGridOptions`, same as CSRM) and
  forwards the rest; both call sites (`MarketsGridHost`,
  `MarketsGridCoreInner`) pass the computed `shell.gridOptions`.
- The `statusBar` hard-null is gone — the host's `statusBar` prop reaches the
  SSRM grid. Pipeline `statusBar` stays stripped: general-settings emits AG's
  client-side count/aggregation panels, which read the client row model and
  render blanks under SSRM (translation to the SSRM panels → T8).

Verified: grid **726** passing (724 + 2 new surface tests), ssrm-grid **149**
(145 + 4 strip tests), `tsc` clean in both.

### T6 — Edit/export paths: fetch-or-refuse · `DONE`

Landed:

- **Refuse** — `scanTargetCells` / `scanBulkUpdateTargets` (engine) report an
  `unloadedRowCount` alongside the collected targets: a range row is
  "unloaded" when its node is missing, an SSRM `stub`, or data-less without
  being a group/footer. Every edit entry point — smart-edit
  (keyboard + toolbar apply/preview/confirm), shortcuts, plus-minus,
  bulk-update (apply + confirm) — refuses the whole edit with a console
  warning (`warnRefusedUnloadedTargets`) when the count is non-zero, instead
  of silently applying to the loaded subset. The bulk-update scan also
  suppresses the focused-cell fallback when the range carried unloaded rows.
  Old `collect*` signatures remain as thin delegates.
- **Fetch** — visual-excel under SSRM routes through the engine:
  `CustomSSRMGridHandle.exportAll({format, fileName, visual})` (new, forwarded
  by `SsrmMarketsGridSurface`) → `exportAllViaAgGrid` (now takes
  `processCellCallback` so display formatters survive) with the full filtered
  set from `queryAll`; `useMarketsGridController.handleExportVisualExcel`
  detects the SSRM handle and exports the whole book, not loaded blocks.

Follow-up (unchanged scope, tracked in T8): a UI toast for refusals, and
selection-state-aware (`getServerSideSelectionState`) row-selection edits.

Verified: engine **297**, ssrm-grid **149**, grid **726** — all passing.

### T7 — Conditional-styling runtime under SSRM · `DONE`

Landed:

- **Header painter — engine-side counting.** `ssrmCountMatching` (published
  in grid context) now accepts `{ rowKeepExpression }`: the count runs over
  the DISPLAYED book (quick filter + the grid's own keep composed with the
  rule keep via `and(...)`). The painter compiles each rule's DSL to a
  Perspective keep-expression (`planSsrmCalcColumn`, memoised per rule);
  compilable rules paint from the async full-book verdict (stale-pass
  guarded), diff-based rules (`.old`/`.new` — tick-local by construction)
  keep the on-screen scan. Immediate on-screen paint is preserved for
  latency; the book verdict corrects it when it lands.
- **Timed activations — prune guard.** Under `rowModelType: 'serverSide'`,
  `forEachNode` covers loaded blocks only, so an absent rowId means
  "scrolled out of cache", not "left the book" — the per-pass
  `pruneTimedRuleState` is skipped (activations stay bounded by their own
  TTL expiry), so block unload/reload inside the TTL no longer drops live
  timed styles.

Verified: grid **729** passing (+3 SSRM header-painter tests), ssrm-grid
**149**, both `tsc` clean.

### T8 — Remaining customizer gaps · `WIP`

**Landed:** bulk-update distinct values from the engine — the SSRM grid
publishes `ssrmDistinctValues` (engine `getFilterValues`, full book) in grid
context; `BulkUpdateToolbarBody` prefers it and falls back to the client
scan (loaded blocks) on CSRM / engine-not-ready. Also landed earlier under
T5/T6/T7: general-settings pass-through, edit refusal, visual-excel full
export, header-painter book counting.

**Remaining, ranked:**
1. grid-state — async viewport restore, quickFilter reconciliation.
2. general-settings `statusBar` translation to the SSRM panels (pipeline
   `statusBar` is currently stripped — AG's client-side count panels render
   blanks under SSRM; see T5 note).
3. data-change-history — verify partial-row merge on undo/redo.
4. shortcuts / plus-minus capability ids — blocked on deciding B1 (the
   capability gate is inert; either advance `PHASE_MIN`s or delete the gate).
5. A visible toast for T6 edit refusals (today: console warning only).

---

## Defect backlog (independent of the migration)

| # | Defect | Where |
|---|---|---|
| B1 | SSRM capability gate inert — `CURRENT_SSRM_PHASE = 4`, all `PHASE_MIN` ≤ 3, so every gate returns enabled and all `disabled`/tooltip paths are dead | `engine/ssrmCapabilities.ts:5-23` |
| B2 | ~~`patchGrandTotalFromMirror` / `patchLoadedGroupAggregatesFromMirror` called without `extras`~~ **Fixed with T1** — extras passed at the (engine-based) call site | `CustomSSRMGrid.tsx` |
| B3 | `ssrmRowDiff` module-scope globals shared across grid instances; `clearSsrmRowDiffs`/`forgetSsrmRowDiff` have no callers → unbounded growth | `engine/ssrmRowDiff.ts:4-5,56-64` |
| B4 | Row exclusion **fails open** — a rejected expression silently shows *more* rows | `useSsrmRowKeepExpression.ts:23` |
| B5 | `agGrid/theme.ts` hardcodes `#8AAAA7` / `#8AAAA766` and forces `colorSchemeDark` — violates the UI stack rule, dark-only | `ssrm-grid/src/agGrid/theme.ts` |
| B6 | No bounded queue hub→window on the push path; a window that falls behind grows unbounded (observed: one renderer at 11 GB) | `SharedWorkerDataServicesHub` |
| B7 | Dead code: `applyTickToSsrm.ts` (tested, unused), `getSsrmShareOfTotal` (exported, no consumer), `engine/index.ts` subpath (no importer) | — |
| B8 | ~~`__refresh` client test fails~~ **Fixed with T3** — test updated to the `__reload` contract; host-data fully green | `SharedWorkerDataServicesClient.test.ts` |
| B9 | No e2e coverage of SSRM at all — zero matches for `ssrm`/`rowModel` under `e2e/` | — |

---

## Environment notes

- STOMP demo server defaults to its **coverage ceiling**. `rate` in the
  destination controls chunking only — the batcher recomputes batch size from
  elapsed time, so lowering it does not reduce row rate. The real knob is
  `SWEEP_ROWS_PER_SEC`:
  `set SWEEP_ROWS_PER_SEC=2000 && npm run dev:stomp` (cmd) /
  `$env:SWEEP_ROWS_PER_SEC=2000; npm run dev:stomp` (PowerShell).
  At the default (~20k rows/s into a 20k book) reads degrade to ~150 ms.
- star-demo blotters currently run **client-side** (`useSSRM` is commented out
  at `BlottersMarketsGrid.tsx:60`).
- OpenFin SharedWorker inspection: `chrome://inspect#devices` → Configure →
  `localhost:9091` (manifest sets `devtools_port` + `--remote-debugging-port`).

---

## Open questions

1. **Why was Perspective dropped in `74e3c69e`?** The diff reads as vendoring an
   external `file:ssrmgrid` dep during an AG Grid 35→36 upgrade, not a technical
   rejection. Only a concrete failure (bundle size, correctness, licensing)
   would change the plan.
2. Should `rowModel: 'server'` still accept a `rowData` prop, or should pull be
   the only server mode?
3. Row selection across blocks — unresolved in both designs.
