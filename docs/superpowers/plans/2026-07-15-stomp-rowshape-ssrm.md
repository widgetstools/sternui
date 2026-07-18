# STOMP `rowShape: 'ssrm'` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `rowShape: 'csrm' | 'ssrm'` to the STOMP data provider so SSRM consumers get Perspective-ready flat rows streamed during snapshot (and flattened live ticks), while CSRM default behaviour stays unchanged.

**Architecture:** Extend `StompProviderConfig` with `rowShape`. When `'ssrm'`, the worker applies a flatten projector (dotted `columnDefinitions` paths → literal top-level keys via `getValueByPath`) on every inbound batch, emits `{ rows, replace }` progressively during the snapshot phase (no full-book buffer flush), and keeps `{ rowsReceived }` + end-token `ready`. Provider editor Behaviour tab exposes the mode. No new provider type.

**Tech Stack:** TypeScript, Vitest, `@wellsfargo-starui/host-data` STOMP transport, `@wellsfargo-starui/shared-types`, `@wellsfargo-starui/widgets-react` BehaviourFields, existing `getValueByPath` / `fieldProjection` patterns.

**Spec:** `docs/superpowers/specs/2026-07-15-stomp-rowshape-ssrm-design.md`

**Worktree:** `/Users/develop/wfh/starui/.worktrees/marketsgrid-ssrm-dual-engine` (branch `feat/marketsgrid-ssrm-dual-engine`)

## Global Constraints

- Default / omitted `rowShape` === CSRM today: buffer snapshot, `{ rowsReceived }` only until end-token, nested rows, then chunked replace flush + `ready`.
- Flatten + stream only when `rowShape === 'ssrm'`.
- Flatten in the **provider** for snapshot **and** live ticks — not in Perspective/ssrmgrid.
- Output keys are the literal `field` strings (e.g. `rating.moody`).
- Skip non-scalar object/array leaves (Perspective scalars only).
- Changing `rowShape` requires provider Restart (same as `projectFields`).
- Do not change probe `passthroughSnapshot` semantics.
- Small focused commits; do not push unless asked.
- Unrelated uncommitted lab stress / ssrmgrid WIP stays out of these commits.

## File structure

| File | Responsibility |
|------|----------------|
| `packages/shared/shared-types/src/dataProvider.ts` | Add `rowShape?: 'csrm' \| 'ssrm'` on `StompProviderConfig` (+ JSDoc) |
| `packages/data/host-data/src/runtime/providers/ssrmRowFlatten.ts` | `createSsrmRowFlattener` — paths → flat scalar row |
| `packages/data/host-data/src/runtime/providers/ssrmRowFlatten.test.ts` | Unit tests for flattener |
| `packages/data/host-data/src/runtime/providers/transports/stomp.ts` | Wire flattener + streaming snapshot path |
| `packages/data/host-data/src/runtime/providers/transports/stomp.test.ts` | CSRM regression + SSRM stream/flatten/live tests |
| `packages/react-core/widgets-react/.../BehaviourFields.tsx` | Row shape select in STOMP Behaviour |

Compose with `projectFields`: when both on, apply project then flatten (or flatten alone is enough if flattener only copies listed paths — prefer **single flattener when `rowShape === 'ssrm'`** that both lifts dotted paths and drops unlisted fields, so SSRM always ships lean flat rows even without `projectFields`).

---

### Task 1: Types + flatten helper (TDD)

**Files:**
- Modify: `packages/shared/shared-types/src/dataProvider.ts`
- Create: `packages/data/host-data/src/runtime/providers/ssrmRowFlatten.ts`
- Create: `packages/data/host-data/src/runtime/providers/ssrmRowFlatten.test.ts`

- [ ] **Step 1: Add `rowShape` to `StompProviderConfig`**

After `projectFields` (or nearby behaviour knobs), add:

