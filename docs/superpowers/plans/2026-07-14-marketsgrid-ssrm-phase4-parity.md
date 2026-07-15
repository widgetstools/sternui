# MarketsGrid SSRM Phase 4 — Parity checklist & polish

> **For agentic workers:** Implement task-by-task. Checkboxes track progress.

**Goal:** Document SSRM feature parity vs CSRM and close remaining polish that does **not** require full-book client APIs.

I'm using the writing-plans skill to create this implementation plan.

## IN vs OUT (Phase 4 overall)

| # | Item | Status |
|---|------|--------|
| 1 | Feature matrix (this doc) — green / limited / red | **IN (this commit)** |
| 2 | Lab smoke checklist cross-links (alerts / smart-edit / link / traffic-light) | **IN (this commit)** |
| 3 | Worker-emitted `dirty` events in ssrmgrid | **DONE** — see `2026-07-14-marketsgrid-ssrm-phase4-worker-dirty.md` |
| 4 | Full-book alerts / edits / `mode: 'rowId'` external filter | **OUT** |
| 5 | Group publish via `allLeafChildren` under SSRM | **OUT** |
| 6 | Perspective-backed row-exclusion DSL | **OUT** |
| 7 | Auto-suggest SSRM / `rowModel` alias | **OUT** |
| 8 | Large-N + high tick perf campaign | **OUT — later** |

**Rule:** Prefer disable + tooltip over silent no-ops (design spec).

## Feature matrix (MarketsGrid + `useSSRM`)

| Area | Status | Notes |
|------|--------|--------|
| Presentation / theme / chrome | Green | Surface parity |
| Excel format / Visual Excel | Green | Phase 0–1 |
| Column groups | Green | Phase 1 |
| Named agg / grouping | Green | Phase 1 |
| Live ticks | Green | `applyDataTransactionAsync` + worker `dirty` refresh |
| Export all | Green | Phase 1 |
| Old/new diff (viewport) | Green / limited | Loaded rows only |
| Calc columns | Green | Phase 2 materialize |
| Custom JS agg | Limited | Gate unmappable |
| Traffic-light / RAG agg | Green | Phase 2 + lab seed |
| Alerts (delta) | Green | Phase 3 — ticks/tx only; not unloaded rows |
| Smart-edit / bulk / +/- | Green / limited | Viewport / `getRowNode` rows |
| Context link | Green / limited | `mode: 'fields'` → filterModel; no `rowId` external filter |
| Row-exclusion DSL | Red → documented | Skipped under SSRM; UI message |
| Full-book relative alerts | Red | OUT |
| Group leaf expansion publish | Limited | No `allLeafChildren` under SSRM |

## Lab smoke links

- Traffic light: Calculated tab + Use SSRM
- Alerts: `.superpowers/sdd/lab-pass-ssrm-alerts.md`
- Smart-edit: `.superpowers/sdd/lab-pass-ssrm-smart-edit.md`
- Context link: `.superpowers/sdd/lab-pass-ssrm-context-link.md`
- Worker dirty: `.superpowers/sdd/lab-pass-ssrm-worker-dirty.md`

## Success criteria (Phase 4 doc slice)

1. Matrix lives in-repo and matches shipped gates (`CURRENT_SSRM_PHASE === 3`).
2. OUT items remain explicitly OUT (no silent deferral).
