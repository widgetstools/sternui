import { describe, expect, it } from "vitest";
import { pickDistinctIndices } from "./sample.js";

describe("pickDistinctIndices", () => {
  it("returns the requested count of distinct in-range indices", () => {
    const out = pickDistinctIndices(5, 100);
    expect(out).toHaveLength(5);
    expect(new Set(out).size).toBe(5);
    for (const i of out) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(100);
    }
  });

  it("returns every index when count >= length", () => {
    expect(pickDistinctIndices(10, 3).sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it("returns empty for non-positive count or length", () => {
    expect(pickDistinctIndices(0, 100)).toEqual([]);
    expect(pickDistinctIndices(5, 0)).toEqual([]);
  });

  it("is deterministic under an injected rng", () => {
    // rng cycles 0, 0.5, 0.25 → indices 0, 5, 2 in a length-10 array.
    const seq = [0, 0.5, 0.25];
    let i = 0;
    const rng = () => seq[i++ % seq.length]!;
    expect(pickDistinctIndices(3, 10, rng)).toEqual([0, 5, 2]);
  });
});
