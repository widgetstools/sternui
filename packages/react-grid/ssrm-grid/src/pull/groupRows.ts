/**
 * Group-row materialization for the pull datasource (P4a).
 *
 * A Perspective group-level view lays out `to_json` rows as:
 * row 0 = the total row (`__ROW_PATH__: []`), rows 1..n = the groups
 * (`__ROW_PATH__: [label]`), and `num_rows()` INCLUDES the total row
 * (verified against the 3.8 engine). Reads therefore shift the AG
 * block window by +1 and report `num_rows - 1` as the store count.
 *
 * Every group row is stamped with:
 * • its group field value (what AG's auto-column renders),
 * • the requested aggregates under their own field names,
 * • `CHILD_COUNT_FIELD` — leaf rows under the group (the key column's
 *   `count` aggregate) for AG's `getChildCount`,
 * • `GROUP_ID_FIELD` — a row id encoded from the FULL group path
 *   (route + own label), stable across refreshes and ticks; live
 *   group-header patches are keyed update transactions on it.
 *
 * Consumers wire `getRowId` via `createSsrmRowIdGetter` (group rows →
 * the stamped path id; leaf rows → the key column).
 */

import type { GetRowIdParams } from 'ag-grid-community';
import type { GroupPlanInfo } from './buildQueryPlan.js';

/** Stamped on group rows: stable row id encoded from the group path. */
export const GROUP_ID_FIELD = '__ssrmGroupId';
/** Stamped on group rows: leaf child count (for AG `getChildCount`). */
export const CHILD_COUNT_FIELD = '__ssrmChildCount';

/** Stable id for a group row from its full path (route + own label). */
export function encodeGroupRowId(path: ReadonlyArray<unknown>): string {
  return `ssrm-group:${JSON.stringify(path.map((part) => (part === null ? null : String(part))))}`;
}

/**
 * `getRowId` for grids served by the pull datasource: group rows carry
 * their path id; leaf rows key on the provider's `keyColumn`.
 */
export function createSsrmRowIdGetter(
  keyColumn: string,
): (params: GetRowIdParams) => string {
  return (params) => {
    const data = params.data as Record<string, unknown> | undefined;
    const groupId = data?.[GROUP_ID_FIELD];
    if (typeof groupId === 'string') return groupId;
    return String(data?.[keyColumn]);
  };
}

/**
 * Perspective group-view `to_json` rows → AG group row data.
 * `keyCountField` is the column whose `count` aggregate carries the
 * child count (null when the key column doubles as a value column).
 */
export function toGroupRowData(
  rows: Record<string, unknown>[],
  group: GroupPlanInfo,
  route: string[],
  keyCountField: string | null,
): Record<string, unknown>[] {
  return rows.map((row) => {
    const path = (row.__ROW_PATH__ as unknown[] | undefined) ?? [];
    const label = path.length > 0 ? path[path.length - 1] : null;
    const data: Record<string, unknown> = {};
    for (const field of group.valueFields) data[field] = row[field];
    data[group.field] = label ?? row[group.field] ?? null;
    if (keyCountField !== null) data[CHILD_COUNT_FIELD] = row[keyCountField];
    data[GROUP_ID_FIELD] = encodeGroupRowId([...route, label]);
    return data;
  });
}
