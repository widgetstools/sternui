# SSRM grid + provider replacement — analysis

**Date:** 2026-07-19
**Question:** should the STOMP provider and SSRM grid be replaced with new
implementations, and if so what exactly has to be reproduced?
**Related:** [ADR-ssrm-worker-hosted-engine.md](./ADR-ssrm-worker-hosted-engine.md)

---

## 1. Summary

MarketsGrid **already has** a server-side row model (`rowModel: 'server'` /
`useSSRM`), rendering `CustomSSRMGrid` from `@wellsfargo-starui/ssrm-grid`. It is
substantially built — 1,086 LOC with block caching, scroll-quiet windows,
surgical-vs-purge refresh policy, group aggregate patching and tree/detail
support.

But it is **SSRM rendering over client-held data**: the full book is passed in
as a React `rowData` prop and cloned again into a main-thread `RowMirror`. So it
does not solve the problem the pull architecture exists to solve — per-window
dataset cost — and at 250 MB datasets it never will.

**The decisive finding for replace-vs-retrofit:** every piece that would be
*kept* is well tested (141 passing tests over the engine/logic layer); the one
piece that would be *thrown away* — `CustomSSRMGrid.tsx`, 1,086 LOC — has **no
test file at all**. There is no test debt being discarded.

---

## 2. What exists today

### Render path (server mode)

```
MarketsGrid.tsx:294  resolveUseSsrm({ useSSRM, rowModel })
  → MarketsGrid.tsx:479 / MarketsGridHost.tsx:421
    → SsrmMarketsGridSurfaceConnected      (adds rowKeepExpression)
      → SsrmMarketsGridSurface             (maps rowIdField→getRowId, hardcodes tuning)
        → ssrmgrid-entry.ts                (pure re-export)
          → CustomSSRMGrid.tsx:1002        AgGridReact rowModelType="serverSide"
```

### The core problem: the book is held twice, per window

| Copy | Where |
|---|---|
| 1 | React `rowData` prop (`MarketsGridHost.tsx:201`), sourced from `useProviderDataWiring.ts:207` → `onSsrmSnapshot(rows.slice())` |
| 2 | `RowMirror.replaceAll` → `rows.map(r => ({...r}))` (`rowMirror.ts:83`) — a full shallow-clone |
| + | AG Grid's loaded blocks, and `SsrmBlockCache` |

Confirmed by inspection. This is what makes N blotters cost N × dataset, and it
is unaffected by any grid-side tuning.

### Anti-jank machinery that already exists

Worth knowing before reinventing it — `CustomSSRMGrid` has:

- **1 s scroll-quiet window** (`tickQuietUntilRef` :228, `onBodyScroll` :395)
  suppressing agg patching (:310/:314), soft refresh (:372) and diverting leaf
  updates into the block cache only (:351)
- 250 ms group/grand-total agg patch throttle (:312)
- `asyncTransactionWaitMillis={50}`, `blockLoadDebounceMillis={50}`,
  `cacheBlockSize={100}`, microtask coalescing, generation-guarded async results
- Sync block serving from the mirror, so a fling doesn't paint stubs

A replacement must reproduce these or scroll quality regresses.

---

## 3. History — Perspective was here before

`74e3c69e` (2026-07-15) *"CustomSSRMGrid only — drop Perspective from
MarketsGrid"*. Reading the diff, this was primarily an **AG Grid 35→36 upgrade
plus vendoring an external `file:ssrmgrid` dependency in-repo**; the vendored
engine (RowMirror) simply doesn't use Perspective. The commit does not record a
technical failure of Perspective.

Corroborating: the expression compiler still targets Perspective
(`ssrmExpressionCompile`, `compileColExpression`, `perspectiveExpr.ts`), and
`ssrmFilters.ts` (806 LOC) compiles AG filter models to **Perspective filter
plans**. The filter/expression layer never stopped being Perspective-shaped.

> Caveat: absence of a stated reason is not proof there wasn't one. Worth
> confirming with whoever made the call before committing to the direction.

---

## 4. Inventory — reuse vs rework

`ssrm-grid` is 9,245 LOC / 64 files.

**Reusable as-is (~2,600 LOC, all tested):** `engine/*` (types, customEngine,
perspectiveEngine, perspectiveViewCache, perspectiveTypes,
materializeCalcColumns), `filters/ssrmFilters.ts`, `filters/perspectiveExpr.ts`,
`ssrm/rowMirror.ts`, `mirrorGroupAgg.ts`, `trafficLightAgg.ts`,
`shareOfTotal.ts`, `configuredGate.ts`, `mergeLeafUpdateRows.ts`,
`ssrmBlockCache.ts`, `applyWorkerDirtyToGrid.ts`, `getGroupLeafRows.ts`,
`types.ts`, `quickFilterHighlight.ts`, `refreshScheduler.ts`.

**Reusable behind an adapter (type-only AG coupling):**
`activeFilterModel.ts`, `readGridQueryState.ts`, `refreshAllLoadedStores.ts`,
`columnOverride.ts`.

