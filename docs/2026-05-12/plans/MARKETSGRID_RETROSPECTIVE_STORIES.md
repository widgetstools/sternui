# MarketsGrid — Retrospective stories (delivered work)

Stories covering the React-side work shipped on 2026-05-12 against
`@starui/grid-react` and the two demo apps. Use these to back-fill
Jira with a "Delivered" status so the velocity baseline reflects
real output and the forward backlog in
`MARKETSGRID_ANGULAR_GAP_ANALYSIS.md` reads against a calibrated team.

**Conventions**

- IDs use `STERN-R*` (R for retrospective).
- Story-point scale matches the forward plan (Fibonacci 1, 2, 3, 5, 8, 13).
- Each story lists the commit SHA + file paths so a reviewer can verify scope.
- All retrospective stories should be Jira-imported with `status=Done`
  and `resolution=Done`. Suggested labels: `delivered`, `grid-react`,
  plus the epic tag.

---

## Delivered epics summary

| Epic | Title | Stories | SP | Ref |
|---|---|---:|---:|---|
| **R-A** | Unified settings-panel chrome + diff-aware conditional styling | 6 | 26 | commit `f98dd65`, PR #1 |
| **R-B** | Conditional styling: timed style window + per-rule flash redesign | 9 | 47 | commit `6fd24f1`, PR #2 |
| **R-C** | Standalone-grid demo & MarketsGrid overview doc | 3 | 8 | commits `8ea371e`, `7dd1639` |
| | **Totals delivered 2026-05-12** | **18 stories** | **81 SP** | |

This is the **single-day** output of the 2026-05-12 work session
(2 engineers including pair-with-agent). Use it as the realistic
velocity-ceiling data point when sequencing the forward backlog.

---

## Epic R-A — Unified settings-panel chrome + diff-aware conditional styling

