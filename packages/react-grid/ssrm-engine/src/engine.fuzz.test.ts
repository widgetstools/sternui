import { describe, expect, it } from 'vitest';
import { createSsrmEngine } from './engine.js';
import {
  SSRM_CHILD_COUNT,
  SSRM_TREE_GROUP,
  SSRM_TREE_KEY,
  type SsrmGetRowsRequest,
  type SsrmRow,
  type SsrmSchema,
} from './types.js';

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

/**
 * Absent for the purposes of ORDERING.
 *
 * NaN is a value a feed can send and the store keeps it as one — it is not
 * null, it is not blank, and an aggregate skips it. But it has no position on
 * the number line, so the engine's contract is that it sorts with the nulls:
 * LAST in both directions. A NaN that sorted first on a descending price column
 * is "no quote" above the best bid, which is the same failure the null
 * direction-multiplier bug produced.
 */
function unordered(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value));
}

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

/**
 * One aggregate over plain rows. Nulls and NaN are SKIPPED rather than counted
 * as zero — a null price is an absent quote, and a sum that counted it would
 * under-report.
 */
function reduce(rows: readonly SsrmRow[], field: string, fn: 'sum' | 'max'): number | null {
  const values: number[] = [];
  for (const row of rows) {
    const value = row[field];
    if (typeof value === 'number' && !Number.isNaN(value)) values.push(value);
  }
  if (values.length === 0) return null;
  if (fn === 'sum') return values.reduce((a, b) => a + b, 0);
  let max = values[0];
  for (const value of values) if (value > max) max = value;
  return max;
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
        const xNull = unordered(x);
        const yNull = unordered(y);
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

    const buckets = this.buckets(request, groupCols[depth].id);
    return { ids: buckets.map((b) => b.bucketKey), rowCount: buckets.length };
  }

  /**
   * The level's group rows, in the order the engine's contract says.
   *
   * Ordered by the sort entry naming the GROUP column — a sort on a leaf column
   * cannot order groups, so it is ignored — with nulls last in BOTH directions,
   * the same rule the leaf sort follows.
   *
   * Weaker than the rest of this oracle, and worth saying so: group ORDER has
   * no obvious independent definition, so this restates a documented rule
   * rather than deriving one. It catches a group level that stops obeying it;
   * it cannot catch the rule itself being wrong.
   */
  buckets(
    request: SsrmGetRowsRequest,
    field: string,
  ): { key: unknown; bucketKey: string; members: SsrmRow[] }[] {
    const rows = this.sorted(this.filtered(request), request);
    const map = new Map<string, { key: unknown; bucketKey: string; members: SsrmRow[] }>();
    for (const row of rows) {
      const raw = row[field];
      const value = raw === undefined ? null : raw;
      const bucketKey = value === null ? ' null' : String(value);
      let bucket = map.get(bucketKey);
      if (bucket === undefined) {
        bucket = { key: value, bucketKey, members: [] };
        map.set(bucketKey, bucket);
      }
      bucket.members.push(row);
    }

    const entry = (request.sortModel ?? []).find((s) => s.colId === field);
    const dir = entry?.sort === 'desc' ? -1 : 1;
    return [...map.values()].sort((a, b) => {
      if (a.key === b.key) return 0;
      if (a.key === null) return 1;
      if (b.key === null) return -1;
      return ((a.key as never) < (b.key as never) ? -1 : 1) * dir;
    });
  }

  /**
   * The pivot cells one set of rows produces: every combination of the pivot
   * columns' values x every value column.
   *
   * The combinations come from the LEVEL, not from the group — so a group with
   * no rows for a combination still carries that cell, holding null. Getting
   * that wrong is a ragged result AG cannot build secondary columns from.
   */
  pivot(
    request: SsrmGetRowsRequest,
    pivotFields: readonly string[],
    aggs: readonly { field: string; fn: 'sum' | 'max' }[],
  ): { fields: string[]; cells(members: readonly SsrmRow[]): Record<string, unknown> } {
    const comboKey = (row: SsrmRow): string =>
      pivotFields
        .map((f) => (row[f] === null || row[f] === undefined ? '' : String(row[f])))
        .join('_');

    const combos = [...new Set(this.sorted(this.filtered(request), request).map(comboKey))].sort();
    const fields: string[] = [];
    for (const combo of combos) for (const agg of aggs) fields.push(`${combo}_${agg.field}`);

    return {
      fields,
      cells(members) {
        const out: Record<string, unknown> = {};
        for (const combo of combos) {
          const inCombo = members.filter((row) => comboKey(row) === combo);
          for (const agg of aggs) {
            out[`${combo}_${agg.field}`] = reduce(inCombo, agg.field, agg.fn);
          }
        }
        return out;
      },
    };
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
    /**
     * The same book under TREE mode, fed identically.
     *
     * `treeFields` is a construction option, so tree cannot be a per-request
     * variation of the engine above. Every mutation goes to both, which is also
     * the check that the two configurations do not diverge on a shared store.
     */
    const treeEngine = createSsrmEngine({ schema: SCHEMA, treeFields: ['desk', 'sector'] });
    const oracle = new Oracle();

    const write = (rows: readonly SsrmRow[]): void => {
      engine.applyUpdate(rows);
      treeEngine.applyUpdate(rows);
      oracle.upsert(rows);
    };
    const erase = (keys: readonly string[]): void => {
      engine.applyRemove(keys);
      treeEngine.applyRemove(keys);
      oracle.remove(keys);
    };

    const ids: string[] = [];
    const seed: SsrmRow[] = [];
    for (let i = 0; i < 400; i++) {
      const id = `r${i}`;
      ids.push(id);
      seed.push(makeRow(random, id));
    }
    engine.applySnapshot(seed);
    treeEngine.applySnapshot(seed);
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
        erase(victims);
      } else if (roll < 0.2) {
        const id = `n${frame}`;
        ids.push(id);
        write([makeRow(random, id)]);
      } else {
        // A tick: sparse updates, some of which land on rows the active filters
        // exclude. That is the exact shape that corrupted a group's sum in the
        // engine evaluated here.
        const batch: SsrmRow[] = [];
        const count = 1 + Math.floor(random() * 12);
        for (let i = 0; i < count; i++) {
          const id = ids[Math.floor(random() * ids.length)];
          const roll2 = random();
          batch.push({
            id,
            // A bad tick, on purpose. NaN is not null and the store keeps it as
            // a value, so it reaches the comparator — where it either sorts with
            // the nulls or poisons the order.
            px: roll2 < 0.04 ? Number.NaN : roll2 < 0.14 ? null : Math.round(random() * 20000) / 100,
            ...(random() < 0.3 ? { qty: Math.floor(random() * 1000) } : {}),
            ...(random() < 0.15 ? { desk: DESKS[Math.floor(random() * DESKS.length)] } : {}),
          });
        }
        write(batch);
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
      // The ORDER too, not only the count: group rows are ordered by the sort
      // entry naming the group column, nulls last in both directions.
      expect(
        groupedGot.rowData.map((r) => (r.desk === null ? ' null' : String(r.desk))),
        `frame ${frame} group order`,
      ).toEqual(groupedWant.ids);

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

      // ── pivot: desk x sector, two value columns ────────────────────────
      // Unit-tested only until this session. A pivot result is a GENERATED
      // column set, so a wrong cell here is a column AG builds and fills with a
      // number nobody can trace back to a row.
      const pivotAggs = [
        { field: 'qty', fn: 'sum' as const },
        { field: 'px', fn: 'max' as const },
      ];
      const pivoted: SsrmGetRowsRequest = {
        filterModel,
        sortModel,
        rowGroupCols: [{ id: 'desk' }],
        groupKeys: [],
        pivotMode: true,
        pivotCols: [{ id: 'sector' }],
        valueCols: [
          { id: 'qty', aggFunc: 'sum' },
          { id: 'px', aggFunc: 'max' },
        ],
      };
      const pivotGot = engine.getRows(pivoted);
      const pivotWant = oracle.pivot(pivoted, ['sector'], pivotAggs);
      expect(pivotGot.pivotResultFields, `frame ${frame} pivot fields`).toEqual(pivotWant.fields);

      const pivotBuckets = oracle.buckets(pivoted, 'desk');
      expect(pivotGot.rowCount, `frame ${frame} pivot groups`).toBe(pivotBuckets.length);
      for (let i = 0; i < pivotGot.rowData.length; i++) {
        const row = pivotGot.rowData[i];
        const bucket = pivotBuckets[i];
        expect(row.desk ?? null, `frame ${frame} pivot group ${i}`).toEqual(bucket.key);
        const want = pivotWant.cells(bucket.members);
        for (const field of pivotWant.fields) {
          const got = row[field] as number | null;
          if (want[field] === null) expect(got, `frame ${frame} pivot ${bucket.bucketKey}.${field}`).toBeNull();
          else
            expect(got as number, `frame ${frame} pivot ${bucket.bucketKey}.${field}`).toBeCloseTo(
              want[field] as number,
              6,
            );
        }
      }
      // The level's own pivoted totals, over every member rather than a group's.
      const levelWant = pivotWant.cells(oracle.buckets(pivoted, 'desk').flatMap((b) => b.members));
      for (const field of pivotWant.fields) {
        const got = (pivotGot.groupLevelInfo ?? {})[field] as number | null;
        if (levelWant[field] === null) expect(got, `frame ${frame} pivot total ${field}`).toBeNull();
        else expect(got as number, `frame ${frame} pivot total ${field}`).toBeCloseTo(levelWant[field] as number, 6);
      }

      // ── tree: the same hierarchy, read off the DATA ────────────────────
      // AG sends no `rowGroupCols` in tree mode, so the shape below is what a
      // tree grid actually asks for. The oracle is asked the GROUPED question:
      // a tree level must be the same rows as the equivalent group level, with
      // the markers AG reads the hierarchy from stamped on.
      const treeShape: SsrmGetRowsRequest = { filterModel, sortModel };
      const treeAsGroup: SsrmGetRowsRequest = {
        ...treeShape,
        rowGroupCols: [{ id: 'desk' }, { id: 'sector' }],
        groupKeys: [],
      };
      const treeTop = treeEngine.getRows(treeShape);
      const treeWant = oracle.buckets(treeAsGroup, 'desk');
      expect(treeTop.rowCount, `frame ${frame} tree top count`).toBe(treeWant.length);
      expect(
        treeTop.rowData.map((r) => (r.desk === null ? ' null' : String(r.desk))),
        `frame ${frame} tree top order`,
      ).toEqual(treeWant.map((b) => b.bucketKey));
      for (let i = 0; i < treeTop.rowData.length; i++) {
        const row = treeTop.rowData[i];
        // Without these AG shows a flat list: it reads the hierarchy off the
        // data, and a parent row that does not say it is one has no children.
        expect(row[SSRM_TREE_GROUP], `frame ${frame} tree marker`).toBe(true);
        expect(row[SSRM_TREE_KEY], `frame ${frame} tree key`).toBe(
          treeWant[i].key === null ? '' : String(treeWant[i].key),
        );
        expect(row[SSRM_CHILD_COUNT], `frame ${frame} tree children`).toBe(treeWant[i].members.length);
      }

      // One level down, then its leaves — where a tree request differs from a
      // group request by nothing but the absence of `rowGroupCols`.
      if (treeWant.length > 0) {
        const parent = treeWant[frame % treeWant.length];
        const childShape: SsrmGetRowsRequest = { ...treeShape, groupKeys: [parent.key] };
        const childWant = oracle.buckets(
          { ...treeAsGroup, groupKeys: [parent.key] },
          'sector',
        );
        const childGot = treeEngine.getRows(childShape);
        expect(childGot.rowCount, `frame ${frame} tree children of ${parent.bucketKey}`).toBe(
          childWant.length,
        );
        expect(
          childGot.rowData.map((r) => (r.sector === null ? ' null' : String(r.sector))),
          `frame ${frame} tree child order`,
        ).toEqual(childWant.map((b) => b.bucketKey));

        if (childWant.length > 0) {
          const leaf = childWant[frame % childWant.length];
          const leafGot = treeEngine.getRows({
            ...treeShape,
            groupKeys: [parent.key, leaf.key],
          });
          expect(
            leafGot.rowData.map((r) => String(r.id)),
            `frame ${frame} tree leaves`,
          ).toEqual(leaf.members.map((r) => String(r.id)));
          // A leaf row must NOT claim to be a parent, or AG paints an expander
          // on a row with nothing under it and asks for its children forever.
          for (const row of leafGot.rowData) {
            expect(row[SSRM_TREE_GROUP], `frame ${frame} leaf marker`).toBeUndefined();
          }
        }
      }

      // ── the grand total tracks the filtered book ───────────────────────
      const total = engine.grandTotal({ filterModel, valueCols: [{ id: 'qty', aggFunc: 'sum' }] });
      const wantTotal = oracle.sum({ filterModel }, 'qty');
      if (wantTotal === null) expect(total.qty, `frame ${frame} grand total`).toBeNull();
      else expect(total.qty as number, `frame ${frame} grand total`).toBeCloseTo(wantTotal, 6);
    }
  });

  /**
   * The minimal case behind a fuzz failure on frame 6, reduced by hand so the
   * disagreement is legible without the seed.
   *
   * A NaN price sorted FIRST on a descending sort. The engine's stated rule is
   * that NaN orders with the nulls — and nulls are last in both directions,
   * because a direction multiplier applied to an "absent" verdict is exactly the
   * bug the null path was fixed for. `compareValues` returned that verdict as an
   * ordinary comparison, so `cmp * dir` inverted it and "no quote" sorted above
   * the best bid.
   */
  it('sorts NaN with the nulls in both directions', () => {
    const engine = createSsrmEngine({ schema: SCHEMA });
    engine.applySnapshot([
      { id: 'low', desk: 'FX', sector: 'Gov', px: 1, qty: 1 },
      { id: 'nan', desk: 'FX', sector: 'Gov', px: Number.NaN, qty: 1 },
      { id: 'high', desk: 'FX', sector: 'Gov', px: 9, qty: 1 },
      { id: 'null', desk: 'FX', sector: 'Gov', px: null, qty: 1 },
    ]);

    expect(
      engine.getRows({ sortModel: [{ colId: 'px', sort: 'asc' }] }).rowData.map((r) => r.id),
    ).toEqual(['low', 'high', 'nan', 'null']);
    expect(
      engine.getRows({ sortModel: [{ colId: 'px', sort: 'desc' }] }).rowData.map((r) => r.id),
    ).toEqual(['high', 'low', 'nan', 'null']);
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
