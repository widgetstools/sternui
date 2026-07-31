# Bulk Update

> **This is the Perspective lab.** The grid below runs on
> `rowModel="perspective"`: the book lives once as a Table in the SharedWorker
> and this window reads only the blocks its viewport asks for. Sorting,
> filtering, grouping and aggregation are answered by the worker, not by rows
> in this page. The CSRM twin of this tab is in `markets-grid-lab` on :5300 —
> run both to see what the engine changes. Read
> [the lab README](../../README.md) for the differences that matter.

**Bulk Update** replaces all selected cells in **one column** with the same value — text, number, or date.

## Toolbar

When `showBulkUpdateToolbar` is enabled:

1. Select cells in a single editable column (or one focused cell).
2. Enter or pick a value (distinct values dropdown when enabled).
3. Click **Apply**.

## Settings

Open **Settings → Bulk Update** for:

- Confirm threshold for large selections
- Single-column enforcement
- Distinct-value dropdown (max entries)
- Journal recording (works with **Edit History** undo/redo)

## Lab profiles

Import [`public/lab-profiles/bulk-update/`](../../public/lab-profiles/bulk-update/).

| Profile | Focus |
|---------|--------|
| 00 · Curriculum | Currency + qty + maturity editable |
| 01 · Text column | Ccy dropdown from distinct values |
| 02 · Date column | Maturity date input |
| 03 · Confirm threshold | Confirm when >5 cells |

## vs Smart Edit

Smart Edit applies **arithmetic** (× ÷ + −) on numeric cells. Bulk Update sets **one literal value** across the selection — the AdapTable bulk-replace workflow.