**Ref:** commit `f98dd65` ("feat(grid-react): unify settings panel
chrome and diff-aware styling"). Files: 28 changed, +2356 / −352.

**Goal delivered:** every panel in the grid customizer now uses the
same row primitive + summary-chip primitive, and conditional-styling
expressions can reference the **previous** value via `oldValue` /
`[col].old` so price-up / price-down rules update immediately
without a layout reload.

| Story | Title | SP |
|---|---|---:|
| **STERN-R-A1** | New `SettingsRow` primitive — fixed 160px label gutter, hint slot, optional divider mode. Becomes the canonical layout primitive across every panel | 3 |
| **STERN-R-A2** | New `SummaryChip` primitive — compact monospaced status chip used in cockpit list rows | 2 |
| **STERN-R-A3** | Refactor `GridOptionsPanel` to `SettingsRow` layout — touches every field in the 7-section general-settings schema (+455 LOC net) | 8 |
| **STERN-R-A4** | Refactor `ConditionalStylingPanel`, `ColumnSettingsPanel`, `CalculatedColumnsPanel`, `ColumnGroupsPanel` editor/list panes to the unified `SettingsRow` chrome (+275 LOC across panels) | 5 |
| **STERN-R-A5** | Diff-aware conditional expression context — `cellValueChanged` populates a per-API `WeakMap` of `oldValue`/`newValue` deltas, exposed to the expression engine so rules see both states in the same evaluation pass | 5 |
| **STERN-R-A6** | New `indicatorIcons.ts` registry (119 LOC) — Lucide icon catalog + `findIndicatorIcon()` lookup powering the conditional-styling indicator picker | 3 |

**Acceptance — epic-level (all verified, all green)**
- `npx turbo typecheck build test` clean across the monorepo.
- 195 (pre-existing) grid-react unit tests still pass.
- Cockpit list rendering visually unchanged (snapshot review).
- Conditional rules using `oldValue > newValue` apply on the same
  tick as the value change without needing a refresh.
- New primitives exported via `@starui/grid-react`'s public barrel
  (`SettingsRow`, `SummaryChip`).

---

## Epic R-B — Conditional styling: timed style window + per-rule flash redesign

**Ref:** commit `6fd24f1` ("feat(grid-react): timed style window +
redesigned per-rule conditional flash"). Files: 11 changed, +1386 / −189.

**Goal delivered:** conditional rules gain two distinct temporal
features (auto-revert window + per-rule flash), the flash subsystem
becomes a real applied schema with per-rule isolation, and several
correctness/performance defects shipped in the same patch (header
repaint thrash, focus loss in cell editors / floating filters,
memory bookkeeping under live ticks).

### Feature stories

| Story | Title | SP |
|---|---|---:|
| **STERN-R-B1** | `activeDurationMs` style window — per-rule auto-revert window. Module-scoped activation map keyed by rowId (cell + row variants), coalesced `setTimeout` pointing at the next-to-expire activation (O(1) timer churn under any tick rate), `pruneTimedRuleState` runs every `modelUpdated` pass | 8 |
| **STERN-R-B2** | `FlashConfig` schema upgrade — replace stored-but-never-applied `{ flashDuration, fadeDuration }` with `{ mode, color, durationMs }`. `mode: 'oneShot' \| 'pulse'`; `color` one of an 8-entry theme-aware palette (`amber`, `emerald`, `rose`, `sky`, `violet`, `teal`, `orange`, `slate`); `durationMs` covers one full cycle | 5 |
| **STERN-R-B3** | `FLASH_PALETTE` constant — 8 colours × `{ light, dark, swatch }` triples with tuned alphas so cell text stays legible against the flash overlay in both themes | 2 |
| **STERN-R-B4** | Deserialize migration — legacy `{ flashDuration, fadeDuration }` collapses to `durationMs`; unknown `mode`/`color` strings coerce to safe defaults. Idempotent re-serialize | 3 |
| **STERN-R-B5** | Per-rule CSS isolation — each enabled flash rule emits its own `@keyframes ds-flash-<ruleId>` block and scopes `--ds-flash-color` to its own class. Two flashing rules on the same cell stay independent in colour and timing. Header flash gets a dedicated `.ds-flash-hdr-<ruleId>` class so rule cell styling does NOT leak onto headers | 5 |
| **STERN-R-B6** | `FlashBand` editor rebuilt on `SettingsRow` layout — adds `FLASH` switch+target, `MODE` pill toggle, `COLOR` 8-swatch picker with offset-ring + scale animation on the active swatch, `DURATION` numeric input, `STYLE WINDOW` numeric input (the activeDurationMs control). `role="radiogroup"` + `aria-checked` for accessibility | 5 |

### Correctness / performance stories (same patch)

| Story | Title | SP |
|---|---|---:|
| **STERN-R-B7** | Differential header repaint — `evaluate()` previously stripped + re-added every `ds-flash-hdr-*` / `ds-rule-*` class on every `modelUpdated`, restarting CSS animations every frame. Now diffs against `lastFlashColsByRule` / `lastIndicatorColsByRule` and mutates only the delta. Zero DOM work when matching set is unchanged | 5 |
| **STERN-R-B8** | Bounded grid refresh — `refreshGridVisuals` no longer calls `redrawRows()` or `refreshHeader()` (they rebuilt row/header DOM, stealing focus from cell editors + floating-filter inputs under live ticks). Only `refreshCells({ force: true })` remains, and it fires at most once per `modelUpdated` pass, and only when a timed activation was actually written | 5 |
| **STERN-R-B9** | Cleanup invariants — `refreshTimeouts` `Set` replaced by single `expiryTimer` handle; `previousByRow` + `timedRuleStateByRowId` cleared on module activate + teardown; `pruneTimedRuleState` removes stale row IDs every pass. No leaks under multi-hour live-tick session | 5 |

### Quality bar (covered under the same epic)

| Story | Title | SP |
|---|---|---:|
| **STERN-R-B10** | Test coverage — 4 new vitest cases in `ConditionalStylingPanel.test.tsx` covering: STYLE WINDOW commit through editor, flash mode/color/durationMs commit, legacy `{ flashDuration, fadeDuration }` → `durationMs` migration, unknown-value coercion. Suite up from 10 → 14 conditional-styling tests; grid-react total now 209 passing | 4 |

**Acceptance — epic-level (verified)**
- All 14 conditional-styling tests pass; 209/209 grid-react.
- Manual: rule with `activeDurationMs: 1500` highlights matching cells for ~1.5s then reverts cleanly. Cell editor + floating filter inputs retain focus for the full duration of typing a value while live ticks run at 30/s.
- Manual: two flash rules on the same cell with different colours / modes alternate independently without blending or restart artifacts.
- Manual: header column-menu icons no longer flash on every model update.
- 6-hour live-tick soak: heap stays flat (`Memory` tab snapshot shows `timedRuleStateByRowId` size bounded by row count, not unbounded).

---

## Epic R-C — Standalone-grid demo & MarketsGrid overview doc

**Ref:** commits `8ea371e` (+`marketsui-grid-edit-demo-ag35/index.html` + `grrid-config.json` 1037 lines) and `7dd1639` (`marketsgrid-overview.md` 202 lines + PDF).

**Goal delivered:** zero-build single-page demo proving the grid +
layout JSON can be loaded standalone, and a stakeholder-friendly
overview document for non-engineering audiences.

| Story | Title | SP |
|---|---|---:|
| **STERN-R-C1** | Single-file `marketsui-grid-edit-demo-ag35/index.html` — standalone AG-Grid 35 demo bootstrap, no bundler. Used to validate that a layout snapshot generated from the React app loads cleanly outside the React shell | 3 |
| **STERN-R-C2** | `grrid-config.json` — 1037-line representative layout snapshot covering every module (general-settings, column-customization, calculated-columns, column-groups, conditional-styling with timed window + new flash schema, grid-state, toolbar-visibility, saved-filters). Doubles as a regression-test fixture | 2 |
| **STERN-R-C3** | `marketsgrid-overview.md` + matching PDF — 202-line stakeholder-facing overview of MarketsGrid: what it does, who it serves, how it sits in the FI Trading Terminal context. Suitable for sharing with product, design, and execs | 3 |

**Acceptance — epic-level**
- `marketsui-grid-edit-demo-ag35/index.html` opened directly in browser renders an AG-Grid v35 instance.
- `grrid-config.json` round-trips through `deserialize` + `serialize` without diff (verified by loading then exporting, byte-compared).
- Overview PDF renders cleanly in macOS Preview + Adobe Reader.

---

## Delivery notes (relevant to future planning)

1. **Single-session output of 81 SP** across two PRs is a useful
   ceiling-not-floor velocity data point. Sustainable per-sprint rate
   is likely 25-35 SP for non-pair-with-agent work.
2. **Iterative defect-fix cost** on R-B was ≈ 40% of original story
   scope. The user's first 4 bug reports
   ("predicate:cell no state", "not working", "uneven distribution",
   "persistent feature makes grid unusable") all surfaced after the
   initial implementation. Bake this iteration cost into the forward
   backlog — Angular stories for the same conceptual surface should
   be sized assuming a similar bug-fix tail (or higher, due to less
   internal familiarity with the Angular AG-Grid wrapper).
3. **The 14 conditional-styling tests are the asset** that lets us
   port confidently to Angular: vanilla migration logic + state
   transitions are now spec'd, so the Angular panel only needs UI
   tests, not re-derived logic tests.
4. **Demo apps' live-ticking module is now framework-agnostic**
   (`startLiveTicking` is pure TypeScript). The Angular demo can
   import the exact same `data.ts` once moved to a shared location;
   sized accordingly under forward Epic G.

---

## Jira import — CSV (delivered subset)

Suggested CSV for bulk import, matching the forward backlog header:

```
Issue Type,Summary,Description,Epic Link,Labels,Story Points,Components,Status,Resolution
Epic,"R-A — Unified settings-panel chrome + diff-aware conditional styling",See doc,,delivered grid-react epic,,grid-react,Done,Done
Story,"New SettingsRow primitive",See STERN-R-A1 spec,STERN-R-A,delivered grid-react story,3,grid-react,Done,Done
Story,"New SummaryChip primitive",See STERN-R-A2 spec,STERN-R-A,delivered grid-react story,2,grid-react,Done,Done
... (one row per story above)
```

Set `Fix Version` = `M0 / Pre-Angular` so the delivered work bucket
sits cleanly below the four `Angular GA M1..M4` milestones in the
forward backlog.
