# Smart Edit

> **This is the Perspective lab.** The grid below runs on
> `rowModel="perspective"`: the book lives once as a Table in the SharedWorker
> and this window reads only the blocks its viewport asks for. Sorting,
> filtering, grouping and aggregation are answered by the worker, not by rows
> in this page. The CSRM twin of this tab is in `markets-grid-lab` on :5300 —
> run both to see what the engine changes. Read
> [the lab README](../../README.md) for the differences that matter.

Bulk update and arithmetic editing for numeric columns.

> **Primary demo:** use the unified **[Editing](./editing.md)** tab for all editing modules together. This page describes Smart Edit in isolation.

## Try it

1. Open the **Smart Edit** tab — stream is **paused** so edits are not overwritten by ticks.
2. Drag-select cells in **Quantity** or **Mid** (editable columns).
3. Enter an **operand** (e.g. `0.5`) and click **×** to halve values.
4. Click **Set…** to bulk-set all selected cells to one value (supports `1.5M` in the dialog if shortcuts are on).
5. Focus a qty cell (not editing) and press **`+`** / **`-`** to increment/decrement by the step in Settings → Smart Edit.
6. Double-click a cell and type **`1.5M`** then Enter — parses to `1,500,000` when magnitude shortcuts are enabled.

## Settings

Open **Grid Options** (settings gear) → **Smart Edit** module (`06`) to toggle ops, increment step, K/M/B shortcuts, and confirm threshold.

Import [`public/lab-profiles/smart-edit/`](../../public/lab-profiles/smart-edit/).
