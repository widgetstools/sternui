import { describe, expect, it } from 'vitest';
import { createSsrmEngine } from './engine.js';
import { SSRM_CHILD_COUNT, type SsrmGetRowsRequest, type SsrmRow, type SsrmSchema } from './types.js';

/**
 * Differential fuzz against a brute-force oracle.
 *
 * This exists because of a specific, documented failure. A hand-rolled columnar
 * SSRM engine was evaluated on this project and had three critical defects,
 * **all in its optimised paths and none of them loud**:
 *
 *   - a removal-only frame that skipped compaction served ghost rows forever —
 *     invisible at small cardinality, always wrong at production scale;
 *   - an aggregation fast path missing its membership guard, so ticking a
 *     FILTERED-OUT row corrupted the group's sum;
 *   - an anti-drift recompute that ignored pending work, measured off by 1.65M
 *     by frame 436.
 *
 * Its own smoke test printed identical ticks with those defects present and
 * fixed. That is the point: a hand-written test asserts what the author already
 * believed. Only a differential run against an independent implementation, over
 * inputs nobody chose, catches the case the author did not think of.
 *
 * The oracle below is deliberately the STUPID implementation — plain objects,
 * `Array.prototype.filter`, `sort` and a `Map` — written to be obviously
 * correct rather than fast. When the two disagree, the engine is wrong.
 */

// A tiny deterministic PRNG: a failing seed is a reproducible bug report.
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const SCHEMA: SsrmSchema = {
  keyField: 'id',
  fields: [
    { field: 'id', type: 'string' },
    { field: 'desk', type: 'string' },
    { field: 'sector', type: 'string' },
    { field: 'px', type: 'number' },
    { field: 'qty', type: 'number' },
  ],
};

const DESKS = ['Rates', 'Credit', 'FX', null];
const SECTORS = ['Gov', 'IG', 'HY'];

function makeRow(random: () => number, id: string): SsrmRow {
  return {
    id,
    desk: DESKS[Math.floor(random() * DESKS.length)],
    sector: SECTORS[Math.floor(random() * SECTORS.length)],
    // Nulls on purpose: null handling in sort, filter and aggregate is where
    // engines disagree, and it is the thing a hand-written test forgets.
    px: random() < 0.15 ? null : Math.round(random() * 20000) / 100,
    qty: random() < 0.1 ? null : Math.floor(random() * 1000),
  };
}

/** The oracle: the whole book as plain objects, queried the obvious way. */
class Oracle {
  rows = new Map<string, SsrmRow>();

  upsert(batch: readonly SsrmRow[]): void {
    for (const row of batch) {
      const id = String(row.id);
      this.rows.set(id, { ...(this.rows.get(id) ?? {}), ...row });
    }
  }

  remove(keys: readonly string[]): void {
    for (const key of keys) this.rows.delete(key);
  }

  private filtered(request: SsrmGetRowsRequest): SsrmRow[] {
    let out = [...this.rows.values()];
    const model = request.filterModel ?? {};
    for (const field of Object.keys(model)) {
      const item = model[field];
      if (item.filterType === 'set') {
        const wanted = new Set((item.values ?? []).map((v) => (v === null ? null : String(v))));
        out = out.filter((r) => wanted.has(r[field] === null || r[field] === undefined ? null : String(r[field])));
      } else if (item.type === 'greaterThan') {
        const n = Number(item.filter);
        out = out.filter((r) => r[field] !== null && r[field] !== undefined && Number(r[field]) > n);
      } else if (item.type === 'lessThan') {
        const n = Number(item.filter);
        out = out.filter((r) => r[field] !== null && r[field] !== undefined && Number(r[field]) < n);
      } else if (item.type === 'blank') {
        out = out.filter((r) => r[field] === null || r[field] === undefined);
      }
    }
    // Ancestor keys.
    const groupCols = request.rowGroupCols ?? [];
    const groupKeys = request.groupKeys ?? [];
    for (let depth = 0; depth < groupKeys.length && depth < groupCols.length; depth++) {
      const field = groupCols[depth].id;
      const key = groupKeys[depth];
      out = out.filter((r) => {
        const value = r[field];
        if (key === null || key === undefined) return value === null || value === undefined;
        return value !== null && value !== undefined && String(value) === String(key);
      });
    }
    return out;
  }

