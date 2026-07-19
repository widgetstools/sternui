import { describe, expect, it } from "vitest";

import {
  SSRM_STRUCTURAL_GRID_OPTION_KEYS,
  stripSsrmStructuralGridOptions,
} from "../custom/ssrmGridOptionsPassthrough.js";

describe("stripSsrmStructuralGridOptions", () => {
  it("passes panel-controlled options through", () => {
    const out = stripSsrmStructuralGridOptions({
      rowSelection: { mode: "multiRow" },
      selectionColumnDef: { pinned: "left" },
      pagination: true,
      paginationPageSize: 250,
      singleClickEdit: true,
      rowGroupPanelShow: "never",
      groupDefaultExpanded: 1,
      enableCellTextSelection: true,
      undoRedoCellEditing: false,
    });
    expect(out).toEqual({
      rowSelection: { mode: "multiRow" },
      selectionColumnDef: { pinned: "left" },
      pagination: true,
      paginationPageSize: 250,
      singleClickEdit: true,
      rowGroupPanelShow: "never",
      groupDefaultExpanded: 1,
      enableCellTextSelection: true,
      undoRedoCellEditing: false,
    });
  });

  it("strips row-model wiring, tuning, handlers, and surface-prop keys", () => {
    const out = stripSsrmStructuralGridOptions({
      rowData: [],
      rowModelType: "clientSide",
      serverSideDatasource: {},
      getRowId: () => "x",
      cacheBlockSize: 5,
      suppressAnimationFrame: false,
      onGridReady: () => undefined,
      onCellValueChanged: () => undefined,
      context: {},
      theme: {},
      defaultColDef: { flex: 2 },
      statusBar: { statusPanels: [] },
      sideBar: false,
      quickFilterText: "abc",
      pivotMode: true,
      rowDragManaged: true,
      grandTotalRow: "bottom",
      // one survivor proves it is a filter, not a wipe
      accentedSort: true,
    });
    expect(out).toEqual({ accentedSort: true });
  });

  it("does not mutate the input", () => {
    const input = { rowModelType: "clientSide", accentedSort: true };
    stripSsrmStructuralGridOptions(input);
    expect(input).toEqual({ rowModelType: "clientSide", accentedSort: true });
  });

  it("every structural key is actually stripped", () => {
    const input = Object.fromEntries(
      SSRM_STRUCTURAL_GRID_OPTION_KEYS.map((k) => [k, "x"]),
    );
    expect(stripSsrmStructuralGridOptions(input)).toEqual({});
  });
});
