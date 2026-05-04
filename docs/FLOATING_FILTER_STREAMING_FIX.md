# Floating filter input clobber on streaming grids

**TL;DR.** When a user typed into a floating filter on a column configured
as `agMultiColumnFilter` with `agSetColumnFilter` as one of the sub-filters
on a streaming-data grid, characters got clobbered every time a row update
arrived (~every 100-250ms). The standalone non-streaming repro behaved
correctly. Root cause was an interaction between AG-Grid Enterprise's
set-filter handler and the multi-filter's floating-filter delegate — not
a bug in our code, but a sharp edge in AG-Grid Enterprise's wiring that
needed a custom floating filter component to defuse.

Initial fix landed in commit `b688f3a` on `main`. Two enhancements landed
on branch `feat/floating-filter-clear-and-multi-token`:

- **Clear (✕) button** appears on the input's right edge whenever the
  input has a value; clicking clears both the input and the underlying
  filter.
- **Comma-token OR matching.** Typing `aaa,bbb,ccc` filters rows that
  contain ANY of those tokens (compound model with `operator: 'OR'`).
  Single-token typing keeps the simple model so the popup filter UI
  stays in sync. Whitespace around tokens is trimmed; empty tokens
  (e.g. trailing comma) are dropped. Numeric filters auto-coerce
  tokens; non-numeric tokens in a number-filter column are dropped.

Standalone reproduction + side-by-side fixed/broken comparison lives in
[`../agg-floating-filter-repro`](../../agg-floating-filter-repro)
(sibling to this monorepo).

---

## What the user saw

- Click into a floating filter on a column like `issuer.sector`
  (configured as `agMultiColumnFilter` with text + set sub-filters).
- Type `hello`.
- Result: only the first character lands. Subsequent keystrokes
  produced garbled values (`'hl'`, `'ht'`, `'hh'`, …) — the input
  appeared to forget what was just typed.

The grid otherwise worked fine: AG-Grid event handlers fired, the React
tree wasn't re-rendering, no errors in the console. Just the floating
filter input getting silently overwritten.

## Why our standalone repro initially passed

The first cut of `agg-floating-filter-repro` had **no streaming data**.
We populated 200 static rows and never called `applyTransactionAsync`
afterwards. Every floating-filter shape passed.

The bug only surfaces when row data changes after mount. In production,
the DataPlane streams pricing/positions deltas continuously. Without
streaming, the trigger never fires.

After we wired streaming into the standalone (interval calling
`applyTransactionAsync` with mutated rows every 250ms), the same column
in the standalone reproduced the clobber exactly.

## Root cause

Override `HTMLInputElement.prototype.value`'s setter to log every
external assignment + stack trace. Every clobber's stack was identical:

```
setValue                @ TextFloatingFilter
onModelUpdated          @ TextFloatingFilter
onParentModelChanged    @ TextFloatingFilter
parentMultiFilterInstance ...
onParentModelChanged    @ MultiFloatingFilter
syncWithFilter          ...
dispatchLocalEvent('modelAsStringChange')
updateAvailableKeys     @ SetFilterHandler
updateAllValues
refreshAll
syncAfterDataChange     @ SetFilterHandler
onNewRowsLoaded
refreshModel
applyTransactionAsync   @ MarketsGridContainer.tsx:630
onDelta                 @ DataPlane.ts:274
handleMessage           @ DataPlane.ts:396
```

The chain, in plain English:

1. A streaming delta arrives via STOMP/websocket.
2. `MarketsGridContainer` calls `api.applyTransactionAsync({update: [...]})`.
3. AG-Grid commits the row transaction → `refreshModel` → `onNewRowsLoaded`.
4. The **set sub-filter** (`agSetColumnFilter` inside the multi-filter)
   reacts to data changes via `syncAfterDataChange`. It recomputes the
   list of available values for the popup, then dispatches an internal
   event called `modelAsStringChange`.
5. The **multi-filter** (`agMultiColumnFilter`) listens for that event
   and calls its own `onParentModelChanged` to keep its floating filter
   in sync.
6. The multi-filter's floating-filter delegate forwards the call to its
   **first sub-filter's floating filter** — which on this column is the
   text floating filter.
7. AG-Grid's default text floating filter implements
   `onParentModelChanged` as `this.input.value = stringify(model)`. It
   does this **regardless of whether the input currently has focus**.
8. Result: every time data changes, the text input gets reset to the
   *applied* filter model — which is `'h'` (the only character we
   managed to commit before the next data tick).

Critical detail: step 4 fires even though **the applied filter model
didn't change**. The set sub-filter is just refreshing its
discoverable-values list. But that refresh dispatches an event whose
listener doesn't distinguish "applied model changed" from "available
values list changed."

## What didn't work

**`filterParams.refreshValuesOnOpenOnly: true` on the set sub-filter.**
The AG-Grid docs suggested this gates value-list refreshes to popup-open
only. We auto-defaulted it for set sub-filters in `agMultiColumnFilter`.
A DOM dump confirmed it landed on the resolved colDef. But the clobber
chain still fired. In AG-Grid 35.1.0 this param controls a different
refresh code path; `syncAfterDataChange` runs unconditionally.

