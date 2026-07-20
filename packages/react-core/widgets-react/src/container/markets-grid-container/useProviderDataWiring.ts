/**
 * Provider → grid data-wiring effect, extracted from
 * {@link MarketsGridContainer} to keep that component under the 800-LOC
 * ceiling. This is the hot path: it subscribes the live `GridApi` to the
 * active {@link IDataProvider}'s snapshot / tick / status / error streams,
 * drives the loading-overlay state setters, and kicks the initial
 * `start()` / `restart()` depending on whether the hub slot is already
 * warm (live cold-start connects immediately; historical restore waits
 * briefly for a peer window — see {@link PEER_PROVIDER_WAIT_MS}).
 *
 * Behaviour is identical to the inlined effect — same body, same deps
 * array, same eslint-disable. The container owns the state; this hook
 * just receives the inputs + setters it needs.
 */
import { useEffect } from 'react';
import type { GridApi } from 'ag-grid-community';
import {
  isProviderWorkerRunning,
  type IDataProvider,
  type ProviderWorkerRoutingOpts,
} from '@wellsfargo-starui/host-data';
import type { MarketsGridHandle } from '@wellsfargo-starui/grid';
import { isHistoricalToolbarDate } from '@wellsfargo-starui/grid/customizer';
import { createApplyProviderToGridState } from './applyProviderToGrid.js';
import type { ProviderMode } from './gridLevelState.js';
import type { useDataServices } from '@wellsfargo-starui/host-data-react/runtime';
import type { createMarketsGridContainerEventBus } from '@wellsfargo-starui/grid';

/** Historical restore only — brief peer race before `restartProvider()`. Live mode connects immediately. */
const PEER_PROVIDER_WAIT_MS = 2_000;

/**
 * Gate for hot-path diagnostic logs. Flip to `true` locally when debugging
 * subscribe / update / unsubscribe behavior.
 */
const DEBUG = false;

type DataHubClient = ReturnType<typeof useDataServices>['client'];
type ContainerEventBus = ReturnType<typeof createMarketsGridContainerEventBus>;

export interface UseProviderDataWiringParams<TData extends Record<string, unknown>> {
  liveApi: GridApi<TData> | null;
  provider: IDataProvider<TData> | null;
  activeId: string | null;
  subscriptionKey: string | null;
  rowIdField: string | readonly string[] | null;
  rowIdFieldKey: string | readonly string[] | null;
  mode: ProviderMode;
  asOfDate: string | null;
  toolbarDate: string;
  dataHubClient: DataHubClient;
  /**
   * When set (star-demo demux), peer-running checks use the provider
   * SharedWorker — monolith introspect has no streaming slots.
   */
  providerWorkerRouting?: ProviderWorkerRoutingOpts;
  restartProvider: (extra?: Record<string, unknown>) => Promise<void>;
  /**
   * `'pull'`: the dataset lives in a worker-hosted Perspective table and the
   * grid reads viewport blocks through its own engine — this wiring must NOT
   * apply snapshot rows or ticks to the grid (the pull engine would write
   * them back into the shared table). Provider start/restart, status, and
   * overlay bookkeeping still run. Default `'push'`.
   */
  dataPlane?: 'push' | 'pull';
  onError?: (error: Error) => void;
  containerEventBus: ContainerEventBus;
  setLoadRowCount: (count: number | undefined) => void;
  setProviderDisconnected: (disconnected: boolean) => void;
  setDisconnectDetail: (detail: string | undefined) => void;
  setResolvedSubKey: (key: string | null) => void;
  setIsRefetching: (refetching: boolean) => void;
  /**
   * When true, pause applying live ticks to the grid while `document.hidden`
   * (background view / inactive tab) and run one `provider.refresh()` on
   * return. When false (default), live ticks always apply. Driven by the
   * `pauseUpdatesWhenHidden` grid setting.
   */
  pauseUpdatesWhenHidden: boolean;
  /** When true, live ticks route through `gridHandle.applyDataTransactionAsync`. */
  useSSRM?: boolean;
  gridHandle: MarketsGridHandle | null;
  /**
   * SSRM snapshot sink — lab/STOMP pattern: full book via React `rowData`
   * (SsrmGrid `setRowData`), ticks via `applyDataTransactionAsync`.
   * CSRM ignores this and uses `liveApi.setGridOption('rowData')`.
   */
  onSsrmSnapshot?: (rows: TData[]) => void;
}

