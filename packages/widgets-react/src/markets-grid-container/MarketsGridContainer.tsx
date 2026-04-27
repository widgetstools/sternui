/**
 * MarketsGridContainer — wraps `<MarketsGrid />` and feeds it from the
 * data plane instead of a static `rowData` array.
 *
 * Lifecycle
 * ---------
 *   1. On `providerId` change, look up the saved DataProviderConfig
 *      via `dataProviderConfigService.getById()` and call
 *      `client.configure(providerId, cfg.config)` so the worker
 *      router has a slot to subscribe to. Without this step,
 *      `subscribe-stream` is rejected with PROVIDER_NOT_CONFIGURED
 *      and no rows ever flow.
 *   2. Mount `<MarketsGrid />` with `rowData={[]}` and a `getRowId`
 *      derived from `rowIdField`. AG-Grid's `onReady` captures the
 *      `gridApi` ref.
 *   3. Once configure resolves, mount the `<StreamSubscriber>` leaf
 *      which uses `useDataPlaneRowStream` in `onEvent` mode. Snapshot
 *      batches stream through `applyTransactionAsync({ add })`,
 *      realtime updates through `applyTransactionAsync({ update })`.
 *      No React-side buffering of rows.
 *
 * Why split into two components
 * -----------------------------
 * `useDataPlaneRowStream` re-runs its subscribe effect when its
 * `providerId` arg or `onEvent` identity changes. We want AG-Grid
 * mounted unconditionally (so its chrome doesn't flash on every
 * provider swap) but the subscription mounted only after configure
 * has succeeded. Splitting `<StreamSubscriber>` out makes that
 * independence explicit and keeps AG-Grid's lifecycle stable.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef, GridApi } from 'ag-grid-community';
import { MarketsGrid } from '@marketsui/markets-grid';
import type { MarketsGridProps, MarketsGridHandle } from '@marketsui/markets-grid';
import {
  useDataPlaneRowStream,
  useDataPlaneRestart,
  useDataPlaneClient,
} from '@marketsui/data-plane-react';
import type { StreamListener } from '@marketsui/data-plane/client';
import { dataProviderConfigService } from '@marketsui/data-plane';
import type { ColumnDefinition } from '@marketsui/shared-types';

export interface MarketsGridContainerProps<TData extends Record<string, unknown> = Record<string, unknown>>
  extends Omit<MarketsGridProps<TData>, 'rowData' | 'rowIdField' | 'columnDefs'> {
  /** Worker-registered providerId to subscribe to. */
  providerId: string;
  /**
   * Optional override for column defs. Normally the container derives
   * these from the saved DataProvider's `columnDefinitions` (authored
   * in the editor's Columns tab). Pass this only as a last-resort
   * override; it short-circuits the provider-driven defs.
   */
  columnDefs?: ColDef<TData>[];
  /**
   * Optional override for the row-id field. By default the container
   * reads `keyColumn` from the loaded DataProviderConfig — that's the
   * value the user authored in the editor's Row Identity callout.
   * Apps should rarely need to override; pass this only if the saved
   * config carries the wrong field for some reason and you want a
   * per-instance escape hatch.
   */
  rowIdField?: string;
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
    rowIdField: rowIdFieldOverride,
    columnDefs: columnDefsOverride,
    asOfDate,
    onRequestRestart,
    onError,
    onReady: onReadyProp,
    ...marketsGridProps
  } = props;

  const gridApiRef = useRef<GridApi<TData> | null>(null);
  const snapshotCompleteRef = useRef(false);
  // Snapshot rows accumulate here while the snapshot phase is in
  // flight; on `onSnapshotComplete` they're dispatched via
  // setGridOption('rowData', ...) in one shot. pendingUpdatesRef
  // holds row-updates that arrived too early (grid not ready, or
  // snapshot hasn't completed yet).
  const snapshotRowsRef = useRef<TData[]>([]);
  const pendingUpdatesRef = useRef<TData[]>([]);

  // Mutable callback ref so the listener identity stays stable but
  // callers can swap the onError handler freely.
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // ── Configure the worker for this providerId ────────────────────
  //
  // The router rejects subscribe-stream with PROVIDER_NOT_CONFIGURED
  // when no slot exists for the given id. So before we can subscribe
  // we have to look up the saved DataProviderConfig (REST or local
  // Dexie) and call `client.configure()` to register it. Router's
  // getOrCreate is idempotent — repeat calls for the same id are safe.
  //
  // We also capture the resolved `rowIdField` here. AG-Grid's
  // `getRowId` is an INITIAL property — once the grid mounts, the
  // value can't be changed. So the grid is gated on configResolved
  // and remounts via key={providerId} when the user swaps providers,
  // ensuring the correct getRowId comes from the new provider's
  // keyColumn.
  const client = useDataPlaneClient();
  const [providerReady, setProviderReady] = useState(false);
  const [resolvedRowIdField, setResolvedRowIdField] = useState<string | null>(null);
  const [resolvedColumnDefs, setResolvedColumnDefs] = useState<ColDef<TData>[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProviderReady(false);
    setResolvedRowIdField(null);
    setResolvedColumnDefs(null);
    // Reset snapshot/realtime state for the new provider — any rows
    // accumulated for the previous provider must NOT spill into the
    // new one's setRowData call.
    snapshotCompleteRef.current = false;
    snapshotRowsRef.current = [];
    pendingUpdatesRef.current = [];

    if (!providerId) return;

    // Breadcrumbs aid debugging when nothing seems to happen — a
    // common failure mode is the configure path silently throwing.
    // Tag the lines so they're easy to filter in devtools.
    const tag = `[MarketsGridContainer:${providerId}]`;
    console.info(`${tag} resolving config + configuring worker`);

    (async () => {
      const cfg = await dataProviderConfigService.getById(providerId);
      if (cancelled) return;
      if (!cfg) {
        throw new Error(
          `DataProvider not found in storage: ${providerId}. ` +
          `Re-create / re-pick the provider in the editor.`,
        );
      }
      // Resolve the row-id field. The user's explicit prop override
      // wins, but normally the keyColumn from the saved DataProvider
      // config is the source of truth. Without one, getRowId returns
      // undefined and AG-Grid logs "Duplicate node id 'undefined'"
      // for every incoming row.
      const cfgKeyColumn = (cfg.config as { keyColumn?: string }).keyColumn;
      const effectiveRowIdField = rowIdFieldOverride || cfgKeyColumn;
      if (!effectiveRowIdField) {
        throw new Error(
          `DataProvider '${cfg.name}' has no keyColumn configured. ` +
          `Open it in the editor → Connection tab → Key Column, set the ` +
          `unique-id field for your rows (e.g. 'positionId'), and save.`,
        );
      }
      // Resolve column defs. Provider-driven (from
      // cfg.config.columnDefinitions, which the editor's Columns tab
      // authors) is the source of truth. Override prop wins only when
      // explicitly set. Falls back to a single keyColumn-based
      // placeholder so the grid still mounts when the user hasn't
      // authored any columns yet.
      const cfgColumnDefinitions = (cfg.config as { columnDefinitions?: ColumnDefinition[] }).columnDefinitions;
      const effectiveColumnDefs: ColDef<TData>[] = columnDefsOverride
        ? columnDefsOverride
        : cfgColumnDefinitions && cfgColumnDefinitions.length > 0
          ? (cfgColumnDefinitions as unknown as ColDef<TData>[])
          : [{ field: effectiveRowIdField as keyof TData & string, headerName: effectiveRowIdField, filter: true } as ColDef<TData>];

      console.info(`${tag} config loaded`, {
        providerType: cfg.providerType,
        name: cfg.name,
        rowIdField: effectiveRowIdField,
        columnCount: effectiveColumnDefs.length,
      });
      // The DataProviderConfig wrapper carries a typed inner `config`
      // (StompProviderConfig | RestProviderConfig | …). The worker's
      // factory dispatches on `providerType` to build the right
      // provider instance.
      await client.configure(providerId, cfg.config);
      if (cancelled) return;
      console.info(`${tag} worker configured; mounting subscriber`);
      setResolvedRowIdField(effectiveRowIdField);
      setResolvedColumnDefs(effectiveColumnDefs);
      setProviderReady(true);
    })().catch((err: unknown) => {
      if (cancelled) return;
      const error = err instanceof Error ? err : new Error(String(err));
      // Surface to the explicit handler if the consumer wired one;
      // otherwise log so the user can see what went wrong instead of
      // staring at an empty grid. Suppressing both is what was making
      // the "doesn't even try to connect" failure mode invisible.
      if (onErrorRef.current) {
        onErrorRef.current(error);
      } else {
        console.error(`${tag} configure failed`, error);
      }
    });

    return () => { cancelled = true; };
  }, [providerId, client, rowIdFieldOverride, columnDefsOverride]);

  // ── Snapshot vs realtime semantics ──────────────────────────────
  //
  // STOMP server contract: a stream of snapshot batches, then an
  // end-of-snapshot token (e.g. "Success"), then live updates. The
  // worker translates that to:
  //   onSnapshotBatch * N  →  onSnapshotComplete  →  onRowUpdate * N
  //
  // The grid handles those two phases very differently:
  //
  //   • Snapshot phase — we accumulate ALL batches into a buffer and,
  //     on `onSnapshotComplete`, apply the entire set as `rowData` in
  //     one synchronous call. This is the documented AG-Grid pattern
  //     for initial loads. It also avoids a race that the previous
  //     "stream batches via applyTransactionAsync({add})" path
  //     exhibited: AG-Grid's transaction queue isn't flushed
  //     synchronously, so live updates that arrived right after
  //     "Success" could land before the corresponding adds, producing
  //     "Could not find row id=…" errors for every update.
  //
  //   • Realtime phase — every batch and every row-update goes
  //     through `applyTransactionAsync({ update })`. The id is
  //     guaranteed to exist because we already replaced rowData with
  //     the full snapshot.
  //
  // If updates arrive BEFORE the grid is ready (rare — onReady fires
  // synchronously on AgGridReact mount), or before `onSnapshotComplete`
  // (also rare — by definition the server sent updates after
  // "Success"), we buffer them and drain at the right boundary.

  const applyUpdates = useCallback((rows: readonly TData[]) => {
    const api = gridApiRef.current;
    if (!api || rows.length === 0) return;
    api.applyTransactionAsync({ update: rows.slice() });
  }, []);

  const flushSnapshotToGrid = useCallback(() => {
    const api = gridApiRef.current;
    if (!api) return;
    api.setGridOption('rowData', snapshotRowsRef.current.slice());
    // Snapshot is now in the grid; release the buffer so it doesn't
    // pin memory. Subsequent batches go through update transactions.
    snapshotRowsRef.current = [];
    if (pendingUpdatesRef.current.length > 0) {
      api.applyTransactionAsync({ update: pendingUpdatesRef.current.slice() });
      pendingUpdatesRef.current = [];
    }
  }, []);

  // ── Stable onEvent listener (one identity for the lifetime) ─────
  const stableOnEvent = useMemo<StreamListener<TData>>(() => ({
    onSnapshotBatch: (batch) => {
      if (!snapshotCompleteRef.current) {
        // Snapshot phase — accumulate, don't touch the grid yet.
        snapshotRowsRef.current.push(...(batch.rows as TData[]));
        return;
      }
      // Realtime-phase batch (uncommon: a restart() can re-issue
      // batches). Treat as upsert.
      if (gridApiRef.current) {
        applyUpdates(batch.rows);
      } else {
        pendingUpdatesRef.current.push(...(batch.rows as TData[]));
      }
    },
    onSnapshotComplete: () => {
      snapshotCompleteRef.current = true;
      // If the grid is mounted, apply the snapshot as rowData now.
      // Otherwise onReady will drain when the grid arrives.
      if (gridApiRef.current) {
        flushSnapshotToGrid();
      }
    },
    onRowUpdate: (update) => {
      if (gridApiRef.current && snapshotCompleteRef.current) {
        applyUpdates(update.rows);
      } else {
        // Defer: either the grid isn't ready, or the snapshot
        // hasn't finished. Either way we must NOT apply an update
        // before the corresponding row is in rowData.
        pendingUpdatesRef.current.push(...(update.rows as TData[]));
      }
    },
    onError: (err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      if (onErrorRef.current) {
        onErrorRef.current(error);
      } else {
        console.error('[MarketsGridContainer] stream error', error);
      }
    },
  }), [applyUpdates, flushSnapshotToGrid]);

  // ── Capture grid api on ready, drain any buffered snapshot ───────
  const onReady = useCallback(
    (handle: MarketsGridHandle) => {
      gridApiRef.current = handle.gridApi as unknown as GridApi<TData>;
      // If the snapshot already completed before the grid mounted,
      // apply it now via rowData. If the snapshot is still ongoing,
      // the buffer keeps growing and onSnapshotComplete will flush it.
      if (snapshotCompleteRef.current) {
        flushSnapshotToGrid();
      }
      onReadyProp?.(handle);
    },
    [flushSnapshotToGrid, onReadyProp],
  );

  // ── Historical-mode restart on asOfDate change ───────────────────
  const { restart } = useDataPlaneRestart(providerId);
  const lastAsOfDateRef = useRef<string | undefined>(asOfDate);
  useEffect(() => {
    if (asOfDate === lastAsOfDateRef.current) return;
    lastAsOfDateRef.current = asOfDate;
    if (asOfDate === undefined) return;
    if (!providerReady) return; // skip until first configure resolves

    snapshotCompleteRef.current = false;
    if (gridApiRef.current) {
      gridApiRef.current.setGridOption('rowData', []);
    }
    const extra = { asOfDate };
    onRequestRestart?.(extra);
    restart(extra).catch((err) => onErrorRef.current?.(err instanceof Error ? err : new Error(String(err))));
  }, [asOfDate, providerReady, restart, onRequestRestart]);

  // Empty rowData is fine — we hydrate via applyTransactionAsync. The
  // memo keeps prop-identity stable across renders.
  const emptyRows = useMemo<TData[]>(() => [], []);

  return (
    <>
      {providerReady && resolvedRowIdField && (
        <StreamSubscriber<TData>
          providerId={providerId}
          keyColumn={resolvedRowIdField}
          onEvent={stableOnEvent}
        />
      )}
      {/* AG-Grid's getRowId is INITIAL — fixed at mount time and
          can't be changed. Gate the grid on `resolvedRowIdField` so
          the first mount has the correct id callback, and key on
          `providerId + rowIdField` so swapping providers (potentially
          with a different keyColumn) cleanly remounts the grid. */}
      {resolvedRowIdField && resolvedColumnDefs ? (
        <MarketsGrid<TData>
          {...(marketsGridProps as MarketsGridProps<TData>)}
          key={`${providerId}::${resolvedRowIdField}`}
          rowData={emptyRows}
          rowIdField={resolvedRowIdField}
          columnDefs={resolvedColumnDefs}
          onReady={onReady}
        />
      ) : null}
    </>
  );
}

// ─── Stream subscriber leaf ─────────────────────────────────────────
//
// Side-effect-only component. Splitting the subscription out of
// MarketsGridContainer lets us mount/unmount the subscription on
// `providerReady` flips without remounting AG-Grid every time.

interface StreamSubscriberProps<TData> {
  providerId: string;
  keyColumn: string;
  onEvent: StreamListener<TData>;
}

function StreamSubscriber<TData extends Record<string, unknown>>({
  providerId,
  keyColumn,
  onEvent,
}: StreamSubscriberProps<TData>): React.ReactElement | null {
  useDataPlaneRowStream<TData>(providerId, { keyColumn, onEvent });
  return null;
}
