# MarketsGrid SSRM Phase 4c — Polish + phase bump Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 4 polish: `rowModel` alias, optional suggest-SSRM banner, high-tick Stress Test, and `CURRENT_SSRM_PHASE = 4` with matrix refresh.

**Architecture:** Resolve `useSSRM` from either `useSSRM` or `rowModel: 'server'|'client'` (boolean wins if both set). Suggest banner is opt-in via threshold prop + dismiss; parent confirms via callback. Stress lab turns live ticks on at a high rate. Phase constant is the single capability floor bump.

**Tech Stack:** TypeScript, Vitest, MarketsGrid lab demo.

**Spec:** `docs/superpowers/specs/2026-07-15-marketsgrid-ssrm-phase4-design.md` (slice 4c)

## Global Constraints

- CSRM default unchanged — SSRM still opt-in.
- Suggest SSRM never auto-switches without user confirm.
- `useSSRM` remains supported; `rowModel` is an alias only.
- Push commits; no PR / merge unless asked.

## File structure

| File | Responsibility |
|------|----------------|
| `engine/resolveUseSsrm.ts` (+ test) | Pure: `{ useSSRM?, rowModel? }` → boolean |
| `widget/types.ts`, MarketsGrid / Host / Container | Accept `rowModel`; resolve effective flag |
| `engine/SsrmSuggestBanner.tsx` (+ hook) | Threshold banner + dismiss + confirm callback |
| Stress lab config + help + guide | High-tick live updates |
| `ssrmCapabilities.ts` + tests + parity docs | `CURRENT_SSRM_PHASE = 4` |

---

### Task 1: `rowModel` alias

- [ ] Failing tests for `resolveUseSsrm`: undefined→false; `useSSRM:true`; `rowModel:'server'`; `rowModel:'client'`; both set → `useSSRM` wins.
- [ ] Add `rowModel?: 'client' | 'server'` to `MarketsGridProps` (+ Host / Container / HostedMarketsGrid).
- [ ] Wire resolved flag everywhere `useSSRM` is read from props.
- [ ] Tests PASS → commit

### Task 2: Suggest SSRM banner

- [ ] Props: `suggestSsrmAbove?: number` (default unset/off; lab or docs can pass `10_000`); `onSuggestSsrm?: () => void`.
- [ ] When `rowData.length >= threshold` and engine is CSRM and not dismissed: show compact banner “Large dataset — switch to server row model?” with Switch / Dismiss.
- [ ] Unit test for visibility helper; light component smoke if easy.
- [ ] Commit

### Task 3: High-tick Stress Test

- [ ] `STRESS_TEST_FEATURE.stream.enableUpdates = true`, `updateIntervalMs` ≈ 200–250.
- [ ] Update `stress-test.md` + featureGuides stress copy.
- [ ] Commit

### Task 4: Phase bump + matrix

- [ ] `CURRENT_SSRM_PHASE = 4`; update `ssrmCapabilities.test.ts`.
- [ ] Refresh parity matrix (4c items Green; phase note).
- [ ] Mark 4c plan done; commit + push both repos if ssrmgrid untouched.

---
