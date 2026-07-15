# Stress Test (50k × 400)

Large-book AG Grid stress surface for **both CSRM and SSRM**. Use the
header **Use SSRM (large dataset)** toggle to flip engines against the
same row/column shape and seeded modules.

## Shape

| Dimension | Value |
|-----------|-------|
| Rows | **50,000** (mock FI positions, updates off) |
| Columns | **400** (~34 real FI + synthetic `S000…` series) |
| Default profile | Full stress — grouping, CS, formatters, calcs, pills |

Synthetic columns use `valueGetter`s (derived from id + mid) so we do not
materialise 350 extra keys on every row. They stress paint, scroll, and
column virtualisation; filter/sort/group those series under SSRM is not
the focus — use the real FI columns for that.

## Seeded complexity

- **Row grouping** — Asset Class → Sector, collapsed by default
- **Aggregations** — sum MV / P&L / face / DV01; avg duration / OAS
- **Conditional styling** — overview rule set (winners/losers, flash, junk)
- **Complex formatting** — Excel + preset formatters on pricing / P&L
- **Column groups** — nested header groups (Pricing / P&L / Risk open)
- **Calculated columns** — P&L Total, Carry/Risk, Dollar Dur, B/A bps
- **Quick-filter pills** — curriculum pills present, inactive on load
- **Grid options** — compact density, multi-select, cell selection, totals,
  row-group + pivot panels, animations off

## Profiles

| Profile | Intent |
|---------|--------|
| **00 · Full stress** | Everything on |
| **01 · Flat wide** | No groups — wide scroll + styles |
| **02 · Grouped + agg** | Lean grouping / aggregation only |

## CSRM vs SSRM performance

SSRM should win once the book is in Perspective (filter / group / scroll
without holding 50k row nodes in AG Grid). **First paint** still has to
ingest the book into the worker — that path is slimmed (schema-only row
projection + chunked postMessage) and refreshes the grid once when ingest
finishes (no mid-ingest double purge on CSRM→SSRM switches).

CSRM can still feel snappier on a warm main thread because it paints
straight from the React array with no worker round-trip. Prefer SSRM when
you care about large-N grouping/filter stability and heap after load.

1. Open this tab and wait for the 50k snapshot (status bar / load banner).
2. Expand a Class group, scroll horizontally across synthetic columns.
3. Toggle **Use SSRM** and repeat — compare first paint, expand, scroll.
4. Activate a Quick Filter pill (Rates / Corp IG / HY) and watch counts.
5. Switch to **01 · Flat wide** for pure column-virtualisation pressure.

Expect CSRM to hold the full book in the browser heap; SSRM pushes the
book into Perspective and pages leaves. Both should remain interactive
after the initial load — if not, that is the finding.
