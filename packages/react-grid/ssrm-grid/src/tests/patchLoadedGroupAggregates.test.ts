import { GRAND_TOTAL_ROW_ID } from "ag-grid-community";
import { describe, expect, it, vi } from "vitest";

import {
  patchGrandTotalFromEngine,
  patchLoadedGroupAggregatesFromEngine,
} from "../ssrm/patchLoadedGroupAggregates.js";
import { createCustomEngine } from "../engine/customEngine.js";

function engineWith(rows: Record<string, unknown>[]) {
  const engine = createCustomEngine();
  engine.configure({
    dataset: "main",
    schema: {},
    index: "id",
  });
  engine.setRowData("main", rows);
  return engine;
}

describe("patchLoadedGroupAggregatesFromEngine", () => {
  it("patches root group store with recomputed sums", () => {
    const engine = engineWith([
      { id: "1", book: "A", pnl: 10 },
      { id: "2", book: "A", pnl: 20 },
    ]);
    const apply = vi.fn();
    const api = {
      getRowGroupColumns: () => [
        { getColId: () => "book", getColDef: () => ({ field: "book" }) },
      ],
      getValueColumns: () => [
        {
          getColId: () => "pnl",
          getColDef: () => ({ field: "pnl", aggFunc: "sum" }),
          getAggFunc: () => "sum",
        },
      ],
      getFilterModel: () => ({}),
      isPivotMode: () => false,
      getServerSideGroupLevelState: () => [{ route: [] }],
      applyServerSideTransactionAsync: apply,
    };

    patchLoadedGroupAggregatesFromEngine(api as never, engine);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        route: [],
        update: expect.arrayContaining([
          expect.objectContaining({
            __ssrmGroupKey: "A",
            childCount: 2,
            pnl: 30,
          }),
        ]),
      }),
    );
  });

  it("no-ops on engines without trySyncRows", () => {
    const apply = vi.fn();
    const api = {
      getRowGroupColumns: () => [
        { getColId: () => "book", getColDef: () => ({ field: "book" }) },
      ],
      getValueColumns: () => [],
      getFilterModel: () => ({}),
      isPivotMode: () => false,
      getServerSideGroupLevelState: () => [{ route: [] }],
      applyServerSideTransactionAsync: apply,
    };
    patchLoadedGroupAggregatesFromEngine(api as never, { getRows: vi.fn() } as never);
    expect(apply).not.toHaveBeenCalled();
  });
});

describe("patchGrandTotalFromEngine", () => {
  it("updates grand total via GRAND_TOTAL_ROW_ID transaction", () => {
    const engine = engineWith([
      { id: "1", book: "A", pnl: 10 },
      { id: "2", book: "A", pnl: 20 },
    ]);
    const apply = vi.fn();
    const api = {
      getRowGroupColumns: () => [
        { getColId: () => "book", getColDef: () => ({ field: "book" }) },
      ],
      getValueColumns: () => [
        {
          getColId: () => "pnl",
          getColDef: () => ({ field: "pnl", aggFunc: "sum" }),
          getAggFunc: () => "sum",
        },
      ],
      getFilterModel: () => ({}),
      isPivotMode: () => false,
      applyServerSideTransactionAsync: apply,
    };

    patchGrandTotalFromEngine(api as never, engine, { idField: "id" });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({
      update: [{ id: GRAND_TOTAL_ROW_ID, pnl: 30 }],
    });
  });

  it("recomputes after leaf patches", () => {
    const engine = engineWith([
      { id: "1", book: "A", pnl: 10 },
      { id: "2", book: "A", pnl: 20 },
    ]);
    engine.updateRows("main", [{ id: "1", pnl: 100 }]);
    const apply = vi.fn();
    const api = {
      getRowGroupColumns: () => [],
      getValueColumns: () => [
        {
          getColId: () => "pnl",
          getColDef: () => ({ field: "pnl", aggFunc: "sum" }),
          getAggFunc: () => "sum",
        },
      ],
      getFilterModel: () => ({}),
      isPivotMode: () => false,
      applyServerSideTransactionAsync: apply,
    };

    patchGrandTotalFromEngine(api as never, engine, { idField: "id" });

    expect(apply).toHaveBeenCalledWith({
      update: [{ id: GRAND_TOTAL_ROW_ID, pnl: 120 }],
    });
  });

  it("skips transaction when grand total measures are unchanged", () => {
    const engine = engineWith([
      { id: "1", book: "A", pnl: 10 },
      { id: "2", book: "A", pnl: 20 },
    ]);
    const apply = vi.fn();
    const api = {
      getRowGroupColumns: () => [],
      getValueColumns: () => [
        {
          getColId: () => "pnl",
          getColDef: () => ({ field: "pnl", aggFunc: "sum" }),
          getAggFunc: () => "sum",
        },
      ],
      getFilterModel: () => ({}),
      isPivotMode: () => false,
      getRowNode: () => ({
        data: { id: GRAND_TOTAL_ROW_ID, pnl: 30 },
      }),
      applyServerSideTransactionAsync: apply,
    };

    patchGrandTotalFromEngine(api as never, engine, { idField: "id" });

    expect(apply).not.toHaveBeenCalled();
  });

  it("patches avg when raw mean moves even slightly", () => {
    const engine = engineWith([
      { id: "1", book: "A", price: 10 },
      { id: "2", book: "A", price: 10 },
    ]);
    engine.updateRows("main", [{ id: "1", price: 10.5 }]);
    const apply = vi.fn();
    const api = {
      getRowGroupColumns: () => [],
      getValueColumns: () => [
        {
          getColId: () => "price",
          getColDef: () => ({ field: "price", aggFunc: "avg" }),
          getAggFunc: () => "avg",
        },
      ],
      getFilterModel: () => ({}),
      isPivotMode: () => false,
      getRowNode: () => ({
        data: { id: GRAND_TOTAL_ROW_ID, price: 10 },
      }),
      applyServerSideTransactionAsync: apply,
    };

    patchGrandTotalFromEngine(api as never, engine, { idField: "id" });

    expect(apply).toHaveBeenCalledWith({
      update: [{ id: GRAND_TOTAL_ROW_ID, price: 10.25 }],
    });
  });

  it("applies quick filter and keep expression from extras", () => {
    const engine = engineWith([
      { id: "1", book: "FX", pnl: 10 },
      { id: "2", book: "EQ", pnl: 20 },
      { id: "3", book: "FX", pnl: -5 },
    ]);
    const apply = vi.fn();
    const api = {
      getRowGroupColumns: () => [],
      getValueColumns: () => [
        {
          getColId: () => "pnl",
          getColDef: () => ({ field: "pnl", aggFunc: "sum" }),
          getAggFunc: () => "sum",
        },
      ],
      getFilterModel: () => ({}),
      isPivotMode: () => false,
      applyServerSideTransactionAsync: apply,
    };

    patchGrandTotalFromEngine(api as never, engine, {
      idField: "id",
      quickFilterText: "FX",
      rowKeepExpression: '"pnl" > 0',
    });

    expect(apply).toHaveBeenCalledWith({
      update: [{ id: GRAND_TOTAL_ROW_ID, pnl: 10 }],
    });
  });
});
