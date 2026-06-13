import { describe, expect, it } from "vitest";
import type { PositionRecord } from "../data/fiRecords.js";
import { createSparseLiveBatcher } from "./sparseLiveBatcher.js";

function rows(n: number): PositionRecord[] {
  return Array.from({ length: n }, (_, i) => ({
    positionId: `POS-${i}`,
    cusip: "X",
    instrumentType: "Treasury",
    notionalAmount: 1_000_000,
    currentPrice: 100,
    marketValue: 1_000_000,
    bookValue: 990_000,
    pnl: 10_000,
    yield: 4,
    spread: 100,
    pv01: 1000,
    dv01: 1100,
  }));
}

describe("createSparseLiveBatcher", () => {
  it("returns a random subset capped by rowsPerTick jitter", () => {
    let seq = 0;
    const rng = () => {
      seq = (seq + 0.37) % 1;
      return seq;
    };
    const next = createSparseLiveBatcher({
      records: rows(20_000),
      rowsPerTick: 100,
      random: rng,
    });
    const batch = next();
    expect(batch.length).toBeGreaterThanOrEqual(1);
    expect(batch.length).toBeLessThanOrEqual(100);
    for (const delta of batch) {
      expect(delta.positionId).toMatch(/^POS-/);
      expect(Object.keys(delta).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("does not return full row payloads", () => {
    const next = createSparseLiveBatcher({
      records: rows(50),
      rowsPerTick: 10,
      random: () => 0.42,
    });
    const batch = next();
    for (const delta of batch) {
      expect(delta).not.toHaveProperty("cusip");
      expect(delta).not.toHaveProperty("instrumentType");
    }
  });
});
