import { useEffect, useMemo, useRef, useState } from 'react';
import { useProviderStream } from '@starui/host-data-react/runtime';
import type { MockProviderConfig } from '@starui/types';
import { applyDelta } from './applyDelta';
import type { LabRow, StreamOptions } from './types';

/**
 * Subscribes to the canonical MockDataProvider hosted in the
 * data-services SharedWorker, identified by a tab-scoped `providerId`.
 *
 * Why a SharedWorker:
 *   - Data generation + the keyed row cache run off the main thread, so
 *     UI work (sorting, scrolling, paint) isn't fighting the ticker.
 *   - The hub dedupes incoming rows by `cfg.keyColumn` and emits deltas
 *     instead of full snapshots, so a tick costs O(changed rows) not
 *     O(all rows).
 *
 * The worker auto-stops a provider when no subscribers remain (i.e.
 * when the user switches tabs and Radix unmounts the inactive content).
 *
 * `providerId` is required and MUST be unique per tab — colliding ids
 * would share a single stream across tabs that may want different
 * configs.
 */
export function useMockStream(providerId: string, opts: StreamOptions = {}): LabRow[] {
  const { rowCount = 500, updateIntervalMs = 500, enableUpdates = true } = opts;

  // Hub only applies `cfg` on the *first* attach per providerId; later
  // attaches are late-joiners. Stream tuning (interval, pause, row count)
  // must go through `refresh({ ... })` → provider.restart(extra).
  const cfg = useMemo<MockProviderConfig>(
    () => ({
      providerType: 'mock',
      dataType: 'positions',
      rowCount,
      updateIntervalMs,
      enableUpdates,
      // Must match the MarketsGrid `rowIdField` so the hub's keyed cache
      // and AG-Grid's `getRowId` agree.
      keyColumn: 'id',
    }),
    [providerId],
  );

  const [rows, setRows] = useState<LabRow[]>([]);
  const rowsRef = useRef<LabRow[]>([]);

  const { refresh, status } = useProviderStream<LabRow>(providerId, cfg, {
    onDelta: (incoming, replace) => {
      rowsRef.current = replace
        ? [...incoming]
        : applyDelta(rowsRef.current, incoming, 'id');
      setRows(rowsRef.current);
    },
    onStatus: () => {
      // Status changes (loading/ready/error) drive optional UI overlays.
      // The lab doesn't surface a banner here — MarketsGrid's own
      // `dataStale` prop is the canonical way to expose disconnects.
    },
  });

  useEffect(() => {
    if (status !== 'ready') return;
    refresh({ updateIntervalMs, enableUpdates, rowCount });
  }, [status, updateIntervalMs, enableUpdates, rowCount, refresh]);

  // Reset local snapshot when the provider id flips (tab change).
  useEffect(() => {
    rowsRef.current = [];
    setRows([]);
  }, [providerId]);

  return rows;
}
