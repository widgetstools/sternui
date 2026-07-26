/**
 * AG `IServerSideGetRowsRequest` → a Perspective query plan.
 *
 * A plan is `{ kind, viewConfig, key, route }`:
 * • `kind: 'rows'`   — flat reads and leaf reads under fully-expanded
 *   group routes (`rowGroupCols.length === groupKeys.length`); ancestor
 *   group keys become equality filter clauses.
 * • `kind: 'group-level'` — the request asks for GROUP rows
 *   (`rowGroupCols.length > groupKeys.length`): Perspective `group_by`
 *   on the NEXT level only, ancestor equality filters pinning the
 *   route, `valueCols` mapped to aggregates, the group column carried
 *   with a `unique` aggregate (its own label — also what makes label
 *   sorts work), and the key column carried with `count` for child
 *   counts. Group-view reads skip the leading `__ROW_PATH__: []` total
 *   row (see `groupRows.ts`).
 *
 * **Tree data (P4b-2).** `treePathFields` synthesizes a serverSide
 * tree from ordered categorical fields (the dataset has no natural
 * parent/child). AG 36 tree requests carry NO `rowGroupCols` — only
 * `groupKeys` (the keys returned by `getServerSideGroupKey` up the
 * expanded path) — so with `treePathFields` configured every request
 * whose route is shorter than the path list becomes a `'group-level'`
 * plan on `treePathFields[route.length]`, and a full-depth route reads
 * leaf rows. Ancestor keys pin the route exactly as row grouping does;
 * row ids are the same stable path-encoded group ids (`groupRows.ts`).
 *
 * **Calc/expression columns (P4b-2).** `calcExpressions` (name →
 * Perspective expression over REAL columns) flows into EVERY view
 * config built here, so calc columns sort / filter / aggregate /
 * export like real columns (engine-verified: a view with `columns`
 * omitted serves expression columns alongside the table columns;
 * native filter ops, sorts, group_by and aggregates all accept the
 * alias). Two cost/limit rules shape the mapping:
 * • an expression cannot reference ANOTHER expression's alias (engine
 *   limit) — internal boolean filter expressions (OR-combined
 *   conditions, `notContains`, set-with-null, quick filter) that
 *   reference a calc column are dropped and reported, never guessed;
 * • Perspective computes every attached expression per row, so plans
 *   with EXPLICIT `columns` (group-level, rollup, configured-column
 *   rows) PRUNE calc expressions the view doesn't reference
 *   (columns/sort/filter/group_by) — measured ~120 ms off a 20k group
 *   load. Only column-omitted rows plans keep them all (calc columns
 *   are displayed payload there).
 *
 * `buildRollupPlan` builds the grand-total read: a single-group view
 * over the SAME filtered set (group_by on a constant expression), read
 * at row 0 (Perspective's total row).
 *
 * Sorting: `'ag-Grid-AutoColumn'` (AG's group auto-column) maps to the
 * level's group field on group-level plans and is dropped on leaf
 * plans (the group columns are constant within a route). Group-level
 * sorts on columns absent from the grouped view are reported, never
 * guessed.
 *
 * `key` is a canonical serialization of the view config — the identity
 * used by the view LRU and the block cache.
 */

import type { IServerSideGetRowsRequest, SortModelItem } from 'ag-grid-community';
import { agFilterModelToPerspective } from './agFilterToPerspective.js';
import {
  columnRef,
  EXPR_PREFIX,
  QUICK_FILTER_EXPR,
  ROLLUP_GROUP_EXPR,
  quickFilterExpr,
} from './filterExpressions.js';
import type { PullAggregates, PullFilter, PullSort, PullViewConfig } from './types.js';

/** AG's synthetic colId for the row-group auto column. */
export const AUTO_COLUMN_ID = 'ag-Grid-AutoColumn';

