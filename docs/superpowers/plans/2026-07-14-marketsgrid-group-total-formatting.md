# Group / grand-total Excel format + conditional style

**Goal:** Excel formatting and conditional styling apply on subgroup and grand-total rows (CSRM + SSRM), not only leaf rows.

## IN vs OUT

| # | Item | Status |
|---|------|--------|
| 1 | Wire `grandTotalRow` / `groupTotalRow` from general-settings into SSRM surface | **IN** |
| 2 | Virtual calc `valueGetter` reads `aggData` / stamped field on group + footer rows | **IN** |
| 3 | Conditional cell rules overlay `params.value` into `data[colId]` when missing | **IN** |
| 4 | Make leaf-field rules like `[midPrice] > 100` invent group semantics | **OUT** (needs share-of-total / different expression) |
| 5 | Phase 3 alerts | **OUT** |

## Verify

1. Calculated → **05 · Traffic light** — Group Sub-Total + Grand Total on (defaults).
2. CSRM: group / footer / grand total show 🟢🟡🔴 (not blank / raw).
3. Use SSRM: same; grand total row appears with folded RAG.
4. Optional: conditional rule `[trafficlight] = 1` paints green cells on group/footer too.
