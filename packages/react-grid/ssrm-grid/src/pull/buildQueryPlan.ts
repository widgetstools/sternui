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
import { QUICK_FILTER_EXPR, ROLLUP_GROUP_EXPR, quickFilterExpr } from './filterExpressions.js';
import type { PullFilter, PullSort, PullViewConfig } from './types.js';

/** AG's synthetic colId for the row-group auto column. */
export const AUTO_COLUMN_ID = 'ag-Grid-AutoColumn';

export interface QueryPlanOpts {
  /** Table index / row identity — always projected into `columns`. */
  keyColumn: string;
  /** Columns to read; omit for every table column. */
  columns?: string[];
  /** Quick-filter text (already trimmed; empty/undefined = off). */
  quickFilter?: string;
  /** String columns the quick filter matches against. */
  quickFilterColumns?: string[];
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
};

/** Expanded ancestor group keys pin reads to their group route. */
function ancestorFilters(request: IServerSideGetRowsRequest): PullFilter[] {
  return request.groupKeys.map((key, level): PullFilter => {
    const col = request.rowGroupCols[level];
    return [col?.field ?? col?.id ?? '', '==', key];
  });
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
  const filter = [...(withAncestors ? ancestorFilters(request) : []), ...mapped.filters];
  const expressions = { ...mapped.expressions };
  if (opts.quickFilter) {
    const expr = quickFilterExpr(opts.quickFilter, opts.quickFilterColumns ?? []);
    if (expr) {
      expressions[QUICK_FILTER_EXPR] = expr;
      filter.push([QUICK_FILTER_EXPR, '==', true]);
    } else {
      unsupported.push(`quick filter '${opts.quickFilter}' (no quickFilterColumns configured)`);
    }
  }
  const config: PullViewConfig = {};
  if (filter.length > 0) config.filter = filter;
  if (Object.keys(expressions).length > 0) config.expressions = expressions;
  return config;
}

/** valueCols → Perspective aggregates; unknown aggFuncs report. */
function mapValueCols(
  request: IServerSideGetRowsRequest,
  unsupported: string[],
): { valueFields: string[]; aggregates: Record<string, string> } {
  const valueFields: string[] = [];
  const aggregates: Record<string, string> = {};
  for (const col of request.valueCols) {
    const field = col.field ?? col.id;
    const agg = col.aggFunc ? AGG_FUNC_MAP[col.aggFunc] : undefined;
    if (!agg) {
      unsupported.push(`${field}: aggFunc '${String(col.aggFunc)}'`);
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

  if (request.rowGroupCols.length > request.groupKeys.length) {
    // ── group-level: group_by the NEXT level under the ancestor route ──
    const level = request.groupKeys.length;
    const groupCol = request.rowGroupCols[level]!;
    const groupField = groupCol.field ?? groupCol.id;
    const { valueFields, aggregates } = mapValueCols(request, unsupported);

    const viewConfig = baseConfig(request, opts, unsupported, true);
    viewConfig.group_by = [groupField];
    // The group column rides along with `unique` (constant within its
    // own group → the label; also the handle for label sorts). The key
    // column rides with `count` → the group's leaf child count.
    viewConfig.columns = [...valueFields, groupField];
    viewConfig.aggregates = { ...aggregates, [groupField]: 'unique' };
    if (!valueFields.includes(opts.keyColumn) && opts.keyColumn !== groupField) {
      viewConfig.columns.push(opts.keyColumn);
      viewConfig.aggregates[opts.keyColumn] = 'count';
    }
    const sort = groupSort(request.sortModel, groupField, valueFields, unsupported);
    if (sort.length > 0) viewConfig.sort = sort;

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

  return {
    kind: 'rows',
    viewConfig,
    key: canonicalViewKey(viewConfig),
    route,
    unsupportedFilters: unsupported,
  };
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
  const { valueFields, aggregates } = mapValueCols(request, unsupported);
  if (valueFields.length === 0) return null;

  const viewConfig = baseConfig(request, opts, unsupported, false);
  viewConfig.expressions = { ...viewConfig.expressions, [ROLLUP_GROUP_EXPR]: "'total'" };
  viewConfig.group_by = [ROLLUP_GROUP_EXPR];
  viewConfig.columns = valueFields;
  viewConfig.aggregates = aggregates;

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
