# MarketsGrid SSRM Phase 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable calc columns (compile/materialize/gate), share-of-total / dataset aggs, and traffic-light leaf + group roll-up on MarketsGrid SSRM; bump `CURRENT_SSRM_PHASE` to 2.

**Architecture:** ssrmgrid owns named `trafficLight`/`rag` aggregation (min/max → 1|2|3). starui owns StarUI→Perspective expression compile, materialize fallback, RAG IFS layout compile + client fallback, share-of-total wiring, and capability ungating.

**Tech Stack:** React 19, AG Grid 36 (SSRM path), `@starui/grid`, `ssrmgrid`, Vitest, FINOS Perspective (via ssrmgrid), `@starui/engine` expression package.

**Spec:** `docs/superpowers/specs/2026-07-14-marketsgrid-ssrm-phase2-design.md`

## Global Constraints

- Keep CSRM (`useSSRM={false}`) behaviour identical — zero regression.
- AG Grid 36+ APIs only on SSRM path.
- Unmappable custom JS agg / unsupported calc ops: **disable + tooltip**, never blank group cells for the known traffic-light recipe.
- Expression floor: arithmetic, column refs, comparisons, `AND`/`OR`/`NOT`, `IF`/`IFS` — not full DSL parity.
- 5-level RAG variations are out of scope for named agg v1.
- Work in starui worktree: `/Users/develop/wfh/starui/.worktrees/marketsgrid-ssrm-dual-engine`
- ssrmgrid repo: `/Users/develop/wfh/ssrmgrid` (coordinate commits there for Task 1)
- Commits: small, focused; do not push unless asked.
- After Task 1, if worktree `node_modules/ssrmgrid` is stale, `ln -sfn /Users/develop/wfh/ssrmgrid node_modules/ssrmgrid`.

## File structure

| File | Responsibility |
|------|----------------|
| `ssrmgrid/src/ssrm/trafficLightAgg.ts` | `isTrafficLightAgg`, `foldTrafficLight(min,max)` |
| `ssrmgrid` worker host + query engine | Wire named agg into group/leaf aggregate paths |
| `packages/react-grid/grid/src/engine/ssrmExpressionCompile.ts` | StarUI DSL → Perspective expression or unsupported |
| `packages/react-grid/grid/src/engine/ssrmCalcColumns.ts` | Apply compile/materialize plan onto SSRM ColDefs / row enrich |
| `packages/react-grid/grid/src/engine/ssrmTrafficLightAgg.ts` | Detect documented IFS RAG custom-agg → `trafficLight`; client fallback |
| `packages/react-grid/grid/src/engine/ssrmShareOfTotal.ts` | Re-export / wire share helpers for formatters |
| `packages/react-grid/grid/src/engine/ssrmCapabilities.ts` | Bump `CURRENT_SSRM_PHASE` to 2 (final task) |

---

### Task 1: ssrmgrid named `trafficLight` / `rag` agg

**Files:**
- Create: `/Users/develop/wfh/ssrmgrid/src/ssrm/trafficLightAgg.ts`
- Create: `/Users/develop/wfh/ssrmgrid/src/tests/trafficLightAgg.test.ts`
- Modify: `/Users/develop/wfh/ssrmgrid/src/workers/perspectiveHost.ts` (`aggregateFilteredRows` + group shaping)
- Modify: `/Users/develop/wfh/ssrmgrid/src/workers/ssrmQueryEngine.ts` (`buildValueAggregates` so trafficLight is not sent as a raw Perspective agg name)
- Modify: `/Users/develop/wfh/ssrmgrid/src/index.ts` — export `foldTrafficLight`, `isTrafficLightAgg`

**Interfaces:**
- Produces:
  - `isTrafficLightAgg(aggFunc: string | undefined | null): boolean` — true for `trafficLight` and `rag`
  - `foldTrafficLight(min: unknown, max: unknown): number | null` — all 1s → 1; all 3s → 3; else → 2 when both finite; null if either missing/non-finite
- Consumes: existing `mapAggFunc`, `aggregateFilteredRows`, `shapeGroupRows`

- [ ] **Step 1: Write failing unit tests**

