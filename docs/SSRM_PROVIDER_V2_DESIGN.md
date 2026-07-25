# SSRM STOMP data provider V2 — clean-room design

Status: **P0–P5 SHIPPED** (2026-07-25). Consumer-facing usage guide:
[`SSRM_PROVIDER_V2.md`](./SSRM_PROVIDER_V2.md).
Base: **`main` @ `9945ebd6`** (fresh branch; the old pull-path branch
`docs/optional-data-plane-topology` is retained untouched as a *measurement*
reference only). Author: agent, 2026-07-25.

## Mandate (user, 2026-07-25)

Reimplement the SSRM STOMP data provider **from scratch** on a fresh branch
off `main`. **No code is borrowed from the old pull-path branch** — it grafted
pull semantics onto the push (CSRM) hub, which made the Perspective table a
derived copy instead of the source of truth and produced a family of async-seam
bugs. End state: **two STOMP providers** —

- **CSRM** — the existing default `stomp` provider (push plane). Untouched.
- **SSRM** — new `stomp-ssrm` provider (pull plane), **its own config type and
  its own config editor**, feature parity with the old SSRM provider, lean:
  **no duplication of data**.

## Clean-room rules

- **Forbidden inputs:** any implementation file that exists only on the old
  branch (`host-data/src/runtime/perspective/*`, `useSsrmPullEngine`, the pull
  branches of the container/wiring, fi-stress-lab, the old branch's ssrm-grid
  changes). Do not open, copy, or paraphrase them.
- **Allowed inputs:** everything on `main` (it is the baseline product);
  vendor packages and their docs/types/source (`@finos/perspective`,
  `@stomp/stompjs`, AG Grid, `@wellsfargo-starui/ui`/design-system); and the
  measured **facts** below (facts about the problem, not code).

## Facts the design must respect (measured on the old branch, 2026-07-24/25)

1. **CPU:** at a ~3k updates/sec 120-col stress feed, STOMP ingest burned
   ~74% of a core and Perspective writes+view-compute ~58% — *in the old,
   duplicated design*. The clean design sheds the JS cache upsert and the
   push columnar-encode/fan-out (~11%+), so **default to ONE worker** (ingest
   + Perspective server in the same SharedWorker, windows read it directly);
   escalate to an ingest/table two-worker split **only if P1's measurement
   shows one thread saturating** at the real feed rate.
2. **Memory:** the WASM table is the floor (the book must live somewhere) —
   the win available here is eliminating the *second* JS copy, not shrinking
   the table. Row/column budgets are a design input (a 50k×400 book crashes
   tabs; 50k×120 is fine).
3. **Workers can't `new SharedWorker(...)`** — only windows can introduce two
   workers. Single-worker avoids needing any introduction at all.
4. **SharedWorker lifecycle:** the worker (and the book) dies when its last
   client disconnects; a solo tab's full reload re-streams by design; peers
   keep it warm. Communicate via state, never look like a hang.
5. **Wide books:** materializing per-row deltas across hundreds of columns on
   every tick saturates the engine thread — cheap dirty-signal + viewport
   refetch must be the wide-book path (gate row-deltas by width).
6. **Fling scroll needs a window-side viewport cache** — every block read is
   an async worker hop; a small LRU + serve-then-refresh keeps thumb-drag off
   loading stubs (field-proven failure mode).
7. **Interaction baselines to hold:** sort ≤ ~250 ms, group ≤ ~600 ms,
   expand ≤ ~250 ms on a 20k live book (prod build).
8. **The race classes to design out, not patch:** configure-vs-seed ordering,
   "0 rows" ambiguity, owner-loss mid-seed, restart adoption, multi-window
   attach races. One worker-owned state machine + one generation token.

## Architecture

```
STOMP ──► SSRM provider SharedWorker  (starui-ssrm:{appId}:{providerId})
            • @stomp/stompjs dial/subscribe; parse snapshot + ticks
            • hosts the Perspective server + Table — THE ONLY COPY of the book
            • snapshot → table.replace / batched update; ticks → keyed update
            • owns DatasetState: connecting → seeding(n) → live(n, gen)
              | empty | error  — published to every client; nobody infers
              state from side effects
            • one generation token; bumped on (re)start/asOfDate; stamped on
              every response; consumers drop on mismatch
          ▲
          │ windows connect DIRECTLY (their own SharedWorker port; the worker
          │ speaks the Perspective client protocol per vendor source — no
          │ window-brokered introductions, no retries, no self-heal)
          └─ window: read client → AG SSRM datasource → viewport LRU → grid
```

