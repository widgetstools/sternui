/**
 * AG `IServerSideGetRowsRequest` → a Perspective query plan.
 *
 * A plan is `{ kind, viewConfig, key }`:
 * • `kind: 'rows'`   — flat reads and leaf reads under fully-expanded
 *   group routes (`rowGroupCols.length === groupKeys.length`); ancestor
 *   group keys become equality filter clauses.
 * • `kind: 'group-level'` — the request asks for GROUP rows
 *   (`rowGroupCols.length > groupKeys.length`). TODO(P4): serve these
 *   via Perspective `group_by` + aggregates (the plan already carries
 *   `group_by` for it); P2's datasource fails them honestly.
 *
 * `key` is a canonical serialization of the view config — the identity
 * used by the view LRU and the block cache.
 */

import type { IServerSideGetRowsRequest } from 'ag-grid-community';
import { agFilterModelToPerspective } from './agFilterToPerspective.js';
import type { PullFilter, PullSort, PullViewConfig } from './types.js';

export interface QueryPlanOpts {
  /** Table index / row identity — always projected into `columns`. */
  keyColumn: string;
  /** Columns to read; omit for every table column. */
  columns?: string[];
}

export interface QueryPlan {
  kind: 'rows' | 'group-level';
  viewConfig: PullViewConfig;
  /** Canonical cache identity of `viewConfig`. */
  key: string;
  /** Filter clauses the P2 mapping could not express (warn, don't guess). */
  unsupportedFilters: string[];
}

function sortFromRequest(request: IServerSideGetRowsRequest): PullSort[] {
  return request.sortModel.map((item): PullSort => [item.colId, item.sort]);
}

/** Expanded ancestor group keys pin leaf reads to their group route. */
function ancestorFilters(request: IServerSideGetRowsRequest): PullFilter[] {
  return request.groupKeys.map((key, level): PullFilter => {
    const col = request.rowGroupCols[level];
    return [col?.field ?? col?.id ?? '', '==', key];
  });
}

export function buildQueryPlan(
  request: IServerSideGetRowsRequest,
  opts: QueryPlanOpts,
): QueryPlan {
  const isGroupLevel = request.rowGroupCols.length > request.groupKeys.length;
  const mapped = agFilterModelToPerspective(
    (request.filterModel ?? null) as Record<string, unknown> | null,
  );
  const filter = [...ancestorFilters(request), ...mapped.filters];

  const viewConfig: PullViewConfig = {};
  if (opts.columns) {
    viewConfig.columns = opts.columns.includes(opts.keyColumn)
      ? [...opts.columns]
      : [opts.keyColumn, ...opts.columns];
  }
  const sort = sortFromRequest(request);
  if (sort.length > 0) viewConfig.sort = sort;
  if (filter.length > 0) viewConfig.filter = filter;
  if (isGroupLevel) {
    // Carried for P4 — P2 never opens a group_by view.
    viewConfig.group_by = request.rowGroupCols
      .slice(request.groupKeys.length)
      .map((col) => col.field ?? col.id);
  }

  return {
    kind: isGroupLevel ? 'group-level' : 'rows',
    viewConfig,
    key: canonicalViewKey(viewConfig),
    unsupportedFilters: mapped.unsupported,
  };
}

/** Stable identity: field order is fixed by construction above. */
export function canonicalViewKey(config: PullViewConfig): string {
  return JSON.stringify({
    columns: config.columns ?? null,
    sort: config.sort ?? [],
    filter: config.filter ?? [],
    group_by: config.group_by ?? [],
  });
}
