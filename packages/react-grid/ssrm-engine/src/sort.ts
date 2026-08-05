import type { SsrmColumnResolver } from './columnAccess.js';
import type { SsrmSortModelItem } from './types.js';

/**
 * Multi-column sort over an index of row offsets.
 *
 * Sorts the INDEX, never the data: an `Int32Array` of offsets is permuted while
 * every column stays exactly where it was. That is what makes a re-sort cheap
 * and, more importantly, what makes it non-destructive — a live tick writing a
 * cell does not have to move anything.
 *
 * Contrast with the Perspective path, where a view config is immutable so every
 * sort is a fresh View: MEASURED at 0.4-1.1 s for the first block after a sort
 * on a 20,000 x 120 book.
 *
 * ## The sort key comes from a column ACCESSOR, not from the store
 *
 * A calculated column is not a field, so `store.hasField` skipped it and a
 * sort on one did nothing at all — silently. Both functions here now resolve a
 * `colId` through {@link SsrmColumnResolver}, which answers a store column and
 * a compiled expression identically, and the comparator below cannot tell them
 * apart. There is exactly one comparator here and one definition of "absent",
 * and that is the point: the last time this rule existed in two places, the
 * second place got it wrong for a release.
 */

/**
 * Compare two sort keys that are both PRESENT. Absent keys are handled by the
 * caller, above the direction multiplier, and that split is the whole point.
 *
 * An "absent" verdict must NOT be multiplied by the sort direction — doing so
 * put nulls first on a descending sort, which on a price column means "no
 * quote" sorts above the best bid. **The same bug then survived in the NaN
 * branch for a release**, because that branch lived inside the comparator and
 * returned an ordinary comparison result, so `cmp * dir` inverted it. Both are
 * now impossible to write: `orderKey` answers `null` for either, and the null
 * is resolved before `dir` is ever reached.
 *
 * Two strings compare lexicographically. Anything else compares with `<` / `>`,
 * including a MIXED pair from a calculated column whose expression produces a
 * string on some rows and a number on others — where both comparisons are false
 * and the pair ties, falling through to the next sort column. That is exactly
 * what AG Grid's own `_defaultComparator` does with an untyped pair, so a mixed
 * calculated column orders the same way on the client-side row model.
 */
export function compareOrderKeys(
  x: number | string | null,
  y: number | string | null,
  dir: number,
): number {
  if (x === null || y === null) {
    if (x === null && y === null) return 0;
    // Direction-independent, deliberately, and this is the only place the
    // verdict is produced.
    return x === null ? 1 : -1;
  }
  if (x === y) return 0;
  return (x < y ? -1 : x > y ? 1 : 0) * dir;
}

interface SortSpec {
  key: (offset: number) => number | string | null;
  dir: number;
  calculated: boolean;
}

/** The sort keys and direction for one active sort entry. */
function specsFor(
  columns: SsrmColumnResolver,
  sortModel: readonly SsrmSortModelItem[] | undefined,
): SortSpec[] {
  const specs: SortSpec[] = [];
  for (const entry of sortModel ?? []) {
    const access = columns.get(entry.colId);
    // A sort on a column that is neither a field nor a calculated column is
    // ignored rather than made an error: a stale sort model naming a removed
    // column would otherwise fail every block read.
    if (access === undefined) continue;
    specs.push({
      key: access.orderKey,
      dir: entry.sort === 'desc' ? -1 : 1,
      calculated: access.calculated,
    });
  }
  return specs;
}

/**
 * Pull a CALCULATED sort key out of the comparator and into an array indexed by
 * row offset — decorate, sort, undecorate.
 *
 * MEASURED, and the reason this exists rather than being assumed: a sort of
 * 20,000 rows on a key with no ascending runs in it performs **254,515
 * comparisons**, so a key read inside the comparator is read half a million
 * times to order 20,000 distinct values. On a scattered calculated key that was
 * **34.0 ms** against 3.3 ms for the same sort on a stored column; adding a
 * per-generation value cache took it to 16.0 ms, at which point the cost was
 * the CACHE LOOKUP rather than the expression; hoisting the key here takes it
 * to a stored sort plus one pass.
 *
 * Deliberately NOT done for a stored column. There the key already is a typed
 * array index — the cheapest read in the engine — so decorating would allocate
 * 20,000 entries to replace something that costs nothing, and it measured
 * slower. `lowerBound` does not decorate either: it is one binary search, ~15
 * comparisons, and building a 20,000-entry array to serve them would be the
 * same mistake inverted.
 */
function decorate(
  spec: SortSpec,
  index: readonly number[],
): (offset: number) => number | string | null {
  if (!spec.calculated) return spec.key;
  // Indexed by row offset, packed rather than holey — a sparse array of 20,000
  // entries is a dictionary lookup per read, which is what this is replacing.
  let max = 0;
  for (let i = 0; i < index.length; i++) if (index[i] > max) max = index[i];
  const keys = new Array<number | string | null>(max + 1).fill(null);
  for (let i = 0; i < index.length; i++) keys[index[i]] = spec.key(index[i]);
  return (offset) => keys[offset];
}

/**
 * Sort `index` in place.
 *
 * The tie-break on row offset is what makes this STABLE across re-sorts: two
 * rows equal on every sort column keep a deterministic order, so a live tick
 * cannot make rows swap places under the user's cursor for no visible reason.
 */
export function sortIndex(
  columns: SsrmColumnResolver,
  index: Int32Array,
  sortModel: readonly SsrmSortModelItem[] | undefined,
): Int32Array {
  if (!sortModel || sortModel.length === 0) return index;
  const specs = specsFor(columns, sortModel);
  if (specs.length === 0) return index;

  // `Array.prototype.sort` on a TypedArray sorts numerically and ignores a
  // comparator's intent for NaN; sorting a plain array of offsets avoids both.
  const scratch = Array.from(index);
  const keyed = specs.map((spec) => ({ key: decorate(spec, scratch), dir: spec.dir }));
  scratch.sort((a, b) => {
    for (const spec of keyed) {
      // A zero means this column could not separate them — either a tie or two
      // absent cells — so fall through to the next sort column rather than
      // declaring the pair equal.
      const cmp = compareOrderKeys(spec.key(a), spec.key(b), spec.dir);
      if (cmp !== 0) return cmp;
    }
    return a - b;
  });
  return Int32Array.from(scratch);
}

/**
 * Where `offset` belongs in an already-sorted index — the insertion point.
 *
 * This is what makes a live update able to RE-POSITION a row rather than force
 * a full re-sort: when a tick changes a sort key, the row is removed from its
 * old slot and spliced in here. Closes the recorded gap that "update
 * transactions cannot re-order rows under sort".
 */
export function lowerBound(
  columns: SsrmColumnResolver,
  index: Int32Array | readonly number[],
  offset: number,
  sortModel: readonly SsrmSortModelItem[] | undefined,
): number {
  if (!sortModel || sortModel.length === 0) return index.length;
  const specs = specsFor(columns, sortModel);
  if (specs.length === 0) return index.length;

  const before = (candidate: number): boolean => {
    for (const spec of specs) {
      const cmp = compareOrderKeys(spec.key(candidate), spec.key(offset), spec.dir);
      // Absent sorts last whatever the direction, and `compareOrderKeys` has
      // already said so — an absent candidate answers +1 and is never before a
      // present row.
      if (cmp !== 0) return cmp < 0;
    }
    return candidate < offset;
  };

  let lo = 0;
  let hi = index.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (before(index[mid])) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
