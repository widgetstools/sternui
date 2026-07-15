# MarketsGrid lab — traffic-light Calculated seed

> **For agentic workers:** Implement task-by-task. Checkboxes track progress.

**Goal:** Calculated tab has a one-click profile that shows the Phase 2 traffic-light recipe (leaf IFS → emoji Excel format → `trafficLight` group agg) under both CSRM and SSRM.

## IN vs OUT

| # | Item | Status |
|---|------|--------|
| 1 | Virtual col `trafficlight` with `IFS([midPrice]…)` + emoji excel format | **IN** |
| 2 | Calculated profile `calc-05-traffic-light` (+ group by `assetClass`, agg `trafficLight`) | **IN** |
| 3 | Bump Calculated `gridId` so existing lab installs pick up the new profile | **IN** |
| 4 | Guide try-step points at the new profile | **IN** |
| 5 | Optional Demo Console scenario that forces green/amber/red mids | **IN if cheap** |
| 6 | Phase 3 alerts/edit | **OUT** |
| 7 | New toolbar / Settings UI | **OUT** |
| 8 | Change ssrmgrid trafficLight engine | **OUT** (already shipped) |

## Architecture

```text
calculatedCatalog calc-05
  ├── calculated-columns.virtualColumns → trafficlight IFS
  └── column-customization.assignments
        ├── trafficlight → excel emoji + rowGrouping.aggFunc: trafficLight
        └── assetClass → rowGroup index 0
```

---

### Task 1: Seed virtual column + catalog profile

**Files:** `seeds/calculatedColumns.ts`, `profiles/catalogs/calculatedCatalog.ts`, `seeds/index.ts` (if needed)

- [ ] Add `TRAFFIC_LIGHT_VIRTUAL` / include in catalog pick
- [ ] Profile `calc-05-traffic-light` with calc + column-customization seed
- [ ] Bump `CALCULATED_GRID_ID` to `lab-calculated-v6`
- [ ] Commit: `feat(lab): seed Calculated traffic-light profile`

### Task 2: Guide + optional scenario

**Files:** `guides/featureGuides.ts`, optionally `demo/scenarios.ts`

- [ ] Try-step: select profile 05, Use SSRM, expand a group
- [ ] Optional scenario patches midPrice bands
- [ ] Commit: `docs(lab): traffic-light try-steps (+ scenario)`

### Task 3: Lab smoke

- [ ] Calculated → profile 05 → CSRM emojis
- [ ] Use SSRM on → leaf + group traffic lights
- [ ] Note in `.superpowers/sdd/lab-pass-trafficlight-ssrm.md`

## Success criteria

1. Profile appears in Calculated profile selector without manual Settings work.
2. Leaf cells show 🟢/🟡/🔴 from midPrice bands.
3. Grouped by assetClass, group cell uses trafficLight fold under SSRM.
