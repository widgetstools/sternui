import { describe, expect, it } from "vitest";

import {
  formatShareOfTotal,
  resolveAggregate,
  shareExceeds,
  shareOfAggregate,
  shareOfTotal,
} from "../ssrm/shareOfTotal.js";

describe("shareOfTotal / shareOfAggregate", () => {
  it("uses __ssrm_aggs for any aggFunc (sum/avg/max)", () => {
    const data = {
      pnl: 25,
      __ssrm_aggs: {
        pnl: { sum: 100, avg: 10, max: 40, min: -5, count: 10 },
      },
    };
    expect(shareOfTotal(25, "pnl", data)).toBe(0.25);
    expect(shareOfAggregate(25, "pnl", "avg", data)).toBe(2.5);
    expect(shareOfAggregate(25, "pnl", "max", data)).toBe(0.625);
    expect(resolveAggregate("pnl", "min", data)).toBe(-5);
    expect(formatShareOfTotal(25, "pnl", { data })).toBe("25.00%");
    expect(shareExceeds(25, "pnl", 0.2, { data })).toBe(true);
  });

  it("falls back to legacy __ssrm_sums / context.totals for sum", () => {
    expect(
      shareOfTotal(10, "pnl", { __ssrm_sums: { pnl: 50 } }),
    ).toBe(0.2);
    expect(
      shareOfTotal(10, "pnl", {}, { totals: { pnl: 50 } }),
    ).toBe(0.2);
  });
});