```ts
/**
 * Row / snapshot delivery shape for hub consumers.
 * - `'csrm'` | omitted — buffer snapshot; nested rows; `{ rowsReceived }` until end-token.
 * - `'ssrm'` — flatten dotted column paths to scalar keys; stream snapshot
 *   row batches as they arrive; flatten live ticks the same way.
 * Changing this requires a provider Restart.
 */
rowShape?: 'csrm' | 'ssrm';
```

- [ ] **Step 2: Write failing flatten tests**

```ts
import { describe, it, expect } from 'vitest';
import { createSsrmRowFlattener } from './ssrmRowFlatten';
import type { ColumnDefinition } from '@wellsfargo-starui/types';

const col = (field: string): ColumnDefinition => ({ field, headerName: field });

describe('createSsrmRowFlattener', () => {
  it('returns null when there are no paths', () => {
    expect(createSsrmRowFlattener(undefined, undefined)).toBeNull();
  });

  it('lifts dotted paths to literal flat keys', () => {
    const flatten = createSsrmRowFlattener(
      [col('cusip'), col('rating.moody'), col('rating.sp')],
      'positionId',
    )!;
    expect(
      flatten({
        positionId: 'p1',
        cusip: '912828',
        rating: { moody: 'Aa', sp: 'AA', junk: true },
        extra: { deep: 1 },
      }),
    ).toEqual({
      positionId: 'p1',
      cusip: '912828',
      'rating.moody': 'Aa',
      'rating.sp': 'AA',
    });
  });

  it('skips object/array leaves', () => {
    const flatten = createSsrmRowFlattener([col('spark'), col('name')], 'id')!;
    expect(
      flatten({ id: '1', name: 'x', spark: [1, 2, 3] }),
    ).toEqual({ id: '1', name: 'x' });
  });

  it('honours literal flat key before dot-walk', () => {
    const flatten = createSsrmRowFlattener([col('a.b')], 'id')!;
    expect(flatten({ id: '1', 'a.b': 9, a: { b: 1 } })).toEqual({
      id: '1',
      'a.b': 9,
    });
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
cd packages/data/host-data && npm test -- src/runtime/providers/ssrmRowFlatten.test.ts
```

- [ ] **Step 4: Implement `createSsrmRowFlattener`**

Reuse path collection similar to `collectProjectionPaths` (union columns + keyColumn; **do not** drop longer paths under a shorter prefix — SSRM wants each leaf path as its own key). Resolve with `getValueByPath` from `@wellsfargo-starui/shared-types` (or `@wellsfargo-starui/types` re-export). Keep only string/number/boolean/`Date`/null values (skip plain objects and arrays).

```ts
export type SsrmRowFlattener = (row: unknown) => Record<string, unknown>;

export function createSsrmRowFlattener(
  columnDefinitions: readonly ColumnDefinition[] | undefined,
  keyColumn: string | readonly string[] | undefined,
): SsrmRowFlattener | null;
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd packages/data/host-data && npm test -- src/runtime/providers/ssrmRowFlatten.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/shared-types/src/dataProvider.ts \
  packages/data/host-data/src/runtime/providers/ssrmRowFlatten.ts \
  packages/data/host-data/src/runtime/providers/ssrmRowFlatten.test.ts
git commit -m "$(cat <<'EOF'
feat(host-data): add SSRM row flattener and StompProviderConfig.rowShape

EOF
)"
```

---

### Task 2: STOMP transport — stream + flatten when `rowShape === 'ssrm'`

**Files:**
- Modify: `packages/data/host-data/src/runtime/providers/transports/stomp.ts`
- Modify: `packages/data/host-data/src/runtime/providers/transports/stomp.test.ts`

**Behaviour when `cfg.rowShape === 'ssrm'` and not `passthroughSnapshot`:**