```ts
import { describe, expect, it } from "vitest";
import { foldTrafficLight, isTrafficLightAgg } from "../ssrm/trafficLightAgg";

describe("trafficLightAgg", () => {
  it("recognizes trafficLight and rag", () => {
    expect(isTrafficLightAgg("trafficLight")).toBe(true);
    expect(isTrafficLightAgg("rag")).toBe(true);
    expect(isTrafficLightAgg("min")).toBe(false);
  });

  it("folds min/max to RAG 1|2|3", () => {
    expect(foldTrafficLight(1, 1)).toBe(1);
    expect(foldTrafficLight(3, 3)).toBe(3);
    expect(foldTrafficLight(1, 3)).toBe(2);
    expect(foldTrafficLight(2, 2)).toBe(2);
    expect(foldTrafficLight(null, 1)).toBe(null);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

```bash
cd /Users/develop/wfh/ssrmgrid && npm test -- src/tests/trafficLightAgg.test.ts
```

- [ ] **Step 3: Implement `trafficLightAgg.ts`**

```ts
export function isTrafficLightAgg(aggFunc: string | undefined | null): boolean {
  return aggFunc === "trafficLight" || aggFunc === "rag";
}

export function foldTrafficLight(min: unknown, max: unknown): number | null {
  const lo = typeof min === "number" ? min : Number(min);
  const hi = typeof max === "number" ? max : Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (lo === 1 && hi === 1) return 1;
  if (lo === 3 && hi === 3) return 3;
  return 2;
}
```

- [ ] **Step 4: Wire into `aggregateFilteredRows`**

In the switch that handles `weightedAvg` / `min` / `max`, add:

```ts
case "trafficLight":
case "rag": {
  value =
    nums.length === 0
      ? null
      : foldTrafficLight(Math.min(...nums), Math.max(...nums));
  break;
}
```

Import `foldTrafficLight` / `isTrafficLightAgg` at top of `perspectiveHost.ts`.

- [ ] **Step 5: Wire group / Perspective aggregate path**

`mapAggFunc("trafficLight")` must not send `"trafficLight"` to Perspective. Prefer:

1. Treat trafficLight like `weightedAvg` for paths that already fall back to `aggregateFilteredRows`; **and/or**
2. For native Perspective `group_by` views: expand each trafficLight value col into min+max aliases (reuse `aggregateAlias`), then after `to_json` / in `shapeGroupRows` set `shaped[field] = foldTrafficLight(minVal, maxVal)`.

Pick the smallest change that makes a grouped `getRows` return a single numeric cell for a `trafficLight` value col. Add a focused test; if a full Perspective integration test is too heavy, unit-test the fold + alias expansion helpers.

- [ ] **Step 6: Export from package root and run tests**

```bash
cd /Users/develop/wfh/ssrmgrid && npm test -- src/tests/trafficLightAgg.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit in ssrmgrid**

```bash
git add src/ssrm/trafficLightAgg.ts src/tests/trafficLightAgg.test.ts src/workers/perspectiveHost.ts src/workers/ssrmQueryEngine.ts src/index.ts
git commit -m "feat(ssrm): named trafficLight/rag aggregate from min/max"
```

---

### Task 2: StarUI RAG IFS detector → `trafficLight` + client fallback

**Files:**
- Create: `packages/react-grid/grid/src/engine/ssrmTrafficLightAgg.ts`
- Create: `packages/react-grid/grid/src/engine/ssrmTrafficLightAgg.test.ts`
- Modify: column-customization transform / SSRM ColDef prep so effective agg becomes `trafficLight` when pattern matches
- Optionally modify: `RowGroupingEditor.tsx` to list `trafficLight` when capability allows (full ungating in Task 6)

**Interfaces:**
- Produces:
  - `normalizeAggExpression(expr: string): string`
  - `isTrafficLightRagCustomAgg(expr: string | undefined): boolean`
  - `resolveSsrmAggFunc(cfg: { aggFunc?: string; customAggExpression?: string }): string | undefined` — returns `'trafficLight'` when IFS matches or aggFunc already `trafficLight`/`rag`
  - `foldTrafficLightFromAggs(field: string, aggregates: Record<string, Record<string, unknown>> | undefined): number | null`

Canonical pattern after normalize (strip whitespace):

```text
IFS(MIN([value])=1ANDMAX([value])=1,1,MIN([value])=3ANDMAX([value])=3,3,2)
```

Allow the multiline help recipe with spaces around `=` and `,`.

- [ ] **Step 1: Failing tests for detector + resolve**

