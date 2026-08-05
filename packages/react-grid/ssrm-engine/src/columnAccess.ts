import type { ColumnStore, StoredColumn } from './columnStore.js';
import type { SsrmCalcColumn } from './calc.js';

/**
 * How every path in this engine reads a column — ONE abstraction, not three.
 *
 * ## The defect this exists to remove
 *
 * `sortIndex`, `compileFilter` and `aggregateMembers` each opened with the same
 * line: skip a column the store does not have. A calculated column is not a
 * field, so a sort, a filter or an aggregation on one was a **silent no-op** —
 * it did not error, it did nothing, and the grid looked like it had ignored the
 * click. Three call sites, one reason.
 *
 * ## One accessor, not three, and why that is the deliberate choice
 *
 * The alternative was to teach each of the three call sites about calculated
 * columns separately, which is a smaller diff and the wrong shape. The rule
 * this repo already paid for is that **a fix has to generalise to every branch
 * that shares its reasoning**: the null verdict was lifted above the sort's
 * direction multiplier and the NaN verdict — which the same comment says
 * belongs with it — was left below, so the identical bug shipped in the branch
 * nobody re-read. Three parallel "if it is calculated, do this instead"
 * branches is that failure pre-arranged, because the fourth call site (pivot,
 * grouping, distinct values) then has to remember to grow a fourth.
 *
 * So a column id resolves to ONE object with the five reads every path needs,
 * and none of those paths knows or asks where the value came from. Adding a
 * calculated column to the pivot and set-filter paths afterwards was a
 * one-line change each, which is the property being bought.
 *
 * ## `orderKey` is where the null rule lives, exactly once
 *
 * Sorting is the only read whose rule is not obvious, and it is the one this
 * engine has already got wrong twice. A cell with no position on the number
 * line — null, undefined, or NaN — answers `null` here, and `sortIndex` puts a
 * null key LAST IN BOTH DIRECTIONS without ever multiplying it by the sort
 * direction. Every implementation below funnels through
 * {@link numericOrderKey} so that "absent" is defined in one place rather than
 * restated per column kind.
 *
 * NaN being absent for ORDERING does not make it null anywhere else: the store
 * keeps it, `blank` does not match it (`isNull` is false for a NaN), and an
 * aggregate skips it. Those are three separate behaviours a null would get
 * wrong, and they are all reachable from this one interface.
 */
export interface SsrmColumnAccess {
  /** True for a calculated column. Only for reporting and for the fast paths
   *  that can answer from the store's dictionary — never for a semantic rule. */
  readonly calculated: boolean;
  /**
   * Is this cell ABSENT — null or undefined?
   *
   * **NaN is not null here**, deliberately: `blank` must not match a NaN price,
   * because a bad tick and a missing quote are different facts.
   */
  isNull(offset: number): boolean;
  /**
   * The numeric comparable. Epoch ms for a date, 0/1 for a boolean, the
   * DICTIONARY CODE for a store-backed string (assignment-ordered, so for
   * equality and grouping only — sorting text goes through `orderKey`).
   */
  numberAt(offset: number): number;
  /**
   * This cell's value if it genuinely IS a number, and `null` otherwise.
   *
   * Distinct from {@link numberAt}, which coerces — and the difference is what
   * an AGGREGATE has to see. AG Grid's own `aggSum` / `aggMin` / `aggMax` skip
   * any value that is not a `number` or a `bigint`, so a boolean, a string or a
   * Date contributes nothing to a total on the client-side row model. Coercing
   * here instead made a calculated boolean column sum to the number of TRUE
   * rows, which is a confident number for a question nobody asked — caught by
   * the differential fuzz on frame 0, against an oracle written from AG's
   * aggregation code rather than from this engine's.
   *
   * NaN is returned rather than nulled: `typeof NaN === 'number'`, and the
   * caller skips it separately because that is a different rule with a
   * different reason (AG's sum of a column holding a NaN is NaN; this engine
   * skips it, which session 3 settled and nothing here weakens).
   */
  numberOrNull(offset: number): number | null;
  stringAt(offset: number): string | null;
  /** The cell as the grid should see it. */
  valueAt(offset: number): unknown;
  /**
   * What this cell sorts by, or `null` when it has no position on the number
   * line. See the header — this is the single definition of "absent".
   */
  orderKey(offset: number): number | string | null;
}

/**
 * The ONE definition of "this cell has no position on the number line".
 *
 * Null and NaN both answer `null`, and `sortIndex` puts a null key last in both
 * directions. Both branches of every accessor below call this rather than
 * restating the test, because the last time this rule was restated in a second
 * place the second place got it wrong for a release.
 */
export function numericOrderKey(raw: number, isNull: boolean): number | null {
  if (isNull) return null;
  return Number.isNaN(raw) ? null : raw;
}