1. Build `ssrmFlatten = createSsrmRowFlattener(columnDefinitions, keyColumn)`.
2. Pipeline each parsed batch: optional existing `projectFields` projector **or** rely on flattener alone (prefer flattener alone for SSRM to avoid nested intermediate). Spec: `parse → flatten-for-ssrm → emit`.
3. Snapshot phase: do **not** push to `snapshotBuffer` for later flush. Instead:
   - First non-empty batch this generation: `emit({ rows, replace: true })`
   - Later batches: `emit({ rows })`
   - Always `emit({ rowsReceived: cumulativeCount })`
4. End-token: skip buffer flush (buffer empty); `emit({ status: 'ready' })` as today.
5. Live phase: flatten then existing `liveDispatch` / `emit({ rows })`.
6. `beginSnapshotPhase` / restart: reset “first batch” flag; clear any SSRM cumulative count.

**CSRM path:** untouched (still buffer + `rowsReceived` + end flush).

- [ ] **Step 1: Write failing STOMP tests** (extend `stomp.test.ts`)

Cover at least:

- `rowShape: 'ssrm'` emits flattened rows before end-token; first batch has `replace: true`; later batches have no replace (or `replace: false`); `ready` only after token.
- CSRM default still buffers (no row payloads until end-token) — regression.
- Live tick after ready is flattened when `rowShape: 'ssrm'`.

Use existing `startStomp` test harness / mock client patterns in the file.

- [ ] **Step 2: Run targeted tests — expect FAIL**

```bash
cd packages/data/host-data && npm test -- src/runtime/providers/transports/stomp.test.ts
```

- [ ] **Step 3: Implement streaming + flatten wiring in `stomp.ts`**

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd packages/data/host-data && npm test -- src/runtime/providers/ssrmRowFlatten.test.ts src/runtime/providers/transports/stomp.test.ts src/runtime/providers/fieldProjection.test.ts
```

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(host-data): stream and flatten STOMP rows when rowShape is ssrm

EOF
)"
```

---

### Task 3: Provider editor Behaviour control

**Files:**
- Modify: `packages/react-core/widgets-react/src/container/provider-editor/transports/BehaviourFields.tsx`

- [ ] **Step 1: Add Row shape select under “Row fields” (or Snapshot)**

Select values: `csrm` (default) | `ssrm`. Persist `rowShape: 'ssrm'` or `undefined`/`'csrm'` for default. Helper text from the spec (flatten + stream vs nested + buffered; Restart required).

- [ ] **Step 2: Manual / typecheck**

```bash
cd packages/react-core/widgets-react && npm run typecheck
```

(or monorepo equivalent used in this worktree)

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(provider-editor): add STOMP rowShape CSRM/SSRM control

EOF
)"
```

---

### Task 4: Spec status + dual-engine cross-link in worktree

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-stomp-rowshape-ssrm-design.md` (status → Implementing / Done)
- Modify: `docs/superpowers/specs/2026-07-14-marketsgrid-ssrm-dual-engine-design.md` (deferred section link if missing)
- Modify: `docs/superpowers/plans/2026-07-14-marketsgrid-ssrm-dual-engine.md` (follow-on row)

- [ ] **Step 1: Update docs to mark implementation in progress / complete**
- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: mark STOMP rowShape SSRM plan and cross-links

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `rowShape?: 'csrm' \| 'ssrm'` on STOMP config | Task 1 |
| Flatten dotted paths to literal keys | Task 1 |
| Skip non-scalars | Task 1 |
| Stream snapshot batches; first `replace: true` | Task 2 |
| Keep `rowsReceived` + end-token `ready` | Task 2 |
| Flatten live ticks | Task 2 |
| CSRM default unchanged | Task 2 |
| Behaviour editor control | Task 3 |
| Docs / deferral cross-links | Task 4 |

## Out of scope (this plan)

- Auto-restart provider when MarketsGrid `useSSRM` toggles
- REST/mock `rowShape`
- Committing unrelated lab stress-test / ssrmgrid ingest WIP
