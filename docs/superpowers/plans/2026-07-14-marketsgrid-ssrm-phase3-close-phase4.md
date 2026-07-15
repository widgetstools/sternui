# MarketsGrid SSRM — Phase 3 close + Phase 4 kickoff

> **For agentic workers:** Implement task-by-task. Checkboxes track progress.

**Goal:** Formalize Phase 3 (`CURRENT_SSRM_PHASE = 3`) now that alerts, smart-edit, and context-link landed; start Phase 4 parity docs (not full-book OUT items).

I'm using the writing-plans skill to create this implementation plan.

## IN vs OUT (this plan only)

| # | Item | Status |
|---|------|--------|
| 1 | Set `PHASE_MIN` for alerts/smartEdit/externalFilter to **3**; `CURRENT_SSRM_PHASE = 3` | **DONE** |
| 2 | Update capability tests + Phase 3 progress note | **DONE** |
| 3 | Phase 4 plan + SSRM feature matrix checklist (docs) | **DONE** |
| 4 | Worker-emitted `dirty` events in ssrmgrid | **DONE** — `2026-07-14-marketsgrid-ssrm-phase4-worker-dirty.md` |
| 5 | Full-book alerts / edits / rowId external filter | **OUT** |
| 6 | Group publish via `allLeafChildren` under SSRM | **OUT** |
| 7 | Perspective-backed row-exclusion DSL | **OUT** |
| 8 | Auto-suggest SSRM / `rowModel` alias | **OUT** |
| 9 | Large-N perf campaign | **OUT — later Phase 4** |

---

### Task 1: Phase bump

- [ ] `ssrmCapabilities.ts` + tests
- [ ] Commit: `chore(grid): bump CURRENT_SSRM_PHASE to 3`

### Task 2: Phase 4 matrix doc

- [ ] `docs/superpowers/plans/2026-07-14-marketsgrid-ssrm-phase4-parity.md` with matrix
- [ ] `.superpowers/sdd/progress-phase3.md` mark complete
- [ ] Commit
