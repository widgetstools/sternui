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
import type { GridApi } from 'ag-grid-community';
import { MarketsGrid } from '@marketsui/markets-grid';
import type { MarketsGridProps, MarketsGridHandle } from '@marketsui/markets-grid';
import {
  useDataPlaneRowStream,
  useDataPlaneRestart,
  useDataPlaneClient,
} from '@marketsui/data-plane-react';
import type { StreamListener } from '@marketsui/data-plane/client';
import { dataProviderConfigService } from '@marketsui/data-plane';

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
  const client = useDataPlaneClient();
  const [providerReady, setProviderReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProviderReady(false);
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
      console.info(`${tag} config loaded`, {
        providerType: cfg.providerType,
        name: cfg.name,
      });
      // The DataProviderConfig wrapper carries a typed inner `config`
      // (StompProviderConfig | RestProviderConfig | …). The worker's
      // factory dispatches on `providerType` to build the right
      // provider instance.
      await client.configure(providerId, cfg.config);
      if (cancelled) return;
      console.info(`${tag} worker configured; mounting subscriber`);
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
  }, [providerId, client]);

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
      {providerReady && (
        <StreamSubscriber<TData>
          providerId={providerId}
          keyColumn={rowIdField}
          onEvent={stableOnEvent}
        />
      )}
      <MarketsGrid<TData>
        {...(marketsGridProps as MarketsGridProps<TData>)}
        rowData={emptyRows}
        rowIdField={rowIdField}
        onReady={onReady}
      />
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
