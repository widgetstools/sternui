import type { SsrmColumnAccess, SsrmColumnResolver } from './columnAccess.js';
import type { SsrmAggFunc, SsrmColumnVO } from './types.js';

/**
 * Group aggregation, computed by a FULL PASS over the level's members.
 *
 * ## Why not incremental
 *
 * Incremental aggregation is where hand-rolled engines go silently wrong, and
 * the evaluation of one on this project found three shipped examples, all in
 * the optimised paths and none of them loud:
 *
 *   - a removal-only frame that skipped compaction served ghost rows forever;
 *   - an agg fast path missing its membership guard let a FILTERED-OUT row
 *     ticking corrupt the group's sum;
 *   - an anti-drift recompute that ignored pending work was off by 1.65M
 *     by frame 436.
 *
 * A full pass has none of those failure modes because it has no state to get
 * out of step. It costs O(members) per level per read, and the levels a grid
 * asks for are the ones on screen.
 *
 * **This is a measured trade, not laziness.** Recomputing a level of 20,000
 * rows across a handful of value columns is single-digit milliseconds. Should a
 * book ever be large enough for that to matter, the incremental version goes
 * here — behind the differential fuzz in `engine.fuzz.test.ts`, which exists to
 * catch exactly the three defects above.
 *
 * `min`/`max` are the specific reason to be suspicious of any future
 * incremental version: they are not reversible. Removing the current max
 * requires knowing the runner-up, so an incremental implementation needs a
 * multiset per group per column, and the naive "just subtract" that works for
 * sum has no counterpart here.
 *
 * ## A calculated column aggregates like any other
 *
 * `activeAggregations` used to drop a value column the store did not have,
 * which made an aggregation on a calculated column a silent no-op — the group
 * row simply carried nothing under that id. It now resolves through
 * {@link SsrmColumnResolver}, and the loop below reads the accessor rather than
 * the store, so there is ONE skip rule (null and NaN, never counted as zero)
 * and one Kahan-compensated sum for both kinds of column.
 */

export function toAggFunc(name: string | null | undefined): SsrmAggFunc | null {
  switch (name) {
    case 'sum':
    case 'min':
    case 'max':
    case 'avg':
    case 'count':
    case 'first':
    case 'last':
      return name;
    default:
      return null;
  }
}

/** One value column resolved to what it aggregates and how. */
export interface SsrmAggregation {
  field: string;
  agg: SsrmAggFunc;
  access: SsrmColumnAccess;
}

/** The value columns AG asked to aggregate, with unmappable ones dropped. */
export function activeAggregations(
  columns: SsrmColumnResolver,
  valueCols: readonly SsrmColumnVO[] | undefined,
): SsrmAggregation[] {
  const out: SsrmAggregation[] = [];
  for (const col of valueCols ?? []) {
    const agg = toAggFunc(col.aggFunc);
    if (agg === null) continue;
    const field = col.field ?? col.id;
    const access = columns.get(field);
    if (access === undefined) continue;
    out.push({ field, agg, access });
  }
  return out;
}

/**
 * Aggregate `members` (row offsets, already in display order).
 *
 * Order matters for `first`/`last` — they are ordinal in the group's CURRENT
 * order, so they are read off the sorted member list rather than from insertion
 * order.
 *
 * Nulls are SKIPPED, not treated as zero. A null price is an absent quote; a
 * sum that counted it as zero would under-report, and an average that counted
 * it in the denominator would too. `count` counts ROWS, which is what AG's
 * `count` means, so it does not skip.
 */
export function aggregateMembers(
  members: Int32Array | readonly number[],
  aggregations: readonly SsrmAggregation[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (aggregations.length === 0) return out;

  for (const { field, agg, access } of aggregations) {
    if (agg === 'count') {
      out[field] = members.length;
      continue;
    }
    if (agg === 'first' || agg === 'last') {
      if (members.length === 0) {
        out[field] = null;
        continue;
      }
      const offset = agg === 'first' ? members[0] : members[members.length - 1];
      out[field] = access.isNull(offset) ? null : access.valueAt(offset);
      continue;
    }

    // Kahan-compensated summation. At 20,000 rows plain addition is fine; the
    // compensation costs one subtraction per row and removes the class of bug
    // where a total drifts visibly over a long session.
    let sum = 0;
    let compensation = 0;
    let seen = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < members.length; i++) {
      const offset = members[i];
      // Two skips, two different reasons, and neither is "treat it as zero".
      //
      // NOT A NUMBER — null, a string, a boolean, a Date — contributes nothing,
      // which is what AG's own `aggSum`/`aggMin`/`aggMax` do (`typeof value ===
      // 'number'`). This engine used to COERCE instead, so a calculated boolean
      // column summed to the count of its true rows and a string column summed
      // its dictionary codes. Found by the differential fuzz on frame 0.
      //
      // NaN is a number and is skipped anyway, which is where this deliberately
      // parts company with AG: AG's sum of a column holding one NaN is NaN, and
      // one bad tick taking out a desk's whole total is worse than one row of
      // it going missing. Session 3 settled that and nothing here weakens it.
      const value = access.numberOrNull(offset);
      if (value === null || Number.isNaN(value)) continue;
      seen += 1;
      if (agg === 'sum' || agg === 'avg') {
        const y = value - compensation;
        const t = sum + y;
        // The compensation is only meaningful while the running total is
        // FINITE. `Infinity - 0 - Infinity` is NaN, and once the compensation
        // is NaN every subsequent `value - compensation` is NaN too — so one
        // Infinity anywhere in a group turned the whole total into NaN, and it
        // stayed NaN even if the Infinity was later cancelled out. Caught by
        // the differential fuzz on frame 11 (`x / null` is Infinity, which is
        // an ordinary result of an ordinary expression); reachable on a stored
        // column too, because a feed can send one.
        compensation = Number.isFinite(t) ? t - sum - y : 0;
        sum = t;
      } else if (agg === 'min') {
        if (value < min) min = value;
      } else if (agg === 'max') {
        if (value > max) max = value;
      }
    }

    if (seen === 0) {
      out[field] = null;
      continue;
    }
    switch (agg) {
      case 'sum': out[field] = sum; break;
      case 'avg': out[field] = sum / seen; break;
      case 'min': out[field] = min; break;
      case 'max': out[field] = max; break;
    }
  }
  return out;
}