- **No JS book cache.** Schema comes from the config's column definitions
  (+ first-row refinement while `seeding`); a bounded pre-table buffer may
  hold early frames only until the table exists, then is dropped.
- **Grid mounts once**, keyed by `(providerId, generation)`, gated on
  DatasetState — no mid-flight reconfigure races.
- Grid side: a **new, lean window engine + datasource written fresh**
  (AG filterModel → Perspective plan, grouping/aggregates, quick filter,
  live-ticking group headers + grand total). Main's old `CustomSSRMGrid` is
  not the target surface; the new engine is exposed through a clean injection
  seam and the consumer surface is built/wired in P2.

## Config + editor

New `providerType: 'stomp-ssrm'`, `StompSsrmProviderConfig`:
- transport: `websocketUrl`, `listenerTopic`, `requestMessage`,
  `snapshotEndToken`, reconnect, `asOfDate` support
- **`keyColumn` (required, validated)** — table index / row identity
- **column definitions / dotted-leaf projection** — the table schema and the
  grid columns (single declaration, no drift)
- ingest tuning: batch size, conflation window; wide-book row-delta gate
  *(shipped P4b-2 as `wideColumnThreshold` + `sweepThrottleWideMs` —
  window-side, see below)*
- optional calc/expression columns *(shipped P4b-2 as `calcExpressions` —
  window-side per-view expressions, never table schema)*
- tree hierarchy: `treePathFields` *(P4b-2 — synthesizes serverSide tree
  data from categorical fields; window-side)*

**Own editor:** a dedicated SSRM editor component registered alongside the
existing provider editor (design-system primitives only, no native inputs),
exposing exactly the fields above — no push-only knobs.

## Feature-parity checklist

Snapshot + live ticks; restart/`asOfDate`; N-window sharing (one table, zero
per-window copy); sort/filter/quick-filter/calc columns; row grouping with
live group-header aggregates; live grand total; cell-edit write-back
(fetch-or-refuse on unloaded rows); full-filtered-set export + chart; tree
data; master-detail; set-filter distinct values; wide-book delta gating;
fling anti-jank; loading/empty/error UX from DatasetState.

## Phases (each ships green; tests-first for the race classes)

- **P0** — this doc committed on the fresh branch. ✅
- **P1 — the spike that de-risks everything:** worker hosting the Perspective
  server + STOMP ingest straight into the table + DatasetState + generation
  token; a window read client connecting directly (vendor protocol). Driven
  headless against `stomp-view-server` (main has it; add a NEW wide test
  dataset to it if needed — written fresh). **Measure worker CPU at the
  target feed rate → confirm single- vs two-worker.** ✅ *(2026-07-25 —
  `host-data/src/runtime/ssrm/` + `data-services-ssrm-worker.mjs` asset +
  `markets-grid-lab` spike page `/spikes/ssrmWorker.html`. Headless proof:
  connecting→seeding(rising)→live over 20k positions; direct
  `perspective.worker(sharedWorker)` viewport read (100 rows, sorted); live
  ticks land; restart → gen 2 + full reseed. Worker CPU busy (CDP Profiler,
  200µs sampling, ~40-col slim rows): **11% @ 3k rows/s** (the design's
  stress figure), 52% @ 20k rows/s, saturates ~99% only at the mock's 60k
  rows/s sweep cap → **single worker confirmed**; top costs at saturation
  are JSON parse + Perspective write WASM + per-row schema projection.)*
- **P2** — window engine + AG SSRM datasource + viewport LRU; grid consumer
  wired; multi-window + reload behavior verified. ✅ *(2026-07-25 —
  `@starui/ssrm-grid/pull`: `connectSsrmProvider` (control port + direct
  `perspective.worker(sharedWorker)` data client) +
  `createSsrmPullDatasource` (DatasetState-owned rowCount — seeding never
  finalizes, empty is an honest 0; generation-fenced responses; view LRU 8 +
  viewport block LRU 12 with serve-then-refresh; throttled bare `on_update` →
  refetch → keyed `applyServerSideTransactionAsync`, no purges) + lab spike
  `/spikes/ssrmGrid.html` (mount-once per `(providerId, generation)`).
  Headless proof over 20k live positions: progressive seed fill → live 20000
  with no stuck overlay; numeric sort re-orders in ~200 ms; ticks repaint
  28/100 viewport rows over 4 s with 0/37 loading-stub samples; second tab
  attaches straight to `live` gen-1 (no re-dial, both at 20000); solo-tab
  reload repopulates from the live table in <1 s; `restart()` → gen 2, both
  tabs remount + refill. Deferred to P4: group-level rows (plan flags
  `'group-level'`, `group_by` carried), OR-combined/date/notContains filter
  ops, ordering drift under an active sort between user refreshes.)*
