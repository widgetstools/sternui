# SSRM Engine — MarketsGrid surface

The same 20,000 × 120 book as the **SSRM Engine** tab, in the same SharedWorker,
under the same book id — so the two tabs share one book. The difference is
everything above the row supply: this one is a full `MarketsGrid`.

The other tab keeps its plain `AgGridReact` on purpose. It is the control.

## What had to be built for a server-side surface, and why none of it is free

Each of these was a separate bug on the Perspective pull path, found only by
driving the real UI. They are wired here from the start.

- **Set-filter values come from the engine.** AG builds a set filter's checkbox
  list from the rows the client model holds, which under a server row model is
  one block. `engine.distinctValues` answers instead — including for a
  *calculated* column, which it scans because an expression has no dictionary.
  Above its ceiling it answers nothing at all rather than a partial list: a
  truncated list renders as the whole domain and its Select All silently
  excludes the rest.
- **Quick search is bridged through `modelUpdated`.** AG's `quickFilterText` is
  a client-side-row-model option and does nothing here. Setting it fires
  `modelUpdated` and not `filterChanged`, so that is the hook — and the bridge
  compares against the last text it acted on, because the engine's own purge
  fires `modelUpdated` again.
- **The status-bar row counts come from the worker.** AG's stock row-count
  panels render *nothing* under a server row model, and `forEachNode` visits
  only the loaded blocks. The count shown is `engine.countFiltered`, which is
  the filtered book measured flat — deliberately not the grouped level's row
  count, which is the number of top-level groups.
- **A committed edit goes to the book.** AG writes it to the block-cache row
  node only, and the next re-read paints the old value back over it.
- **The grand total is created one way and updated another.** `grandTotalData`
  on a block response creates that row and does not update it; keeping it live
  needs a transaction addressed to AG's own grand-total row id.
- **Export reads the whole book and refuses above a ceiling.** A spreadsheet
  that stopped early is indistinguishable from a complete one once it is open.

## The calculated columns are authored, not injected

The six `calc_*` columns are seeded as **customizer state**, not handed to the
surface as a prop. They take the path a user's own column takes: the
calculated-columns module holds the authored string, the planner parses it to a
StarUI AST, the AST crosses the worker port, and the engine evaluates it where
the book is. That is what lets them be **sorted, filtered and grouped from the
grid's own header menus and row-group panel** — there are no demo buttons on
this tab. A value computed in this window could do none of those, because this
window holds only the blocks in view.

Open **Settings → Calculated Columns** to see them, or edit one and watch the
grid re-read.

| column | expression |
|---|---|
| P&L % of Mkt | `IF([marketValue] > 0, ([dailyPnL] / [marketValue]) * 100, null)` |
| Dollar Duration | `[marketValue] * [modifiedDuration] / 100` |
| Price Band | `IFS([midPrice] >= 105, "rich", [midPrice] >= 95, "fair", "cheap")` |
| Notional | `[quantityFace] * [midPrice] / 100` |
| Carry (rich only) | `IF([midPrice] >= 105, [yieldToMaturity] / [modifiedDuration], null)` |
| Live Sum (ticks) | `ROUND([esgScore] + [originalMaturity], 2)` |

Two of those are worth watching specifically, and both are claims this book can
actually show:

- **Carry (rich only)** is genuinely null wherever `midPrice >= 105` is false —
  thousands of rows. Sort by it in either direction and the nulls are last both
  times. That is this engine's rule and it is a deliberate divergence from AG's
  client-side comparator, which puts nulls first ascending.
- **Live Sum (ticks)** is the only one that moves. The generated book ticks
  exactly two fields, and it is the only expression that reads them — so it
  flashes while the other five hold. That is `engine.calcPatch` deciding, per
  frame, which calculated cells the frame actually made stale. Re-stamping all
  of them would flash a total that did not move.

## What this surface does not have

- **No cross-row style rules.** A rule like `[price] > AVG([price])` needs the
  engine to answer an aggregate over the whole filtered book from an expression,
  and this engine has no expression language of its own to compile a rule into.
  The seam is absent rather than stubbed, so a rule paints nothing instead of
  reading a `null` as "no row matches".
- **No master/detail and no tree data.** Those are Perspective-surface props.
