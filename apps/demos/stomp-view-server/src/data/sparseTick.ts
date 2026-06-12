import type { PositionRecord } from "./fiRecords.js";

/** Headline blotter fields eligible for sparse live deltas. */
export const SPARSE_TICK_FIELDS = [
  "marketValue",
  "currentPrice",
  "pnl",
  "yield",
  "spread",
  "pv01",
  "dv01",
] as const;

export type SparseTickField = (typeof SPARSE_TICK_FIELDS)[number];

export type SparsePositionDelta = Partial<
  Pick<PositionRecord, SparseTickField>
> & {
  positionId: string;
};

/** Weighted draw for how many distinct fields change on one row tick. */
const FIELD_COUNT_WEIGHTS: readonly [count: number, weight: number][] = [
  [1, 0.32],
  [2, 0.26],
  [3, 0.18],
  [4, 0.12],
  [5, 0.07],
  [6, 0.03],
  [7, 0.02],
];

function random(): number {
  return Math.random();
}

function pickFieldCount(rng: () => number = random): number {
  const roll = rng();
  let cumulative = 0;
  for (const [count, weight] of FIELD_COUNT_WEIGHTS) {
    cumulative += weight;
    if (roll <= cumulative) return count;
  }
  return 1;
}

function shuffleFields(
  fields: readonly SparseTickField[],
  rng: () => number = random,
): SparseTickField[] {
  const copy = [...fields];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

function uniqueFields(fields: SparseTickField[]): SparseTickField[] {
  return [...new Set(fields)];
}

/**
 * Pick an erratic subset of headline fields. Correlation bundles mimic
 * real feeds (price moves often carry MV/PnL; spread shocks often carry
 * yield; risk fields sometimes move together).
 */
export function pickErraticFields(rng: () => number = random): SparseTickField[] {
  const count = pickFieldCount(rng);
  let fields = shuffleFields(SPARSE_TICK_FIELDS, rng).slice(0, count);

  if (fields.includes("currentPrice") && rng() < 0.65) {
    fields = uniqueFields([...fields, "marketValue", "pnl"]);
  }
  if (fields.includes("marketValue") && rng() < 0.4 && !fields.includes("pnl")) {
    fields.push("pnl");
  }
  if (fields.includes("spread") && rng() < 0.45) {
    if (rng() < 0.7 && !fields.includes("yield")) fields.push("yield");
  }
  if (fields.includes("yield") && rng() < 0.35 && !fields.includes("spread")) {
    fields.push("spread");
  }
  if (fields.includes("pv01") && rng() < 0.38 && !fields.includes("dv01")) {
    fields.push("dv01");
  }
  if (fields.includes("dv01") && rng() < 0.3 && !fields.includes("pv01")) {
    fields.push("pv01");
  }

  return uniqueFields(fields);
}

function applyFieldTick(
  row: PositionRecord,
  field: SparseTickField,
  rng: () => number,
): void {
  const jitter = () => (rng() - 0.5) * 2;

  switch (field) {
    case "currentPrice": {
      const notional = Number(row.notionalAmount) || 1;
      const price = Number(row.currentPrice) * (1 + jitter() * 0.01);
      row.currentPrice = Number(price.toFixed(4));
      row.marketValue = Math.round((notional * Number(row.currentPrice)) / 100);
      row.pnl = Math.round(
        Number(row.marketValue) - Number(row.bookValue ?? row.marketValue),
      );
      break;
    }
    case "marketValue": {
      const mv = Number(row.marketValue) * (1 + jitter() * 0.008);
      row.marketValue = Math.round(mv);
      row.pnl = Math.round(
        Number(row.marketValue) - Number(row.bookValue ?? row.marketValue),
      );
      break;
    }
    case "pnl": {
      row.pnl = Math.round(Number(row.pnl) + jitter() * 5000);
      break;
    }
    case "yield": {
      const y = Number(row.yield) * (1 + jitter() * 0.015);
      row.yield = Number(Math.max(0, y).toFixed(3));
      break;
    }
    case "spread": {
      row.spread = Math.round(Number(row.spread) + jitter() * 8);
      break;
    }
    case "pv01": {
      row.pv01 = Number(
        (Number(row.pv01) * (1 + jitter() * 0.04)).toFixed(2),
      );
      break;
    }
    case "dv01": {
      row.dv01 = Number(
        (Number(row.dv01) * (1 + jitter() * 0.04)).toFixed(2),
      );
      break;
    }
  }
}

/**
 * Mutate `row` in place for the erratic field subset and return a sparse
 * wire payload (`positionId` + changed fields only).
 */
export function sparseErraticTickPosition(
  row: PositionRecord,
  rng: () => number = random,
): SparsePositionDelta | null {
  const fields = pickErraticFields(rng);
  if (fields.length === 0) return null;

  const delta: SparsePositionDelta = { positionId: row.positionId };
  for (const field of fields) {
    applyFieldTick(row, field, rng);
    delta[field] = row[field] as PositionRecord[SparseTickField];
  }
  return delta;
}
