# MarketsGrid SSRM Phase 2 — Expressions, calcs & traffic light

**Date:** 2026-07-14  
**Status:** Approved for planning (pending user review of this file)  
**Parent:** [2026-07-14-marketsgrid-ssrm-dual-engine-design.md](./2026-07-14-marketsgrid-ssrm-dual-engine-design.md)  
**Repos:** starui (`@wellsfargo-starui/grid`) + ssrmgrid  
**Prerequisite:** Phase 0–1 landed (`CURRENT_SSRM_PHASE = 1`, dual-engine scaffold)

## Goal

Enable **expressions & calcs** on the MarketsGrid SSRM path so that, with `useSSRM={true}`:

1. **Calculated columns** work for a documented arithmetic / comparison / `IF`·`IFS` subset (transpile or materialize; gate the rest).
2. **Dataset aggregates** (`SUM` / `AVG` and share-of-total style formatters) resolve via Perspective / `__ssrm_aggs` / existing `shareOfTotal` helpers.
3. **Traffic light / RAG** leaf classify + **group roll-up** works under grouping via a named server agg, without blank group cells.

Ship by bumping `CURRENT_SSRM_PHASE` to **2**, unlocking `calcColumns`, `customJsAgg` (mapped + gated), and `trafficLightAgg`.

## Non-goals

- Full StarUI expression DSL parity with CSRM in one release.
- Alerts, smart-edit, context-link / `doesExternalFilterPass` (Phase 3).
- Auto-switching row model by row count.
- Changing CSRM behaviour (`useSSRM={false}` must stay unchanged).
- Storing `.old` columns in Perspective (Phase 1 viewport previous-values store remains the source of truth for `.old`/`.new`).

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Scope | Full Phase 2: calcs + share-of-total + traffic-light agg in one plan |
| Unsupported calcs | **Hybrid:** compile when possible → materialize documented fallback → disable + tooltip for the rest |
| Traffic-light group roll-up | **Named server agg** `trafficLight` (alias `rag`) in ssrmgrid; StarUI compiles the known IFS custom-agg pattern onto it; thin **client fallback** for saved layouts that still store the IFS string |
| Expression floor | Arithmetic + column refs + comparisons + `IF` / `IFS` (enough for blotter calcs and traffic-light leaf classify) |
| Architecture | **ssrmgrid-first:** server owns RAG agg; starui owns DSL compile / materialize / gates / layout migration |

## Architecture

```text
MarketsGrid (useSSRM)
├── ColDef / module transforms
│   ├── calcColumns → SsrmExpressionPlan
│   │     ├── compile → perspectiveExpression (+ perspectiveType)
│   │     ├── materialize → ingest/tick field write
│   │     └── unsupported → gate save (tooltip)
│   ├── custom agg expression
│   │     ├── detect traffic-light IFS pattern → aggFunc: 'trafficLight'
│   │     ├── other mappable patterns (future) → named agg
│   │     └── unmappable → disable + explanation (no blank groups)
│   └── share-of-total formatters → shareOfTotal / __ssrm_aggs
└── SSRMGrid (ssrmgrid)
      ├── Perspective expressions for compiled calcs
      ├── named aggs: sum/avg/min/max/… + trafficLight|rag
      └── group cells stamped with rolled-up 1|2|3
```

### Package split

| Concern | Owner | Notes |
|---------|-------|-------|
| `mapAggFunc` + `trafficLight`/`rag` post-agg from min/max | **ssrmgrid** | Worker must return a single group value |
| Expression transpile (StarUI DSL → Perspective expr string) | **starui** | Keep ssrmgrid framework-agnostic |
| Materialize-on-ingest for fallback calcs | **starui** (adapter) calling SSRM transactions / snapshot enrich | May use worker-side calculated columns if already available |
| Detect IFS RAG custom-agg → named `trafficLight` | **starui** | Pattern match on documented recipe |
| Client fallback mapper for legacy layouts | **starui** | Only when layout still has IFS string and named agg not yet applied |
| Capability matrix + panel gates | **starui** | Reuse `useSsrmCapabilityGate` |

## 1. Expression compile / materialize

### Supported Phase 2 subset (must work)

- Column refs: `[field]`, `[field.old]` / `[field.new]` only where Phase 1 previous-values already applies (viewport / client eval — not Perspective).
- Arithmetic: `+`, `-`, `*`, `/`
- Comparisons: `>`, `>=`, `<`, `<=`, `=`, `!=` / `<>`
- Boolean: `AND`, `OR`, `NOT` (as used by StarUI expressions today)
- Conditionals: `IF(...)`, `IFS(...)` with numeric/string literals and column refs
- Parentheses

**Canonical leaf traffic-light classify** (from help):

```text
IFS([price] >= 105, 1, [price] >= 95, 2, 3)
```

Must compile to a Perspective expression (or materialize) on a real column such as `trafficlight`.

### Pipeline

For each virtual / calculated column when `engineKind === 'ssrm'`:

1. **Try compile** → `perspectiveExpression` (+ type). Prefer this for leaf classify and pure arithmetic.
2. Else **try materialize** → on snapshot/tick, compute value into the row payload under `colId` before / as part of SSRM upsert (documented ops only).
3. Else **unsupported** → calculated-columns Add/Save remain gated with tooltip explaining the missing op; do not mount a blank `valueGetter` that lies about server coverage.

