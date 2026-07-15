# MarketsGrid SSRM surface parity + Loading fix

> **For agentic workers:** Implement task-by-task. Checkboxes track progress.

**Goal:** With `useSSRM`, MarketsGrid paints rows (no stuck Loading) and uses the **same presentation chrome** as CSRM via the StarUI design-system AG Grid theme and shared surface props.

**Agreed scope (user choice B):** Grid chrome parity + Loading fix. Not traffic-light lab seed, not Phase 3, not full toolbar proof matrix.

## IN vs OUT (this plan only — no silent deferrals)

| # | Item | Status |
|---|------|--------|
| 1 | Fix SSRM perpetual Loading (fake `ssrmBridgeReady` + lab `setGridOption('rowData')`) | **IN — code landed** |
| 2 | Pass StarUI `theme` + density `rowHeight`/`headerHeight` into SSRM surface | **IN — code landed** |
| 3 | Pass `sideBar`, `statusBar`, `defaultColDef`, stream-safe `components`, overlays | **IN — code landed** |
| 4 | `onGridReady` wired so `onReady` gets a real `gridApi` | **IN — code landed** |
| 5 | ssrmgrid: host presentation props (`theme`, heights, chrome) | **IN — done in SSRMGrid** |
| 6 | Lab smoke note of residual gaps | **IN — see lab-pass note** |
| 7 | Traffic-light lab preset / demo toggle | **OUT — next plan if asked** |
| 8 | Phase 3 (alerts / edit / link) | **OUT — separate phase** |
| 9 | Prove every toolbar action on SSRM | **OUT — follow-up matrix** |
| 10 | Monorepo-wide `build:packages` AG Grid 36 clean | **OUT — unrelated** |

**Rule:** Anything not in rows 1–6 is **not** being done in this pass. If you want 7–10, say which and we open a new plan.

## Architecture

```text
MarketsGridHost / MarketsGrid
  ├── chrome (unchanged): PrimaryToolbar, FormattingToolbar, Settings…
  ├── CSRM → MarketsGridSurface (theme, density, sideBar, …)
  └── SSRM → SsrmMarketsGridSurface
        ├── SAME presentation props as MarketsGridSurface (subset)
        └── SSRMGrid (engine: worker + SSRM datasource)
              theme from host; no StarUI dependency inside ssrmgrid
```

**Rule:** Presentation chrome is owned by `@starui/grid`. `ssrmgrid` stays engine + optional demo theme.

---

### Task 1: Diagnose and fix SSRM Loading

**Files:** `SsrmMarketsGridSurface.tsx`, `SSRMGrid.tsx` / `createPerspectiveDatasource.ts`, `MarketsGridHost.tsx` (rowData / configure timing)

- [ ] Reproduce: lab + Use SSRM → identify why getRows never resolves (worker, configure, getRowId, empty rowData, calc transform)
- [ ] Minimal fix so leaf rows paint
- [ ] Commit: `fix(grid): unblock SSRM Loading in MarketsGrid lab`

### Task 2: SsrmMarketsGridSurface presentation contract

**Files:** `SsrmMarketsGridSurface.tsx`, `MarketsGridHost.tsx`, `MarketsGrid.tsx`

Mirror CSRM surface props (pass-through to `SSRMGrid` / AgGridReact inside):

- `theme` (required from host — `shell.theme` / host `theme`)
- `rowHeight`, `headerHeight` (from density)
- `sideBar`, `statusBar`, `defaultColDef`
- stream-safe `components` (reuse `buildStreamSafeComponents`)
- overlays: `suppressNoRowsOverlay`, `overlayNoRowsTemplate` aligned with CSRM
- `loadThemeGoogleFonts={false}` when host theme supplied

- [ ] Extend surface props + wire host
- [ ] Unit test: surface forwards theme + sideBar
- [ ] Commit: `feat(grid): SSRM surface shares CSRM presentation chrome`

### Task 3: ssrmgrid accept presentation passthrough cleanly

**Files:** `/Users/develop/wfh/ssrmgrid/src/ssrmgrid/SSRMGrid.tsx`

- [ ] Document: `theme` / grid chrome props are host-owned; default theme is **demo fallback only**
- [ ] Accept passthroughs needed by Task 2 (`defaultColDef` merge, sideBar/statusBar if not already, rowHeight/headerHeight)
- [ ] Commit in ssrmgrid: `feat(ssrmgrid): host-driven presentation props for StarUI chrome`

### Task 4: Lab smoke check

- [ ] `STARUI_SKIP_ENSURE_BUILD=1 npm run dev:markets-grid-lab`
- [ ] Use SSRM on → rows visible; chrome matches CSRM light/dark tokens
- [ ] Note residual gaps in `.superpowers/sdd/lab-pass-ssrm-chrome.md`

---

## Success criteria

1. Lab SSRM: rows paint (not stuck Loading).
2. Lab SSRM: grid chrome uses StarUI theme (not Inter/hardcoded dark Quartz alone).
3. CSRM path unchanged.