  private sorted(rows: SsrmRow[], request: SsrmGetRowsRequest): SsrmRow[] {
    const model = request.sortModel ?? [];
    if (model.length === 0) return rows;
    /**
     * Tie-break on ORIGINAL ROW ORDER, which is what AG's client-side model
     * does and what the engine's row-offset tie-break means.
     *
     * The first version of this oracle tied on `id` instead, and the fuzz
     * failed on frame 1 — correctly. The tie-break is a real choice and both
     * implementations have to make the same one, or every equal-valued pair is
     * a spurious disagreement. Insertion order is the defensible choice: it is
     * stable across re-sorts, so a live tick cannot reshuffle equal rows under
     * the user's cursor.
     */
    const order = new Map([...this.rows.keys()].map((key, i) => [key, i] as const));
    return [...rows].sort((a, b) => {
      for (const spec of model) {
        const x = a[spec.colId];
        const y = b[spec.colId];
        const xNull = x === null || x === undefined;
        const yNull = y === null || y === undefined;
        if (xNull || yNull) {
          if (xNull && yNull) continue;
          return xNull ? 1 : -1;
        }
        if (x !== y) {
          const cmp = x < y ? -1 : 1;
          return spec.sort === 'desc' ? -cmp : cmp;
        }
      }
      return (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0);
    });
  }

  getRows(request: SsrmGetRowsRequest): { ids: string[]; rowCount: number } {
    const groupCols = request.rowGroupCols ?? [];
    const depth = (request.groupKeys ?? []).length;
    const rows = this.sorted(this.filtered(request), request);

    if (depth >= groupCols.length) {
      const start = request.startRow ?? 0;
      const end = request.endRow ?? rows.length;
      return { ids: rows.slice(start, end).map((r) => String(r.id)), rowCount: rows.length };
    }

    const field = groupCols[depth].id;
    const buckets = new Map<string, SsrmRow[]>();
    for (const row of rows) {
      const value = row[field];
      const key = value === null || value === undefined ? ' null' : String(value);
      const bucket = buckets.get(key) ?? [];
      bucket.push(row);
      buckets.set(key, bucket);
    }
    const keys = [...buckets.keys()].sort();
    return { ids: keys, rowCount: keys.length };
  }

  sum(request: SsrmGetRowsRequest, field: string): number | null {
    const values = this.filtered(request)
      .map((r) => r[field])
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0);
  }

  childCount(request: SsrmGetRowsRequest, groupField: string, key: string): number {
    return this.filtered(request).filter((r) => {
      const value = r[groupField];
      const asKey = value === null || value === undefined ? ' null' : String(value);
      return asKey === key;
    }).length;
  }
}

const FILTERS: SsrmGetRowsRequest['filterModel'][] = [
  null,
  { desk: { filterType: 'set', values: ['Rates', 'Credit'] } },
  { qty: { filterType: 'number', type: 'greaterThan', filter: 500 } },
  { px: { type: 'blank' } },
  {
    desk: { filterType: 'set', values: ['Rates', null] },
    qty: { filterType: 'number', type: 'lessThan', filter: 800 },
  },
];

const SORTS: SsrmGetRowsRequest['sortModel'][] = [
  undefined,
  [{ colId: 'qty', sort: 'asc' }],
  [{ colId: 'px', sort: 'desc' }],
  [{ colId: 'desk', sort: 'asc' }, { colId: 'qty', sort: 'desc' }],
];

