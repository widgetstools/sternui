# MarketsGrid SSRM Phase 4b — Hybrid full-book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Under SSRM, unlock hybrid whole-book paths for context-link `mode: 'rowId'`, Perspective-backed row-exclusion DSL, and on-demand full-book alert rescans — without forcing full-book work on every tick.

**Architecture:** Day-to-day stays viewport/delta (Phase 3). Explicit / receive-side paths use Perspective: `rowId` receive → set filter on PK; exclusion → compile DSL to a keep expression; alerts → optional `queryAll` rescan via existing uncapped leaf fetch (`getGroupLeafRows({ groupKeys: [] })`).

**Tech Stack:** TypeScript, Vitest, ssrmgrid Perspective worker, `@starui/widgets-react` context link, MarketsGrid toolbar-date-settings + alerts modules.

**Spec:** `docs/superpowers/specs/2026-07-15-marketsgrid-ssrm-phase4-design.md` (slice 4b)

## Global Constraints

- Hybrid only — no per-tick full-book scan.
- CSRM behaviour unchanged when `useSSRM` is false.
- No silent no-ops: remove SSRM gates only when the replacement path works.
- Small focused commits; push when asked (no merge / no PR unless asked).

## File structure

| File | Responsibility |
|------|----------------|
| `ssrmgrid/.../perspectiveExpr.ts` | `ROW_KEEP_EXPR` constant |
| `ssrmgrid/.../ssrmFilters.ts` + query engine | Merge optional `rowKeepExpression` into filter plans |
| `ssrmgrid/.../SSRMGrid.tsx` | Prop `rowKeepExpression`; pass on every query; purge refresh on change |
| `starui/.../gridContextLink.ts` | SSRM `rowId` receive via set filter; async `rowId` publish with group leaves |
| `starui/.../useGridContextLink.ts` / HostedMarketsGrid | Stop forcing `mode: 'fields'`; wire rowIdField + group leaves for rowId |
| `starui/.../ssrmRowExclusion.ts` | Compile exclusion DSL → Perspective keep expression (`not(...)`) |
| `starui/.../rowExclusionFilter.ts` + activate + panel | Unblock UI; SSRM uses keep expression + refreshServerSide |
| `starui/.../alerts` | On-demand full-book rescan via `getGroupLeafRows([])` |
| Tests + matrix docs | Cover receive/exclusion/rescan; mark 4b rows |

---

### Task 1: ssrmgrid — `rowKeepExpression` on queries

**Files:** `perspectiveExpr.ts`, `ssrmFilters.ts` / `ssrmQueryEngine.ts`, `types.ts`, `createPerspectiveDatasource.ts`, `SSRMGrid.tsx`, tests

- [ ] **Step 1: Failing test** — request with `rowKeepExpression: 'not("ccy" == \'INR\')'` adds expression `__ssrm_row_keep` and filter `== true`.
- [ ] **Step 2: Implement** — constant `ROW_KEEP_EXPR`; merge in filter plan builder alongside quick filter; wire prop → datasource extras → getRows/queryAll/aggregates.
- [ ] **Step 3: SSRMGrid** — when `rowKeepExpression` changes, `refreshServerSide({ purge: true })`.
- [ ] **Step 4: Tests PASS** → commit `feat(ssrm): Perspective row-keep expression filter`

---

### Task 2: Context link `mode: 'rowId'` under SSRM

**Files:** `gridContextLink.ts`, `useGridContextLink.ts`, `HostedMarketsGrid.tsx`, tests

- [ ] **Step 1: Failing tests**
  - SSRM + `applyRowIdFilterModel(api, context, rowIdField)` → set filter on PK with `rowIds`.
  - Empty `rowIds` clears the link-owned PK filter.
  - `resolveGridLinkMode` returns configured `'rowId'` even when `rowModelType === 'serverSide'`.
  - `buildRowIdContextAsync` expands groups via `resolveGroupLeaves` and collects PK values as `rowIds`.
- [ ] **Step 2: Implement receive** — replace external-filter path under SSRM with set-filter merge (same ownership pattern as fields mode for the PK column).
- [ ] **Step 3: HostedMarketsGrid** — stop forcing `mode: 'fields'`; keep `resolveGroupLeaves`; pass `rowIdField` for both modes.
- [ ] **Step 4: Publish** — when `mode === 'rowId'` and `resolveGroupLeaves`, use async builder.
- [ ] **Step 5: Tests PASS** → commit `feat(context-link): SSRM rowId via Perspective set filter`

---

### Task 3: Row-exclusion DSL → Perspective keep expression

**Files:** `ssrmRowExclusion.ts` (+ test), `rowExclusionFilter.ts`, `activate.ts`, `ToolbarDateSettingsPanel.tsx`, `SsrmMarketsGridSurface.tsx`, MarketsGrid/Host

- [ ] **Step 1: Helper** — `compileRowExclusionKeepExpression(expr)` using `compileStarUiExpressionToPerspective`; return `not(${compiled})` or `{ ok: false, reason }`.
- [ ] **Step 2: Wire** — MarketsGrid reads toolbar `rowExclusionExpression`, compiles, passes `rowKeepExpression` into SSRM surface.
- [ ] **Step 3: activate** — under SSRM, on expression change call `refreshServerSide({ purge: true })` (not external filter). Keep CSRM external filter path.
- [ ] **Step 4: UI** — remove hard block; show compile-error hint when unsupported.
- [ ] **Step 5: Tests PASS** → commit `feat(grid): SSRM row-exclusion via Perspective keep expression`

---

### Task 4: Full-book alert rescan (on demand)

**Files:** alerts `activate.ts` / panel / platform wiring, `SSRMGridHandle` already has `getGroupLeafRows`

- [ ] **Step 1: Document** — relativeChange / dataChange day-to-day = delta (`publishExternalDelta`); full-book = explicit rescan only.
- [ ] **Step 2: API** — `rescanFullBook(rows)` or platform hook that fetches leaves via `getGroupLeafRows({ groupKeys: [] })`, seeds `prevValues`, evaluates enabled cell rules once (no fire on first observation for relativeChange baselines — same as CSRM seed).
- [ ] **Step 3: UI** — SSRM-only “Rescan full book” control in alerts settings band.
- [ ] **Step 4: Tests** — seed/rescan with mock rows; CSRM unchanged.
- [ ] **Step 5: Commit** `feat(alerts): on-demand SSRM full-book rescan`

---

### Task 5: Docs / matrix

- [ ] Update Phase 4 parity matrix: rowId link, row-exclusion, full-book alerts → Green (hybrid).
- [ ] Mark 4b plan tasks done; leave 4c OUT (phase bump stays for 4c).
- [ ] Commit docs

---

## OUT (slice 4c)

- `rowModel` alias, suggest-SSRM banner, high-tick stress, `CURRENT_SSRM_PHASE = 4`
