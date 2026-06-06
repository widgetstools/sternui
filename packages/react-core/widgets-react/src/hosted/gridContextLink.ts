/**
 * gridContextLink — pure helpers for grid-to-grid context linking over
 * OpenFin's colored "Link" groups (FDC3 user channels / Interop context
 * groups).
 *
 * The model is peer-to-peer, NOT publisher/parent → subscriber/child:
 * every view joined to the same color is an equal member of one flat
 * group. A grid PUBLISHES the key-field values of its selected row(s) —
 * or the grouped column id + group key when a group row is selected —
 * and every peer grid RECEIVES that context and FILTERS its rows to the
 * carried field/value pairs.
 *
 * These functions are framework-free so they unit-test without a React
 * tree or an OpenFin runtime. The React wiring lives in
 * `useGridContextLink`.
 */

import type { GridApi, IRowNode } from 'ag-grid-community';
import type { Fdc3Context } from './useFdc3Channel.js';

/** Default FDC3 context type for grid-selection link messages. */
export const GRID_LINK_CONTEXT_TYPE = 'starui.gridSelection';

/**
 * The wire payload broadcast between linked grids. `criteria` maps a
 * row field to the distinct values to match: receivers AND across
 * fields and OR within a field. An empty `criteria` means "selection
 * cleared" — receivers drop the link filter.
 */
export interface GridLinkSelectionContext extends Fdc3Context {
  type: string;
  /** Instance id of the publishing grid, so receivers ignore their own echo. */
  source?: string;
  /** `mode: 'fields'` payload — field → distinct values to match. */
  criteria: Record<string, unknown[]>;
  /**
   * `mode: 'rowId'` payload — the row ids AG-Grid's `getRowId` produced
   * for the selected rows (`node.id`, i.e. `composeRowId(data, keyColumn)`).
   * Receivers apply these as an external filter. Empty/absent means
   * "selection cleared".
   */
  rowIds?: string[];
}

/**
 * Receive-side mapping: turn an incoming context into an AG-Grid filter
 * model (passed straight to `setFilterModel`), or `null` to clear the
 * link filter. Consumers can override to target specific filter types /
 * columns; the default builds a set-filter model from `criteria`.
 */
export type GridLinkResolver = (
  context: GridLinkSelectionContext,
  api: GridApi,
) => Record<string, unknown> | null;

/**
 * Publish-side mapping: turn the grid's current selection into a context
 * to broadcast, or `null` to broadcast nothing.
 */
export type GridLinkSelectionBuilder = (
  api: GridApi,
  opts: { instanceId: string; rowIdField: readonly string[] },
) => GridLinkSelectionContext | null;

/** Normalize a `rowIdField` prop into an always-array form (defaults to `['id']`). */
export function normalizeRowIdField(
  field: string | readonly string[] | undefined,
): readonly string[] {
  if (!field) return ['id'];
  return Array.isArray(field) ? field : [field as string];
}

/**
 * Default publish builder. Leaf rows contribute their `rowIdField`
 * values; group rows contribute the grouped column id (`node.field`)
 * and group key. Values are de-duplicated. Returns a context with an
 * empty `criteria` when nothing is selected, so peers clear their filter
 * on deselect.
 */
export const buildSelectionContext: GridLinkSelectionBuilder = (api, opts) => {
  const criteria: Record<string, Set<unknown>> = {};
  const add = (field: string, value: unknown) => {
    if (value === undefined || value === null) return;
    (criteria[field] ??= new Set<unknown>()).add(value);
  };

  for (const node of api.getSelectedNodes() as IRowNode[]) {
    if (node.group) {
      if (node.field) add(node.field, node.key);
      continue;
    }
    const data = node.data as Record<string, unknown> | undefined;
    if (!data) continue;
    for (const field of opts.rowIdField) add(field, data[field]);
  }

  return {
    type: GRID_LINK_CONTEXT_TYPE,
    source: opts.instanceId,
    criteria: Object.fromEntries(
      Object.entries(criteria).map(([field, values]) => [field, Array.from(values)]),
    ),
  };
};

/**
 * Publish builder for `mode: 'rowId'`. Broadcasts the row id AG-Grid's
 * `getRowId` produced for each selected leaf row (`node.id`, i.e. the
 * `composeRowId(data, keyColumn)` value the data provider's key fields
 * drive). Needs no `rowIdField` config — the id is already computed.
 * Group rows are skipped (their synthetic ids don't map to peer leaf
 * rows).
 */
export const buildRowIdContext: GridLinkSelectionBuilder = (api, opts) => {
  const rowIds: string[] = [];
  for (const node of api.getSelectedNodes() as IRowNode[]) {
    if (node.group || node.id == null) continue;
    rowIds.push(node.id);
  }
  return {
    type: GRID_LINK_CONTEXT_TYPE,
    source: opts.instanceId,
    criteria: {},
    rowIds,
  };
};

/**
 * Apply a `mode: 'rowId'` context as an AG-Grid external filter that
 * keeps only the broadcast row ids (matched against `getRowId` via
 * `node.id`). Group rows always pass so their visibility follows their
 * children. An empty id set removes the filter. The external filter
 * AND's against the user's own column filters, so those survive with no
 * merge logic.
 */
export function applyRowIdExternalFilter(
  api: GridApi,
  context: GridLinkSelectionContext,
): void {
  const ids = new Set(context.rowIds ?? []);
  api.setGridOption('isExternalFilterPresent', () => ids.size > 0);
  api.setGridOption('doesExternalFilterPass', (node) =>
    node.group ? true : ids.has(node.id as string),
  );
  api.onFilterChanged();
}

/**
 * Default receive resolver. Builds a set-filter model (MarketsGrid
 * registers `AllEnterpriseModule`, so the set filter is available) from
 * the carried criteria. Returns `null` when there is nothing to match.
 */
export const defaultGridLinkResolver: GridLinkResolver = (context) => {
  const entries = Object.entries(context.criteria ?? {}).filter(
    ([, values]) => Array.isArray(values) && values.length > 0,
  );
  if (entries.length === 0) return null;
  const model: Record<string, unknown> = {};
  for (const [field, values] of entries) {
    model[field] = { filterType: 'set', values: values.map((v) => String(v)) };
  }
  return model;
};

/**
 * Apply an incoming context to the grid as a filter, merging with any
 * filters the user set by hand: only the fields this link previously
 * owned are cleared/replaced, so manual column filters survive. Returns
 * the field names this link now owns, to pass back on the next call.
 */
export function applyGridLinkContext(
  api: GridApi,
  context: GridLinkSelectionContext,
  resolve: GridLinkResolver,
  prevLinkFields: readonly string[],
): readonly string[] {
  const linkModel = resolve(context, api) ?? {};
  const next = { ...(api.getFilterModel() ?? {}) } as Record<string, unknown>;

  // Drop fields the previous link context owned but the new one doesn't.
  for (const field of prevLinkFields) {
    if (!(field in linkModel)) delete next[field];
  }
  Object.assign(next, linkModel);

  api.setFilterModel(Object.keys(next).length > 0 ? next : null);
  return Object.keys(linkModel);
}