**Needs rework:** `createCustomDatasource.ts` (273 — extract resolution from the
AG callback shape), `patchLoadedGroupAggregates.ts` (188), `mirrorLoadingCell.tsx`
(96), `chartAllViaAgGrid.ts` + `exportAllViaAgGrid.ts` (303).

**Dropped:** `CustomSSRMGrid.tsx` (1,086), `agGrid/modules.ts`, `agGrid/theme.ts`.

### The structural blocker

`SsrmEngine` looks like a clean seam but **the component does not respect it**.
`CustomSSRMGrid.tsx:233` calls `engineRef.current.getMirror()` — a method on
`createCustomEngine`'s return type, *not* on `SsrmEngine` — and RowMirror then
spreads through ~16 further sites plus three more channels:
`CustomDatasourceExtras.rowMirror`, the `setActiveRowMirror` module singleton,
and AG `context.rowMirror`.

**Consequence:** `CustomSSRMGrid` cannot be handed `createPerspectiveEngine`
today. Closing this is the real scope driver — either promote a sync-read
capability onto `SsrmEngine` (e.g. optional `trySyncRows?`), or accept a
RowMirror-aware fast path in the replacement.

---

## 5. Risk profile

| | LOC | Tests |
|---|---|---|
| Kept (engine + logic layer) | ~2,600 | 141 passing |
| Discarded (`CustomSSRMGrid.tsx`) | 1,086 | **none** |

`ssrm-grid`: 24 files, 141 tests, all passing, nothing skipped.
`grid`: 90 files, 724 tests, **43 failing** (see §7).
**No e2e coverage of SSRM at all** — zero matches for `ssrm` / `rowModel` under `e2e/`.

---

## 6. Repo-rule violations found

- `CustomSSRMGrid.tsx` is **1,086 lines**, over the 800 LOC/file ceiling.
  `ssrmFilters.ts` is 806, marginally over.
- `agGrid/theme.ts` **violates the UI stack rule**: hardcoded `#8AAAA7`,
  `#8AAAA766` and a forced `colorSchemeDark`, instead of resolving `--bn-*` /
  `--fi-*` tokens. It is dark-only, so SSRM grids cannot render correctly in
  light theme.

---

## 7. Defects found during analysis

Independent of the replacement decision:

1. **42 MarketsGrid tests were dead.** Four files failed to *collect* (an
   incomplete `ag-grid-enterprise` mock), so their tests never ran. Fixed by
   spreading `importOriginal()`; they now run and **43 fail** — stale against
   the current component contract (`useGridPlatform() must be used inside
   <GridProvider>`).
2. **The SSRM capability gate is inert.** `CURRENT_SSRM_PHASE = 4` while every
   `PHASE_MIN` entry is ≤ 3, so all 14 capabilities report enabled and every
   `disabled` / tooltip path is dead code.
3. **`patchGrandTotalFromMirror` / `patchLoadedGroupAggregatesFromMirror` are
   called without `extras`** (`CustomSSRMGrid.tsx:316,319`), so quick-filter
   text, `absSort`, `rowKeepExpression` and `idField` are not applied —
   aggregates are computed against the wrong view and stamp `id` not `idField`.
4. **`ssrmRowDiff.ts` uses module-scope globals** shared across grid instances;
   `clearSsrmRowDiffs` / `forgetSsrmRowDiff` have no callers, so
   `latestDiffsByRow` grows unbounded.
5. **Row exclusion fails open** — an expression the compiler rejects silently
   shows *more* rows (`useSsrmRowKeepExpression.ts:23`).
6. **Dead code**: `applyTickToSsrm.ts` (tested, unused), `getSsrmShareOfTotal`
   (exported, no consumer), `engine/index.ts` subpath (no importer).
7. `ssrmCalcColumns.test.ts:34` asserts old ternary output the compiler no
   longer emits.

---

## 7a. Customizer modules under a server row model

Audited all 17. The customizer is in better shape than expected — the SSRM
effort is real (a capability registry, `useSsrmCapabilityGate`, and purpose-built
SSRM replacements for row exclusion, calc columns and old/new diffs) — but that
work is concentrated in about four modules; the rest are unguarded.

| Verdict | Modules |
|---|---|
| **WORKS** (8) | column-templates, toolbar-visibility, column-groups, saved-filters, toolbar-date-settings, calculated-columns, alerts, column-customization |
| **DEGRADES** (5) | smart-edit / shortcuts / plus-minus, visual-excel, bulk-update, data-change-history, grid-state |
| **PARTIAL** (1) | conditional-styling — rules work, runtime degrades |
| **BREAKS** (1) | general-settings |

### The structural one: general-settings

`SsrmMarketsGridSurface` accepts a **narrow prop whitelist**
(`SsrmMarketsGridSurface.tsx:10-40`). `MarketsGrid.tsx:478-506` forwards only
`theme`, `rowHeight`, `headerHeight`, `sideBar`, `defaultColDef`,
`grandTotalRow`, `groupTotalRow` — and hard-nulls the status bar
(`:488`). The module's ~100 other computed gridOptions, **including
`rowSelection`** (`general-settings/index.ts:171`), are computed and discarded.

