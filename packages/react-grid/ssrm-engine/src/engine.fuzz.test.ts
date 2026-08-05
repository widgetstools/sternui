import { describe, expect, it } from 'vitest';
import { createSsrmEngine } from './engine.js';
import type { SsrmCalcColumnDef, SsrmExpressionNode } from './calcAst.js';
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

/**
 * Compare two PRESENT sort keys, written from AG Grid's own
 * `_defaultComparator` (`ag-stack`) rather than from the engine.
 *
 * The reason it is not `x < y ? -1 : 1` — which is what this oracle used while
 * only store columns were sortable — is that a CALCULATED column has no type.
 * `IF([px] > 4, [desk], [px])` is a string on some rows and a number on others,
 * and AG answers **0** for such a pair because both `>` and `<` are false. The
 * engine reproduces that so the same expression orders identically on the
 * client-side row model; the oracle has to know it independently or every
 * cross-type pair is a spurious disagreement.
 */
function agCompare(x: unknown, y: unknown): number {
  if ((x as number) > (y as number)) return 1;
  if ((x as number) < (y as number)) return -1;
  return 0;
}

/** The oracle: the whole book as plain objects, queried the obvious way. */
class Oracle {
  rows = new Map<string, SsrmRow>();
  /**
   * The calculated columns currently installed, stamped onto every row before
   * a query touches it.
   *
   * That is the whole of what session 5 means: a calculated column is not a
   * special case in a filter or a sort, it is a value the row has. The oracle
   * models it the stupid way — evaluate it onto a copy of the row and then run
   * exactly the same filter, sort, bucket and aggregate code as before.
   */
  calcDefs: readonly SsrmCalcColumnDef[] = [];

  upsert(batch: readonly SsrmRow[]): void {
    for (const row of batch) {
      const id = String(row.id);
      this.rows.set(id, { ...(this.rows.get(id) ?? {}), ...row });
    }
  }

  remove(keys: readonly string[]): void {
    for (const key of keys) this.rows.delete(key);
  }

  /** Every row with its calculated cells on it. */
  private stamped(): SsrmRow[] {
    const out: SsrmRow[] = [];
    for (const row of this.rows.values()) {
      if (this.calcDefs.length === 0) {
        out.push(row);
        continue;
      }
      const copy = { ...row };
      for (const def of this.calcDefs) copy[def.colId] = oracleEval(def.ast, row);
      out.push(copy);
    }
    return out;
  }

