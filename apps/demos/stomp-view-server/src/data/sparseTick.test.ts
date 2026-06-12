import { describe, expect, it } from "vitest";
import type { PositionRecord } from "./fiRecords.js";
import {
  SPARSE_TICK_FIELDS,
  pickErraticFields,
  sparseErraticTickPosition,
} from "./sparseTick.js";

function sampleRow(): PositionRecord {
  return {
    positionId: "POS-test-1",
    cusip: "TEST12345",
    instrumentType: "Corporate",
    notionalAmount: 1_000_000,
    currentPrice: 100,
    marketValue: 1_000_000,
    bookValue: 990_000,
    pnl: 10_000,
    yield: 4.5,
    spread: 120,
    pv01: 5000,
    dv01: 5200,
  };
}

describe("pickErraticFields", () => {
  it("returns 1–7 known headline fields", () => {
    const rng = () => 0.1;
    for (let i = 0; i < 20; i++) {
      const fields = pickErraticFields(rng);
      expect(fields.length).toBeGreaterThanOrEqual(1);
      expect(fields.length).toBeLessThanOrEqual(SPARSE_TICK_FIELDS.length);
      for (const f of fields) {
        expect(SPARSE_TICK_FIELDS).toContain(f);
      }
    }
  });

  it("can expand price picks to marketValue and pnl", () => {
    let n = 0;
    const rng = () => {
      n++;
      if (n === 1) return 0;
      if (n === 2) return 0;
      return 0.1;
    };
    const fields = pickErraticFields(rng);
    if (fields.includes("currentPrice")) {
      expect(fields).toContain("marketValue");
      expect(fields).toContain("pnl");
    }
  });
});

describe("sparseErraticTickPosition", () => {
  it("returns positionId plus only selected fields", () => {
    const row = sampleRow();
    const delta = sparseErraticTickPosition(row, () => 0.05);
    expect(delta).not.toBeNull();
    expect(delta!.positionId).toBe("POS-test-1");
    const keys = Object.keys(delta!).filter((k) => k !== "positionId");
    expect(keys.length).toBeGreaterThanOrEqual(1);
    for (const key of keys) {
      expect(SPARSE_TICK_FIELDS).toContain(
        key as (typeof SPARSE_TICK_FIELDS)[number],
      );
    }
  });

  it("mutates the in-memory row for each selected field", () => {
    const row = sampleRow();
    const delta = sparseErraticTickPosition(row, () => 0.05);
    expect(delta).not.toBeNull();
    for (const key of Object.keys(delta!)) {
      if (key === "positionId") continue;
      expect(row[key as keyof PositionRecord]).toEqual(
        delta![key as keyof typeof delta],
      );
    }
  });
});
