# SSRM-in-Worker Data Engine — Design & Build Plan

> **Status — Phase 1 landed (branch `feat/ssrm-worker-data-engine`).**
> Flat filter + sort + paginate run in the SharedWorker; the dataset
> never crosses to the main thread. Plug-and-play with `MarketsGrid` via
> one additive `serverSide` prop. Shipped:
> - `host-data/src/runtime/ssrm/` — pure `runQuery` engine (text/number/
>   date/set + AND/OR filters, multi-col null-safe sort, exact `lastRow`)
>   + `SsrmDataProvider` (vanilla `IServerSideDatasource`). 16 unit tests.
> - Protocol: `query`/`query-result` reqId RPC + `control` attach mode
>   (starts/keeps the provider alive with **no** row fan-out).
> - Hub: `handleQuery` over `ProviderSlot.cache` + control listeners.
> - Client: `query()` RPC + `attachControl()`.
> - `useSsrmDataSource(providerId)` (host-data-react) → grid binding.
> - `MarketsGrid` `serverSide` prop (merges into pipeline grid options;
>   bridges `onGridReady`/`onGridPreDestroyed`).
> - Demo: `apps/demos/stomp-marketsgrid-minimal` now runs on SSRM.
>
> **Status — Phase 3a landed (realtime, basic).** Post-ready live ticks
> now flow through SSRM:
> - Hub forwards conflated post-ready deltas to `control` subscribers as a
>   new `ssrm-txn` event (only the changed rows cross to the main thread —
>   the dataset stays in the worker; snapshot/replace frames are not
>   forwarded).
> - Client routes `ssrm-txn` → `ControlListener.onTxn`; `useSsrmDataSource`
>   applies it via `applyServerSideTransactionAsync({ update })`.
> - 5 new hub tests (query RPC + control + realtime forwarding).
> - **Known limits (Phase 3b):** update-only (new rows / sort-position
>   moves reconcile on next refresh, not surgically); no conflation tuning
>   knob yet beyond the provider's own throttle.
>
> **Status — Phase 2a landed (set-filter values).** SSRM set filters now
> show every option across the **full** worker cache, not just loaded
> rows:
> - `ssrm/indexes.distinctValues(rows, colId)` — distinct, display-sorted,
>   nullish-dropped, dot-path aware (scanned on demand; incremental
>   `Map<value,count>` index is a later optimization).
> - `set-filter-values` reqId RPC + hub `handleSetFilterValues`.
> - `SharedWorkerDataServicesClient.getSetFilterValues(providerId, colId)`;
>   `useSsrmDataSource` exposes `getSetFilterValues(colId)` for an SSRM set
>   filter's async `values` callback.
> - Demo wires set filters on the categorical columns.
> - 5 new tests.
>
> **Engine extraction (row-shaping) — deferred, by design.** The
> expression engine + formatters are verified worker-safe *code*, but
> `@starui/engine` ships as a single-entry bundled lib (`vite` lib mode +
> `dts({ rollupTypes })`). Cleanly exposing a `/worker` subpath means
> reworking that multi-entry + dts build — a focused, separately-verified
> change (it touches the 193-test engine package and every consumer), not
> something to rush inline. Tracked as the Phase 0 build task.
>
> Totals: 409 host-data tests green; host-data / host-data-react / grid /
> demo typecheck clean.
>
> **Not yet (next):** worker-safe engine extraction → row-shaping (calc
> cols / formatted strings / style tokens), aggregates over all rows
> (grand totals / status bar), grouping/pivot, surgical realtime (adds +
> re-sort). See §7 phases 2–7.



> **Goal.** Move *all* data processing — filtering, sorting, grouping,
> aggregation, pivot, calculated columns, value formatting and conditional
> styling — off the UI thread into the `host-data` SharedWorker, exposed to
> AG-Grid through the **Server-Side Row Model (SSRM)**. The dataset is cached
> **once** in the worker and dispatched to many subscribers (no duplication).
>
> **Non-negotiable acceptance bar.** The end user must **not be able to tell it
> from the Client-Side Row Model (CSRM)** — instant sort/filter, no "Loading…"
> flicker, 60 fps scroll, responsive keyboard nav — **and every CSRM feature
> must keep working** under SSRM.

