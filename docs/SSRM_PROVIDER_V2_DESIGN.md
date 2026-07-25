# SSRM STOMP data provider V2 — clean-room design

Status: **DESIGN APPROVED DIRECTION — implementation starting.**
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
- optional calc/expression columns

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
  wired; multi-window + reload behavior verified.
- **P3** — `StompSsrmProviderConfig` + the SSRM config editor + catalog/registry
  integration ("New SSRM STOMP provider" in the browser).
- **P4** — feature-parity pass (grouping/aggregates/edit/export/chart/tree),
  each with unit tests; race-class tests with injected transport/clock/ports.
- **P5** — multi-window + live-feed + reload soak and e2e in CI (the coverage
  gap that hid the V1 bugs); docs; then decide the old branch's disposition.

## Deliberately dropped from V1

JS hub cache and the `pullSinkFor` tee · counts-mode subscriptions ·
window-brokered `psp-attach` + liveness probe + self-heal watchdog ·
`PullDatasetState` phase/generation sprawl (5 tokens → 1) · the dual
sync/async engine seam.
