# Critical review — `packages/react-grid/`

**Date:** 2026-05-23
**Scope:** `packages/react-grid/grid/src/` — ~250 files, ~40k LOC
**Method:** Three independent parallel audits (perf/lifecycle, architecture/complexity, types/anti-patterns); findings converged on the same problem cluster
**Verdict:** Fundamentally well-structured codebase. No circular deps, no god objects, light `any` density (~0.18%), clean error handling. Pain is concentrated in 6-8 files that grew past the maintainability cliff.

---

## Scorecard

| Dimension | Grade | Notes |
|---|---|---|
| Architecture (boundaries, coupling) | **A−** | Clean widget→customizer one-way deps. No cycles. |
| Type safety | **B+** | Light `any` use, but `Record<string, unknown>` overused for filter models |
| React idioms | **A−** | Proper memoization in hot paths; one wrong dep array on rAF |
| Lifecycle / cleanup | **B** | Two real leak risks; broader pattern of effects depending on changing callbacks |
| File size discipline | **D** | 11 files exceed the 500-LOC convention; 1 breaks the 800-LOC hard ceiling |
| Hot-path performance | **C+** | Repeated `JSON.stringify` on filter / option diffs; selector-less external store |
| Dead code / drift | **A−** | Very little dead code; deprecation paths documented |

---

## Critical (fix-first)

