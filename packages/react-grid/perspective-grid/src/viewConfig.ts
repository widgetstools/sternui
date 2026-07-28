/**
 * Translate AG Grid request state into a Perspective View config.
 *
 * Sort, filter, aggregation and expression evaluation all live server-side
 * (worker-side) now: AG Grid states the intent, Perspective computes it, and
 * the grid only paints the window it gets back. Changing any of these means
 * building a NEW View — Perspective view configs are immutable — which is why
 * every swap must go through `createSafeView` (see safeView.ts).
 *
 * Every shape below was verified against @perspective-dev/client 4.5.2 by
 * `scripts/viewConfigProbe.mjs`; none of it is inferred from docs.
 */

/** Verified aggregate names. NOTE: 3.8's `weighted mean` is NOT accepted by
 *  4.5.2 (the string does not appear anywhere in the package) — express it as
 *  `sum(w*x) / sum(w)` with expression columns instead. */
export type PerspectiveAggregate =
  | 'sum'
  | 'avg'
  | 'mean'
  | 'median'
  | 'count'
  | 'distinct count'
  | 'high'
  | 'low'
  | 'first'
  | 'last';

export interface PerspectiveViewConfig {
  /** `[[colId, 'asc' | 'desc'], ...]` */
  sort?: [string, 'asc' | 'desc'][];
  /** `[[colId, op, value], ...]` — clauses AND together. */
  filter?: unknown[][];
  group_by?: string[];
  aggregates?: Record<string, PerspectiveAggregate>;
  /** Object map: `{ alias: '"a" * "b"' }`. Aliases are usable in sort/filter/group_by. */
  expressions?: Record<string, string>;
  columns?: string[];
}

export interface AgSortItem {
  colId: string;
  sort: string;
}

/** The AG filter shapes we translate. */
export interface AgFilterItem {
  filterType?: string;
  type?: string;
  filter?: unknown;
  filterTo?: unknown;
  values?: unknown[];
  dateFrom?: string;
  dateTo?: string;
  operator?: string;
  conditions?: AgFilterItem[];
}

export interface AgRequestState {
  sortModel?: readonly AgSortItem[];
  filterModel?: Record<string, AgFilterItem> | null;
  rowGroupCols?: readonly { id: string }[];
  valueCols?: readonly { id: string; aggFunc?: string | null }[];
  /** Calc columns: alias -> Perspective expression source. */
  expressions?: Record<string, string>;
}

/** AG sort -> Perspective sort. Unknown directions are dropped, not guessed. */
export function toPerspectiveSort(
  sortModel: readonly AgSortItem[] | undefined,
): [string, 'asc' | 'desc'][] | undefined {
  if (!sortModel?.length) return undefined;
  const out: [string, 'asc' | 'desc'][] = [];
  for (const s of sortModel) {
    if (s.sort === 'asc' || s.sort === 'desc') out.push([s.colId, s.sort]);
  }
  return out.length > 0 ? out : undefined;
}

/** AG aggFunc -> Perspective aggregate. Returns null when unmappable so the
 *  caller can leave the column alone rather than silently mis-aggregating. */
export function toPerspectiveAggregate(aggFunc: string | null | undefined): PerspectiveAggregate | null {
  switch (aggFunc) {
    case 'sum':
      return 'sum';
    case 'avg':
      return 'avg';
    case 'min':
      return 'low';
    case 'max':
      return 'high';
    case 'count':
      return 'count';
    case 'first':
      return 'first';
    case 'last':
      return 'last';
    default:
      return null;
  }
}

const NUMERIC_OPS: Record<string, string> = {
  equals: '==',
  notEqual: '!=',
  greaterThan: '>',
  greaterThanOrEqual: '>=',
  lessThan: '<',
  lessThanOrEqual: '<=',
};

const TEXT_OPS: Record<string, string> = {
  equals: '==',
  notEqual: '!=',
  contains: 'contains',
};

/**
 * Translate ONE AG filter entry into zero or more Perspective clauses.
 *
 * Returns `[]` for anything we cannot express exactly. That is deliberate:
 * a filter we half-understand would show the trader a subtly wrong book,
 * which is far worse than showing an unfiltered one.
 */
export function toPerspectiveFilterClauses(colId: string, item: AgFilterItem): unknown[][] {
  // Compound (AND only — Perspective clause lists are conjunctive).
  if (item.conditions?.length) {
    if ((item.operator ?? 'AND').toUpperCase() !== 'AND') return [];
    return item.conditions.flatMap((c) => toPerspectiveFilterClauses(colId, c));
  }

  if (item.filterType === 'set') {
    return Array.isArray(item.values) ? [[colId, 'in', item.values]] : [];
  }

  if (item.type === 'blank') return [[colId, 'is null']];
  if (item.type === 'notBlank') return [[colId, 'is not null']];

  if (item.type === 'inRange') {
    const from = item.filter ?? item.dateFrom;
    const to = item.filterTo ?? item.dateTo;
    if (from === undefined || to === undefined) return [];
    return [
      [colId, '>=', from],
      [colId, '<=', to],
    ];
  }

  const table = item.filterType === 'text' ? TEXT_OPS : NUMERIC_OPS;
  const op = item.type ? table[item.type] : undefined;
  if (!op || item.filter === undefined) return [];
  return [[colId, op, item.filter]];
}

export function toPerspectiveFilter(
  filterModel: Record<string, AgFilterItem> | null | undefined,
): unknown[][] | undefined {
  if (!filterModel) return undefined;
  const clauses: unknown[][] = [];
  for (const colId of Object.keys(filterModel)) {
    clauses.push(...toPerspectiveFilterClauses(colId, filterModel[colId]));
  }
  return clauses.length > 0 ? clauses : undefined;
}