export interface QueryPlanOpts {
  /** Table index / row identity — always projected into `columns`. */
  keyColumn: string;
  /**
   * Columns to read; omit for every table column (calc columns ride
   * along automatically when omitted — engine behavior). When given,
   * calc columns must be LISTED here to be projected, exactly like
   * real columns.
   */
  columns?: string[];
  /** Quick-filter text (already trimmed; empty/undefined = off). */
  quickFilter?: string;
  /** String columns the quick filter matches against. */
  quickFilterColumns?: string[];
  /**
   * Calc/expression columns (name → Perspective expression over REAL
   * table columns) attached to every view this builder emits. Names
   * must not use the reserved `__ssrm_` prefix.
   */
  calcExpressions?: Record<string, string>;
  /**
   * Server-side TREE data: ordered categorical fields synthesizing the
   * hierarchy — level i groups by `treePathFields[i]`; a route as deep
   * as the list reads leaf rows. Mutually exclusive with row grouping
   * (AG never issues `rowGroupCols` under `treeData`).
   */
  treePathFields?: string[];
  /**
   * Server-side TREE data from a PARENT-ID adjacency column, for data
   * with a natural hierarchy (as opposed to `treePathFields`, which
   * synthesizes one from categorical columns). Mutually exclusive with
   * `treePathFields` and with row grouping.
   *
   * Every level is a filtered LEAF read, not a `group_by`: the root
   * level is the rows with no parent, and an expanded route reads the
   * rows whose parent is the last key on the route. Rows keep their
   * natural key as the AG row id; the ones with children are stamped
   * `TREE_HAS_CHILDREN_FIELD` so `isServerSideGroup` lets them expand.
   */
  treeParentField?: string;
  /**
   * Weighted-mean sources: value field → WEIGHT field. Required for any
   * column the grid aggregates with `wavg` — AG's `valueCols` carries no
   * weight slot, and Perspective needs one for its
   * `['weighted mean', [weightField]]` tuple. A `wavg` column with no
   * entry here is REPORTED as unsupported rather than served as a plain
   * average: a spread that is silently unweighted is a wrong number that
   * looks right. Example: `{ oas: 'dv01', wal: 'notional' }`.
   */
  weightedAggregates?: Record<string, string>;
}

export interface GroupPlanInfo {
  /** The field grouped at this level. */
  field: string;
  /** Fields carrying requested aggregates on the group rows. */
  valueFields: string[];
}

export interface QueryPlan {
  kind: 'rows' | 'group-level';
  viewConfig: PullViewConfig;
  /** Canonical cache identity of `viewConfig`. */
  key: string;
  /** AG store route these rows belong to ([] = root). */
  route: string[];
  /** Present when `kind === 'group-level'`. */
  group?: GroupPlanInfo;
  /** Filter clauses the mapping could not express (warn, don't guess). */
  unsupportedFilters: string[];
}

/** AG aggFunc → Perspective aggregate (P4a scope; others report). */
const AGG_FUNC_MAP: Record<string, string> = {
  sum: 'sum',
  min: 'min',
  max: 'max',
  avg: 'avg',
  count: 'count',
  // AG ships `first`/`last` as built-ins; Perspective has both under the
  // same names (engine-verified).
  first: 'first',
  last: 'last',
  distinctCount: 'distinct count',
};

/**
 * AG aggFunc names that mean "weighted mean". Perspective spells it as a
 * TUPLE — `['weighted mean', [weightField]]`; there is no bare `wavg`
 * (engine-verified: it aborts with "unknown aggregate operation"). The
 * weight column cannot come from AG — `valueCols` has no slot for it —
 * so it is supplied by `weightedAggregates` (value field → weight field).
 */
const WEIGHTED_AGG_FUNCS = new Set(['wavg', 'weightedAvg', 'weightedMean']);

/**
 * Expanded ancestor group keys pin reads to their group route. Under
 * tree data the level's field comes from `treePathFields` (tree
 * requests carry no `rowGroupCols`).
 */
function ancestorFilters(
  request: IServerSideGetRowsRequest,
  treeFields: readonly string[],
): PullFilter[] {
  return request.groupKeys.map((key, level): PullFilter => {
    if (treeFields.length > 0) return [treeFields[level] ?? '', '==', key];
    const col = request.rowGroupCols[level];
    return [col?.field ?? col?.id ?? '', '==', key];
  });
}

/**
 * Calc expressions minus reserved-prefix names (reported, never
 * silently accepted — `__ssrm_*` aliases are this plane's namespace).
 */
function sanitizeCalcExpressions(
  calc: Record<string, string> | undefined,
  unsupported: string[],
): Record<string, string> {
  if (!calc) return {};
  const out: Record<string, string> = {};
  for (const [name, expression] of Object.entries(calc)) {
    if (name.startsWith(EXPR_PREFIX)) {
      unsupported.push(`calc column '${name}' (reserved '${EXPR_PREFIX}' prefix)`);
      continue;
    }
    out[name] = expression;
  }
  return out;
}