The first commit (`0bc9986`) included this attempted fix; commit
`b688f3a` superseded it with the working approach.

## What did work

A **custom AG-Grid floating filter component** that ignores
`onParentModelChanged` writes while its input has focus.

```ts
// packages/markets-grid/src/streamSafeFloatingFilter.ts
export class StreamSafeTextFloatingFilter implements IFloatingFilterComp {
  // ... renders an <input>, debounces user typing, applies via
  // parentFilterInstance(parent => parent.onFloatingFilterChanged(...))

  onParentModelChanged(parentModel: unknown): void {
    if (document.activeElement === this.input) return;  // ← the fix
    this.input.value = parentModel == null ? '' : stringify(parentModel);
  }
}
```

Registered globally on `AgGridReact` via the `components` prop:

```tsx
// packages/markets-grid/src/MarketsGrid.tsx
<AgGridReact
  components={{ streamSafeText: StreamSafeTextFloatingFilter }}
  ...
/>
```

Auto-applied to text/number sub-filters of any `agMultiColumnFilter`
via the column-customization transform layer:

```ts
// packages/core/src/modules/column-customization/transforms.ts
if (cfg.kind === 'agMultiColumnFilter' && cfg.multiFilters?.length > 0) {
  params.filters = cfg.multiFilters.map((mf) => {
    const entry = { filter: mf.filter, display: mf.display, title: mf.title };
    if (mf.filter === 'agTextColumnFilter' || mf.filter === 'agNumberColumnFilter') {
      entry.floatingFilterComponent = 'streamSafeText';
    }
    return entry;
  });
}
```

### Why focus-aware works

Step 7 in the chain (above) writes `this.input.value = stringify(model)`.
That write doesn't fire DOM `input` or `change` events — it's a direct
property assignment. Browsers don't route property assignments through
`document.activeElement` checks; the input quietly gets a new value
under the cursor.

Our floating filter implements the same surface but adds an early return
when the focused element is our own input. The set sub-filter still
refreshes its values, the dispatch chain still reaches us — we just
choose not to clobber. As soon as focus leaves, normal sync resumes.

This isn't a hack: AG-Grid's IFloatingFilterComp interface explicitly
allows custom implementations. We're just being more polite about
focus than the default.

## Why we don't apply this to set-filter floating filters

`agSetColumnFilter`'s default floating filter is read-only by design —
it shows a comma-separated label of currently-selected values, not a
typeable input. There's nothing to clobber. The fix is unnecessary
there.

## Why we don't apply this to non-multi columns

A standalone `agTextColumnFilter` (no multi wrapper, no set sibling)
doesn't trigger the chain. The multi-filter's role here is the
"middleman" that forwards set-driven dispatches to the text floating
filter. Without the multi wrapper, set's `modelAsStringChange` doesn't
have a path into the text input.

## Side-by-side reproduction

The standalone app at `../agg-floating-filter-repro` shows the broken
and fixed behaviour next to each other. Run:

```powershell
cd ..\agg-floating-filter-repro
npm run dev
```

Two grids stack vertically:

- **Top grid** — uses AG-Grid's default floating filter on a
  multi(text+set) column. Type while streaming is on → characters
  clobber every ~250ms.
- **Bottom grid** — same column shape, but with our `streamSafeText`
  custom floating filter wired in. Typing is uninterrupted. The
  underlying set sub-filter still refreshes its values list; only the
  floating filter input is now focus-aware.

Toggle the **Streaming** button at the top to confirm streaming is
the trigger — with streaming off, the top grid's input also works.

## Future maintenance

- **AG-Grid version bumps.** Re-run the standalone repro before
  upgrading. If the top grid (broken case) starts passing, AG-Grid
  has fixed it upstream and we can consider removing
  `streamSafeFloatingFilter.ts` + the transform-layer auto-default.
- **New filter kinds.** If we add custom filter kinds to
  `MultiFilterEntry['filter']`, decide whether they need
  `streamSafeText` too. The current rule (auto-apply for
  `agTextColumnFilter` and `agNumberColumnFilter`) is the minimum
  safe set.
- **Date floating filters.** `agDateColumnFilter` has a different
  floating filter shape (date picker, not text input). Not currently
  affected. If we want to defend it too, write a parallel
  `StreamSafeDateFloatingFilter` and add it to the auto-default list.

## File pointers

| File | Purpose |
|---|---|
| [`packages/markets-grid/src/streamSafeFloatingFilter.ts`](../packages/markets-grid/src/streamSafeFloatingFilter.ts) | The custom floating filter component |
| [`packages/markets-grid/src/MarketsGrid.tsx`](../packages/markets-grid/src/MarketsGrid.tsx) | Component registration via `<AgGridReact components={...} />` |
| [`packages/core/src/modules/column-customization/transforms.ts`](../packages/core/src/modules/column-customization/transforms.ts) | Auto-default in `applyFilterConfigToColDef` |
| [`../../agg-floating-filter-repro`](../../agg-floating-filter-repro) | Standalone reproduction app |