- **P3** — `StompSsrmProviderConfig` + the SSRM config editor + catalog/registry
  integration ("New SSRM STOMP provider" in the browser). ✅ *(2026-07-25 —
  `providerType: 'stomp-ssrm'` in shared-types (`stompSsrm.ts`, re-exported via
  `@starui/types`): required single-column `keyColumn`, `columnDefinitions` as
  the one schema/columns declaration, worker-consumed knobs only (`heartbeat`,
  `maxBufferedRows`); `reconnect` reserved-documented, no asOfDate config field
  (CSRM's asOfDate is a restart overlay, not config). Pure structured
  `validateStompSsrmConfig` (blank/malformed URL, empty topic, missing /
  composite / not-in-columns keyColumn) also routed through
  `validateProviderConfig`. `toSsrmDatasetConfig` in host-data
  `runtime/ssrm` (re-exported from `@starui/ssrm-grid/pull`) is the documented
  catalog→worker mapping. Dedicated editor `StompSsrmFields` registered in the
  provider editor's per-transport switches (Connection + Behaviour) with inline
  validation errors; "New Provider" picker lists STOMP SSRM; Diagnostics tab
  (a CSRM-hub surface) hidden for SSRM rows; probes (Test Connection / Infer
  Fields) ride the field-identical STOMP transport helpers. Catalog round-trip
  unit-tested at the `DataProviderConfigStore` seam (componentSubType
  `stomp-ssrm`; subtype filters isolate both planes). Grid spike now seeds a
  catalog row programmatically, reads it back, validates, maps — headless
  proof: live 5000-row seed from the seeded row's own requestHeaders, grid
  columns = the row's columnDefinitions headerNames, sort + restart→gen-2
  remount probes intact; editor smoke (star-demo `/dataproviders`): SSRM
  fields render, blank keyColumn shows its inline error, zero push-plane
  knobs.)*
- **P4** — feature-parity pass (grouping/aggregates/edit/export/chart/tree),
  each with unit tests; race-class tests with injected transport/clock/ports.
  - **P4a — query-feature parity. ✅** *(2026-07-25 — row grouping
    (multi-level; one `group_by` level per view + ancestor filters; group
    rows carry label, sum/min/max/avg/count aggregates, leaf child count,
    refresh-stable path row-ids via `createSsrmRowIdGetter`); live grand
    total (AG 36 native `grandTotalRow` + `grandTotalData`, rollup view =
    `group_by` on a constant expression, tick-patched via
    `rowNode.updateData` — the row lives outside every store); filter
    parity (OR-combined per-column conditions / `notContains` /
    set-with-null via boolean expression columns filtered `== true` —
    Perspective's `filter_op` is view-global so mixed AND/OR is natively
    inexpressible; date filters with date-only terms; engine-verified:
    native `contains`/`begins with`/`ends with` are case-insensitive
    literal matches); set-filter `getDistinctValues` (group-labels read);
    quick filter (`setQuickFilter`, expression across configured string
    columns). Tick refresh now sweeps EVERY cached block (flat / group /
    leaf-under-route) with route-aware keyed transactions; `setRowCount`
    confined to flat root stores (AG error #28 under grouping). Headless
    proof on the 20k live book: group 241 ms (≤600), expand 146 ms
    (≤250), all 5 group aggregates + grand total ticking over 5 s with
    0 loading stubs / no remount, OR + number-range + quick-filter counts
    exactly matching direct-table control reads. ssrm-grid suite 200
    green. Deferred to P4b: edit/export/chart/tree/master-detail,
    day-equals on datetime columns, ordered-block refresh under active
    sort, mid-seed new-group discovery on grouped stores.)*
  - **P4b-1 — edit / export / chart. ✅** *(2026-07-25 — cell-edit
    write-back: `ssrm-update-rows` control message (keyed partial rows
    + the generation they were computed against; worker fences stale
    generations, schema-coerces values — `coerceRowToSchema` — and
    rides the serialized TableWriter path), `connection.updateRows` +
    `createSsrmCellEditHandler` (refuses key-column/unkeyed edits) +
    fetch-or-refuse guard for bulk shapes (`fetchLoadedRowsOrRefuse` /
    `updateLoadedRowsOrRefuse` — any unloaded target row ⇒ one warn +
    no-op, never a subset edit). Full-filtered-set export + chart ride
    `datasource.queryAll` (grouping stripped to leaves, filters/sort/
    quick-filter kept; bounded 10k-row windowed reads over a TRANSIENT
    view; `onChunk` streaming; generation-fenced) — AG's own SSRM
    export/integrated charts walk only loaded blocks, so CSV is direct
    sheet building (`rowsToCsv`, RFC 4180), Excel is AG's
    ExcelExportModule on an off-screen client-side grid, chart is AG
    Charts standalone over the queryAll series (routes documented in
    `exportRows.ts` / the spike). Headless proof (two tabs, 20k live
    book): edit in A visible in B in ~340 ms; string `'777.25'` on the
    float `quantity` column converges to number `777.25` in BOTH tabs;
    under a 2-book set filter CSV rows = off-screen-grid rows = chart
    points = 7995 = direct-table control count (loaded-block ceiling
    1000). ssrm-grid 225 / host-data 460 green. Deferred: tree data,
    master-detail, periodic ordered-block refresh under active sort,
    fetch-unloaded-targets for bulk edits.)*
  - **P4b-2 — tree data / master-detail / calc columns / wide-book
    gate. ✅** *(2026-07-25 —
    **Tree data:** config `treePathFields` (e.g.
    `['bookName','trader']`) synthesizes a serverSide tree from
    categorical fields — the dataset needs no parent/child column. AG
    36's SSRM tree contract (studied in the shipped types): tree
    requests carry NO `rowGroupCols`, only `groupKeys` accumulated from
    `getServerSideGroupKey`, with `isServerSideGroup` deciding
    expandability — so routes shorter than the path list reuse the SAME
    group-level plans as row grouping (ancestor equality filters,
    stable path-encoded row ids) and full-depth routes read leaves;
    group rows now also stamp `GROUP_KEY_FIELD`, wired via
    `isSsrmServerSideGroup`/`getSsrmServerSideGroupKey`; `queryAll`
    strips tree levels to leaves like grouping.
    **Master-detail:** `createSsrmDetailFetcher` answers
    `detailCellRendererParams.getDetailRowData` (successCallback-only
    params — failures warn + deliver empty, never a hung spinner);
    default detail source is a keyed single-row read of the hosted
    table over a transient view (the panel always shows the table's
    CURRENT values), richer sources via the documented
    `detailQuery(masterRow, { table, keyColumn, key })` hook;
    `createSsrmRowMasterGetter` keeps group/keyless rows unexpandable.
    **Calc columns:** config `calcExpressions` (name → Perspective
    expression) — WINDOW-side by design (per-view expressions, never
    worker table schema; `toSsrmDatasetConfig` documents them unmapped)
    — flow into every view the plan builder emits (leaf, group-level,
    rollup, distinct-values, queryAll) so calc columns sort / filter /
    aggregate / export like real columns. Engine-verified (3.8):
    column-omitted views serve expression columns as payload; native
    ops/sorts/group_by/aggregates accept aliases; expressions canNOT
    reference other expression aliases — so OR-combined/`notContains`/
    set-with-null filters on calc columns are dropped + reported; and
    Perspective computes every attached expression per row, so
    explicit-columns plans PRUNE unreferenced calc expressions
    (recovered ~120 ms on the 20k group load).
    **Wide-book delta gate (design fact #5):** `wideColumnThreshold`
    (default 80; configured or observed width) + `sweepThrottleWideMs`
    (default 1000 ms, clamped ≥ the narrow throttle): wide books
    degrade the tick sweep to the longer throttle and refetch only the
    `WIDE_SWEEP_MAX_BLOCKS` (4) MRU cached blocks — block-LRU recency
    IS viewport order, so that slice is what's on screen; off-screen
    blocks catch up on scroll-back cache misses. Pure decision
    (`resolveSweepGate`) + datasource-level MRU-sweep unit-tested (no
    live wide dataset needed).
    Headless proof (20k live book): tree root 5 book nodes, child
    counts exactly = direct-table control reads (Σ 20000), trader level
    6/6 exact, leaves pinned to their two-key route; master-detail
    expand → detail grid = the table's current row (identity + numerics
    exact vs control read), collapse tears it down; calc column sorts
    (ppu == pnl/qty on every sampled viewport row), grouped sums +
    grand total BIT-EXACT vs a client-side Σ pnl/qty control read in a
    tick-quiet window, and appears in queryAll + CSV for all 20000
    rows. Timing re-probe (P4a shape): group 205–267 ms (P4a 241),
    expand 43–113 ms (P4a 146) — budgets hold; with the calc aggregate
    added to the group request: ~375/~173 ms. ssrm-grid 260 green.
    Deferred to P5: editor fields for the P4b-2 knobs (StompSsrmFields
    doesn't expose calcExpressions/treePathFields/gate knobs yet),
    tree-level aggregates exercised live (plans support valueCols on
    tree levels; the spike tree runs label+counts only), periodic
    ordered-block refresh under active sort, fetch-unloaded-targets
    for bulk edits.)*
- **P5** — multi-window + live-feed + reload soak and e2e in CI (the coverage
  gap that hid the V1 bugs); docs; then decide the old branch's disposition.
  ✅ *(2026-07-25 —
  **e2e suite** `e2e/ssrm-pull/` (own config `playwright.ssrm.config.ts`,
  `npm run e2e:ssrm`; boots stomp-view-server :8081 + markets-grid-lab :5300
  via Playwright `webServer`, 1 worker, excluded from the main suite's
  collection): 7 specs against the lab spike — cold seed (connecting →
  seeding with monotonically rising mid-seed rowCounts → live at the full
  count, one mount, no stuck overlay), two-tabs-one-worker (second tab's
  ENTIRE timeline is live gen-1 at the full count — zero re-stream; peer
  undisturbed; both viewports read the same table), peer-reload (reloaded
  tab's fresh timeline never leaves live gen-1 — repopulated from the live
  table, no re-seed), restart-generation (ack carries gen 2; both tabs
  observe gen-2 seeding, remount exactly once each, refill), edit-convergence
  (string `'777.25'` typed into the float `quantity` in tab A lands as
  NUMBER 777.25 in the table and BOTH grids — strict-equality asserted),
  grouped-aggregates (sandwiched exact child counts Σ = book; grand-total +
  group-header pnl each take ≥2 distinct values across 12 samples over 6 s
  with 0 loading stubs and no remount), tree-child-counts (root books =
  distinct set, every level's counts sandwiched-exact vs control reads,
  leaves route-pinned; tree nodes detected by the plane's GROUP_KEY_FIELD
  stamp — AG's `node.group` is a row-grouping flag only). **7/7 green
  headless, twice consecutively (~1.1 min/run).** Live-feed exactness uses
  quiet-window sandwiches (control → probe → control, retried until the
  control reads agree).
  **Memory soak** `scripts/soakSsrm.mjs` (`npm run soak:ssrm`, opt-in, NOT
  CI-blocking): two tabs one worker for N minutes (default 5), post-GC page
  heaps via CDP + whole browser process-tree RSS (the worker's WASM side),
  table + per-metric first-third→last-third median verdict (LEAK = >15% AND
  >20 MB growth; exit 1). 2-min smoke @10k rows, 5 t/s × 500: heap A
  61.6→62.3 MB (+1.2%), heap B 60.8→61.5 MB (+1.1%), RSS 788.8→752.5 MB
  (−4.6%) — **VERDICT: FLAT**.
  **Editor completion** (the P4b-2 deferred item): `StompSsrmFields` now
  exposes Calculated Columns (name→expression rows via the shared
  KeyValueEditor), Tree Data (ordered level rows) and the Wide-Book Refresh
  Gate (threshold + throttle) — design-system primitives only;
  `validateStompSsrmConfig` grew the matching structured rules
  (blank/colliding/reserved-`__ssrm`-prefix/cross-referencing calc names,
  blank/duplicate/undeclared tree levels, non-positive gate numbers) shown
  inline per card; types suite 22, editor suite 12 green.
  **Docs:** usage guide `docs/SSRM_PROVIDER_V2.md` (catalog row → editor →
  grid wiring, DatasetState contract, operational notes, e2e/soak how-to).
  Still deferred (unchanged): tree-level aggregates exercised live, periodic
  ordered-block refresh under active sort, fetch-unloaded-targets for bulk
  edits; the old branch's disposition stays a user decision.)*

## Deliberately dropped from V1

JS hub cache and the `pullSinkFor` tee · counts-mode subscriptions ·
window-brokered `psp-attach` + liveness probe + self-heal watchdog ·
`PullDatasetState` phase/generation sprawl (5 tokens → 1) · the dual
sync/async engine seam.