/**
 * Perspective expressions cannot reference OTHER expression aliases
 * (engine-verified: "Input column does not exist"). An internal
 * boolean filter expression that references a calc column is therefore
 * inexpressible — drop the expression AND its `== true` clause, report.
 */
function dropCalcRefFilterExprs(
  expressions: Record<string, string>,
  filter: PullFilter[],
  calcNames: readonly string[],
  unsupported: string[],
): void {
  for (const [name, text] of Object.entries(expressions)) {
    if (!name.startsWith(EXPR_PREFIX)) continue;
    const hit = calcNames.find((calcName) => text.includes(columnRef(calcName)));
    if (hit === undefined) continue;
    delete expressions[name];
    const clause = filter.findIndex(([col]) => col === name);
    if (clause >= 0) filter.splice(clause, 1);
    unsupported.push(
      `filter '${name}' references calc column '${hit}' (expressions cannot reference expression columns)`,
    );
  }
}

/**
 * Drop calc expressions the finished view config never references —
 * Perspective computes every attached expression per row, so an
 * unreferenced calc column is pure waste on group/rollup reads. Only
 * applied when `columns` is EXPLICIT (a column-omitted view serves
 * calc columns as payload, so they are all referenced by definition).
 */
function pruneUnreferencedCalc(config: PullViewConfig, calcNames: readonly string[]): void {
  if (!config.columns || !config.expressions || calcNames.length === 0) return;
  const referenced = new Set<string>([
    ...config.columns,
    ...(config.group_by ?? []),
    ...(config.sort ?? []).map(([col]) => col),
    ...(config.filter ?? []).map(([col]) => col),
  ]);
  for (const name of calcNames) {
    if (!referenced.has(name)) delete config.expressions[name];
  }
  if (Object.keys(config.expressions).length === 0) delete config.expressions;
}

/** Shared base: filters (model + quick filter + ancestors) + expressions. */
function baseConfig(
  request: IServerSideGetRowsRequest,
  opts: QueryPlanOpts,
  unsupported: string[],
  withAncestors: boolean,
): PullViewConfig {
  const mapped = agFilterModelToPerspective(
    (request.filterModel ?? null) as Record<string, unknown> | null,
  );
  unsupported.push(...mapped.unsupported);
  const filter = [
    ...(withAncestors ? ancestorFilters(request, opts.treePathFields ?? []) : []),
    ...mapped.filters,
  ];
  const calc = sanitizeCalcExpressions(opts.calcExpressions, unsupported);
  const expressions = { ...calc, ...mapped.expressions };
  // FAST PATH: a single-token quick filter that is the ONLY filter can
  // ride Perspective's NATIVE `contains` with a view-global `filter_op:
  // 'or'`, skipping the ExprTK expression column entirely. Native
  // contains is a literal, case-insensitive match — no regex, no
  // per-cell allocation — and measured 191ms vs 235ms at 100k x 34.
  //
  // Strictly gated, because `filter_op` is VIEW-GLOBAL: with any other
  // clause present (a column filter, or an ancestor route filter under
  // grouping) an OR would silently WIDEN the result instead of
  // narrowing it. Multi-token also falls back, since tokens AND
  // together and one global op cannot express AND-of-ORs.
  const quickTokens = opts.quickFilter?.trim().split(/\s+/).filter(Boolean) ?? [];
  const quickColumns = opts.quickFilterColumns ?? [];
  if (
    quickTokens.length === 1 &&
    quickColumns.length > 0 &&
    filter.length === 0 &&
    Object.keys(mapped.expressions).length === 0
  ) {
    for (const column of quickColumns) filter.push([column, 'contains', quickTokens[0]!]);
    const fast: PullViewConfig = { filter, filter_op: 'or' };
    if (Object.keys(calc).length > 0) fast.expressions = { ...calc };
    return fast;
  }

  if (opts.quickFilter) {
    const expr = quickFilterExpr(opts.quickFilter, opts.quickFilterColumns ?? []);
    if (expr) {
      expressions[QUICK_FILTER_EXPR] = expr;
      filter.push([QUICK_FILTER_EXPR, '==', true]);
    } else {
      unsupported.push(`quick filter '${opts.quickFilter}' (no quickFilterColumns configured)`);
    }
  }
  const calcNames = Object.keys(calc);
  if (calcNames.length > 0) dropCalcRefFilterExprs(expressions, filter, calcNames, unsupported);
  const config: PullViewConfig = {};
  if (filter.length > 0) config.filter = filter;
  if (Object.keys(expressions).length > 0) config.expressions = expressions;
  return config;
}