```ts
import { describe, expect, it } from 'vitest';
import {
  isTrafficLightRagCustomAgg,
  resolveSsrmAggFunc,
} from './ssrmTrafficLightAgg.js';

const RECIPE = `IFS(
  MIN([value]) = 1 AND MAX([value]) = 1, 1,
  MIN([value]) = 3 AND MAX([value]) = 3, 3,
  2
)`;

describe('ssrmTrafficLightAgg', () => {
  it('detects documented RAG IFS recipe', () => {
    expect(isTrafficLightRagCustomAgg(RECIPE)).toBe(true);
    expect(isTrafficLightRagCustomAgg('sum([value])')).toBe(false);
  });

  it('resolves custom recipe to trafficLight', () => {
    expect(
      resolveSsrmAggFunc({ aggFunc: 'custom', customAggExpression: RECIPE }),
    ).toBe('trafficLight');
    expect(resolveSsrmAggFunc({ aggFunc: 'sum' })).toBe('sum');
  });
});
```

- [ ] **Step 2: Implement detector + resolve; run tests PASS**

- [ ] **Step 3: Apply in ColDef transform / SSRM surface prep**

Where row-grouping config sets `aggFunc: 'custom'` + expression, if `resolveSsrmAggFunc` returns `trafficLight`, set ColDef `aggFunc: 'trafficLight'` (no client JS child-walking aggFunc).

- [ ] **Step 4: Client fallback helper** (unit-tested) reading `__ssrm_aggs[field].min/max` when named agg value is missing on a group row.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(grid): map traffic-light IFS custom agg to SSRM trafficLight"
```

---

### Task 3: StarUI expression compile (Phase 2 subset → Perspective)

**Files:**
- Create: `packages/react-grid/grid/src/engine/ssrmExpressionCompile.ts`
- Create: `packages/react-grid/grid/src/engine/ssrmExpressionCompile.test.ts`

**Interfaces:**
- Produces:

```ts
export type SsrmExpressionCompileResult =
  | {
      ok: true;
      perspectiveExpression: string;
      perspectiveType?: 'float' | 'integer' | 'string' | 'boolean';
    }
  | { ok: false; reason: string };

export function compileStarUiExpressionToPerspective(
  expression: string,
): SsrmExpressionCompileResult;
```

**Mapping rules (Phase 2):**
- `[field]` → `"field"`
- Reject `[field.old]` / `[field.new]` for Perspective (`ok: false`, viewport-only)
- `+ - * /` and parentheses pass through
- `=` → `==` for Perspective equality
- `AND` / `OR` / `NOT` → `and` / `or` / `not`
- `IF(c, a, b)` → `if(c, a, b)`
- `IFS(...)` → nested `if(...)` (odd arg count = trailing default)
- Unknown function / token → `{ ok: false, reason }`

Prefer reusing `@starui/engine` tokenizer/parser AST — do not invent a second language.

- [ ] **Step 1: Failing tests**

```ts
it('compiles arithmetic column refs', () => {
  const r = compileStarUiExpressionToPerspective('[price] * [quantity] / 1000');
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.perspectiveExpression).toBe('"price" * "quantity" / 1000');
});

it('compiles traffic-light leaf IFS', () => {
  const r = compileStarUiExpressionToPerspective(
    'IFS([price] >= 105, 1, [price] >= 95, 2, 3)',
  );
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.perspectiveExpression).toContain('if(');
    expect(r.perspectiveExpression).toContain('"price"');
  }
});

it('rejects .old/.new for Perspective', () => {
  const r = compileStarUiExpressionToPerspective('[price.old] < [price.new]');
  expect(r.ok).toBe(false);
});
```

- [ ] **Step 2: Implement minimal compile; tests PASS**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(grid): compile StarUI expressions to Perspective for SSRM calcs"
```

---

### Task 4: Apply calc columns on SSRM surface (compile + materialize fallback)

**Files:**
- Create: `packages/react-grid/grid/src/engine/ssrmCalcColumns.ts`
- Create: `packages/react-grid/grid/src/engine/ssrmCalcColumns.test.ts`
- Modify: `SsrmMarketsGridSurface.tsx` and/or calculated-columns transform when SSRM
- Modify: `applyTickToSsrm.ts` (and snapshot prep if present) to materialize fallback fields