/**
 * The same rule over an already-materialised VALUE.
 *
 * Used by the calculated accessor, which has a value and no declared type, and
 * by the GROUP ROW ordering in `engine.ts`, which compares keys it has already
 * pulled out of the book. That second call site is why this is exported: group
 * rows were ordered by their own hand-written comparator, and a NaN group key
 * went through its direction multiplier — the exact bug the leaf sort was fixed
 * for twice. There is now one mapping to an order key and one comparison of
 * two of them.
 */
export function orderKeyOfValue(value: unknown): number | string | null {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  return numericOrderKey(typeof value === 'number' ? value : Number(value), false);
}

/** A store-backed column, resolved once — no `Map.get` and no type switch per cell. */
function storeAccess(column: StoredColumn): SsrmColumnAccess {
  const isNull = (offset: number): boolean => column.nulls[offset] === 1;

  if (column.type === 'string') {
    const text = (offset: number): string | null =>
      column.nulls[offset] === 1
        ? null
        : (column.values![(column.data as Int32Array)[offset]] ?? null);
    return {
      calculated: false,
      isNull,
      numberAt: (offset) => (column.data as Int32Array)[offset],
      // A string is not a number, so an aggregate skips it — which is what AG
      // does and what this engine did NOT: `numberAt` answers the dictionary
      // CODE for a string column, so summing one summed assignment ordinals.
      numberOrNull: () => null,
      stringAt: text,
      valueAt: text,
      // A null string is already the absent case, so `text` IS the order key.
      orderKey: text,
    };
  }

  if (column.type === 'boolean') {
    const raw = (offset: number): number => (column.data as Uint8Array)[offset];
    return {
      calculated: false,
      isNull,
      numberAt: raw,
      // A boolean is not a number to AG either.
      numberOrNull: () => null,
      stringAt: (offset) => (isNull(offset) ? null : String(raw(offset) === 1)),
      valueAt: (offset) => (isNull(offset) ? null : raw(offset) === 1),
      orderKey: (offset) => numericOrderKey(raw(offset), isNull(offset)),
    };
  }

  const raw = (offset: number): number => (column.data as Float64Array)[offset];
  if (column.type === 'date') {
    return {
      calculated: false,
      isNull,
      numberAt: raw,
      // A Date is an object, and AG's aggregations skip it. Summing epoch
      // milliseconds is not what a totals row under a maturity column means.
      numberOrNull: () => null,
      // `String(new Date(ms))`, not `toISOString()` — this is what a text
      // filter and the quick filter have always matched against on a date
      // column, and changing the spelling would change which rows they find.
      stringAt: (offset) => (isNull(offset) ? null : String(new Date(raw(offset)))),
      valueAt: (offset) => (isNull(offset) ? null : new Date(raw(offset))),
      // The epoch ms, NOT a Date: ordering 20,000 rows must not allocate 20,000
      // objects to compare two numbers.
      orderKey: (offset) => numericOrderKey(raw(offset), isNull(offset)),
    };
  }

  return {
    calculated: false,
    isNull,
    numberAt: raw,
    numberOrNull: (offset) => (isNull(offset) ? null : raw(offset)),
    stringAt: (offset) => (isNull(offset) ? null : String(raw(offset))),
    valueAt: (offset) => (isNull(offset) ? null : raw(offset)),
    orderKey: (offset) => numericOrderKey(raw(offset), isNull(offset)),
  };
}

/**
 * A calculated column, read through its compiled closure.
 *
 * The closure is `(offset) => unknown` — session 4's seam, and the reason it
 * takes an OFFSET rather than a row object: sorting, filtering, grouping and
 * aggregating all mean "evaluate it for these offsets", which is this closure
 * called over an index. Had it taken a row, feeding `materialise` would have
 * meant building 20,000 row objects to sort one column.
 *
 * **A calculated value has no declared type**, and that is the one place this
 * accessor cannot mirror a store column exactly. `IF([px] > 0, "up", [px])`
 * produces a string on some rows and a number on others. `orderKey` therefore
 * answers a string for a string and a number for everything numeric, and
 * `sortIndex`'s comparator resolves a mixed pair with `<` / `>` — which is
 * precisely what AG Grid's own `_defaultComparator` does with two values it was
 * given no type for, so a mixed calculated column orders the same way on both
 * surfaces.
 */
