# SSRM Engine — calculated columns that behave like real ones

`@starui/ssrm-engine` is a columnar row engine written to AG Grid's server-side
row model contract. The book — 20,000 rows × 120 real columns — lives in a
**SharedWorker**; this window holds a port, an async datasource and AG's own
block cache.

The four `calc_*` columns on this tab are **expressions**, not fields. They are
authored as strings, parsed by `@starui/engine`, planned by the customizer's
`planSsrmCalcColumns(..., { backend: 'ssrm-engine' })`, and sent across the port
as an **AST** — the only thing that crosses, because a compiled closure is not
structured-cloneable and the value has to be produced where the book is.

## Why this tab exists

The capability is invisible when it works *and* invisible when it doesn't.
Before this landed, `sortIndex`, `compileFilter` and `aggregateMembers` each
opened by skipping a column the store did not have — and a calculated column is
not a field. So sorting or filtering one was a **silent no-op**: no error, no
effect, and a grid that looked like it had ignored the click.

That is why the toolbar buttons *do* the thing rather than asking you to find
the header menu, and why the strip above the grid reports what the engine says
rather than what the screen suggests.

## Try this

- **Sort by Carry** — `calc_richCarry`, a calculated column that is **null**
  wherever its guard (`midPrice >= 105`) fails, which is thousands of rows.
  Scroll to the bottom: the nulls are there. Click the header to flip the
  direction; they are **still** at the bottom.

  That rule is not AG's. AG's own `_defaultComparator` returns `-1` for a null
  and the grid multiplies by the direction, so on the client-side row model
  nulls sort **first** ascending. This engine puts null *and* NaN last in both
  directions, because a NaN price sorting above the best bid is worse than
  either — a defect this engine shipped once and had fixed twice, in the null
  branch and then again in the NaN branch that shared its reasoning.

  Note that `calc_pnlPct` guards on `marketValue > 0`, which is true for every
  row of this generated book, so that column has no nulls to show. That is why
  the button points at Carry.
- **Filter > 500** — the engine evaluates the expression over the whole book,
  not over the block in view. Watch "AG displays" drop while "Book" stays
  20,000.
- **Group by band** — `calc_band` is a calculated **string** (`IFS` over
  `midPrice`), and `calc_notional` is summed per group. Both are expressions;
  neither is stored.
- **Leave it running.** `calc_notional` depends on `midPrice`, so it moves on
  every price tick. `calc_dollarDur` does not depend on `midPrice` and stays
  put — a tick re-stamps only the calculated cells whose inputs it names,
  because AG flashes a cell it is told changed.

## What is NOT on this tab

A plain `AgGridReact`, deliberately. The MarketsGrid surface — set-filter values
served from the engine, quick search bridged through `modelUpdated`, status-bar
panels, cell-edit commit and export — is the **next** session's work, and each
of those was a separate bug on the Perspective path. Showing a MarketsGrid here
would demonstrate a surface that does not exist yet.

Opening a filter on a calculated column uses a **typed** filter
(`agNumberColumnFilter` / `agTextColumnFilter`). A bare `filter: true` resolves
to AG's *set* filter, which under a server row model has no values to offer —
it builds its list from the rows the client model holds, which is one block.
Wiring the engine's own `distinctValues` into a real set filter is part of that
next session.

## Measurements

The Stress tab (`?engine=ssrm`) is where the numbers are taken, and it defaults
to calculated columns **off** — every documented boundary figure was measured
that way. With four installed, the block round trip moves from ~2.40 ms to
~2.60–3.00 ms median: roughly 0.2 ms of evaluation for 400 cells, plus four more
columns to structured-clone per row.
