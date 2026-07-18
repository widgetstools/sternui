# MarketsGrid SSRM Phase 4a — Group leaf fetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Under SSRM, when a group row is selected for context-link publish (or similar), fetch **all** leaf rows for that group from Perspective and build the same key criteria as CSRM — no `allLeafChildren`, no row cap.

**Architecture:** Add `SSRMGridHandle.getGroupLeafRows` that pages `queryAll` in leaf mode for the given `groupKeys` until exhausted. StarUI context-link publish becomes async under SSRM and calls that API for each selected group node.

**Tech Stack:** TypeScript, Vitest, ssrmgrid Perspective worker, `@wellsfargo-starui/widgets-react` context link.

**Spec:** `docs/superpowers/specs/2026-07-15-marketsgrid-ssrm-phase4-design.md` (slice 4a)

## Global Constraints

- Fetch **all** matching leaves — no safety cap (product decision).
- CSRM path keeps using `allLeafChildren` — zero behaviour change.
- Respect active `filterModel` / quick filter when fetching group leaves.
- Small focused commits; push when asked.

## File structure

| File | Responsibility |
|------|----------------|
| `ssrmgrid/src/ssrm/getGroupLeafRows.ts` | Pure helper: page queryAll until done |
| `ssrmgrid/src/tests/getGroupLeafRows.test.ts` | Unit tests with mock client |
| `ssrmgrid/src/ssrmgrid/SSRMGrid.tsx` | Expose `getGroupLeafRows` on handle |
| `ssrmgrid/src/index.ts` | Export types if needed |
| `starui/.../gridContextLink.ts` | Async builder helper for SSRM group expansion |
| `starui/.../useGridContextLink.ts` | Wire async publish under SSRM |
| `starui/.../SsrmMarketsGridSurface.tsx` | Forward `getGroupLeafRows` on MarketsGridHandle |
| Tests | Context link + handle forwarding |

---

### Task 1: ssrmgrid — uncapped group leaf fetch helper (TDD)

**Files:**
- Create: `src/ssrm/getGroupLeafRows.ts`
- Create: `src/tests/getGroupLeafRows.test.ts`
- Modify: `src/ssrm/types.ts` (optional: document `limit: 0` / `unlimited` — prefer paging helper instead of changing default queryAll)

- [ ] **Step 1: Write failing tests** for a helper that calls `queryAll` with increasing windows until `rowData.length < pageSize` or cumulative `rowCount` reached:

```ts
export async function fetchAllGroupLeafRows(
  queryAll: (req: QueryAllRequest) => Promise<QueryAllResult>,
  base: Omit<QueryAllRequest, "limit" | "startRow" | "endRow"> & {
    groupKeys: string[];
    rowGroupCols: NonNullable<QueryAllRequest["rowGroupCols"]>;
  },
  pageSize?: number, // internal page size only (e.g. 10_000), NOT a product cap
): Promise<Record<string, unknown>[]>;
```

Assert: three pages of 10k + 500 → 20_500 rows concatenated; `includeStructure` false; `groupKeys` passed through; filterModel preserved.

- [ ] **Step 2: Implement helper** — loop `limit: pageSize` with sortModel stable (e.g. by primary key if available) or use startRow/endRow if queryAll supports offset. **Check:** current `queryAll` uses `startRow: 0, endRow: limit` only — if no offset, page by raising limit until `rowData.length === rowCount` in one shot with `limit: Number.MAX_SAFE_INTEGER` or omit limit when `limit === -1`.

**Preferred if queryAll lacks offset:** add `limit?: number | null` where `null` / `-1` means unbounded (`endRow` = table size). One round-trip for uncapped fetch.

- [ ] **Step 3: Tests PASS**
- [ ] **Step 4: Commit** `feat(ssrm): uncapped Perspective group leaf fetch helper`

---

### Task 2: Expose on SSRMGridHandle + MarketsGrid surface

**Files:**
- Modify: `SSRMGrid.tsx` — `getGroupLeafRows({ groupKeys, filterModel?, quickFilterText? })`
- Modify: starui `SsrmMarketsGridSurface.tsx` — forward on handle
- Modify: MarketsGridHandle type if needed

- [ ] **Step 1: Implement handle method** reading current column group state from grid API (`getRowGroupColumns`) to build `rowGroupCols`, merge active filter model.
- [ ] **Step 2: Unit/smoke test or thin integration test**
- [ ] **Step 3: Commit** `feat(ssrmgrid): expose getGroupLeafRows on SSRMGridHandle`

---

### Task 3: Async context-link publish under SSRM

**Files:**
- Modify: `gridContextLink.ts` — add `buildSelectionContextAsync` (or opts with `resolveGroupLeaves`)
- Modify: `useGridContextLink.ts` — when engine is SSRM and selection has groups, await leaf fetch before broadcast
- Modify: tests in `gridContextLink.test.ts`

- [ ] **Step 1: Failing test** — group node with empty `allLeafChildren` + mock `resolveGroupLeaves` returning two leaves → criteria includes both keys
- [ ] **Step 2: Implement async builder + hook wiring**
- [ ] **Step 3: CSRM regression** — existing sync tests still pass
- [ ] **Step 4: Commit** `feat(context-link): expand SSRM group selection via Perspective leaves`

---

### Task 4: Docs

- [ ] Update Phase 4 parity matrix: group leaf expansion → Green (Perspective)
- [ ] Cross-link 4a plan as DONE-in-progress
- [ ] Commit docs

---

## Spec coverage (4a only)

| Spec | Task |
|------|------|
| Uncapped Perspective group leaf fetch | Task 1–2 |
| Context link uses it under SSRM | Task 3 |
| CSRM unchanged | Task 3 |
| Docs / matrix | Task 4 |

## Out of scope (4b / 4c)

- Full-book alerts, `rowId` receive path, row-exclusion DSL
- `rowModel` alias, suggest SSRM, high-tick, `CURRENT_SSRM_PHASE = 4`