function defaultOnError(err: Error): void {
  // eslint-disable-next-line no-console
  console.error('[MarketsGridContainer]', err);
}

export function useProviderDataWiring<TData extends Record<string, unknown>>(
  params: UseProviderDataWiringParams<TData>,
): void {
  const {
    liveApi,
    provider,
    activeId,
    subscriptionKey,
    rowIdField,
    rowIdFieldKey,
    mode,
    asOfDate,
    toolbarDate,
    dataHubClient,
    providerWorkerRouting,
    restartProvider,
    dataPlane,
    onError,
    containerEventBus,
    setLoadRowCount,
    setProviderDisconnected,
    setDisconnectDetail,
    setResolvedSubKey,
    setIsRefetching,
    pauseUpdatesWhenHidden,
    useSSRM = false,
    gridHandle,
    onSsrmSnapshot,
  } = params;

  const applyDataTransactionAsync = gridHandle?.applyDataTransactionAsync;
  const pull = dataPlane === 'pull';

  useEffect(() => {
    // SSRM needs the MarketsGrid handle (applyDataTransactionAsync) so ticks
    // land after snapshot; snapshot itself goes through onSsrmSnapshot → rowData.
    // Pull plane needs NO data surface — rows never flow through this window.
    const dataSurfaceReady = pull
      ? true
      : useSSRM
        ? Boolean(applyDataTransactionAsync) && Boolean(onSsrmSnapshot)
        : Boolean(liveApi);

    if (!dataSurfaceReady || !provider || !activeId) {
      if (DEBUG) {
        // eslint-disable-next-line no-console
        console.log(`[v2/grid]   provider wiring skipped: dataSurface=%s provider=%s activeId=%s useSSRM=%s`,
          dataSurfaceReady, Boolean(provider), activeId, useSSRM);
      }
      return;
    }

    setLoadRowCount(undefined);
    setProviderDisconnected(false);
    setDisconnectDetail(undefined);

    const thisSubKey = subscriptionKey ?? `${activeId}::${rowIdFieldKey}`;
    const t0 = performance.now();
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log(
        '[refresh] %c5. provider wiring effect fired%c provider=%s',
        'color:#ec4899', '', activeId,
      );
    }

    let cancelled = false;
    // When the pause-when-hidden setting is OFF, live ticks always apply.
    // When ON, start paused if the document is currently hidden.
    let applyLiveTicks =
      !pauseUpdatesWhenHidden || typeof document === 'undefined' || !document.hidden;
    const gridApply = createApplyProviderToGridState();
    const providerStatusRef = { current: 'loading' as 'loading' | 'ready' | 'error' };

    const onVisibilityChange = () => {
      const wasPaused = !applyLiveTicks;
      applyLiveTicks = !document.hidden;
      if (wasPaused && applyLiveTicks && !cancelled) {
        void provider.refresh().catch((err: unknown) => {
          if (cancelled) return;
          (onError ?? defaultOnError)(err instanceof Error ? err : new Error(String(err)));
        });
      }
    };
    if (pauseUpdatesWhenHidden && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    const unsubRows = provider.onRowsReceived((count) => {
      if (cancelled) return;
      setLoadRowCount(count);
    });

    const unsubSnapshot = provider.onSnapshotData((rows) => {
      if (cancelled) return;
      if (pull) {
        // Pull plane: the worker already teed this snapshot into the table.
        // Only the overlay bookkeeping runs — no grid/row application.
        setLoadRowCount(rows.length);
        setResolvedSubKey(thisSubKey);
        setIsRefetching(false);
        setProviderDisconnected(false);
        setDisconnectDetail(undefined);
        providerStatusRef.current = 'ready';
        return;
      }
      Promise.resolve().then(() => {
        if (cancelled) return;
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.log(
            '[refresh] %cflushAsyncTransactions BEFORE commit%c pendingAdds=%d gridRows=%d',
            'color:#f97316;font-weight:bold', '',
            gridApply.getPendingAddCount(), liveApi?.getDisplayedRowCount() ?? -1,
          );
        }
        if (liveApi) {
          try { liveApi.flushAsyncTransactions(); } catch (e) {
            if (DEBUG) {
              // eslint-disable-next-line no-console
              console.warn('[refresh]    flushAsyncTransactions threw:', e);
            }
          }
        }
        gridApply.clearPendingAdds();
        gridApply.markSnapshotLoaded(rows, rowIdField ?? undefined);
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.log(
            '[refresh] %csnapshot commit%c %d rows (onSnapshotData)',
            'color:#10b981;font-weight:bold', '', rows.length,
          );
        }
        // SSRM: commit book via React rowData (see markets-grid-lab /
        // stomp-marketsgrid-minimal docs — never setGridOption('rowData') under SSRM).
        if (useSSRM && onSsrmSnapshot) {
          onSsrmSnapshot(rows.slice() as TData[]);
        } else if (liveApi) {
          liveApi.setGridOption('rowData', rows.slice());
        }
        setLoadRowCount(rows.length);
        setResolvedSubKey(thisSubKey);
        setIsRefetching(false);
        setProviderDisconnected(false);
        setDisconnectDetail(undefined);
        providerStatusRef.current = 'ready';
      });
    });

    let updateBatchCount = 0;
    const unsubTick = provider.onTick((updateRows) => {
      if (cancelled || updateRows.length === 0 || !applyLiveTicks) return;
      // Pull plane: ticks reach the grid via the worker table + engine
      // dirty notifications; applying them here would write into the
      // SHARED table through the pull engine.
      if (pull) return;
      updateBatchCount += 1;

      if (useSSRM && applyDataTransactionAsync) {
        applyDataTransactionAsync({
          update: updateRows as unknown[],
        });
        return;
      }

      if (!liveApi) return;

      if (!rowIdField) {
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.log(`[v2/grid] %cupdate#%d%c %d rows (no rowIdField → all update)`, 'color:#f59e0b', '', updateBatchCount, updateRows.length);
        }
        gridApply.applyTick(liveApi, updateRows, undefined);
        return;
      }

      const { coalescedPending, addCount, updateCount } = gridApply.applyTick(
        liveApi,
        updateRows,
        rowIdField,
      );
      if (coalescedPending > 0 && DEBUG) {
        // eslint-disable-next-line no-console
        console.log(
          '[refresh]   %clive split (rows coalesced behind pending adds)%c add=%d update=%d coalescedPending=%d',
          'color:#f97316', '',
          addCount, updateCount, coalescedPending,
        );
      }
    });

    const unsubStatus = provider.onStatus((s, err) => {
      if (DEBUG) {
        // eslint-disable-next-line no-console
        console.log(
          `[refresh] %cstatus%c %s${err ? ' error=' + JSON.stringify(err) : ''} (+${(performance.now() - t0).toFixed(0)}ms) — pendingAdds=${gridApply.getPendingAddCount()}`,
          'color:#a855f7;font-weight:bold', '', s,
        );
      }
      if (cancelled) return;

      const wasDisconnected = providerStatusRef.current === 'error';

      if (s === 'loading') {
        setIsRefetching(true);
        setProviderDisconnected(false);
        setDisconnectDetail(undefined);
        if (providerStatusRef.current === 'ready' || providerStatusRef.current === 'error') {
          gridApply.clearPendingAdds();
        }
        providerStatusRef.current = 'loading';
      }

      if (err) {
        providerStatusRef.current = s;
        setProviderDisconnected(true);
        setDisconnectDetail(err);
        setResolvedSubKey(thisSubKey);
        setIsRefetching(false);
        (onError ?? defaultOnError)(new Error(err));
        return;
      }

      if (s === 'ready') {
        setProviderDisconnected(false);
        setDisconnectDetail(undefined);
        setIsRefetching(false);
        providerStatusRef.current = 'ready';
        if (wasDisconnected) {
          void provider.refresh().catch((refreshErr: unknown) => {
            if (cancelled) return;
            (onError ?? defaultOnError)(
              refreshErr instanceof Error ? refreshErr : new Error(String(refreshErr)),
            );
          });
        }
      } else if (s !== 'loading') {
        providerStatusRef.current = s;
      }

      containerEventBus.emit('provider:status', {
        status: s,
        error: err,
        providerId: activeId,
        mode,
      });
    });

    const unsubError = provider.onError((err) => {
      if (cancelled) return;
      setResolvedSubKey(thisSubKey);
      setIsRefetching(false);
      (onError ?? defaultOnError)(err);
    });

    void (async () => {
      try {
        let running = providerWorkerRouting
          ? await isProviderWorkerRunning({
              ...providerWorkerRouting,
              providerId: activeId,
            })
          : await dataHubClient.isProviderRunning(activeId);
        const asOfForRestart = mode === 'historical'
          ? (asOfDate ?? (isHistoricalToolbarDate(toolbarDate) ? toolbarDate : null))
          : null;
        // Live cold start connects immediately — hub attach dedupes concurrent
        // windows. Historical restore waits briefly so a peer with the same
        // overlay can finish starting instead of this window calling restart().
        if (!running && asOfForRestart) {
          if (providerWorkerRouting) {
            const deadline = Date.now() + PEER_PROVIDER_WAIT_MS;
            while (!running && Date.now() < deadline) {
              await new Promise((r) => setTimeout(r, 50));
              running = await isProviderWorkerRunning({
                ...providerWorkerRouting,
                providerId: activeId,
              });
            }
          } else {
            running = await dataHubClient.waitForProviderRunning(activeId, {
              timeoutMs: PEER_PROVIDER_WAIT_MS,
            });
          }
        }
        // Stable overlay only. Do NOT stamp `__refresh` here — under
        // provider-SW demux, monolith `isProviderRunning` is always false, so
        // a per-window `__refresh` forced STOMP restart and flashed
        // "Refreshing…" / "Replaying cached snapshot…" on settled peers.
        // Intentional Reload stamps `__reload` via `reloadFromSource` only.
        const extra: Record<string, unknown> = {
          rowShape: useSSRM ? 'ssrm' : 'csrm',
        };
        if (asOfForRestart) extra.asOfDate = asOfForRestart;
        // restart() re-attaches with overlay; hub late-joins when the
        // stable overlay matches (rowShape / asOfDate), without upstream
        // restart. start() alone would drop rowShape overlay.
        await restartProvider(extra);
      } catch (err: unknown) {
        if (cancelled) return;
        setResolvedSubKey(thisSubKey);
        (onError ?? defaultOnError)(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return () => {
      cancelled = true;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      unsubRows();
      unsubSnapshot();
      unsubTick();
      unsubStatus();
      unsubError();
      if (DEBUG) {
        // eslint-disable-next-line no-console
        console.log(`[v2/grid] %cunwire provider%c provider=%s (effect cleanup, +${(performance.now() - t0).toFixed(0)}ms)`,
          'color:#6b7280', '', activeId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveApi, provider, activeId, rowIdFieldKey, onError, dataHubClient, mode, asOfDate, toolbarDate, restartProvider, pauseUpdatesWhenHidden, useSSRM, pull, applyDataTransactionAsync, onSsrmSnapshot]);
}