/**
 * Build the full View config for a request.
 *
 * Only defined keys are emitted — passing `undefined`/empty collections would
 * still create a *different* config object and therefore force a needless View
 * rebuild on every block request.
 */
export function toPerspectiveViewConfig(state: AgRequestState): PerspectiveViewConfig {
  const config: PerspectiveViewConfig = {};

  const sort = toPerspectiveSort(state.sortModel);
  if (sort) config.sort = sort;

  const filter = toPerspectiveFilter(state.filterModel);
  if (filter) config.filter = filter;

  const groupBy = state.rowGroupCols?.map((c) => c.id) ?? [];
  if (groupBy.length > 0) config.group_by = groupBy;

  const aggregates: Record<string, PerspectiveAggregate> = {};
  for (const col of state.valueCols ?? []) {
    const agg = toPerspectiveAggregate(col.aggFunc);
    if (agg) aggregates[col.id] = agg;
  }
  if (Object.keys(aggregates).length > 0) config.aggregates = aggregates;

  if (state.expressions && Object.keys(state.expressions).length > 0) {
    config.expressions = { ...state.expressions };
  }

  return config;
}

export interface AgGroupLevelState extends AgRequestState {
  /** Ancestor keys of the level being requested; its length is the depth. */
  groupKeys?: readonly unknown[];
}

export interface PerspectiveGroupLevel {
  config: PerspectiveViewConfig;
  /**
   * The column this level's rows are grouped by, or `null` at the leaf level
   * (every group column already consumed by `groupKeys`), where the View
   * returns real rows rather than group rows.
   */
  groupColId: string | null;
  /** Depth of the requested level — `groupKeys.length`. */
  depth: number;
}

/**
 * Translate ONE level of an AG Grid group request into a View config.
 *
 * AG Grid pulls a group tree one level at a time: it asks for the children of
 * a path, never for the whole tree. Perspective's `group_by` does the
 * opposite — `group_by: ['sector','book']` returns the fully expanded tree
 * with depth-1 and depth-2 rows interleaved, which is not what any single AG
 * request wants.
 *
 * The mapping that fits both (verified against 4.5.2): group by exactly the
 * ONE column at the requested depth, and push the ancestor keys down as
 * filter clauses. `groupKeys: ['Energy']` over `[sector, book]` becomes
 * `{ group_by: ['book'], filter: [['sector','==','Energy'], ...] }`, whose
 * rows are exactly the children AG asked for.
 *
 * Row 0 of the result is ALWAYS the grand total for that filter
 * (`__ROW_PATH__: []`), at every depth — so each level carries its own
 * subtotal, and the root level's row 0 is the grand total of the whole book.
 * Callers must skip it when serving AG a block of children.
 */
export function toPerspectiveGroupLevel(state: AgGroupLevelState): PerspectiveGroupLevel {
  const groupCols = state.rowGroupCols ?? [];
  const groupKeys = state.groupKeys ?? [];
  const depth = groupKeys.length;

  // Build the non-group parts first, then override `group_by`: this level
  // groups by one column, not by all of them.
  const config = toPerspectiveViewConfig({ ...state, rowGroupCols: undefined });

  const ancestorClauses: unknown[][] = [];
  for (let i = 0; i < depth && i < groupCols.length; i++) {
    const colId = groupCols[i].id;
    const key = groupKeys[i];
    // AG represents a blank group as null; `== null` is not a Perspective
    // comparison, so it has to become the null predicate instead.
    ancestorClauses.push(key === null || key === undefined ? [colId, 'is null'] : [colId, '==', key]);
  }
  if (ancestorClauses.length > 0) {
    config.filter = [...(config.filter ?? []), ...ancestorClauses];
  }

  const groupCol = depth < groupCols.length ? groupCols[depth] : undefined;
  if (groupCol) config.group_by = [groupCol.id];

  return { config, groupColId: groupCol?.id ?? null, depth };
}

/**
 * Rewrite a grouped View window into the shape AG Grid builds group rows from.
 *
 * Perspective puts the group key in `__ROW_PATH__` — the full path, deepest
 * last. AG reads the group value from the group column's own field, so without
 * this remap every group row renders blank. Done columnar (rather than after
 * pivoting to rows) so the datasource's `columnsToRows` stays untouched.
 *
 * The grouped View also returns an aggregated column under the group column's
 * own name; overwriting it with the path key is exactly what is wanted.
 */
export function toGroupColumns(
  columns: Record<string, unknown[]>,
  groupColId: string,
): Record<string, unknown[]> {
  const paths = columns.__ROW_PATH__;
  if (!Array.isArray(paths)) return columns;

  const out = { ...columns };
  delete out.__ROW_PATH__;
  out[groupColId] = paths.map((path) =>
    Array.isArray(path) && path.length > 0 ? path[path.length - 1] : null,
  );
  return out;
}

/**
 * Stable identity for a View config, so a block request that changes nothing
 * reuses the live View instead of rebuilding it (a rebuild costs a full
 * recompute AND a delete, and delete is the dangerous operation here).
 * Key order is normalized because AG rebuilds these objects per request.
 */
export function viewConfigKey(config: PerspectiveViewConfig): string {
  return JSON.stringify({
    sort: config.sort ?? null,
    filter: config.filter ?? null,
    group_by: config.group_by ?? null,
    aggregates: config.aggregates
      ? Object.keys(config.aggregates)
          .sort()
          .map((k) => [k, config.aggregates![k]])
      : null,
    expressions: config.expressions
      ? Object.keys(config.expressions)
          .sort()
          .map((k) => [k, config.expressions![k]])
      : null,
    columns: config.columns ?? null,
  });
}
