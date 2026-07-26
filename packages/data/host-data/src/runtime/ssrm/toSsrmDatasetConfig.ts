/**
 * toSsrmDatasetConfig — the ONE documented mapping from the catalog's
 * `StompSsrmProviderConfig` (what the editor authors and the config
 * store persists) to the `SsrmDatasetConfig` the SSRM provider worker
 * actually consumes (`configure` on the control port).
 *
 * Field map:
 *   websocketUrl / listenerTopic / snapshotEndToken / keyColumn /
 *   columnDefinitions / tableName / heartbeat / maxBufferedRows
 *     → 1:1 (blank optional strings are dropped so the worker's
 *       "absent means skip" semantics hold — e.g. an empty
 *       `requestMessage` must NOT publish a trigger frame).
 *   requestMessage / requestBody / requestHeaders → 1:1, same dropping.
 *
 * Deliberately NOT mapped (window-side knobs — the worker's table and
 * ingest never see them):
 *   inferredFields — editor-side schema introspection only.
 *   reconnect      — reserved in the catalog type; the V2 ingest
 *                    session never silently redials (a broken session
 *                    is a dataset `error`; recovery is an explicit
 *                    restart that bumps THE generation token).
 *   calcExpressions / treePathFields / treeParentField /
 *   weightedAggregates / projectDisplayedColumns /
 *   alwaysProjectColumns / wideColumnThreshold /
 *   sweepThrottleWideMs — consumed by `createSsrmPullDatasource` (and
 *                    the consuming grid's tree wiring) in the WINDOW.
 *                    Every one is a per-VIEW concern — which expressions
 *                    are attached, which columns are projected, how a
 *                    hierarchy is walked, which aggregate a value column
 *                    takes — and views are built window-side, per grid.
 *                    The worker hosts ONE table, and it stays exactly
 *                    the declared `columnDefinitions`; two windows on the
 *                    same provider can disagree about all of the above
 *                    and both be right. Mapping any of them here would
 *                    make one window's grid state the worker's problem.
 *
 * The mapping is pure and total — catalog-level validity is the
 * caller's concern (`validateStompSsrmConfig` in @starui/types).
 */

import type { StompSsrmProviderConfig } from '@starui/types';
import type { SsrmDatasetConfig } from './types.js';

// Consumers of the mapping routinely need the catalog type next to it.
export type { StompSsrmProviderConfig } from '@starui/types';

export function toSsrmDatasetConfig(cfg: StompSsrmProviderConfig): SsrmDatasetConfig {
  const requestMessage = trimmed(cfg.requestMessage);
  const snapshotEndToken = trimmed(cfg.snapshotEndToken);
  const tableName = trimmed(cfg.tableName);
  return {
    websocketUrl: cfg.websocketUrl,
    listenerTopic: cfg.listenerTopic,
    keyColumn: cfg.keyColumn,
    ...(requestMessage ? { requestMessage } : {}),
    // requestBody rides only with a trigger destination; '' is a legal
    // body, so it is passed through untrimmed once a trigger exists.
    ...(requestMessage && cfg.requestBody !== undefined
      ? { requestBody: cfg.requestBody }
      : {}),
    ...(requestMessage && cfg.requestHeaders && Object.keys(cfg.requestHeaders).length > 0
      ? { requestHeaders: cfg.requestHeaders }
      : {}),
    ...(snapshotEndToken ? { snapshotEndToken } : {}),
    ...(cfg.columnDefinitions && cfg.columnDefinitions.length > 0
      ? { columnDefinitions: cfg.columnDefinitions }
      : {}),
    ...(tableName ? { tableName } : {}),
    ...(cfg.heartbeat ? { heartbeat: cfg.heartbeat } : {}),
    ...(cfg.maxBufferedRows !== undefined ? { maxBufferedRows: cfg.maxBufferedRows } : {}),
  };
}

function trimmed(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}