CSRM path continues to use existing `valueGetter` / expression eval — unchanged.

### Dataset aggregates in calcs / formatters

Where expressions or formatters need book-level `SUM([x])` / `AVG([x])` / share-of-total:

- Prefer values already stamped on SSRM rows / context: `__ssrm_aggs`, legacy `__ssrm_sums`, grid context aggregates.
- Use ssrmgrid helpers (`shareOfTotal`, `resolveAggregate`, etc.) from `@wellsfargo-starui/grid` SSRM surface — do not reimplement aggregate math on the client over unloaded rows.

## 2. Traffic light / RAG group roll-up

### Semantics (unchanged from CSRM help)

Given leaf/group child values in `{1,2,3}`:

```text
all 1s → 1 (green)
all 3s → 3 (red)
else   → 2 (amber)
```

Equivalent to:

```text
IFS(
  MIN([value]) = 1 AND MAX([value]) = 1, 1,
  MIN([value]) = 3 AND MAX([value]) = 3, 3,
  2
)
```

This is hierarchical: each group level aggregates child **agg results**, not only leaves. For the 1/2/3 scale, **min + max of the classified column** at that group yields the same result.

### ssrmgrid: named agg

- Accept `aggFunc: 'trafficLight'` and alias `'rag'`.
- Implementation: request Perspective `min` and `max` for the field (via existing multi-agg / alias machinery), then map:

```text
(min, max) → min === max === 1 ? 1
           : min === max === 3 ? 3
           : 2
```

(Handle missing/null per existing numeric agg conventions; document edge cases in ssrmgrid tests.)

- Group / pivot cells receive a **single** numeric value so Excel format `[=1]"🟢";…` still paints.

### starui: layout compile + fallback

1. **Preferred:** When column grouping config has Custom expression matching the documented IFS(MIN/MAX) RAG pattern (normalize whitespace), rewrite effective SSRM `aggFunc` to `'trafficLight'` (do not require the user to pick a new UI value for the standard recipe).
2. **UI:** Expose `trafficLight` / RAG as a first-class agg option when `useSSRM` (and optionally on CSRM as alias to the same custom expression for parity later — optional, not required for Phase 2).
3. **Fallback:** If a saved layout still has the IFS string and compile did not run, apply a thin group-row client mapper that reads dual min/max or `__ssrm_aggs` — **never** leave group cells blank for the known pattern.
4. **Unmappable** custom JS agg expressions: keep disabled / show explanation via capability gate; do not silently no-op.

Animate rules (`[trafficlight] = 1` + SPIN) remain client CSS on loaded cells — same as CSRM / Phase 1.

## 3. Capability matrix

At end of Phase 2:

| Capability | Min phase | Phase 2 behaviour |
|------------|-----------|-------------------|
| `calcColumns` | 2 | Enabled for supported subset; unsupported ops still explain |
| `customJsAgg` | 2 | Enabled for mappable patterns; unmappable gated |
| `trafficLightAgg` | 2 | Enabled |
| Phase 3 ids | 3 | Still disabled |

`CURRENT_SSRM_PHASE = 2` after regression green.

## 4. Testing

- **ssrmgrid unit:** `trafficLight` / `rag` agg mapping from min/max; hierarchical group fixture (all green / all red / mixed).
- **starui unit:** expression compile for arithmetic + IFS leaf classify; detect RAG IFS custom-agg → `trafficLight`; unsupported expression → gate message; share-of-total helper wiring with mock `__ssrm_aggs`.
- **Regression:** `useSSRM={false}` — existing MarketsGrid / widgets tests unchanged.
- **Manual (lab):** toggle Use SSRM; add traffic-light calc + Excel format + group; confirm leaf and group emojis; add a simple arithmetic calc column.

## 5. Risks

| Risk | Mitigation |
|------|------------|
| StarUI DSL ≠ Perspective syntax | Explicit compile layer; materialize fallback; gate rest |
| Partial IFS match false-positive → wrong agg | Strict pattern detector tied to documented recipe; tests |
| Materialize on high tick rate | Only for fallback subset; prefer compile |
| Cross-repo drift | Semver / workspace link; ssrmgrid tests first, then starui consume |
| 5-level RAG (help “variations”) | Out of scope for named agg v1 — document as unsupported / future |

## Success criteria

1. `useSSRM={false}` — zero CSRM regression.  
2. `useSSRM={true}` — documented traffic-light recipe shows correct leaf **and** group emoji cells.  
3. Supported calc columns appear as real SSRM fields (Perspective expr or materialized).  
4. Share-of-total / `SUM`·`AVG` style formatters resolve from `__ssrm_aggs` without scanning the full book.  
5. Unmappable custom agg / unsupported calc → clear UI message, not blank cells.  
6. `CURRENT_SSRM_PHASE === 2`.

## Implementation order (for the plan)

1. ssrmgrid: `trafficLight`/`rag` named agg + tests.  
2. starui: RAG IFS detector → `aggFunc: 'trafficLight'` + client fallback + ungating `trafficLightAgg`.  
3. starui: expression compile (Phase 2 subset) → `perspectiveExpression`.  
4. starui: materialize fallback path for subset that won’t compile.  
5. starui: share-of-total / dataset agg wiring on SSRM formatters/calcs.  
6. Ungate `calcColumns` / `customJsAgg` with remaining guards; bump phase to 2; regression.

