/**
 * useGridContextLink — wires a MarketsGrid into OpenFin's colored "Link"
 * groups for grid-to-grid context sharing.
 *
 *   • PUBLISH: broadcasts the grid's selection (key-field values, or the
 *     grouped column id + key for group rows) on the joined FDC3 user
 *     channel whenever the selection changes.
 *   • RECEIVE: listens for link contexts from peer grids and applies them
 *     as a row filter (merging with the user's own column filters).
 *
 * Linking is a flat peer group keyed by color — there is no parent/child
 * or publisher/subscriber hierarchy; every member both broadcasts to and
 * receives from the group. The grid listens on whatever channel the host
 * has linked it to via the Workspace "Link" button (no auto-join).
 *
 * Outside an FDC3 runtime every operation is a no-op (the underlying
 * `useFdc3Channel` degrades gracefully), so this is safe to mount in
 * non-OpenFin hosts.
 */

import { useEffect, useRef } from 'react';
import type { GridApi } from 'ag-grid-community';
import type { UseFdc3ChannelResult } from './useFdc3Channel.js';
import {
  GRID_LINK_CONTEXT_TYPE,
  applyGridLinkContext,
  applyRowIdExternalFilter,
  buildRowIdContext,
  buildSelectionContext,
  defaultGridLinkResolver,
  normalizeRowIdField,
  type GridLinkResolver,
  type GridLinkSelectionBuilder,
  type GridLinkSelectionContext,
} from './gridContextLink.js';

export interface GridContextLinkConfig {
  /** Master switch. Linking is inactive unless this is `true`. */
  enabled?: boolean;
  /**
   * What a selected row contributes to the broadcast:
   *  - `'rowId'` (default): the row id from AG-Grid's `getRowId`
   *    (`composeRowId` over the data provider's key fields). Peers apply
   *    it as an external filter that keeps only those rows. Needs no
   *    `rowIdField` config — the provider already drives `getRowId`.
   *  - `'fields'`: the row's `rowIdField` values, applied by peers as a
   *    per-column set-filter. Use when peers key rows differently and
   *    you want to match on shared business fields.
   */
  mode?: 'rowId' | 'fields';
  /** Broadcast this grid's selection to linked peers. Default `true`. */
  publish?: boolean;
  /** Apply incoming linked contexts to the grid. Default `true`. */
  receive?: boolean;
  /**
   * `mode: 'fields'` only — row key field(s) describing a selected leaf
   * row. Set to the provider's `keyColumn` so peers match on the same
   * fields. Defaults to `'id'`. Ignored in `'rowId'` mode.
   */
  rowIdField?: string | readonly string[];
  /** Override the receive-side context → filter-model mapping (`'fields'` mode). */
  resolve?: GridLinkResolver;
  /** Override the publish-side selection → context mapping. */
  buildContext?: GridLinkSelectionBuilder;
  /** FDC3 context type for link messages. Defaults to `'starui.gridSelection'`. */
  contextType?: string;
}

export interface UseGridContextLinkArgs {
  /** Live AG-Grid API, or `null` until the grid is ready. */
  gridApi: GridApi | null;
  /** FDC3 channel facade from `useFdc3Channel` / `useHostedView().linking.fdc3`. */
  fdc3: UseFdc3ChannelResult;
  /** This view's instance id — broadcast as `source` so we ignore our own echo. */
  instanceId: string;
  /** Linking config; when omitted or `enabled !== true`, the hook does nothing. */
  config?: GridContextLinkConfig;
}

export function useGridContextLink({
  gridApi,
  fdc3,
  instanceId,
  config,
}: UseGridContextLinkArgs): void {
  const active = Boolean(config) && config?.enabled === true;
  const contextType = config?.contextType ?? GRID_LINK_CONTEXT_TYPE;
  const mode = config?.mode ?? 'rowId';

  // Fields the most recent received context filtered on — so the next
  // context only clears the columns this link owns, not the user's.
  const linkFieldsRef = useRef<readonly string[]>([]);
  // True while we apply a received context, so the resulting
  // selection/filter churn doesn't echo straight back out.
  const applyingRemoteRef = useRef(false);

  const { addContextListener } = fdc3;
  const resolve = config?.resolve ?? defaultGridLinkResolver;
  const receive = config?.receive !== false;

  // ── RECEIVE ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !receive || !gridApi) return;
    const detach = addContextListener(contextType, (ctx) => {
      const context = ctx as GridLinkSelectionContext;
      if (context.source && context.source === instanceId) return;
      applyingRemoteRef.current = true;
      try {
        if (mode === 'rowId') {
          applyRowIdExternalFilter(gridApi, context);
        } else {
          linkFieldsRef.current = applyGridLinkContext(
            gridApi,
            context,
            resolve,
            linkFieldsRef.current,
          );
        }
      } finally {
        // Release after the filter/selection events have flushed.
        queueMicrotask(() => {
          applyingRemoteRef.current = false;
        });
      }
    });
    return detach;
  }, [active, receive, gridApi, addContextListener, contextType, instanceId, resolve, mode]);

  const { broadcast } = fdc3;
  const build =
    config?.buildContext ?? (mode === 'rowId' ? buildRowIdContext : buildSelectionContext);
  const publish = config?.publish !== false;
  const rowIdField = config?.rowIdField;

  // ── PUBLISH ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !publish || !gridApi) return;
    const fields = normalizeRowIdField(rowIdField);
    const onSelectionChanged = () => {
      if (applyingRemoteRef.current) return;
      const context = build(gridApi, { instanceId, rowIdField: fields });
      if (!context) return;
      context.type = contextType;
      void broadcast(context);
    };
    gridApi.addEventListener('selectionChanged', onSelectionChanged);
    return () => {
      try {
        gridApi.removeEventListener('selectionChanged', onSelectionChanged);
      } catch {
        /* grid already destroyed */
      }
    };
  }, [active, publish, gridApi, broadcast, build, contextType, instanceId, rowIdField]);
}