  private filtered(request: SsrmGetRowsRequest): SsrmRow[] {
    let out = this.stamped();
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
        const cmp = agCompare(x, y);
        // 0 means this column could not separate them — equal, or a cross-type
        // pair AG ties — so fall through to the next sort column.
        if (cmp !== 0) return spec.sort === 'desc' ? -cmp : cmp;
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
    // Absent — null OR NaN — last in BOTH directions, and never multiplied by
    // the direction. A calculated group key can be a NaN, and the comparator
    // this replaced put one at the TOP of a descending group.
    return [...map.values()].sort((a, b) => {
      const x = unordered(a.key);
      const y = unordered(b.key);
      if (x || y) return x && y ? 0 : x ? 1 : -1;
      return agCompare(a.key, b.key) * dir;
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

/**
 * ─── The calculated-column oracle ────────────────────────────────────────────
 *
 * A tree walk over PLAIN OBJECTS, written the stupid way: no compilation, no
 * column readers, no store. The engine compiles the same AST once into a
 * closure over the columnar book and evaluates it by row OFFSET; if the two
 * ever disagree, the compiler is wrong.
 *
 * It is written from `@starui/engine`'s `evalOps.ts` — the module the grid's
 * own `valueGetter` calls — rather than from the engine's `calcOps.ts`. That is
 * the point: an oracle copied off the implementation checks that the code does
 * what the code does. The three rules most likely to be got wrong are exactly
 * the ones a hand-written test would never think to assert:
 *
 *   - `null > 95` is FALSE and `null > -1` is TRUE (null coerces to 0);
 *   - `x / 0` is null, but `x / null` is Infinity — only the literal zero is
 *     guarded;
 *   - NaN is TRUTHY, so `IFS(NaN, a, b)` takes the first branch while
 *     `IF(NaN, a, b)` — which uses JavaScript truthiness — takes the second.
 */
function oracleTruthy(value: unknown): boolean {
  return !(value === null || value === undefined || value === false || value === 0 || value === '');
}

function oracleNum(value: unknown): number {
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

function oracleStr(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function oracleCall(name: string, args: unknown[]): unknown {
  switch (name) {
    case 'IF':
      return args[0] ? args[1] : args[2];
    case 'IFS': {
      const hasDefault = args.length % 2 === 1;
      for (let i = 0; i < Math.floor(args.length / 2); i++) {
        if (oracleTruthy(args[i * 2])) return args[i * 2 + 1];
      }
      return hasDefault ? args[args.length - 1] : null;
    }
    case 'SWITCH': {
      const rest = args.slice(1);
      const hasDefault = rest.length % 2 === 1;
      for (let i = 0; i < Math.floor(rest.length / 2); i++) {
        if (args[0] === rest[i * 2]) return rest[i * 2 + 1];
      }
      return hasDefault ? rest[rest.length - 1] : null;
    }
    case 'ISNULL':
      return args[0] === null || args[0] === undefined ? args[1] : args[0];
    case 'ISNOTNULL':
      return args[0] !== null && args[0] !== undefined;
    case 'ABS':
      return Math.abs(oracleNum(args[0]));
    case 'ROUND': {
      const f = 10 ** (args[1] !== undefined ? oracleNum(args[1]) : 0);
      return Math.round(oracleNum(args[0]) * f) / f;
    }
    case 'SQRT':
      return Math.sqrt(oracleNum(args[0]));
    case 'MIN':
      return Math.min(...args.flat().map(oracleNum));
    case 'MAX':
      return Math.max(...args.flat().map(oracleNum));
    case 'CONCAT':
      return args.map(oracleStr).join('');
    case 'LEN':
      return oracleStr(args[0]).length;
    case 'UPPER':
      return oracleStr(args[0]).toUpperCase();
    default:
      throw new Error(`oracle has no function '${name}'`);
  }
}

function oracleEval(node: SsrmExpressionNode, row: SsrmRow): unknown {
  switch (node.type) {
    case 'literal':
      return node.value;
    case 'columnRef':
      // `resolveColumnRef` answers null for a field the row does not carry, so
      // a column the book does not have is a null, never an error.
      return row[node.columnId] ?? null;
    case 'array':
      return node.elements.map((el) => oracleEval(el, row));
    case 'unary': {
      const value = oracleEval(node.operand, row);
      return node.operator === 'NOT' ? !oracleTruthy(value) : -(value as number);
    }
    case 'ternary':
      return oracleTruthy(oracleEval(node.condition, row))
        ? oracleEval(node.consequent, row)
        : oracleEval(node.alternate, row);
    case 'call':
      return oracleCall(node.name.toUpperCase(), node.args.map((arg) => oracleEval(arg, row)));
    case 'binary': {
      // AND/OR short-circuit and answer the OPERAND, not a boolean.
      if (node.operator === 'AND') {
        const left = oracleEval(node.left, row);
        return oracleTruthy(left) ? oracleEval(node.right, row) : left;
      }
      if (node.operator === 'OR') {
        const left = oracleEval(node.left, row);
        return oracleTruthy(left) ? left : oracleEval(node.right, row);
      }
      const l = oracleEval(node.left, row) as number;
      const r = oracleEval(node.right, row) as number;
      switch (node.operator) {
        case '+':
          if (typeof l === 'string' || typeof r === 'string') return `${l}${r}`;
          return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return r === 0 ? null : l / r;
        case '%': return l % r;
        case '>': return l > r;
        case '<': return l < r;
        case '>=': return l >= r;
        case '<=': return l <= r;
        case '==': return (l as unknown) === (r as unknown);
        case '!=': return (l as unknown) !== (r as unknown);
        case 'IN': return Array.isArray(r) && (r as unknown[]).includes(l);
        default:
          throw new Error(`oracle has no operator '${node.operator}'`);
      }
    }
    default:
      throw new Error(`oracle has no node '${(node as { type: string }).type}'`);
  }
}

const lit = (value: number | string | boolean | null): SsrmExpressionNode => ({
  type: 'literal',
  value,
});
const col = (columnId: string): SsrmExpressionNode => ({ type: 'columnRef', columnId });
const bin = (
  operator: string,
  left: SsrmExpressionNode,
  right: SsrmExpressionNode,
): SsrmExpressionNode => ({ type: 'binary', operator, left, right });
const call = (name: string, ...args: SsrmExpressionNode[]): SsrmExpressionNode => ({
  type: 'call',
  name,
  args,
});

/**
 * Expression trees generated per frame.
 *
 * The pools are chosen so the cases the session named are reached rather than
 * hoped for: `qty` is null ~10% and can be exactly 0, `px` is null ~15% and NaN
 * ~4% of ticks, `nope` is a column the book does NOT have, the string columns
 * meet the numeric ones under `+` and `CONCAT`, and a literal `0` divisor is in
 * the pool so divide-by-zero is hit on every frame rather than when a random
 * quantity happens to land on it.
 */
const NUMERIC_LEAVES: SsrmExpressionNode[] = [
  col('px'), col('qty'), col('nope'), lit(0), lit(1), lit(-1), lit(95), lit(null), lit(2.5),
];
const STRING_LEAVES: SsrmExpressionNode[] = [col('desk'), col('sector'), col('id'), lit('Rates'), lit('')];
const BINARY_OPS = ['+', '-', '*', '/', '%', '>', '<', '>=', '<=', '==', '!=', 'AND', 'OR'];

function generateExpression(random: () => number, depth: number): SsrmExpressionNode {
  if (depth <= 0 || random() < 0.3) {
    const pool = random() < 0.7 ? NUMERIC_LEAVES : STRING_LEAVES;
    return pool[Math.floor(random() * pool.length)];
  }
  const roll = random();
  if (roll < 0.5) {
    return bin(
      BINARY_OPS[Math.floor(random() * BINARY_OPS.length)],
      generateExpression(random, depth - 1),
      generateExpression(random, depth - 1),
    );
  }
  if (roll < 0.6) {
    return { type: 'unary', operator: random() < 0.5 ? 'NOT' : '-', operand: generateExpression(random, depth - 1) };
  }
  if (roll < 0.7) {
    return {
      type: 'ternary',
      condition: generateExpression(random, depth - 1),
      consequent: generateExpression(random, depth - 1),
      alternate: generateExpression(random, depth - 1),
    };
  }
  if (roll < 0.78) return call('IF', generateExpression(random, depth - 1), generateExpression(random, depth - 1), generateExpression(random, depth - 1));
  if (roll < 0.84) return call('IFS', generateExpression(random, depth - 1), generateExpression(random, depth - 1), generateExpression(random, depth - 1));
  if (roll < 0.88) return call('ISNULL', generateExpression(random, depth - 1), generateExpression(random, depth - 1));
  if (roll < 0.91) return call('ISNOTNULL', generateExpression(random, depth - 1));
  if (roll < 0.94) return call('ABS', generateExpression(random, depth - 1));
  if (roll < 0.96) return call('SQRT', generateExpression(random, depth - 1));
  if (roll < 0.98) return call('CONCAT', generateExpression(random, depth - 1), generateExpression(random, depth - 1));
  // `MIN`/`SUM`/`AVG` and the rest of the reducers are NOT generated here, and
  // the first run of this fuzz is why: given a bare `[column]` argument they
  // are CROSS-ROW on the grid, so the compiler refuses that call site and the
  // column is never stamped — every comparison below would then have been
  // `undefined` against `undefined` and passed. The refusal is covered
  // explicitly in `calc.test.ts`, where it can be asserted rather than
  // silently making a fuzz vacuous.
  return call('LEN', generateExpression(random, depth - 1));
}

/**
 * Exact, including NaN and -0.
 *
 * `Object.is` rather than `===` or `toBeCloseTo`: both sides run the same IEEE
 * doubles through the same operations, so any difference at all is a real
 * disagreement, and NaN must compare EQUAL to NaN here — a NaN silently turned
 * into null is one of the two failures this fuzz exists to catch.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return Object.is(a, b);
}

/**
 * Non-finite numbers go through `String`, not `JSON.stringify`, which answers
 * the STRING `"null"` for both `Infinity` and `NaN` and `"0"` for `-0`. A
 * failure message reading `engine null vs oracle null` describes nothing.
 */
function show(value: unknown): string {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (!Number.isFinite(value)) return String(value);
    if (Object.is(value, -0)) return '-0';
    return String(value);
  }
  if (value === undefined) return 'undefined';
  return JSON.stringify(value) ?? String(value);
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
    // Warnings go to a sink rather than the console: the generator names a
    // column the book does not have on purpose, and 250 frames of that would
    // bury a real failure in noise. The information is not lost — it is
    // asserted through `calcDiagnostics()` below, which is the channel that
    // works in a SharedWorker anyway.
    const calcWarnings: string[] = [];
    const engine = createSsrmEngine({ schema: SCHEMA, onCalcWarning: (m) => calcWarnings.push(m) });
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

    /**
     * How many calculated cells were actually compared.
     *
     * Asserted non-trivial at the end, because a run in which every column was
     * refused, or in which the flat window came back empty, would pass every
     * check above and verify nothing — the same guard the delta-path fuzz needs
     * for the rows it deliberately excuses.
     */
    let calcComparisons = 0;
    /**
     * The anti-vacuous counters for session 5's three new query paths.
     *
     * A sort that did nothing, a filter that excluded nothing and a group that
     * produced one bucket all AGREE WITH THE ORACLE trivially, which is exactly
     * the state the engine was in before this session — silently. So the run is
     * required to have seen each of them actually do something.
     */
    let calcSortsThatMoved = 0;
    let calcFiltersThatCut = 0;
    let calcGroupsWithSplit = 0;

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

      // ── calculated columns, regenerated every frame ────────────────────
      // Three fresh expression trees per frame, so 250 frames is 750 distinct
      // shapes over a book that is being mutated underneath them.
      const calcDefs: SsrmCalcColumnDef[] = [0, 1, 2].map((n) => ({
        colId: `calc${n}`,
        ast: generateExpression(random, 3),
      }));
      /**
       * One DETERMINISTIC calculated column beside the three generated ones.
       *
       * The generated expressions are the differential's whole point, but they
       * make a poor filter subject: most of them are booleans or strings, so a
       * numeric threshold either keeps every row or none, and the run's own
       * anti-vacuous counter reported the calculated filter cutting to a strict
       * subset on only 29 frames of 250. That is the counter doing its job.
       * `[qty] % 3` splits the book three ways on every frame, so the filter
       * path is genuinely exercised — and it is compared cell by cell with the
       * others, so it is not a free pass either.
       */
      calcDefs.push({ colId: 'calc3', ast: bin('%', col('qty'), lit(3)) });
      engine.setCalcColumns(calcDefs);
      oracle.calcDefs = calcDefs;
      // A refusal here would make every comparison below vacuous — the column
      // simply would not be stamped and `undefined === undefined` would pass
      // 30,000 times. The generator only emits supported constructs, so any
      // diagnostic at all is a defect in the compiler, not in the input.
      expect(
        engine.calcDiagnostics().filter((d) => d.phase === 'compile'),
        `frame ${frame} calc refusals`,
      ).toEqual([]);

      // ── flat ──────────────────────────────────────────────────────────
      const flat: SsrmGetRowsRequest = { filterModel, sortModel, startRow: 0, endRow: 40 };
      const flatGot = engine.getRows(flat);
      const flatWant = oracle.getRows(flat);
      expect(flatGot.rowCount, `frame ${frame} flat rowCount`).toBe(flatWant.rowCount);
      expect(flatGot.rowData.map((r) => String(r.id)), `frame ${frame} flat rows`).toEqual(
        flatWant.ids,
      );

      // ── the calculated value of every returned row, against the oracle ──
      for (const row of flatGot.rowData) {
        const source = oracle.rows.get(String(row.id));
        expect(source, `frame ${frame} oracle has row ${String(row.id)}`).toBeDefined();
        for (const def of calcDefs) {
          const want = oracleEval(def.ast, source!);
          const got = row[def.colId];
          calcComparisons += 1;
          if (!sameValue(got, want)) {
            throw new Error(
              `frame ${frame} ${def.colId} on ${String(row.id)}: engine ${show(got)}, oracle ` +
                `${show(want)} — ast ${JSON.stringify(def.ast)} row ${JSON.stringify(source)}`,
            );
          }
        }
      }

      // ── a row's calculated value does not depend on the query ──────────
      // The named case is an expression evaluated over a row a FILTER EXCLUDES.
      // A calculated value is a property of the row, so the same row read under
      // a different filter must carry the same value — if stamping ever read
      // the wrong offset, a filtered read is where it would show, because the
      // index is a different permutation of the same book.
      const unfilteredGot = engine.getRows({ sortModel, startRow: 0, endRow: 40 });
      const byId = new Map(flatGot.rowData.map((r) => [String(r.id), r]));
      for (const row of unfilteredGot.rowData) {
        const filtered = byId.get(String(row.id));
        if (filtered === undefined) continue;
        for (const def of calcDefs) {
          calcComparisons += 1;
          if (!sameValue(row[def.colId], filtered[def.colId])) {
            throw new Error(
              `frame ${frame} ${def.colId} on ${String(row.id)} moved with the filter: ` +
                `${show(filtered[def.colId])} filtered vs ${show(row[def.colId])} unfiltered`,
            );
          }
        }
      }

      // ── a calculated column SORTS, FILTERS, GROUPS and AGGREGATES ──────
      //
      // Session 5's whole subject. Until it, `sortIndex`, `compileFilter` and
      // `aggregateMembers` each skipped a column the store did not have, so
      // every request below was answered as if the calculated entry were not
      // there — no error, no effect. The oracle stamps the same expressions
      // onto plain rows and then runs the SAME filter, sort and bucket code it
      // has always run, which is the point: a calculated column is not a
      // special case, it is a value the row has.
      const calcSorted: SsrmGetRowsRequest = {
        filterModel,
        sortModel: [{ colId: 'calc0', sort: frame % 2 === 0 ? 'asc' : 'desc' }],
        startRow: 0,
        endRow: 40,
      };
      const calcSortGot = engine.getRows(calcSorted).rowData.map((r) => String(r.id));
      expect(calcSortGot, `frame ${frame} sort by calc0`).toEqual(oracle.getRows(calcSorted).ids);
      // A calculated column whose value never varies would make the assertion
      // above agree with anything, exactly as a sort that did nothing would.
      if (calcSortGot.join() !== engine.getRows({ filterModel, startRow: 0, endRow: 40 }).rowData.map((r) => String(r.id)).join()) {
        calcSortsThatMoved += 1;
      }

      const calcFilterModel = [
        { calc1: { type: 'blank' } },
        { calc1: { filterType: 'number', type: 'greaterThan', filter: 0 } },
        { calc3: { filterType: 'number', type: 'greaterThan', filter: 0 } },
        { calc3: { filterType: 'number', type: 'lessThan', filter: 2 } },
      ][frame % 4];
      const calcFiltered: SsrmGetRowsRequest = {
        filterModel: calcFilterModel,
        sortModel,
        startRow: 0,
        endRow: 40,
      };
      const calcFilterGot = engine.getRows(calcFiltered);
      const calcFilterWant = oracle.getRows(calcFiltered);
      expect(calcFilterGot.rowCount, `frame ${frame} filter on calc1 rowCount`).toBe(
        calcFilterWant.rowCount,
      );
      expect(
        calcFilterGot.rowData.map((r) => String(r.id)),
        `frame ${frame} filter on calc1`,
      ).toEqual(calcFilterWant.ids);
      if (calcFilterGot.rowCount > 0 && calcFilterGot.rowCount < oracle.rows.size) {
        calcFiltersThatCut += 1;
      }

      const calcGrouped: SsrmGetRowsRequest = {
        filterModel,
        sortModel: [{ colId: 'calc2', sort: frame % 2 === 0 ? 'asc' : 'desc' }],
        rowGroupCols: [{ id: 'calc2' }],
        groupKeys: [],
        valueCols: [{ id: 'calc0', aggFunc: 'sum' }],
      };
      const calcGroupGot = engine.getRows(calcGrouped);
      const calcGroupWant = oracle.buckets(calcGrouped, 'calc2');
      expect(calcGroupGot.rowCount, `frame ${frame} group by calc2 count`).toBe(
        calcGroupWant.length,
      );
      expect(
        calcGroupGot.rowData.map((r) =>
          r.calc2 === null || r.calc2 === undefined ? ' null' : String(r.calc2),
        ),
        `frame ${frame} group by calc2 order`,
      ).toEqual(calcGroupWant.map((b) => b.bucketKey));
      if (calcGroupGot.rowCount > 1) calcGroupsWithSplit += 1;

      // The aggregate of a CALCULATED value column, per calculated group,
      // computed independently — null and NaN skipped rather than zeroed.
      for (let g = 0; g < calcGroupGot.rowData.length; g++) {
        const bucket = calcGroupWant[g];
        const want = reduce(bucket.members, 'calc0', 'sum');
        const got = calcGroupGot.rowData[g].calc0 as number | null;
        if (want === null) {
          expect(got, `frame ${frame} sum of calc0 over ${bucket.bucketKey}`).toBeNull();
        } else {
          expect(got as number, `frame ${frame} sum of calc0 over ${bucket.bucketKey}`).toBeCloseTo(
            want,
            6,
          );
        }
        calcComparisons += 1;
      }

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

    expect(calcComparisons, 'calculated cells actually compared').toBeGreaterThan(10_000);
    // Each of the three new paths must have been seen to CHANGE the answer.
    // Agreeing with the oracle about a sort that did not sort is what the
    // engine did before this session, and it did it silently.
    expect(calcSortsThatMoved, 'no frame sorted by a calculated column into a different order').toBeGreaterThan(
      50,
    );
    expect(calcFiltersThatCut, 'no frame filtered a calculated column down to a strict subset').toBeGreaterThan(
      50,
    );
    expect(calcGroupsWithSplit, 'no frame grouped a calculated column into more than one bucket').toBeGreaterThan(
      50,
    );
    // The generator names `nope` on purpose, so the "names a field the book
    // does not have" diagnostic must have fired — a run where it never did
    // would mean that leaf was never generated and that case went untested.
    expect(calcWarnings.some((m) => m.includes('nope')), 'missing-column warning reached the sink').toBe(
      true,
    );
    /**
     * An explicit timeout, matching the one `deltaPath.fuzz.test.ts` already
     * carries.
     *
     * This run takes ~2.5 s alone and vitest's default is 5 s, which sounds
     * like headroom and is not: session 5 added three more query shapes per
     * frame, and under `npx turbo typecheck build test --continue` — where the
     * whole workspace compiles and runs at once — it timed out at 5,000 ms,
     * reproducibly, and only there. A fuzz that goes red on a loaded machine
     * and green on an idle one is a fuzz nobody will believe the next time it
     * goes red for a real reason.
     */
  }, 60_000);

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
