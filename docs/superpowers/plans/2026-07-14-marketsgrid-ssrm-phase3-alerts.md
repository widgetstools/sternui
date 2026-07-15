# MarketsGrid SSRM Phase 3 — Alerts first (edit/link later)

> **For agentic workers:** Implement task-by-task. Checkboxes track progress.

**Goal:** Under `useSSRM`, configured alerts fire on live tick / transaction deltas (toast/badge), without full-book `forEachNode` scans.

I'm using the writing-plans skill to create this implementation plan.

## IN vs OUT (this plan only)

| # | Item | Status |
|---|------|--------|
| 1 | Bridge SSRM tick/tx row payloads into `RowChangeBus` as delta `RowChange`s | **DONE** |
| 2 | Alerts activate: skip CSRM-only full seed under SSRM; evaluate deltas | **DONE** |
| 3 | Wire `useSsrmCapabilityGate('alerts')` — enable when bridge ready | **DONE** |
| 4 | Lab smoke: Alerts tab + Use SSRM + live ticks → toast/badge | **DONE** (note: `.superpowers/sdd/lab-pass-ssrm-alerts.md`) |
| 5 | Bump `CURRENT_SSRM_PHASE` to 3 | **OUT** (alerts phase-min lowered to 2; smartEdit/externalFilter stay at 3) |
| 6 | Smart-edit / bulk-update / +/- via SSRM transactions | **OUT — next plan** |
| 7 | Context link / `externalFilter` without `doesExternalFilterPass` | **OUT — next plan** |
| 8 | Worker-emitted `dirty` events in ssrmgrid | **OUT — optional later** |
| 9 | Full-book alert correctness for unloaded SSRM rows | **OUT** |

**Rule:** Anything not in rows 1–4 is not this pass.

## Architecture

```text
Lab / MarketsGridContainer ticks
  → applyDataTransactionAsync / applyTickToSsrm
  → SSRMGrid.applyTransactionAsync (Perspective)
  → NEW: publish RowChange { full:false, nodes:[…] } on platform.rows
  → existing alerts activate.runDelta → toast/badge
```

---

### Task 1: SSRM → RowChangeBus bridge

**Files:**
- Create: `packages/react-grid/grid/src/engine/ssrmRowChangeBridge.ts` (+ test)
- Modify: `applyTickToSsrm.ts`, `routeDataTransactionAsync.ts`
- Modify: `RowChangeBus` / platform if publish API is missing

- [x] After successful SSRM apply, publish delta with row objects (update/add/remove)
- [x] Unit test: bridge emits expected shape; CSRM path unchanged
- [x] Commit: `feat(grid): publish SSRM tick deltas on RowChangeBus`

### Task 2: Alerts activate SSRM-safe

**Files:** `customizer/modules/alerts/runtime/activate.ts` (+ tests)

- [x] Under `engineKind === 'ssrm'`: no full-book `forEachNode` seed; rely on deltas + optional first-tx seed
- [x] Commit: `fix(grid): SSRM-safe alerts activation (delta-only)`

### Task 3: Capability gate + lab smoke

**Files:** `AlertsPanel.tsx` (or badge host), `ssrmCapabilities` if needed, lab note

- [x] Gate UI honestly until bridge works; then enable alerts under SSRM without bumping whole phase to 3
- [x] `STARUI_SKIP_ENSURE_BUILD=1` lab: Use SSRM + Alerts tab + scenario → alert fires
- [x] Note: `.superpowers/sdd/lab-pass-ssrm-alerts.md`
- [x] Commit: `feat(grid): enable SSRM alerts on tick deltas`

## Success criteria

1. CSRM alerts unchanged.
2. SSRM + live ticks: dataChange / relativeChange rule fires toast or badge.
3. No full-book `forEachNode` on every SSRM tick.
4. Smart-edit and context-link still deferred (documented OUT).
