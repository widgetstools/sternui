/**
 * IG corporate axe blotter — seed data + linkage rules + fat-finger
 * thresholds. Pure data; no React, no AG-Grid.
 */

/** Cell pending-state token surfaced into row data so the conditional-
 *  styling module's expression engine can match on it. The buffer
 *  remains the source of truth — these mirror it for read-only style
 *  evaluation. Underscore prefix keeps them out of any column UI. */
export type CellPendingTag =
  | ''
  | 'pending'      // VALID, no warn
  | 'warn'         // VALID with warn message (Δ > warn but ≤ reject)
  | 'committing'   // commit Phase 2 — round-trip in flight
  | 'committed'    // commit Phase 3 — green flash
  | 'rejected'     // failed validation
  | 'conflict';    // streamer ticked underlying while edit was pending

export interface AxeRow {
  id: string;
  cusip: string;
  issuer: string;
  /** 'B' = buy axe, 'S' = sell axe. */
  side: 'B' | 'S';
  /** Size in millions (face value). */
  size: number;
  bid: number;
  ask: number;
  /** Spread vs benchmark in basis points. */
  spread: number;
  yield: number;
  last: number;
  /** Internal model fair value. */
  model: number;
  // Pending-state shadow fields. Populated by syncBufferToRows() in App.tsx
  // on every buffer change; consumed by conditional-styling rules in
  // buildAxeProfile.ts. Out-of-band fields — never displayed in a column.
  __p_bid?: CellPendingTag;
  __p_ask?: CellPendingTag;
  __p_spread?: CellPendingTag;
  __p_size?: CellPendingTag;
}

/** Per-column edit policy: warn / reject thresholds + tick size. */
export interface ColumnPolicy {
  /** Δ above which we surface a warning toast but accept the edit. */
  warn: number;
  /** Δ above which we hard-reject (fat-finger guard). */
  reject: number;
  /** Display unit shown in toasts. */
  unit: 'pts' | 'bp' | 'mm';
  /** Tick increment used by Alt+↑/↓ range tick. */
  tick: number;
  /** Decimal places kept when writing pending values. */
  precision: number;
}

export const POLICY: Record<string, ColumnPolicy> = {
  bid:    { warn: 1.0, reject: 3.0, unit: 'pts', tick: 0.125, precision: 3 },
  ask:    { warn: 1.0, reject: 3.0, unit: 'pts', tick: 0.125, precision: 3 },
  spread: { warn: 10,  reject: 25,  unit: 'bp',  tick: 0.5,   precision: 1 },
  size:   { warn: 50,  reject: 999, unit: 'mm',  tick: 1,     precision: 0 },
};

/**
 * Linkage rules — when one column changes, derive sibling values to
 * preserve invariants (bid/ask spread, derived re-pricing).
 */
export type LinkageStrategy =
  | { kind: 'preserve_spread'; paired: readonly string[] }
  | { kind: 'derive_anchor'; derive: (newValue: number, row: AxeRow) => Partial<AxeRow> };

export const LINKAGE: Record<string, LinkageStrategy> = {
  // bid ↔ ask: move the paired column by the same delta to preserve spread.
  bid: { kind: 'preserve_spread', paired: ['ask'] },
  ask: { kind: 'preserve_spread', paired: ['bid'] },
  // Spread is the IG-corporate anchor cell — triangular {price, spread, yield}
  // per the architecture matrix. A 1bp tightening lifts price ~0.05 pts on a
  // typical 5y duration; yield moves 1:1 with spread (assuming benchmark steady).
  spread: {
    kind: 'derive_anchor',
    derive: (newSpread, row) => {
      const dSpread = newSpread - row.spread;
      const dPrice = -dSpread * 0.05;
      const dYield = dSpread / 100; // bp → percentage points
      return {
        bid:   round(row.bid + dPrice, 3),
        yield: round(row.yield + dYield, 3),
      };
    },
  },
};

export function round(v: number, dp: number): number {
  const p = Math.pow(10, dp);
  return Math.round(v * p) / p;
}

export const SEED_ROWS: AxeRow[] = [
  { id: 'r1',  cusip: '037833DT8', issuer: 'AAPL 4.65 02/29',  side: 'B', size: 5,  bid: 99.875,  ask: 100.000, spread: 78,  yield: 4.75, last: 99.85,  model: 99.88  },
  { id: 'r2',  cusip: '459200JX0', issuer: 'IBM 4.50 02/26',   side: 'B', size: 10, bid: 99.250,  ask: 99.375,  spread: 92,  yield: 4.92, last: 99.20,  model: 99.27  },
  { id: 'r3',  cusip: '594918BR4', issuer: 'MSFT 3.30 02/27',  side: 'S', size: 3,  bid: 96.500,  ask: 96.625,  spread: 65,  yield: 4.21, last: 96.51,  model: 96.55  },
  { id: 'r4',  cusip: '478160CN2', issuer: 'JNJ 4.95 06/33',   side: 'B', size: 7,  bid: 101.125, ask: 101.250, spread: 88,  yield: 4.81, last: 101.10, model: 101.13 },
  { id: 'r5',  cusip: '14913R2D9', issuer: 'CAT 5.20 09/31',   side: 'B', size: 5,  bid: 102.000, ask: 102.125, spread: 105, yield: 4.95, last: 101.97, model: 102.02 },
  { id: 'r6',  cusip: '24422EUM9', issuer: 'JD 4.10 03/30',    side: 'S', size: 2,  bid: 95.875,  ask: 96.000,  spread: 145, yield: 5.35, last: 95.85,  model: 95.90  },
  { id: 'r7',  cusip: '254687FK7', issuer: 'DIS 3.80 05/29',   side: 'B', size: 8,  bid: 96.250,  ask: 96.375,  spread: 110, yield: 5.05, last: 96.22,  model: 96.26  },
  { id: 'r8',  cusip: '345370DA0', issuer: 'F 4.95 03/30',     side: 'B', size: 12, bid: 94.500,  ask: 94.750,  spread: 215, yield: 6.15, last: 94.45,  model: 94.55  },
  { id: 'r9',  cusip: '375558BS4', issuer: 'GILD 5.25 12/29',  side: 'S', size: 4,  bid: 100.625, ask: 100.750, spread: 95,  yield: 5.05, last: 100.62, model: 100.65 },
  { id: 'r10', cusip: '38141GVR1', issuer: 'GS 4.75 02/29',    side: 'B', size: 15, bid: 99.500,  ask: 99.625,  spread: 118, yield: 5.10, last: 99.48,  model: 99.52  },
];