/** valueCols → Perspective aggregates; unknown aggFuncs report. */
function mapValueCols(
  request: IServerSideGetRowsRequest,
  unsupported: string[],
  weightedAggregates: Record<string, string> = {},
): { valueFields: string[]; aggregates: PullAggregates } {
  const valueFields: string[] = [];
  const aggregates: PullAggregates = {};
  for (const col of request.valueCols) {
    const field = col.field ?? col.id;
    const aggFunc = col.aggFunc;

    if (aggFunc && WEIGHTED_AGG_FUNCS.has(aggFunc)) {
      const weightField = weightedAggregates[field];
      if (!weightField) {
        // Reported, never silently downgraded to a plain average: a
        // weighted spread quietly served unweighted is a wrong number
        // that looks right.
        unsupported.push(
          `${field}: aggFunc '${aggFunc}' needs a weight column — add it to weightedAggregates`,
        );
        continue;
      }
      valueFields.push(field);
      aggregates[field] = ['weighted mean', [weightField]];
      continue;
    }

    const agg = aggFunc ? AGG_FUNC_MAP[aggFunc] : undefined;
    if (!agg) {
      unsupported.push(`${field}: aggFunc '${String(aggFunc)}'`);
      continue;
    }
    valueFields.push(field);
    aggregates[field] = agg;
  }
  return { valueFields, aggregates };
}

function rowsSort(request: IServerSideGetRowsRequest): PullSort[] {
  return request.sortModel
    .filter((item) => item.colId !== AUTO_COLUMN_ID) // constant within a route
    .map((item): PullSort => [item.colId, item.sort]);
}

/** Group-level sort: auto-column → the level's group field; others must be in the view. */
function groupSort(
  sortModel: SortModelItem[],
  groupField: string,
  valueFields: string[],
  unsupported: string[],
): PullSort[] {
  const out: PullSort[] = [];
  for (const item of sortModel) {
    const colId = item.colId === AUTO_COLUMN_ID ? groupField : item.colId;
    if (colId === groupField || valueFields.includes(colId)) {
      out.push([colId, item.sort]);
    } else {
      unsupported.push(`sort '${item.colId}' (not aggregated at this group level)`);
    }
  }
  return out;
}