---

## 0. Why this works (and why the worker, specifically)

| Load on the UI thread today (CSRM) | Where it goes |
|---|---|
| Sort / filter / group / aggregate over all rows (one-time, but *freezes* the thread when it runs) | Worker |
| Applying realtime ticks across all rows (continuous — the real scroll/keyboard killer) | Worker |
| Per-cell `valueGetter` / `valueFormatter` / `cellStyle` on every cell that scrolls into view (per frame, scales with columns) | Pre-baked in the worker → cells become dumb reads |
| Dataset-wide aggregate expressions (`x / SUM(x)`) — full-table pass via `GridApi.forEachNode()` | Worker (it holds all rows; this is *easier* there) |
| Distinct values for set filters | Worker distinct-value index |

The SharedWorker is the ideal SSRM "server" because it already holds the
canonical cache (`ProviderSlot.cache`), it is *local* (postMessage RTT ≈ 0.1–1 ms,
**not** a network call), and it is the only place that sees the full dataset —
so dataset-wide aggregates and set-filter distinct values are correct *and* off
the main thread. "Indistinguishable from CSRM" is achievable precisely because
the latency is sub-frame and the data is resident.

**Two halves, both required.** (1) Offload the data operations (SSRM contract).
(2) Ship **render-ready rows** so viewport cells run zero callbacks. Doing only
(1) fixes the freezes but leaves wide-grid scroll stutter; (2) is what makes
scroll/keyboard feel native. Both fall out of the same worker pipeline.

---

## 1. What already exists (reuse map)

The hard part — a deduplicated, realtime, in-worker cache — is **already built**.

| Capability | Location | Reused as |
|---|---|---|
| Canonical row cache `Map<rowId, row>` | `host-data` `ProviderSlot.cache` (`runtime/hubTypes.ts`) | **RowStore** (source of truth) |
| Snapshot + delta application | `SharedWorkerDataServicesHub.ts` | Feeds RealtimeReconciler |
| Thin field-level deltas (`delta-patch`) | `runtime/protocol.ts` | Maps to SSRM `update` transactions |
| `reqId` request/response RPC (config catalog) | `runtime/protocol.ts` | Pattern for `query` / `set-filter-values` / `export-all` RPCs |
| Columnar binary wire format (`delta-bin`) | `runtime/protocol.ts` | Block serialization for large blocks |
| Transports (rest / stomp / mock) | `runtime/providers/transports/*` | Ingestion (orthogonal to consumption) |
| Subscription plumbing | `host-data-react` `useDataProvider`, `ProviderClientAdapter` | Client wiring for the SSRM hook |
| Expression engine (parse/AST/eval) | `@starui/engine` `ExpressionEngine`, `Evaluator` | Calculated columns + custom aggs (worker-safe) |
| Value formatters (Intl presets, Excel via `ssf`) | `engine/colDef/adapters/valueFormatterFromTemplate.ts` | Pre-baked display strings (worker-safe) |
| Filter predicates | `engine/filters/filtersToolbarLogic.ts` (`doesRowMatchFilterModel`) | Worker filter engine (partial) |
| Null-safe comparators | `engine/colDef/nestedField.ts` (`defaultNullSafeComparator`) | Worker sort |
| `allRows` aggregate concept + invalidation | `engine/.../calculated-columns/virtualColumn.ts` | Worker dataflow (relocated, made incremental) |
| Custom aggregation compile | `engine/.../column-customization/transforms.ts` (`buildCustomAggFn`) | Worker group aggs |
| Field-format catalog / auto-format | `engine` `FIELD_FORMAT_CATALOG`, `matchFieldToCatalog` | Shaping defaults |
| Conditional styling → CSS (already off the per-cell path) | `engine/.../transforms.ts` `reinjectCSS` | **Keep** — CSS injection stays main-thread, once per profile |

