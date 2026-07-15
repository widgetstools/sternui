# MarketsGrid SSRM Phase 3 — Context link / externalFilter

> **For agentic workers:** Implement task-by-task. Checkboxes track progress.

**Goal:** Under `useSSRM`, grid context linking works via **filterModel** (`mode: 'fields'`), never via `doesExternalFilterPass`. Row-exclusion DSL stays client-only and is suppressed under SSRM.

I'm using the writing-plans skill to create this implementation plan.

## IN vs OUT (this plan only)

| # | Item | Status |
|---|------|--------|
| 1 | Force `mode: 'fields'` under SSRM in `useGridContextLink` / HostedMarketsGrid | **DONE** |
| 2 | `applyRowIdExternalFilter` no-op under SSRM (defense in depth) | **DONE** |
| 3 | Skip row-exclusion `buildExternalFilterOptions` under SSRM + UI note | **DONE** |
| 4 | Enable `externalFilter` phase-min 2 (fields-mode linking); tests + lab note | **DONE** |
| 5 | Bump `CURRENT_SSRM_PHASE` to 3 | **OUT** |
| 6 | Faithful `mode: 'rowId'` / `doesExternalFilterPass` on full book | **OUT** |
| 7 | Group publish via `allLeafChildren` under SSRM | **OUT** |
| 8 | Perspective-backed row-exclusion DSL | **OUT** |

## Architecture

```text
SSRM receive:
  peer context → applyGridLinkContext → setFilterModel (set filter)
  NOT applyRowIdExternalFilter / doesExternalFilterPass

SSRM publish:
  leaf selection → buildSelectionContext (key fields)
  group rows: no allLeafChildren → contribute nothing (documented)
```

---

### Task 1: Context link SSRM-safe mode

- [ ] Detect SSRM → effective mode `'fields'`
- [ ] HostedMarketsGrid forces `mode: 'fields'` when `useSSRM`
- [ ] Unit tests

### Task 2: Suppress client-only external filters

- [ ] `applyRowIdExternalFilter` no-op when `rowModelType === 'serverSide'`
- [ ] `buildExternalFilterOptions` returns `{}` under SSRM
- [ ] Toolbar date settings UI: show SSRM unavailable for row exclusion

### Task 3: Capability + lab note + commit

- [ ] `externalFilter` PHASE_MIN = 2
- [ ] `.superpowers/sdd/lab-pass-ssrm-context-link.md`
- [ ] Commit
