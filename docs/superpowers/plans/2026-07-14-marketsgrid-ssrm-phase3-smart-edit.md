# MarketsGrid SSRM Phase 3 — Smart-edit (shared writer)

> **For agentic workers:** Implement task-by-task. Checkboxes track progress.

**Goal:** Under `useSSRM`, Smart Edit (and shared editing-core applies) persist via Perspective transactions + RowChangeBus, same path as live ticks/alerts.

I'm using the writing-plans skill to create this implementation plan.

## IN vs OUT (this plan only)

| # | Item | Status |
|---|------|--------|
| 1 | Host `applyDataTransaction` slot on `GridPlatform` + wire from MarketsGrid controller | **DONE** |
| 2 | `editWriterFromPlatform` → `applyForwardPatches` for smart-edit (+ shared callers) | **DONE** |
| 3 | `useSsrmCapabilityGate('smartEdit')` on panel/toolbar; enable `smartEdit` phase-min 2 | **DONE** |
| 4 | Unit tests: writer routes to host applier; CSRM unchanged | **DONE** |
| 5 | Lab smoke note: Use SSRM + Editing/Smart Edit apply | **DONE** |
| 6 | Bump `CURRENT_SSRM_PHASE` to 3 | **OUT** |
| 7 | Context-link / `externalFilter` | **OUT — next plan** |
| 8 | Edits for unloaded SSRM rows (no `getRowNode`) | **OUT** |
| 9 | Cell-editor / paste write-path audit | **OUT** |

**Rule:** Product claim is smart-edit; implementation uses shared writer so bulk/+/- inherit.

## Architecture

```text
Smart Edit / bulk / +/- / journal
  → editWriterFromPlatform
    → platform.applyDataTransaction({ update })
      → MarketsGridHandle.applyDataTransactionAsync
        → routeDataTransactionAsync (Perspective + publishExternalDelta)
```

---

### Task 1: Platform data-transaction slot

- [ ] `GridPlatform.setDataTransactionApplier` + `applyDataTransaction`
- [ ] Expose on `PlatformHandle` for `activate*` keyboard paths
- [ ] Controller wires applier to `applyDataTransactionAsync`
- [ ] Commit

### Task 2: Edit writer + smart-edit apply

- [ ] `editWriterFromPlatform` helper
- [ ] `applyEdits` / bulk / plus-minus / shortcut / journal use writer
- [ ] Commit

### Task 3: Gate + enable + lab note

- [ ] Lower `smartEdit` PHASE_MIN to 2; gate UI
- [ ] Tests + `.superpowers/sdd/lab-pass-ssrm-smart-edit.md`
- [ ] Commit
