# Perspective SSRM Transparent Integration — Execution Plan

> **Companion to:** [design spec](../specs/2026-07-13-perspective-ssrm-transparent-integration-design.md)  
> **For agentic workers:** implement phase-by-phase; keep CSRM default until Phase 1 exit criteria pass.

**Goal:** STOMP (and other) providers can use FINOS Perspective as the **single** row cache + SSRM query engine for MarketsGrid, shared across blotters on the same `providerId`, without dual hub+Perspective materialization and without a user-facing row-model switch.

---

## Phase 0 — Spike

- [ ] Create `packages/data/perspective-engine` with package.json, tsconfig, worker entry.
- [ ] Port minimal Perspective host + nested worker bootstrap (polyfill as in agssrm).
- [ ] Implement `replace` / `update` / leaf `getRows` (filter+sort optional stub OK).
- [ ] Demo app or lab flag: one grid SSRM against engine fed by mock/STOMP.
- [ ] Two grids → one `providerId` → verify single table instance (refCount).

## Phase 1 — Dual wiring

- [ ] Add `rowStore: 'memory' | 'perspective'` (or `ssrm` config) to shared-types.
- [ ] Hub: perspective providers do not retain full row Map after feeding engine.
- [ ] `useProviderDataWiring` SSRM branch (no setRowData).
- [ ] `MarketsGridSurface` accepts serverSide + datasource props.
- [ ] Attach/detach refCount + table lifecycle.
- [ ] Default remains `memory` (CSRM).

## Phase 2 — Query parity

- [ ] Port `ssrmFilters` + `ssrmQueryEngine` (group, pivot, dates, set, advanced).
- [ ] `getFilterValues`, `getAggregates`, `__ssrm_aggs` stamps + grid context.
- [ ] Quick filter worker path.
- [ ] Dirty → `refreshAllLoadedServerSideStores` (flat leaf tx optional).
- [ ] Parity checklist vs CSRM STOMP demo.

## Phase 3 — Transparent policy

- [ ] `ssrm.enabled: 'auto'` + threshold.
- [ ] Document in STOMP guide; link from gap analysis.
- [ ] Advertise capabilities to modules.

## Phase 4 — Modules

- [ ] Export via `queryAll`.
- [ ] Calc cols → Perspective expressions (subset) or gate.
- [ ] Edit / alerts / linking hardening + capability gates.

## Phase 5 — Cross-window (later)

- [ ] Design only until single-window path is production-ready.

---

## Reference paths

| Item | Location |
|------|----------|
| Design | `docs/superpowers/specs/2026-07-13-perspective-ssrm-transparent-integration-design.md` |
| Prototype | `/Users/develop/wfh/agssrm/.worktrees/perspective-aggrid-ssrm` |
| IDataProvider | `packages/data/host-data/src/provider/IDataProvider.ts` |
| Wiring | `packages/react-core/widgets-react/.../useProviderDataWiring.ts` |
| Surface | `packages/react-grid/grid/src/widget/MarketsGridSurface.tsx` |