describe('SsrmEngine — differential fuzz against a brute-force oracle', () => {
  it('agrees on every query shape across 250 mutation frames', () => {
    const random = rng(0xC0FFEE);
    const engine = createSsrmEngine({ schema: SCHEMA });
    const oracle = new Oracle();

    const ids: string[] = [];
    const seed: SsrmRow[] = [];
    for (let i = 0; i < 400; i++) {
      const id = `r${i}`;
      ids.push(id);
      seed.push(makeRow(random, id));
    }
    engine.applySnapshot(seed);
    oracle.upsert(seed);

    for (let frame = 0; frame < 250; frame++) {
      const roll = random();

      if (roll < 0.12 && ids.length > 20) {
        // REMOVAL-ONLY frames, deliberately. A compaction bug in the engine
        // evaluated on this project served ghost rows forever and only ever
        // showed up on a frame that removed and added nothing.
        const victims: string[] = [];
        const count = 1 + Math.floor(random() * 5);
        for (let i = 0; i < count; i++) {
          const at = Math.floor(random() * ids.length);
          victims.push(ids.splice(at, 1)[0]);
        }
        engine.applyRemove(victims);
        oracle.remove(victims);
      } else if (roll < 0.2) {
        const id = `n${frame}`;
        ids.push(id);
        const row = makeRow(random, id);
        engine.applyUpdate([row]);
        oracle.upsert([row]);
      } else {
        // A tick: sparse updates, some of which land on rows the active filters
        // exclude. That is the exact shape that corrupted a group's sum in the
        // engine evaluated here.
        const batch: SsrmRow[] = [];
        const count = 1 + Math.floor(random() * 12);
        for (let i = 0; i < count; i++) {
          const id = ids[Math.floor(random() * ids.length)];
          batch.push({
            id,
            px: random() < 0.1 ? null : Math.round(random() * 20000) / 100,
            ...(random() < 0.3 ? { qty: Math.floor(random() * 1000) } : {}),
            ...(random() < 0.15 ? { desk: DESKS[Math.floor(random() * DESKS.length)] } : {}),
          });
        }
        engine.applyUpdate(batch);
        oracle.upsert(batch);
      }

      // Compare on a rotating query shape so every frame checks something
      // different, and the whole matrix is covered many times over.
      const filterModel = FILTERS[frame % FILTERS.length];
      const sortModel = SORTS[frame % SORTS.length];

      // ── flat ──────────────────────────────────────────────────────────
      const flat: SsrmGetRowsRequest = { filterModel, sortModel, startRow: 0, endRow: 40 };
      const flatGot = engine.getRows(flat);
      const flatWant = oracle.getRows(flat);
      expect(flatGot.rowCount, `frame ${frame} flat rowCount`).toBe(flatWant.rowCount);
      expect(flatGot.rowData.map((r) => String(r.id)), `frame ${frame} flat rows`).toEqual(
        flatWant.ids,
      );

      // ── a deep window, which is where an off-by-one hides ──────────────
      const deep: SsrmGetRowsRequest = { filterModel, sortModel, startRow: 37, endRow: 61 };
      expect(
        engine.getRows(deep).rowData.map((r) => String(r.id)),
        `frame ${frame} deep window`,
      ).toEqual(oracle.getRows(deep).ids);

      // ── grouped level, its counts and its aggregate ────────────────────
      const grouped: SsrmGetRowsRequest = {
        filterModel,
        sortModel,
        rowGroupCols: [{ id: 'desk' }, { id: 'sector' }],
        groupKeys: [],
        valueCols: [{ id: 'qty', aggFunc: 'sum' }],
      };
      const groupedGot = engine.getRows(grouped);
      const groupedWant = oracle.getRows(grouped);
      expect(groupedGot.rowCount, `frame ${frame} group count`).toBe(groupedWant.rowCount);

      for (const row of groupedGot.rowData) {
        const key = row.desk === null || row.desk === undefined ? ' null' : String(row.desk);
        expect(row[SSRM_CHILD_COUNT], `frame ${frame} children of ${key}`).toBe(
          oracle.childCount(grouped, 'desk', key),
        );
        // The aggregate for THIS group, computed independently.
        const scoped: SsrmGetRowsRequest = {
          ...grouped,
          groupKeys: [row.desk],
        };
        const want = oracle.sum(scoped, 'qty');
        const got = row.qty as number | null;
        if (want === null) expect(got, `frame ${frame} sum of ${key}`).toBeNull();
        else expect(got as number, `frame ${frame} sum of ${key}`).toBeCloseTo(want, 6);
      }

      // ── the grand total tracks the filtered book ───────────────────────
      const total = engine.grandTotal({ filterModel, valueCols: [{ id: 'qty', aggFunc: 'sum' }] });
      const wantTotal = oracle.sum({ filterModel }, 'qty');
      if (wantTotal === null) expect(total.qty, `frame ${frame} grand total`).toBeNull();
      else expect(total.qty as number, `frame ${frame} grand total`).toBeCloseTo(wantTotal, 6);
    }
  });

  it('agrees after a churn of removals and re-adds under the same key', () => {
    // Re-adding a removed key is the case a tombstoned store gets wrong: the
    // offset is dead, and reviving it without clearing the old cells reads back
    // whatever the previous occupant left behind.
    const random = rng(7);
    const engine = createSsrmEngine({ schema: SCHEMA });
    const oracle = new Oracle();

    for (let frame = 0; frame < 120; frame++) {
      const id = `k${frame % 10}`;
      if (random() < 0.5) {
        engine.applyRemove([id]);
        oracle.remove([id]);
      } else {
        const row = makeRow(random, id);
        engine.applyUpdate([row]);
        oracle.upsert([row]);
      }
      const request: SsrmGetRowsRequest = { sortModel: [{ colId: 'qty', sort: 'asc' }] };
      expect(
        engine.getRows(request).rowData.map((r) => String(r.id)),
        `frame ${frame}`,
      ).toEqual(oracle.getRows(request).ids);
    }
  });
});
