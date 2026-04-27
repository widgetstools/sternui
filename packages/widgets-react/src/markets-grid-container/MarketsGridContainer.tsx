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
  const snapshotBufferRef = useRef<TData[]>([]);
  const snapshotCompleteRef = useRef(false);

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
    snapshotCompleteRef.current = false;
    snapshotBufferRef.current = [];

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

  // ── Stable onEvent listener (one identity for the lifetime) ─────
  const stableOnEvent = useMemo<StreamListener<TData>>(() => ({
    onSnapshotBatch: (batch) => {
      if (gridApiRef.current && snapshotCompleteRef.current === false) {
        applyAdds(batch.rows);
      } else if (!gridApiRef.current) {
        // Grid not ready yet — buffer until onReady drains.
        snapshotBufferRef.current.push(...(batch.rows as TData[]));
      } else {
        // Realtime-phase batch (rare but possible after restart).
        applyUpdates(batch.rows);
      }
    },
    onSnapshotComplete: () => {
      snapshotCompleteRef.current = true;
    },
    onRowUpdate: (update) => {
      if (gridApiRef.current) {
        applyUpdates(update.rows);
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
  }), [applyAdds, applyUpdates]);

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
