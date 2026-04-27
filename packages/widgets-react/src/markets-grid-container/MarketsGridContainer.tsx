/**
 * MarketsGridContainer — wraps `<MarketsGrid />` and feeds it from the
 * data plane instead of a static `rowData` array.
 *
 * Lifecycle
 * ---------
 *   1. Mount with `rowData={[]}` and a `getRowId` callback derived from
 *      the configured `rowIdField`.
 *   2. Once AG-Grid fires `onReady`, capture the `gridApi`.
 *   3. Subscribe to the data-plane row stream in `onEvent` mode (no
 *      React-side buffering — every batch / update flows straight into
 *      AG-Grid's imperative API).
 *   4. Snapshot batches → `applyTransactionAsync({ add })` (the worker
 *      resets the cache on `restart`, so first-batch-of-snapshot can
 *      safely add; identity-keyed adds become updates if a row already
 *      exists, which makes the path resilient to late-joining
 *      subscribers reading from cache).
 *   5. Realtime updates → `applyTransactionAsync({ update })`.
 *   6. On error, surface the message via the `onError` prop or, by
 *      default, fall through to AG-Grid's status overlay.
 *
 * Why imperative
 * --------------
 * Pushing every batch through React state would be O(n) per render
 * for n rows in the cache, and a 10k-row snapshot pulls the main
 * thread under. AG-Grid's `applyTransactionAsync` was built for this
 * exact pattern; the container wires it up so callers don't have to.
 *
 * Backward compatibility
 * ----------------------
 * `<MarketsGrid />` keeps its existing `rowData` prop — apps using
 * static data continue to work unchanged. The container is additive.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import { MarketsGrid } from '@marketsui/markets-grid';
import type { MarketsGridProps, MarketsGridHandle } from '@marketsui/markets-grid';
import { useDataPlaneRowStream, useDataPlaneRestart } from '@marketsui/data-plane-react';

export interface MarketsGridContainerProps<TData extends Record<string, unknown> = Record<string, unknown>>
  extends Omit<MarketsGridProps<TData>, 'rowData' | 'rowIdField'> {
  /** Worker-registered providerId to subscribe to. */
  providerId: string;
  /**
   * Field on each row that uniquely identifies it. Drives both
   * AG-Grid's `getRowId` and the worker-side row-cache key. Required
   * — without it, applyTransaction-update can't map a delta to its
   * existing row.
   */
  rowIdField: string;
  /**
   * Optional historical-mode overlay. When set, the container calls
   * `restart({ asOfDate: <value> })` whenever this changes — typical
   * use: bind a date-picker's value here.
   */
  asOfDate?: string;
  /**
   * Imperative entry point for the historical-mode toolbar. Called
   * with the same `extra` object that gets posted to the worker's
   * RestartRequest handler.
   */
  onRequestRestart?: (extra: Record<string, unknown>) => void;
  /** Surfaced when the data-plane subscription fails. */
  onError?: (err: Error) => void;
}

export function MarketsGridContainer<TData extends Record<string, unknown> = Record<string, unknown>>(
  props: MarketsGridContainerProps<TData>,
): React.ReactElement {
  const {
    providerId,
    rowIdField,
    asOfDate,
    onRequestRestart,
    onError,
    onReady: onReadyProp,
    ...marketsGridProps
  } = props;

  const gridApiRef = useRef<GridApi<TData> | null>(null);
  const snapshotBufferRef = useRef<TData[]>([]);
  const snapshotCompleteRef = useRef(false);
  const [, forceRerender] = useState(0);

  // ── Imperative apply helpers ─────────────────────────────────────
  const applyAdds = useCallback((rows: readonly TData[]) => {
    const api = gridApiRef.current;
    if (!api || rows.length === 0) return;
    api.applyTransactionAsync({ add: rows.slice() });
  }, []);

  const applyUpdates = useCallback((rows: readonly TData[]) => {
    const api = gridApiRef.current;
    if (!api || rows.length === 0) return;
    api.applyTransactionAsync({ update: rows.slice() });
  }, []);

  // ── Subscribe to the data plane in onEvent mode (no buffering) ───
  useDataPlaneRowStream<TData>(providerId, {
    keyColumn: rowIdField,
    onEvent: {
      onSnapshotBatch: (batch) => {
        if (gridApiRef.current && snapshotCompleteRef.current === false) {
          // Stream snapshot batches straight into the grid — keeps
          // memory steady on large snapshots since we never hold the
          // whole snapshot in JS at once.
          applyAdds(batch.rows);
        } else if (!gridApiRef.current) {
          // Grid not ready yet — buffer until onReady drains.
          snapshotBufferRef.current.push(...(batch.rows as TData[]));
        } else {
          // Realtime-phase batch (rare but possible if a provider
          // re-issues a partial snapshot after restart). Treat as
          // upsert — AG-Grid's add becomes an update for existing ids.
          applyUpdates(batch.rows);
        }
      },
      onSnapshotComplete: () => {
        snapshotCompleteRef.current = true;
        forceRerender((n) => n + 1);
      },
      onRowUpdate: (update) => {
        if (gridApiRef.current) {
          applyUpdates(update.rows);
        }
      },
      onError: (err) => {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      },
    },
  });

  // ── Capture grid api on ready, drain any buffered snapshot ───────
  const onReady = useCallback(
    (handle: MarketsGridHandle) => {
      gridApiRef.current = handle.gridApi as unknown as GridApi<TData>;
      if (snapshotBufferRef.current.length > 0) {
        applyAdds(snapshotBufferRef.current);
        snapshotBufferRef.current = [];
      }
      onReadyProp?.(handle);
    },
    [applyAdds, onReadyProp],
  );

  // ── Historical-mode restart on asOfDate change ───────────────────
  const { restart } = useDataPlaneRestart(providerId);
  const lastAsOfDateRef = useRef<string | undefined>(asOfDate);
  useEffect(() => {
    if (asOfDate === lastAsOfDateRef.current) return;
    lastAsOfDateRef.current = asOfDate;
    if (asOfDate === undefined) return;

    // Reset snapshot tracking + clear grid before re-fetching so the
    // new snapshot doesn't visually accrete on top of the old.
    snapshotCompleteRef.current = false;
    if (gridApiRef.current) {
      gridApiRef.current.setGridOption('rowData', []);
    }
    const extra = { asOfDate };
    onRequestRestart?.(extra);
    restart(extra).catch((err) => onError?.(err instanceof Error ? err : new Error(String(err))));
  }, [asOfDate, restart, onRequestRestart, onError]);

  // Empty rowData is fine — we hydrate via applyTransactionAsync. The
  // memo keeps prop-identity stable across renders so MarketsGrid
  // doesn't re-diff on every update.
  const emptyRows = useMemo<TData[]>(() => [], []);

  return (
    <MarketsGrid<TData>
      {...(marketsGridProps as MarketsGridProps<TData>)}
      rowData={emptyRows}
      rowIdField={rowIdField}
      onReady={onReady}
    />
  );
}