**Interfaces:**
- Consumes: `compileStarUiExpressionToPerspective`, virtual column `{ colId, expression }`
- Produces:

```ts
export type SsrmCalcPlan =
  | {
      kind: 'perspective';
      colId: string;
      perspectiveExpression: string;
      perspectiveType?: 'float' | 'integer' | 'string' | 'boolean';
    }
  | { kind: 'materialize'; colId: string; expression: string }
  | { kind: 'unsupported'; colId: string; reason: string };

export function planSsrmCalcColumn(col: {
  colId: string;
  expression: string;
}): SsrmCalcPlan;

export function applyPerspectivePlansToColDefs(
  defs: SSRMColDef[],
  plans: SsrmCalcPlan[],
): SSRMColDef[];

export function materializeCalcFields(
  rows: Record<string, unknown>[],
  plans: Extract<SsrmCalcPlan, { kind: 'materialize' }>[],
  evalRow: (expression: string, row: Record<string, unknown>) => unknown,
): Record<string, unknown>[];
```

**Policy:** try compile → else materialize (Phase 2 token subset via `@starui/engine` per row) → else unsupported.

- [ ] **Step 1: Unit tests for plan + materialize enrich**

- [ ] **Step 2: Implement + wire into SSRM surface / tick path**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(grid): apply SSRM calc columns via Perspective or materialize"
```

---

### Task 5: Share-of-total / dataset agg wiring on SSRM

**Files:**
- Create: `packages/react-grid/grid/src/engine/ssrmShareOfTotal.ts`
- Create: `packages/react-grid/grid/src/engine/ssrmShareOfTotal.test.ts`
- Modify: formatter / calc paths that need `SUM([x])` / share-of-total under SSRM to use helpers — not full-book `forEachNode`

**Interfaces:**
- Consumes: `shareOfTotal`, `resolveAggregate` from `ssrmgrid` via `ssrmgrid-entry`
- Produces: `getSsrmShareOfTotal(params: { value: unknown; field: string; data?: Record<string, unknown>; context?: { aggregates?: Record<string, Record<string, unknown>> }; aggFunc?: string }): number | null`

- [ ] **Step 1: Unit test** — mock `__ssrm_aggs: { pnl: { sum: 1000 } }`, value `100` → `0.1`

- [ ] **Step 2: Wire helper; CSRM path unchanged**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(grid): wire SSRM share-of-total via __ssrm_aggs helpers"
```

---

### Task 6: Ungate Phase 2 capabilities + `CURRENT_SSRM_PHASE = 2` + regression

**Files:**
- Modify: `packages/react-grid/grid/src/engine/ssrmCapabilities.ts` → `CURRENT_SSRM_PHASE = 2`
- Modify: `ssrmCapabilities.test.ts`
- Modify: `RowGroupingEditor.tsx` — `trafficLight` option when capability enabled; unmappable custom still gated
- Modify: calculated-columns gate — allow add/save when `planSsrmCalcColumn` is not `unsupported`; otherwise tooltip with reason
- Run: `npm test -w @starui/grid`

- [ ] **Step 1: Update capability tests**

```ts
expect(CURRENT_SSRM_PHASE).toBe(2);
expect(isSsrmCapabilityEnabled('calcColumns')).toBe(true);
expect(isSsrmCapabilityEnabled('trafficLightAgg')).toBe(true);
expect(isSsrmCapabilityEnabled('alerts')).toBe(false);
```

- [ ] **Step 2: Set phase = 2; refine unsupported / unmappable gates**

- [ ] **Step 3: Regression**

```bash
cd /Users/develop/wfh/starui/.worktrees/marketsgrid-ssrm-dual-engine
npm test -w @starui/grid
```

Document bootstrap-blocked suites without chasing unrelated monorepo failures.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(grid): enable SSRM phase 2 (calcs, share-of-total, traffic light)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Named `trafficLight`/`rag` in ssrmgrid | 1 |
| RAG IFS → named agg + client fallback | 2 |
| Compile arithmetic / IF / IFS subset | 3 |
| Materialize fallback + unsupported gate | 4, 6 |
| Share-of-total / `__ssrm_aggs` | 5 |
| `CURRENT_SSRM_PHASE = 2` | 6 |
| CSRM zero regression | 6 |

## Progress ledger

Create/update: `.superpowers/sdd/progress-phase2.md` at execution start.