| # | Where | Issue | Fix |
|---|---|---|---|
| 1 | [`useGridHost.ts:108-117`](../packages/react-grid/grid/src/widget/useGridHost.ts#L108-L117) | `requestAnimationFrame` scheduled in subscription effect with no cleanup → can fire after unmount and call `setState` on dead component | Store `rafId` in ref, `cancelAnimationFrame` in effect cleanup |
| 2 | [`useProfileManager.ts:111-115`](../packages/react-grid/grid/src/customizer/hooks/useProfileManager.ts#L111-L115) | `useSyncExternalStore` returns full `ProfileManagerState`; every store mutation re-renders every grid host that consumes the hook | Add per-field selector overloads (`useProfileManager.useActiveId()`, `.useProfiles()`, `.useIsDirty()`) backed by separate `useSyncExternalStore` calls |
| 3 | [`useGridHost.ts:145`](../packages/react-grid/grid/src/widget/useGridHost.ts#L145) + [`useFilterModel.ts:319`](../packages/react-grid/grid/src/widget/useFilterModel.ts#L319) | `JSON.stringify` in a `useEffect` that fires per tick / per filter change — O(model size) on every render | Shallow compare first (`Object.is` on each known key); fall through to JSON only on the rare drift case |
| 4 | [`DraggableFloat.tsx:154-158`](../packages/react-grid/grid/src/widget/DraggableFloat.tsx#L154-L158) | Cleanup removes `onPointerMove`/`onPointerUp` but those handlers change on every pos update → handlers stack on `window` during every drag | Wrap handlers in `useCallback` reading from a `dragStateRef`; effect deps `[]` |
| 5 | [`FiltersToolbar.tsx:109-116`](../packages/react-grid/grid/src/widget/FiltersToolbar.tsx#L109-L116) | `ResizeObserver` + scroll listener torn down and re-attached every time the filter list changes (the effect depends on `updateScrollState` callback whose deps include `filters`) | Stable `useCallback` reading `filtersRef.current`; observer in separate effect with `[scrollRef]` only |

## High (real but bounded)

| # | Where | Issue | Fix |
|---|---|---|---|
| 6 | [`SettingsSheet.tsx:119-127`](../packages/react-grid/grid/src/widget/SettingsSheet.tsx#L119-L127) | `document.keydown` listener re-registers on every `onClose` identity change | `onClose` to a ref; effect deps `[open]` |
| 7 | [`conditional-styling/index.ts:87-88`](../packages/react-grid/grid/src/customizer/modules/conditional-styling/index.ts#L87-L88) | Module-level closures (`expiryTimer`, `previousByRow`, `triggersByRule`) only cleared if the disposer registered by `activate()` actually runs at grid destroy. If `destroy()` ever fails between modules, timers leak indefinitely | Move to a per-activation `Disposable` class with `try/finally` around each cleanup; never rely on disposer ordering for safety |
| 8 | [`useFilterModel.ts:useFilterModel()`](../packages/react-grid/grid/src/widget/useFilterModel.ts) | **334-LOC hook** mixes normalization, count computation, model sync, and AG-Grid subscriptions. Three suppressed `react-hooks/exhaustive-deps` with no comment explaining why | Split into `useFilterNormalization()`, `useFilterCounts()`, `useFilterModelSync()`. Document each dep-array suppression at the line of suppression |
| 9 | [`useMarketsGridController.ts:233-237`](../packages/react-grid/grid/src/widget/useMarketsGridController.ts#L233-L237) | `useImperativeHandle` deps `[api, platform, profiles]` — `profiles` is a new object reference per store mutation, so the handle is rebuilt constantly even though `onReady` is guarded by `readyFiredRef` | Narrow deps to `[api]`; rely on the ref guard |
| 10 | Stream-safe filters duplication: [`streamSafeDateFloatingFilter.ts`](../packages/react-grid/grid/src/widget/streamSafeDateFloatingFilter.ts) (832), [`streamSafeNumberFloatingFilter.ts`](../packages/react-grid/grid/src/widget/streamSafeNumberFloatingFilter.ts), [`streamSafeFloatingFilter.ts`](../packages/react-grid/grid/src/widget/streamSafeFloatingFilter.ts) | ~300 LOC of focus/clear/debounce/DOM boilerplate copy-pasted across 3 files; 5× `as unknown as {…}` cast pattern repeated | Extract `BaseStreamSafeFilter` with template-method hooks (`parseInput`, `formatValue`); subclass for date/number/text. Extract a single `extractAgGridParam<T>(params, key)` typed helper |

---

## Files breaking the convention

The [CLAUDE.md](../CLAUDE.md) ceiling is **800 LOC/file, 80 LOC/function**. 11 files break the soft 500-LOC convention; 1 breaks the hard 800-LOC ceiling:

| File | LOC | Suggested split |
|---|---:|---|
| [`customizer/modules/conditional-styling/index.ts`](../packages/react-grid/grid/src/customizer/modules/conditional-styling/index.ts) | **1086** ★ | `activate()` → 3 hooks: `useHeaderFlash`, `useTimedExpiry`, `useDiffTracking`. Module export becomes ~120 LOC |
| [`widget/streamSafeDateFloatingFilter.ts`](../packages/react-grid/grid/src/widget/streamSafeDateFloatingFilter.ts) | 832 ★ | Pure `DateExpressionParser` class + thin AG-Grid wrapper |
| [`widget/formatter/state.ts`](../packages/react-grid/grid/src/widget/formatter/state.ts) | 771 | `useFormatter()` is **526 LOC** alone — split into `useFormatterState` / `useFormatterActions` / `useFormatterTemplates` |
| [`customizer/modules/conditional-styling/ConditionalStylingPanel.tsx`](../packages/react-grid/grid/src/customizer/modules/conditional-styling/ConditionalStylingPanel.tsx) | 750 | Extract `RuleEditorForm` |
| [`customizer/ui/StyleEditor/BorderStyleEditor.tsx`](../packages/react-grid/grid/src/customizer/ui/StyleEditor/BorderStyleEditor.tsx) | 686 | Per-property sub-components |
| [`customizer/modules/column-groups/ColumnGroupsPanel.tsx`](../packages/react-grid/grid/src/customizer/modules/column-groups/ColumnGroupsPanel.tsx) | 660 | Extract `useColumnGroupTree()` hook + `TreeNode` component |
| [`customizer/modules/column-customization/ColumnSettingsPanel.tsx`](../packages/react-grid/grid/src/customizer/modules/column-customization/ColumnSettingsPanel.tsx) | 652 | Extract `ColumnPickerForm`, `CellRendererBand`, `FilterBand` |
| [`customizer/ui/PopoutPortal.tsx`](../packages/react-grid/grid/src/customizer/ui/PopoutPortal.tsx) | 648 | `usePopoutPosition()` + 11× `as unknown as` casts → typed window proxy |
| [`widget/ProfileSelector.tsx`](../packages/react-grid/grid/src/widget/ProfileSelector.tsx) | 590 | Extract `ProfileList`, `useProfileSelection()` |
| [`customizer/modules/column-customization/editors/CellEditorEditor.tsx`](../packages/react-grid/grid/src/customizer/modules/column-customization/editors/CellEditorEditor.tsx) | 544 | Per-editor-subtype components |
| [`widget/TemplateManager.tsx`](../packages/react-grid/grid/src/widget/TemplateManager.tsx) | 506 | Extract `TemplateRow`, `useTemplateDrag()` |

★ = exceeds the **hard** 800-LOC ceiling.

### Functions over the 80-LOC ceiling

| File:Function | LOC | Issue |
|---|---:|---|
| `widget/formatter/state.ts::useFormatter` | 526 | Monolithic hook — see §1 |
| `widget/useFilterModel.ts::useFilterModel` | 334 | Mixes normalization, count computation, sync logic |
| `widget/help/EmojiSection.tsx::EmojiSection` | 365 | Inline grid JSX + emoji data |
| `widget/FiltersToolbar.tsx::FiltersToolbar` | 299 | Mixes UI layout, event dispatch, model management |
| `widget/PrimaryToolbar.tsx::PrimaryToolbar` | 201 | Too much event binding in container |
| `widget/streamSafeDateFloatingFilter.ts::parseInput` | 153 | Complex date dispatch — extract `DateFormatDetector` + `DateRangeParser` |
| `widget/help/ExcelSection.tsx::ExcelSection` | 107 | Inline example data — move to const, extract `ExampleCard` |
| `widget/streamSafeDateFloatingFilter.ts::getOnChangeHandler` | 83 | Debounce + normalization intertwined |

---

## Cross-cutting medium issues

- **`Record<string, unknown>` overuse** — 15× in `useFilterModel.ts`, 11× in `ConditionalStylingPanel.tsx`. AG-Grid filter models have known shapes (`AgEqualsFilterModel`, `AgInRangeFilterModel`, etc.); a discriminated union would catch shape drift at compile time.
- **3 undocumented `react-hooks/exhaustive-deps` suppressions** ([`TemplateManager:356`](../packages/react-grid/grid/src/widget/TemplateManager.tsx#L356), [`SettingsSheet:116`](../packages/react-grid/grid/src/widget/SettingsSheet.tsx#L116), [`useGridHost:121`](../packages/react-grid/grid/src/widget/useGridHost.ts#L121)) — each needs a `// Reason: …` comment at the suppression line.
- **`(globalThis as any).fin`** in [`openfinViewProfile.ts:31`](../packages/react-grid/grid/src/widget/openfinViewProfile.ts#L31) — replace with `declare global { interface Window { fin?: FinAPI } }` so every consumer benefits from typing.
- **9 module `index.ts` barrels are inconsistent** — some re-export state, some don't. No documented public API boundary per module.
- **Mixed error patterns** — some modules throw, some return null, some swallow. Worth a one-pager "module conventions" doc rather than a refactor.

### Dead code candidates (low-priority)

| Symbol | File | Reason |
|---|---|---|
| `Select` (deprecated) | `customizer/ui/NativeOptionsSelect.tsx:149` | JSDoc `@deprecated` but still exported from `customizer/index.ts` barrel |
| `GridCore` type alias | `customizer/hooks/GridContext.ts` + `customizer/index.ts` | Duplicate declaration; consolidate to single source |
| Legacy `{col}` expression syntax | `customizer/ui/ExpressionEditor/language.ts:56-59` | Deprecated in favor of `[col]`; can be removed next major |
| `formatDate` epoch-ms overload | `widget/streamSafeDateFloatingFilter.ts:619` | Unexercised fallback path |
| `normalizeFilter()` export | `widget/useFilterModel.ts:175` | Only used within `useFilterModel()`; inline or move to local scope |

### Duplication clusters

| Cluster | Files | Type |
|---|---|---|
| Stream-safe floating filters | `streamSafeDateFloatingFilter.ts`, `streamSafeNumberFloatingFilter.ts`, `streamSafeFloatingFilter.ts` | ~30% boilerplate per filter type; extract `FloatingFilterBase` |
| Date parsing | `streamSafeDateFloatingFilter.ts` (3 parsing functions) | Three separate parsers for ranges/singles/epoch — unify into `DateExpressionParser` |
| Panel layouts | `ConditionalStylingPanel.tsx`, `ColumnSettingsPanel.tsx`, `ColumnGroupsPanel.tsx` | Repeating section/band layout — extract `<Band>` primitive |

---

## What's NOT a problem (give credit)

- **No circular imports** between `widget/` and `customizer/`
- **No god objects** — high-import counts in `MarketsGrid.tsx` and `formatter/state.ts` are appropriate for orchestrators
- **No dead-code hoard** — only 5 candidates total, all clearly deprecation-pathed
- **No callback explosion** — `TemplateManager`'s 6 callbacks are the high-water mark and are intentional
- **No native `<input>` violations** — all 5 native inputs are in valid carve-outs (Palette filter, color picker, inline rename, TitleInput shadcn wrapper)
- **Memoization is generally correct** — `ColumnSettingsPanel`'s `useDirtyColIds()` is a genuinely good pattern
- **Module organization is sound** — naming, file placement, test colocation all consistent
- **No concurrency hazards** — no sequential awaits where Promise.all is correct, no awaits inside loops
- **Error handling is mature** — `.catch(err => console.warn(...))` patterns are intentional, swallows are documented at the swallow site

---

## Suggested priority order (with effort estimates)

### Quick wins (≤ 1 hour each, ship as separate commits)

1. Fix the `useGridHost.ts:108-117` rAF cleanup leak — single ref + `cancelAnimationFrame`
2. Document the 3 `react-hooks/exhaustive-deps` suppressions
3. Replace `(globalThis as any).fin` with a `declare global` block in a `types/fin.d.ts` file
4. Memoize `onClose` to a ref in `SettingsSheet.tsx`
5. Fix `DraggableFloat`'s stacking pointer listeners

### Tier 1 refactors (½ – 1 day each)

6. Extract `BaseStreamSafeFilter` — eliminates ~300 LOC duplication across 3 files, removes 15× `as unknown as` casts
7. Split `useFilterModel()` into 3 hooks — reduces a 334-LOC function to three ~100-LOC siblings
8. Replace `useSyncExternalStore` snapshot with field-selector hooks in `useProfileManager.ts`

### Tier 2 refactors (1 – 2 days each)

9. Decompose `useFormatter()` (526 LOC) into three hooks
10. Extract `useColumnGroupTree()` from `ColumnGroupsPanel.tsx`
11. Decompose `conditional-styling/index.ts` `activate()` into per-feature hooks; consolidate timer cleanup

### Tier 3 (architectural, schedule by appetite)

12. Strict-typed AG-Grid filter model discriminated union (touches `useFilterModel`, `ConditionalStylingPanel`, others)
13. `<Band>` layout primitive to standardize the 3-4 big panel files

---

**Total addressable cleanup:** ~5 person-days for tiers 1–2 to land safely. Quick wins are ~2 hours combined.

---

## Audit method

Three parallel `Explore` agents covered orthogonal concerns:

1. **Performance + lifecycle**: `useEffect` leaks, AG-Grid render thrash, hot-path serialization, state-mgmt subscription patterns. Searched `widget/` and `customizer/hooks/`.
2. **Architecture + complexity**: file/function size ceilings, dead code, god objects, duplication, naming consistency. Cross-grepped the whole package for exports and consumers.
3. **Anti-patterns + types**: weak typing density (`any`, `as`, `Record<string, unknown>`), React hook misuse, native input violations, error swallowing, concurrency hazards.

Findings from all three converged on the same 6-8 file hotspots — strong signal that the diagnosis is real, not noise from any single perspective. Where the agents disagreed (e.g., callback counts), the convergent-finding wins are listed above; isolated-agent findings are documented but not promoted to critical.