**Engine worker-safety:** ~85 % pure TS. Blockers are narrow and don't hurt us —
`injectEditorStyles` (DOM; stays main-thread, runs once per profile, *not* per
cell), `getComputedStyle` theme resolution (has a static-fallback path), and
`GridApi.forEachNode()` for `allRows` aggregates (replaced by iterating the
worker's own cache — strictly better).

---

## 2. Target architecture

```
┌─────────────────────────── SharedWorker (host-data) ───────────────────────────┐
│                                                                                 │
│  Transport (rest/stomp/mock) ──▶ RowStore  Map<rowId, RawRow>  (canonical, 1×)  │
│                                     │                                            │
│                                     ├─▶ IndexManager (incremental, per column)  │
│                                     │     • DistinctValueIndex  Map<val,count>   │
│                                     │     • AggregateIndex  sum/count/avg, min/  │
│                                     │       max-heap   (scope: all | filtered)   │
│                                     │     • (opt) SortIndex / value indexes      │
│                                     │                                            │
│                                     ├─▶ ShapingPipeline (per row, multi-pass)    │
│                                     │     calc cols (expr AST) → fmt strings →   │
│                                     │     style tokens   [topo-ordered DAG]      │
│                                     │                                            │
│                                     ├─▶ QueryEngine  (per request)               │
│                                     │     filter → sort → group → aggregate →    │
│                                     │     pivot → slice → shaped block           │
│                                     │     backed by MaterializedView cache       │
│                                     │     keyed by (filter,sort,groupKeys)       │
│                                     │                                            │
│                                     └─▶ RealtimeReconciler                       │
│                                           tick → update store+indexes+aggs →     │
│                                           reshape affected → per-view txn plan    │
│                                           (add/update/remove + refresh routes) →  │
│                                           conflate → broadcast                    │
│                                                                                 │
│  ViewRegistry: per-subscriber {filterModel, sortModel, groupKeys, loadedRanges} │
│  Protocol (reqId): query · set-filter-values · export-all · selection · txn▲     │
└───────────────────────────────────────────────▲────────────┬───────────────────┘
                                     query/RPC   │            │ txn / block
                                                 │            ▼
┌──────────────────────────── Main thread (client) ──────────────────────────────┐
│  SsrmDataProvider  implements IServerSideDatasource   (vanilla TS class)         │
│     getRows → post `query` → success/fail ; abort-on-view-change                 │
│  useSsrmGrid (React)                                                              │
│     • binds datasource, rowModelType="serverSide"                                │
│     • SSRM colDef adapter (strip baked callbacks → field reads)                  │
│     • set-filter async `values`  · quick-filter bridge · export-all bridge       │
│     • server-side selection state · status-bar aggs                              │
│     • applies `txn` via applyServerSideTransactionAsync                          │
│  MarketsGrid stays presentational — forwards rowModelType + serverSideDatasource  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Package placement (respects the import-boundary rules)

| Component | Package / path | Notes |
|---|---|---|
| Worker engine (RowStore wrapper, IndexManager, ShapingPipeline, QueryEngine, MaterializedView, RealtimeReconciler) | `packages/data/host-data/src/runtime/ssrm/` | Lives with the SharedWorker + providers |
| Protocol additions (`query`, `set-filter-values`, `export-all`, `selection`, `txn`) | `packages/data/host-data/src/runtime/protocol.ts` + types in `shared-types` | Extends existing reqId RPC |
| Worker-safe engine entry | `@starui/engine` new subpath `./worker` | Pure shaping primitives only; **no DOM imports** |
| Client datasource (vanilla class) | `packages/data/host-data/src/ssrm/SsrmDataProvider.ts` | Framework-agnostic |
| React binding | `packages/data/host-data-react/src/ssrm/useSsrmGrid.ts` | Datasource + colDef adapter + capability shims |
| Grid passthrough | `packages/react-grid/grid` (`useGridHost.ts` already forwards `rowModelType`) | Add `serverSideDatasource` + set-filter/agg/group passthrough; **grid stays presentational, no data dep** |

> The grid package must **not** import `host-data` — the app/hook owns the data
> lifecycle and passes the datasource into `MarketsGrid` as props, mirroring how
> `rowData` is passed today.

---

## 3. The performance contract — "indistinguishable from CSRM"

These are **measurable acceptance criteria**, gated in CI/e2e, not vibes.

| Dimension | CSRM baseline | SSRM target | How we hit it |
|---|---|---|---|
| Sort/filter latency | instant | result visible **≤ 1 animation frame (16 ms)** for ≤ 50k rows | local worker + prebuilt indexes + MaterializedView; no spinner |
| Loading flicker | none | **no "Loading…" rows** for any block within a resident view | worker materializes the full ordered id array; `getRows` = O(slice) |
| Scroll | 60 fps | 60 fps, no blank rows | pre-shaped rows (zero cell callbacks) + warm blocks + prefetch |
| Keyboard nav (arrow/page) | < 50 ms | < 50 ms | main thread idle; data already resident |
| Realtime | n/a | totals correct to the row; applied within one conflation frame; no reorder storms | incremental indexes + per-view scoped txns + conflation |
| First paint | full grid | first block within ~1–2 frames | large `cacheBlockSize`, `serverSideInitialRowCount`, low `blockLoadDebounceMillis` |

### Tactics

1. **MaterializedView cache.** After a filter+sort, cache the *full* ordered
   `rowId[]` keyed by `(filterModel, sortModel, groupKeys)`. Any `getRows` block
   is then a synchronous slice — no per-block computation, so scrolling never
   hits a "compute + load" stall. This is the single biggest reason it feels
   like CSRM.
2. **No network, no spinner.** Because the round-trip is a postMessage that
   resolves within a frame, set `blockLoadDebounceMillis` ≈ 0 and **suppress
   loading overlays** for resident views; the result lands before a spinner
   would even be perceptible.
3. **Pre-shaped rows.** Calc-column values, formatted strings and style tokens
   are baked into the block. ColDefs carry **no** `valueGetter` / `valueFormatter`
   / per-cell `cellStyle` — only `field` reads and trivial class lookups.
4. **Efficient serialization.** Reuse the existing **columnar `delta-bin`**
   encoding for blocks; consider transferable `ArrayBuffer`s to avoid
   structured-clone cost on large blocks.
5. **Incremental everything.** Indexes, aggregates and the MaterializedView are
   *patched* on tick, never recomputed.
6. **Conflation.** Batch ticks on a frame-aligned window (≈ 16 ms, configurable)
   → at most one transaction per frame per view.
7. **Stable colDef identity.** Honor the existing warning in `transforms.ts`
   (returning the same colDef reference when inputs are unchanged) to avoid
   AG-Grid's expensive `colDefChanged → filterParamsChanged` pipeline.
8. **Lazy shaping with a cache.** Shape rows on query (bounds memory), cache
   shaped rows keyed by `rowId + shapingVersion`; evict on tick/version bump.

---

## 4. CSRM feature-parity matrix (everything must keep working)

Legend: ✅ native to SSRM · ⚠️ needs explicit work (called out as a work item) ·
🧩 grid-only (row-model-agnostic, just verify).

| Feature | Status under SSRM | Work item |
|---|---|---|
| Single/multi-column sort | ✅ | Worker sort (reuse comparators) |
| Text/number/date filters | ✅ | Worker predicates (reuse `doesRowMatchFilterModel`) |
| **Set filter (distinct values over ALL rows)** | ⚠️ | DistinctValueIndex + async `values` callback (`set-filter-values` RPC) |
| Multi-filter / combined conditions | ⚠️ | Predicate composition in worker |
| Advanced Filter | ⚠️ | Translate advanced filter model → worker predicate tree (later phase) |
| Floating filters | ✅ | Drive the same filterModel |
| **Quick filter / global search** | ⚠️ | No native SSRM quick filter → worker full-text predicate bridge |
| Row grouping (multi-level, lazy) | ✅/⚠️ | Worker group levels per `groupKeys` + child counts |
| **Aggregation over ALL rows (sum/avg/min/max/custom)** | ⚠️ | AggregateIndex + custom-agg expressions in worker |
| Grand total / status-bar aggregations | ⚠️ | Worker aggregates → status bar over all/filtered rows |
| Pivoting | ⚠️ | Pivot mode → secondary columns (dedicated late phase) |
| Tree data | ⚠️ | `isServerSideGroup` / `getServerSideGroupKey` from worker hierarchy |
| Master / detail | ⚠️ | Detail rows get their own (worker-backed) datasource |
| **Calculated columns (incl. dataset-wide aggregate exprs)** | ⚠️ | ShapingPipeline + aggregate dataflow DAG |
| Conditional styling | ✅ | Keep engine's CSS-injection path; bake per-cell tokens for the rest |
| Value formatting | ✅ | Pre-baked display strings |
| Cell editing (write-back) | ⚠️ | Edit → worker cache mutate → persist → re-shape → txn |
| Clipboard copy/paste | ⚠️ | Copy works on rendered cells; paste → edit write-back path |
| **Range selection across unloaded blocks** | ⚠️ | Resolve ranges via worker when spanning unloaded rows |
| **Row selection "select all" across unloaded rows** | ⚠️ | `setServerSideSelectionState` (server-side selection state) |
| **CSV / Excel export of ALL rows** | ⚠️ | SSRM export only has loaded rows → `export-all` worker endpoint |
| Find / search-in-data | ⚠️ | Shares the quick-filter / worker scan path |
| Column pin/resize/reorder/autosize/groups | 🧩 | Verify only |
| Pagination | ✅ | SSRM pagination mode |
| Row pinning (top/bottom) | 🧩 | Verify only |
| Sparklines / cell renderers | 🧩 | Keep cheap; verify |
| Sort/filter row animation | ✅ | Via transactions |
| Undo / redo of edits | ⚠️ | Tied to editing write-back |

Each ⚠️ row becomes a tracked task with an e2e test that asserts parity against
a CSRM reference grid on the same dataset.

---

## 5. The reactive aggregate / dataflow layer (the subtle core)

Calculated columns may depend on **dataset-wide aggregates** (`x / SUM(x)`,
`value − AVG(col)`), aggregates may depend on calc columns (`SUM(someCalcCol)`),
and set filters need distinct values — all over the **full dataset, never the
loaded blocks**. This makes shaping a small **incremental dataflow engine**.

1. **Dependency DAG from the AST.** Walk each expression's AST (the engine
   already parses to one) to extract referenced raw columns and aggregate
   functions + scope. Build `rawColumn → aggregate → dependentExpression`.
   **Topologically order** the passes; **detect and reject cycles**.
2. **Scopes (decided default — overridable per expression):**
   - `all` — entire dataset, invalidated only by ticks.
   - **`filtered` (default for "% of total")** — all rows matching the current
     filter (computed over the full cache, *not* loaded rows); also invalidated
     on **filter change**.
   - `group` — per group; computed during the grouping pass.
3. **Incremental aggregate maintenance.**
   - SUM / COUNT / AVG → O(1) on update (`sum += new − old`).
   - **MIN / MAX → not O(1)** on evict → maintain a heap / ordered multiset, or
     periodic rescan. (Know this before assuming all aggregates are cheap.)
4. **The cascade (key hazard).** A dataset-wide aggregate changing logically
   dirties *every* dependent row. Never push N transactions per tick:
   - The worker knows each view's **loaded ranges** → only re-shape & push txns
     for **loaded** rows; mark the rest dirty so they shape correctly on next
     `getRows`.
   - **Conflate** aggregate deltas over a frame window; recompute once; one txn.
5. **Distinct-value index** = the same pattern for set filters: `Map<val,count>`
   per filterable column, maintained on tick; the `set-filter-values` endpoint
   reads keys with no rescan.

---

## 6. Protocol additions (over the existing `reqId` RPC)

| Kind | Direction | Payload (sketch) | Reply |
|---|---|---|---|
| `query` | client→worker | `{ reqId, subId, request: IServerSideGetRowsRequest }` | `query-result { reqId, rows, lastRow, pivotResultFields?, secondaryColDefs? }` |
| `set-filter-values` | client→worker | `{ reqId, subId, colId, /* respect-other-filters? */ }` | `set-filter-values-result { reqId, values }` |
| `export-all` | client→worker | `{ reqId, subId, request /* filter+sort, no paging */, format }` | streamed/full `export-result { reqId, rows }` |
| `selection-state` | client↔worker | server-side selection set / select-all-in-filter | ack |
| `txn` | worker→client (push) | `{ subId, add?, update?, remove?, route?, refresh? }` | applied via `applyServerSideTransactionAsync` |
| `view-update` | client→worker | `{ subId, filterModel, sortModel, groupKeys, loadedRanges }` | ack — keeps ViewRegistry current for realtime scoping |

Correlation via `reqId` (same mechanism as the config catalog today). Data push
events route by `subId`. `query-result` blocks may use columnar `delta-bin`
encoding + transferables.

---

## 7. Build phases

Each phase is independently shippable, has explicit reuse, risks, and **e2e
parity/perf acceptance**. Update `docs/current-features.md` per phase
(post-implementation checklist).

### Phase 0 — Foundations & worker-safe engine extraction
- New `@starui/engine/worker` subpath: ExpressionEngine/parse/eval, formatters
  (Intl/`ssf`), `doesRowMatchFilterModel`, `defaultNullSafeComparator`,
  `FIELD_FORMAT_CATALOG`. **Zero DOM imports** (theme/token values are passed
  in, not read from `document`).
- SSRM protocol types in `shared-types`; module skeleton in
  `host-data/src/runtime/ssrm/`.
- **Acceptance:** import the worker entry in a DOM-free context; assert (test +
  lint) no `document`/`window`/`React` references leak in.
- **Risk:** hidden DOM coupling in engine → mitigate with a dependency-cruiser
  guard on the subpath.

### Phase 1 — Flat query engine + datasource (sort / filter / paginate)
*No grouping, no realtime, no aggregates yet — but already "feels like CSRM".*
- RowStore over `ProviderSlot.cache`; QueryEngine: filter (text/number/date) →
  multi-col sort → slice. **MaterializedView** cache keyed by `(filter,sort)`.
- ShapingPipeline v1: **row-local** calc columns + formatted strings + style
  tokens baked into the block.
- `query` RPC; `SsrmDataProvider` class; `useSsrmGrid` hook; SSRM colDef adapter
  (strip baked callbacks). Perf knobs (block size, debounce≈0, suppress
  spinner, prefetch).
- **Acceptance (the headline demo):** side-by-side SSRM vs CSRM grid on the
  `mockdata-provider` dataset — identical sort/filter results, **no loading
  rows**, 60 fps scroll, sort/filter ≤ 1 frame. Captured as an e2e + perf trace.

### Phase 2 — Incremental index & aggregate layer
- DistinctValueIndex → `set-filter-values` + async set-filter `values`.
- AggregateIndex (sum/count/avg + min/max heap), scopes `all` / `filtered`.
- Aggregate-dependent calc columns: AST dependency DAG, topo order, scope
  resolution, cascade-on-filter-change.
- Grand total / status-bar aggregations over all rows.
- Quick filter / global search → worker predicate. Export-all endpoint.
- **Acceptance:** set filter shows all distinct values incl. live-added ones;
  `% of total` correct over the filtered full dataset; export produces **all**
  rows; status bar matches a CSRM reference.

### Phase 3 — Realtime reconciliation
- RealtimeReconciler: snapshot→initial load; deltas→incremental store + index +
  aggregate updates; re-shape affected; per-view txn plan (add/update/remove,
  **move** detection vs sort, **membership** vs filter, aggregate cascade →
  loaded rows only); conflation; `txn` push; client applies
  `applyServerSideTransactionAsync`.
- **Acceptance:** live mock at high tick rate — smooth scroll *during* updates,
  totals correct to the row, no reorder storms/flicker, main thread < X ms/frame.

### Phase 4 — Grouping & aggregation
- Lazy group levels per `groupKeys`; child counts; group sort/filter; group agg
  values from AggregateIndex; **group-scope** aggregate calc columns;
  expand/collapse; realtime group membership + agg recompute.
- Server-side selection state / select-all across groups.
- **Acceptance:** multi-level grouping parity with CSRM incl. live regrouping.

### Phase 5 — Pivot
- Pivot mode: `pivotCols` → secondary column defs + pivot values + pivot result
  fields; realtime under pivot.
- **Acceptance:** pivot parity vs CSRM on a representative dataset. (Shippable
  without this; it's isolated.)

### Phase 6 — Full parity hardening
- Master/detail, tree data, range selection across blocks, clipboard, editing
  write-back + undo/redo, find. Each ⚠️ row in §4 closed with an e2e.

### Phase 7 — Scale & robustness
- **Strategy abstraction** so QueryEngine is backed by either the full
  in-memory MaterializedView (Tier 1, ≤ ~200k) or a chunked/streamed source with
  prefetch (Tier 2, 1M+) — a swap, not a rewrite.
- Worker yields/chunks heavy ops (initial sort of huge sets, pivot); optional
  nested-worker pool. Backpressure/coalescing when tick rate exceeds frame
  budget. Lazy-shaping cache eviction / memory bounds. Telemetry (extend the
  hub's existing timing metrics) + perf-budget regression tests.

---

## 8. Scalability model

- **Tier 1 (now: 12k–~200k).** Full cache + full MaterializedView resident →
  every operation is in-memory and sub-frame → CSRM-indistinguishable. This is
  the primary target.
- **Tier 2 (1M+).** Can't cheaply materialize everything; QueryEngine strategy
  switches to chunked compute + block prefetch and *may* show brief loading on
  cold regions. Interfaces (Strategy, IndexManager, MaterializedView) are
  defined in Tier 1 so Tier 2 is additive.
- **Index choices** are all incremental (O(1)/O(log n)) so realtime cost is
  independent of dataset size on the hot path.
- **Many grids, one provider.** Shared RowStore + indexes; per-view state and
  txn fan-out are O(views) and conflated/capped.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Realtime + sort/group correctness (hardest surface) | Phase 3/4 isolation; move/membership detection; heavy property + e2e tests against a CSRM oracle |
| Hidden DOM coupling in extracted engine | Phase 0 dependency-cruiser guard + DOM-free test context |
| "Select all" / range across unloaded rows | Server-side selection state; worker resolves ranges |
| Export only exports loaded rows | Dedicated `export-all` worker endpoint |
| Quick filter absent in SSRM | Explicit worker full-text predicate bridge |
| Large-block serialization cost | Columnar `delta-bin` + transferable buffers |
| Worker single thread blocks on huge ops | Tier 2 chunked/yielding compute; nested-worker pool |
| Pivot complexity | Isolated Phase 5; ship without it initially |
| `new Function` for expressions under strict CSP | Engine's existing `configureExpressionPolicy` gate; precompile |
| colDef identity churn → grid pipeline thrash | Stable-reference rule (already documented in `transforms.ts`) |

---

## 10. Definition of done

1. A user toggling a flag between CSRM and SSRM on the same dataset **cannot
   tell which is which** — sort/filter latency, scroll, keyboard nav, and the
   absence of loading flicker are all within the §3 budgets.
2. Every CSRM feature in §4 has a passing e2e under SSRM.
3. All data processing (filter/sort/group/agg/pivot/calc/format/style) runs in
   the worker; the main thread does only render + transaction apply.
4. Realtime totals and set-filter values are correct over the **full** dataset.
5. `docs/current-features.md` updated; `npx turbo typecheck build test` green;
   e2e + perf-budget specs green.
```