function calcAccess(
  compiled: (offset: number) => unknown,
  version: () => number,
): SsrmColumnAccess {
  /**
   * ONE evaluation per row per write, not one per read — LAZILY.
   *
   * This is the middle path the materialise-vs-compute measurement pointed at,
   * and it was not either of the two options the question was posed with.
   *
   * MEASURED, 20,000 x 121, a calculated sort key with no ascending runs in it:
   * a sort performed **254,515 comparisons and therefore 509,030 evaluations**
   * of a column with 20,000 distinct values, and cost **34.0 ms against 3.3 ms**
   * for the same sort on a stored column. Every other read is the same shape
   * more mildly — a filter evaluates each row twice (`isNull`, then
   * `numberAt`), an aggregate twice per value column.
   *
   * So the value is computed at most once per row per WRITE and answered from
   * here afterwards. It is not materialised into the store, and the difference
   * matters:
   *
   *   - **it cannot go stale.** The stamp is compared on every single read, so
   *     a write invalidates every cached cell at once by incrementing a number.
   *     A materialised column has to be re-derived on exactly the writes that
   *     touch its inputs, and getting that wrong is a silently wrong column —
   *     the failure mode this engine's aggregation is deliberately a full pass
   *     to avoid;
   *   - **it costs nothing on a book nobody queries.** A column is only
   *     computed for the offsets something actually reads, so a calculated
   *     column on a scrolled-away block is never evaluated at all, where
   *     materialising pays for the whole book on every snapshot (MEASURED at
   *     11.5 ms for 4 columns x 20,000 rows).
   *
   * `stampAt` rather than clearing the cache: invalidation is then a single
   * increment rather than a walk of 20,000 entries, and a stale entry is simply
   * never read. `undefined` is a legal value here (a `variable` naming a column
   * the book does not have answers it), which is why the stamp is a separate
   * array rather than a sentinel in the value one.
   */
  const cache: unknown[] = [];
  const stampAt: number[] = [];
  const evaluate = (offset: number): unknown => {
    const now = version();
    if (stampAt[offset] === now) return cache[offset];
    const value = compiled(offset);
    cache[offset] = value;
    stampAt[offset] = now;
    return value;
  };

  return {
    calculated: true,
    isNull: (offset) => {
      const value = evaluate(offset);
      return value === null || value === undefined;
    },
    numberAt: (offset) => {
      const value = evaluate(offset);
      // `typeof value === 'number'` first, so a NaN the expression PRODUCED
      // survives as NaN rather than going through `Number` and staying NaN by
      // luck. An aggregate skips it and a sort treats it as absent; both of
      // those depend on it arriving here intact.
      return typeof value === 'number' ? value : Number(value);
    },
    numberOrNull: (offset) => {
      const value = evaluate(offset);
      return typeof value === 'number' ? value : null;
    },
    stringAt: (offset) => {
      const value = evaluate(offset);
      return value === null || value === undefined ? null : String(value);
    },
    valueAt: evaluate,
    orderKey: (offset) => orderKeyOfValue(evaluate(offset)),
  };
}

/**
 * Resolves a column id to the one way this engine reads it.
 *
 * A calculated column WINS over a store field of the same name, matching what a
 * returned row already shows: `stampCalc` writes the expression's value over
 * whatever `rowAt` put under that id, so sorting or filtering by the underlying
 * field instead would order the grid by numbers it is not displaying.
 */
export interface SsrmColumnResolver {
  has(colId: string): boolean;
  get(colId: string): SsrmColumnAccess | undefined;
}

export function createColumnResolver(
  store: ColumnStore,
  calc: readonly SsrmCalcColumn[],
  /**
   * A number that changes whenever a WRITE could have moved a calculated value.
   *
   * The engine bumps it in the same place it clears the index cache, which is
   * the one event that can invalidate either. Passing it in rather than reading
   * the store keeps the invalidation rule in ONE place instead of two that have
   * to agree.
   */
  version: () => number = () => 0,
): SsrmColumnResolver {
  // Accessors are closures over a resolved column, so building one is not free
  // and a sort would otherwise rebuild it per call. They are safe to keep: a
  // store accessor captures the StoredColumn OBJECT (which `grow` mutates in
  // place) and a calc accessor captures the compiled evaluator, which is
  // replaced only by `setCalcColumns` — and that rebuilds this whole resolver.
  const cache = new Map<string, SsrmColumnAccess | undefined>();
  const calcById = new Map<string, SsrmCalcColumn>();
  for (const column of calc) {
    // A REFUSED column has no evaluator. It is deliberately not registered, so
    // it falls back to the field binding here exactly as it does in a returned
    // row: sorting by `calc_broken` sorts by the store's `calc_broken` if the
    // book happens to have one, and is ignored if it does not.
    if (column.evaluate !== undefined) calcById.set(column.colId, column);
  }

  const resolve = (colId: string): SsrmColumnAccess | undefined => {
    const calculated = calcById.get(colId);
    if (calculated !== undefined) return calcAccess(calculated.evaluate!, version);
    const column = store.resolveColumn(colId);
    return column === undefined ? undefined : storeAccess(column);
  };

  return {
    has(colId) {
      return calcById.has(colId) || store.hasField(colId);
    },
    get(colId) {
      if (cache.has(colId)) return cache.get(colId);
      const access = resolve(colId);
      cache.set(colId, access);
      return access;
    },
  };
}
