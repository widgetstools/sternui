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

Commands a new session should run to confirm the baseline still holds:

```bash
# host-data: expect 476 passing, 1 failing (__refresh, pre-existing)
cd packages/data/host-data && npx vitest run

# ssrm-grid: expect 141 passing, 0 failing
cd packages/react-grid/ssrm-grid && npx vitest run

# grid: expect 681 passing, 43 failing (see T2 — these were dead, now revealed)
cd packages/react-grid/grid && npx vitest run
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

### T3 — Wire the provider worker to host a table · `TODO`

Depends on: D3–D5 (done).

- Route `psp-attach` in `installProviderHub` → `PerspectiveAttachHandler`
- Provider slot writes rows into `bridgeFor(providerId)` via
  `createSsrmTableProvider` instead of hub cache + fan-out
- Implement the real `connect` using `connectPerspectivePort`

**Acceptance:** a provider feeds a worker-hosted table end-to-end with no
window in the data path; verify against `dev:stomp` with
`SWEEP_ROWS_PER_SEC=2000`.

### T4 — New SSRM surface · `TODO` · depends on T1, T2

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

### T5 — Fix the general-settings whitelist · `TODO`

`SsrmMarketsGridSurface` accepts a narrow prop whitelist, so ~100 computed
gridOptions — **including `rowSelection`** — are discarded, and the status bar
is hard-nulled (`MarketsGrid.tsx:488`). The panel shows toggles that do nothing.
Structural; T4 must not re-create it.

### T6 — Edit/export paths: fetch-or-refuse · `TODO` · **data integrity**

Currently silent-wrong under SSRM:
- select-all + bulk-update edits **only loaded blocks** — no module consumes
  `getServerSideSelectionState()` (zero uses outside the status bar)
- smart-edit / shortcuts / plus-minus drop unloaded targets silently
  (`collectTargetCells.ts:55`)
- visual-excel exports only loaded blocks (`exportVisualExcel.ts:24-30`) despite
  `exportAllViaAgGrid` existing and being reachable

Silent wrong results on an edit path are worse than refusal. Independent of the
grid decision — worth doing regardless.

### T7 — Conditional-styling runtime under SSRM · `TODO`

Rules are fine (`ssrmRowDiff.ts` keys previous values by row id from the tick
stream, so block refetch doesn't lose them). The **runtime** is unguarded:
`headerPainter.ts:117` uses `forEachNodeAfterFilter`, `timedActivations.ts:120`
uses `forEachNode`. Header indicators silently mean "matches on screen" rather
than "matches in book". Needs engine-side `countMatching`.

### T8 — Remaining customizer gaps · `TODO`

Ranked: grid-state (async viewport restore, quickFilter reconciliation) →
bulk-update (distinct values from engine, not a client scan) →
data-change-history (verify partial-row merge on undo/redo) → shortcuts /
plus-minus capability ids.

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
| B8 | `__refresh` client test fails — encodes the pre-`stableRestartExtra` contract | `SharedWorkerDataServicesClient.test.ts:254` |
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
