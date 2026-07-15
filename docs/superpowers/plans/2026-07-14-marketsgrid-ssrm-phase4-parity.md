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
| 4 | Full-book alerts / edits / `mode: 'rowId'` external filter | **DONE (4b hybrid)** — rowId via PK set filter; alerts on-demand rescan |
| 5 | Group publish via `allLeafChildren` under SSRM | **DONE (4a)** — Perspective uncapped leaf fetch |
| 6 | Perspective-backed row-exclusion DSL | **DONE (4b)** — compile → `rowKeepExpression` |
| 7 | Auto-suggest SSRM / `rowModel` alias | **DONE (4c)** — `rowModel` + opt-in `suggestSsrmAbove` banner |
| 8 | Large-N + high tick perf campaign | **DONE (4c)** — Stress Test high-tick (~200 ms) live updates |

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
| Alerts (delta) | Green | Phase 3 — ticks/tx; full-book baseline via on-demand Rescan (4b) |
| Smart-edit / bulk / +/- | Green / limited | Viewport / `getRowNode` rows |
| Context link | Green | `fields` + `rowId` (PK set filter under SSRM); group leaves via Perspective |
| Row-exclusion DSL | Green | Phase 4b — Perspective keep expression (`not(exclude)`) |
| Full-book relative alerts | Green / hybrid | Day-to-day delta; **Rescan full book** seeds baselines (4b) |
| Group leaf expansion publish | Green | Phase 4a — Perspective `getGroupLeafRows` (uncapped) |
| `rowModel` alias | Green | Phase 4c — `'server'` ≡ `useSSRM` |
| Suggest SSRM banner | Green | Phase 4c — opt-in `suggestSsrmAbove` + user confirm |
| High-tick stress lab | Green | Phase 4c — Stress Test live ~200 ms ticks |

## Lab smoke links

- Traffic light: Calculated tab + Use SSRM
- Alerts: `.superpowers/sdd/lab-pass-ssrm-alerts.md`
- Smart-edit: `.superpowers/sdd/lab-pass-ssrm-smart-edit.md`
- Context link: `.superpowers/sdd/lab-pass-ssrm-context-link.md`
- Worker dirty: `.superpowers/sdd/lab-pass-ssrm-worker-dirty.md`

## Success criteria (Phase 4 doc slice)

1. Matrix lives in-repo and matches shipped gates (`CURRENT_SSRM_PHASE === 4`).
2. Former OUT items absorbed in 4a–4c are Green (hybrid where noted).