The panel therefore shows toggles that do nothing under SSRM. This is bigger
than any single module and is a direct argument for the replacement: a new
surface must not re-create a narrow whitelist.

### Data-integrity gap: selection across blocks

Selection is configured inside the grid (`CustomSSRMGrid.tsx:965-975`,
`selectAll:'all'`) and read correctly by the status bar via
`getServerSideSelectionState()`. But **no customizer module consumes that
state** — grep finds zero uses outside the status bar.

So: tick "select all", run bulk-update, and edits apply **only to rows in
loaded blocks, silently**. Same class of issue in smart-edit/shortcuts/
plus-minus, where unloaded targets are dropped without warning
(`collectTargetCells.ts:55`), and in visual-excel, which exports only loaded
blocks (`exportVisualExcel.ts:24-30`) despite `exportAllViaAgGrid` already
existing and being reachable.

Silent wrong results are worse than refusal. Whatever the surface decision, the
edit/export paths need fetch-or-refuse semantics.

### Things that are already right

- **Conditional-styling `.old`/`.new`** does *not* break on block refetch:
  `ssrmRowDiff.ts` keys previous values by row id from the tick stream, not by
  node identity. Caveats: module-level singleton shared across grids, and a
  row's first sighting never flashes.
- **Calculated columns** compile to Perspective expressions where possible and
  fall back to per-block client materialisation, with `unsupported` as the safe
  failure mode rather than viewport-scoped sums.
- **toolbar-date-settings** is the model implementation — refuses the external
  filter under SSRM and substitutes a compiled keep-predicate.

### Remaining work, ranked

1. general-settings gridOptions whitelist (structural)
2. conditional-styling runtime — header painter + timed activations use
   `forEachNodeAfterFilter` / `forEachNode`; need engine-side matching
3. grid-state — async viewport restore, quickFilter reconciliation
4. bulk-update — distinct values from the engine, not a client scan
5. data-change-history — verify partial-row merge on undo/redo
6. selection plumbing into edit modules
7. visual-excel — rewire to `exportAllViaAgGrid`
8. shortcuts / plus-minus — capability ids for parity with smart-edit

---

## 8. Options

| Option | Cost | Solves per-window dataset cost? |
|---|---|---|
| **A. Leave as-is** | 0 | No |
| **B. Swap engine only** — make `CustomSSRMGrid` engine-polymorphic, drop `rowData` | Medium: close the `getMirror()` leak across 4 channels; component stays 1,086 LOC and untested | **Yes** |
| **C. New grid component** on the reusable engine layer | High: reproduce the handle contract, scroll-quiet behaviour, block cache, context publication, getRowId encodings, tree/detail, export/chart | **Yes**, and clears §6 violations |
| **D. New grid + new provider** (as instructed) | C + provider — provider already done as a ~120-line sink adapter | **Yes** |

**What C/D must reproduce** (from the existing component): the 10-method
`CustomSSRMGridHandle`; sync block serving; block cache with fingerprinting and
generation invalidation; the scroll-quiet window and its three effects; 250 ms
agg patching; partial-patch merge semantics; `grandTotalData` injection;
`context` publication (`rowMirror`, `ssrmConfigured`, `ssrmCountMatching`,
`totalRowCount`, `filteredRowCount`, `totals`, `aggregates`,
`quickFilterTokens`); loading-cell stubs; `getRowId` encodings for group (`g:`),
tree (`t:`/`tl:`) and grand-total rows; export/chart context-menu overrides;
tree data; master-detail; set-filter values; cell-edit write-back; alerts
leaf-fetcher registration.

---

## 9. Recommendation

**Option D, sequenced so the risky half is proven before the expensive half.**

1. **Provider — done.** `createSsrmTableProvider` is a sink adapter over the
   existing transports (`startStomp` already owns connection, reconnect,
   snapshot assembly, templates, projection — none of it push-specific).
2. **Close the engine seam first.** Add an optional sync-read capability to
   `SsrmEngine` and remove the four RowMirror channels. This is the load-bearing
   change and it is independently valuable: it makes *either* option B or C
   possible, and can be validated against the existing 141 tests.
3. **Then the new component**, built on the reusable layer, with
   `refreshScheduler.ts` as its refresh policy and the Perspective engine behind
   it. Delete `CustomSSRMGrid` in the same change — no parallel implementations.
4. **Fix the 43 dead tests before step 3**, not after. Without them there is no
   safety net for a component swap, and they are currently the only coverage of
   MarketsGrid's mount contract.

**Do not attempt customizer parity in a new component.** The customizer,
toolbars and profiles stay in `grid` and are row-model agnostic; the replacement
is a *surface*, not a product re-implementation.

### Open questions

- Why was Perspective actually dropped in `74e3c69e`? The commit reads as
  vendoring, but confirm.
- Should `rowModel: 'server'` continue to accept a `rowData` prop at all, or
  should the pull path be the only server mode?
- Row selection across blocks under SSRM — unresolved in both designs.