export function buildQueryPlan(
  request: IServerSideGetRowsRequest,
  opts: QueryPlanOpts,
): QueryPlan {
  const unsupported: string[] = [];
  const route = [...request.groupKeys];

  // ── PARENT-ID tree: every level is a filtered LEAF read ──
  // Root = rows with no parent; an expanded route = rows whose parent is
  // the last key on it. No group_by anywhere: these are real data rows
  // that happen to have children, so they keep their natural row id.
  if (opts.treeParentField && request.rowGroupCols.length === 0) {
    const parentField = opts.treeParentField;
    const viewConfig = baseConfig(request, opts, unsupported, false);
    const parentClause: PullFilter =
      route.length === 0
        ? [parentField, 'is null', null]
        : [parentField, '==', route[route.length - 1]!];
    // Prepend so the route clause survives the fast paths in baseConfig
    // and always ANDs with anything the user filtered on.
    viewConfig.filter = [parentClause, ...(viewConfig.filter ?? [])];
    // The parent clause is a second clause, so a view-global OR from the
    // quick-filter fast path would WIDEN the level to the whole book.
    delete viewConfig.filter_op;
    if (opts.columns) {
      viewConfig.columns = opts.columns.includes(opts.keyColumn)
        ? [...opts.columns]
        : [opts.keyColumn, ...opts.columns];
      // The parent column drives the NEXT level's read and the
      // has-children stamp, so it must survive a narrowed projection.
      if (!viewConfig.columns.includes(parentField)) viewConfig.columns.push(parentField);
    }
    const sort = rowsSort(request);
    if (sort.length > 0) viewConfig.sort = sort;
    pruneUnreferencedCalc(viewConfig, calcNamesOf(opts));
    return {
      kind: 'rows',
      viewConfig,
      key: canonicalViewKey(viewConfig),
      route,
      unsupportedFilters: unsupported,
    };
  }

  // Tree mode: AG tree requests carry NO rowGroupCols — the configured
  // path fields decide whether this route still has group levels below.
  const treeFields = request.rowGroupCols.length === 0 ? (opts.treePathFields ?? []) : [];
  const isGroupLevel =
    request.rowGroupCols.length > request.groupKeys.length ||
    treeFields.length > request.groupKeys.length;

  if (isGroupLevel) {
    // ── group-level: group_by the NEXT level under the ancestor route ──
    const level = request.groupKeys.length;
    const groupField =
      treeFields.length > 0
        ? treeFields[level]!
        : (request.rowGroupCols[level]!.field ?? request.rowGroupCols[level]!.id);
    const { valueFields, aggregates } = mapValueCols(request, unsupported, opts.weightedAggregates);

    const viewConfig = baseConfig(request, opts, unsupported, true);
    viewConfig.group_by = [groupField];
    // The group column rides along with `unique` (constant within its
    // own group → the label; also the handle for label sorts). The key
    // column rides with `count` → the group's leaf child count.
    viewConfig.columns = [...valueFields, groupField];
    const groupAggregates: PullAggregates = { ...aggregates, [groupField]: 'unique' };
    viewConfig.aggregates = groupAggregates;
    if (!valueFields.includes(opts.keyColumn) && opts.keyColumn !== groupField) {
      viewConfig.columns.push(opts.keyColumn);
      groupAggregates[opts.keyColumn] = 'count';
    }
    const sort = groupSort(request.sortModel, groupField, valueFields, unsupported);
    if (sort.length > 0) viewConfig.sort = sort;
    pruneUnreferencedCalc(viewConfig, calcNamesOf(opts));

    return {
      kind: 'group-level',
      viewConfig,
      key: canonicalViewKey(viewConfig),
      route,
      group: { field: groupField, valueFields },
      unsupportedFilters: unsupported,
    };
  }

  // ── rows: flat reads / leaf reads under a fully-expanded route ──
  const viewConfig = baseConfig(request, opts, unsupported, true);
  if (opts.columns) {
    viewConfig.columns = opts.columns.includes(opts.keyColumn)
      ? [...opts.columns]
      : [opts.keyColumn, ...opts.columns];
  }
  const sort = rowsSort(request);
  if (sort.length > 0) viewConfig.sort = sort;
  pruneUnreferencedCalc(viewConfig, calcNamesOf(opts));

  return {
    kind: 'rows',
    viewConfig,
    key: canonicalViewKey(viewConfig),
    route,
    unsupportedFilters: unsupported,
  };
}

/** The usable (non-reserved) calc column names of a plan's opts. */
function calcNamesOf(opts: QueryPlanOpts): string[] {
  return Object.keys(opts.calcExpressions ?? {}).filter((name) => !name.startsWith(EXPR_PREFIX));
}

export interface RollupPlan {
  viewConfig: PullViewConfig;
  key: string;
  /** Fields present on the grand-total row. */
  valueFields: string[];
  unsupportedFilters: string[];
}

/**
 * The grand-total read: ONE group over the whole filtered set (constant
 * expression group_by — verified cheap: a single group). Row 0 of the
 * view is Perspective's total row. Returns null when the request
 * carries no supported aggregates (nothing to total).
 */
export function buildRollupPlan(
  request: IServerSideGetRowsRequest,
  opts: QueryPlanOpts,
): RollupPlan | null {
  const unsupported: string[] = [];
  const { valueFields, aggregates } = mapValueCols(request, unsupported, opts.weightedAggregates);
  if (valueFields.length === 0) return null;

  const viewConfig = baseConfig(request, opts, unsupported, false);
  viewConfig.expressions = { ...viewConfig.expressions, [ROLLUP_GROUP_EXPR]: "'total'" };
  viewConfig.group_by = [ROLLUP_GROUP_EXPR];
  viewConfig.columns = valueFields;
  viewConfig.aggregates = aggregates;
  pruneUnreferencedCalc(viewConfig, calcNamesOf(opts));

  return {
    viewConfig,
    key: canonicalViewKey(viewConfig),
    valueFields,
    unsupportedFilters: unsupported,
  };
}

/** Stable identity: field order is fixed by construction above. */
export function canonicalViewKey(config: PullViewConfig): string {
  return JSON.stringify({
    columns: config.columns ?? null,
    sort: config.sort ?? [],
    filter: config.filter ?? [],
    group_by: config.group_by ?? [],
    expressions: config.expressions ?? {},
    aggregates: config.aggregates ?? {},
  });
}
