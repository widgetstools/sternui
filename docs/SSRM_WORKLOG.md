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
(numbers as of 2026-07-20 — T1–T7, T9 + T8 partial landed; B1/B3/B5 fixed):

```bash
# host-data: expect 484 passing, 0 failing
cd packages/data/host-data && npx vitest run

# ssrm-grid: expect 163 passing, 0 failing
cd packages/react-grid/ssrm-grid && npx vitest run

# grid: expect 725 passing, 0 failing (capability-gate + applyTickToSsrm tests deleted with B1/B7)
cd packages/react-grid/grid && npx vitest run

# engine: 301 · widgets-react: 226 (+1 skipped)
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

### T4 — New SSRM surface · `DONE`

Landed: **`CustomSSRMGrid` (1,167 LOC, zero tests) is deleted**, replaced by
a decomposed, tested surface built on the reusable layer:

| File | LOC | Role |
|---|---|---|
| `custom/SsrmGrid.tsx` | 193 | render + the T5 three-tier gridOptions merge |
| `custom/useSsrmGridController.ts` | 548 | engine lifecycle, configure/load, datasource, context publication, grid callbacks |
| `custom/useSsrmGridHandle.ts` | 346 | the 11-method imperative handle + export/chart context-menu items |
| `custom/ssrmDirtyRouter.ts` | 179 | dirty routing over **`RefreshScheduler`** (the worklog-mandated policy — no inline quiet-window timers) |
| `custom/types.ts` | 126 | `SsrmGridHandle` / `SsrmGridProps` |

Public rename: `CustomSSRMGrid`/`CustomSSRMGridHandle`/`CustomSSRMGridProps`
→ `SsrmGrid`/`SsrmGridHandle`/`SsrmGridProps` (grid's `SSRMGridHandle` alias
unchanged for its consumers). Everything on the must-reproduce list carries
over verbatim from the old component (sync block serving + block cache with
fingerprint/generation invalidation, context publication, `g:`/`t:`/`tl:`/
grand-total `getRowId` encodings, tree data, master-detail, set-filter
values, cell-edit write-back, export/chart menu overrides). What changed
behaviorally is the refresh policy, deliberately: leaf transactions conflate
by row id and flush through the scheduler (scroll-deferred, purge-subsuming,
`maxStallMs`-bounded) instead of the 1 s quiet window; purges invalidate
cache/generation/view immediately but defer the grid store purge until
motion settles; the 250 ms agg patch throttle is kept and skipped mid-scroll.

New coverage: `ssrmDirtyRouter.test.ts` (7 — conflation, immediate cache
patching, cache-only unloaded adds, scroll deferral, purge subsumption,
agg throttle, dispose) + `ssrmGrid.mount.test.tsx` (6 — AG wiring, row-id
encodings, gridOptions tiers, context publication, handle-through-engine,
edit write-back with schema coercion).

Verified: ssrm-grid **156**, grid **735**, widgets-react **222**, engine
**297**, host-data **484** — all green; every file under the 800 ceiling.
Customizer parity was NOT attempted, per the task's own scope note.

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

### T9 — Container pull opt-in (ADR Phase 4) · `DONE`

Landed — `MarketsGridContainer` runs the pull plane end-to-end:

- **host-data** — `createPerspectiveReadClient` (window-side WASM init +
  `perspective.worker()` over the shared engine worker; `@finos/perspective`
  imported LAZILY so its Node entry can't wasm-compile inside vitest);
  `perspectiveWorkerScriptUrl` threaded through `CreateProviderClientOpts` →
  `ProviderWorkerRoutingOpts` → `EnsureHubOpts` → `EnsurePlatformReadyOpts`.
- **grid** — `MarketsGridProps.ssrmPullEngine` forwarded (both render paths)
  to `SsrmMarketsGridSurface`, which passes `engine` and OMITS `rowData` when
  present (pull mode: the grid must never `setRowData` into the shared table).
- **widgets-react** — `MarketsGridContainerProps.dataPlane?: 'push' | 'pull'`;
  `pull = requested && live-mode && routing.perspectiveWorkerScriptUrl` (one-shot
  fallback warning otherwise); `useSsrmPullEngine` does the `psp-attach`
  hand-off + read client and OWNS engine disposal; the container gates
  MarketsGrid mount on the engine ("Connecting to the shared data table…").
  `useProviderDataWiring` under pull keeps provider start/status/overlay
  bookkeeping but applies NO rows: snapshot handler only updates overlay
  state (`setLoadRowCount`/`setResolvedSubKey`/…), tick handler returns early
  (either would write back into the SHARED table through the engine).
- **star-demo** — `platformBootstrap` passes the engine worker asset URL;
  `BlottersMarketsGrid` sets `dataPlane="pull"`.

Verified live (headless Chromium, STOMP @ `SWEEP_ROWS_PER_SEC=2000`, seed
provider `test.dp`, 20k book): window 1 renders at snapshot end (~34 s —
dominated by the seed's slow STOMP trickle config, not the pull path); ticks
repaint 35/36 visible price cells in 4 s; a SECOND window reaches the full
20,000-row grid in **3.5 s** with no snapshot re-fetch; zero page errors.
`Rows: 20,000` SSRM status panel correct in both windows.

### T8 — Remaining customizer gaps · `WIP`

> **Directive (2026-07-19, user):** SSRM must reach feature parity with
> CSRM. This section is the parity backlog; treat its items as required,
> not optional polish. Interaction performance targets for the pull path:
> sort/expand ≤ ~250 ms, group ≤ ~600 ms on a 20k live book (measured
> baselines — hold or beat these as parity items land).

**Landed:** bulk-update distinct values from the engine — the SSRM grid
publishes `ssrmDistinctValues` (engine `getFilterValues`, full book) in grid
context; `BulkUpdateToolbarBody` prefers it and falls back to the client
scan (loaded blocks) on CSRM / engine-not-ready. Also landed earlier under
T5/T6/T7: general-settings pass-through, edit refusal, visual-excel full
export, header-painter book counting.

**Landed (statusBar translation):** `translateSsrmStatusBar` maps
general-settings' client-side panel ids (`agTotalAndFilteredRowCount…` /
`agFilteredRowCount…` / `agTotalRowCount…` — new `ServerTotalRowCountPanel`
— / `agSelectedRowCount…`) to the SSRM stand-ins; `agAggregationComponent`
and custom panels pass through untouched. `SsrmGrid` merges pipeline
statusBar (translated) → surface prop → SSRM default, same precedence as
CSRM.

**Landed (grid-state under SSRM):**
- Viewport anchor restore RETRIES on `modelUpdated`/`firstDataRendered`
  until the row count covers the saved index (15 s deadline) — under SSRM
  the count lands async (pull engine: after the shared table fills) and the
  old one-shot `firstDataRendered` restore silently dropped the anchor.
- Quick filter: `SsrmGrid` intercepts `setGridOption('quickFilterText')`
  (still calling through so capture reads it back) and folds the value into
  the engine query + highlight — QuickSearch and grid-state restore now
  work under SSRM unchanged; a host-passed `quickFilterText` prop remains
  the controlled source. `QuickSearch` syncs its input from the grid option
  on ready/`profile:loaded` (skipped while focused) so a restored filter is
  visible in the box.

**Landed (pull-path live-feed fixes, 2026-07-20 — from star-demo field
report: sluggish scroll, slow sort, "no" realtime updates, wrong statusBar):**
- **statusBar total live under pull** — `SsrmGetRowsResult.totalRowCount`
  (Perspective engine: `table.size()` alongside every block read) flows
  through the datasource `onTotals` into `context.totalRowCount`. Before:
  pull mode never seeded `totalRowCountRef`, so the fallback latched the
  FIRST filtered count seen while the table was still filling → permanent
  "Rows: 20,000 of 400" + phantom "Filtered" panel.
- **bare-dirty invalidation conflated into the flush** (`ssrmDirtyRouter`)
  — every subscribed Perspective view fires `on_update` per tick batch, and
  invalidating (cache clear + generation bump + view invalidation) per
  signal kept the block cache permanently cold: sync scroll serving never
  hit, every fling frame waited an async round trip, and the per-interval
  refetch storm competed with sort/expand. Now ONE invalidation + ONE soft
  refresh per scheduler flush (≥`refreshThrottleMs`, scroll-deferred,
  `maxStallMs`-bounded); between flushes sync serving may be up to one
  interval stale — the same staleness the painted grid already shows.
- **pull-aware busy indicator** (`MarketsGridLoadingOverlay.dataPlane`) —
  pull subtitles describe the shared table ("Loading shared data table ·
  N rows", "Connecting…", "Re-syncing…") instead of claiming the window is
  buffering a snapshot; the pull cold-start mount gate shows the animated
  overlay with live `loadRowCount` progress instead of a static text line.
- NOTE the field report's dominant factor was environmental: the STOMP
  demo server at its default sweep ceiling (~20k rows/s into a 20k book —
  reads degrade to ~150 ms). See Environment notes; run with
  `SWEEP_ROWS_PER_SEC=2000`.

**Remaining, ranked:**
1. data-change-history — verify partial-row merge on undo/redo.
2. A visible toast for T6 edit refusals (today: console warning only).
3. Pull windows still receive the full snapshot replay (worker→window row
   copy) solely to resolve the overlay / status bookkeeping — resolving
   from an attach-ack `tableSize` (needs the ack to carry it) would drop
   the copy and speed warm attach.
4. Stale subscribed views in the LRU keep firing `on_update` per tick
   (cheap now that dirt conflates to a bool, but eviction/unsubscribe on
   shape change would silence them).

(The former "shortcuts / plus-minus capability ids" item is moot: B1 was
resolved by DELETING the capability gate — every SSRM capability is
unconditionally on, per the parity directive.)

---

## Defect backlog (independent of the migration)

| # | Defect | Where |
|---|---|---|
| B1 | ~~SSRM capability gate inert~~ **Fixed — gate DELETED** (parity directive: every capability unconditionally on). `ssrmCapabilities.ts`, `useSsrmCapabilityGate`, the `SsrmCapabilityId`/`SsrmPhase` types, and all `disabled`/tooltip dead paths removed; panels simplified | — |
| B2 | ~~`patchGrandTotalFromMirror` / `patchLoadedGroupAggregatesFromMirror` called without `extras`~~ **Fixed with T1** — extras passed at the (engine-based) call site | `CustomSSRMGrid.tsx` |
| B3 | ~~`ssrmRowDiff` unbounded growth~~ **Fixed — bounded**: 50k-row cap with oldest-first eviction (both `PreviousValuesStore` and the diff map); dead `forgetSsrmRowDiff` deleted. Stores stay module-scope (same-provider grids share identical diffs harmlessly; documented) | `engine/ssrmRowDiff.ts` |
| B4 | Row exclusion **fails open** — a rejected expression silently shows *more* rows | `useSsrmRowKeepExpression.ts:23` |
| B5 | ~~`agGrid/theme.ts` hardcoded hex, dark-only~~ **Fixed** — default theme is now the design-system `staruiGridTheme` (live OKLCH tokens, light+dark via `data-ag-theme-mode`) | `ssrm-grid/src/agGrid/theme.ts` |
| B6 | No bounded queue hub→window on the push path; a window that falls behind grows unbounded (observed: one renderer at 11 GB) | `SharedWorkerDataServicesHub` |
| B7 | Dead code: ~~`applyTickToSsrm.ts`~~ (deleted with B1), `getSsrmShareOfTotal` (exported, smoke-tested, no runtime consumer), `engine/index.ts` subpath (no importer) | — |
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
- star-demo blotters run the **pull plane** (`dataPlane="pull"` in
  `BlottersMarketsGrid.tsx`; auto-falls back to push when the bootstrap lacks
  `perspectiveWorkerScriptUrl`, and in historical mode).
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
