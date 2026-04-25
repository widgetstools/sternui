/**
 * useDataPlaneRowStream — subscribe to a row-stream provider (STOMP,
 * WebSocket, SocketIO).
 *
 * Two modes:
 *   • Default: buffered. The hook maintains an internal row set keyed
 *     by the provider's `keyColumn` (reported by the worker in
 *     `snapshot-batch.diagnostics`). `rows` always reflects the
 *     current cached state. Snapshot phase accumulates; realtime
 *     phase upserts. Good for small-to-medium datasets where
 *     re-rendering the full row list is acceptable.
 *
 *   • `onEvent` mode: no buffering. Every `snapshot-batch` /
 *     `snapshot-complete` / `row-update` is forwarded verbatim to
 *     the callback; the hook's `rows` stays empty. Good for large
 *     streams piped directly into AG-Grid's `applyTransaction` or
 *     any other imperative sink that doesn't want React re-renders.
 *
 * The hook also exposes `isSnapshotComplete` so consumers can hide
 * loading overlays on phase transition, and `error` for transport
 * failures.
 *
 * Rationale
 * ---------
 * Row-stream providers can deliver 10k+ rows per snapshot. Rebuilding
 * a useState array on every batch is O(n²) and rerenders the tree.
 * The `onEvent` escape hatch is the primary integration path for
 * grids; the buffered mode is for small, app-state-ish streams.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DataPlaneClientError,
  StreamListener,
} from '@marketsui/data-plane/client';
import { useDataPlaneClient } from './context';

export interface UseRowStreamOpts<TRow> {
  /**
   * Forward every provider event here. When present, the hook does
   * NOT buffer rows into state — callers manage their own sink.
   */
  onEvent?: StreamListener<TRow>;
  /**
   * Field used to dedupe rows when buffering. Normally resolved from
   * the provider's config at worker side; supplying it here short-
   * circuits the diagnostic fallback when buffering begins before
   * the first snapshot batch arrives. Ignored in `onEvent` mode.
   */
  keyColumn?: string;
}

export interface UseRowStreamResult<TRow> {
  rows: readonly TRow[];
  isSnapshotComplete: boolean;
  error: DataPlaneClientError | null;
}

export function useDataPlaneRowStream<TRow extends Record<string, unknown> = Record<string, unknown>>(
  providerId: string,
  opts: UseRowStreamOpts<TRow> = {},
): UseRowStreamResult<TRow> {
  const client = useDataPlaneClient();
  const buffered = !opts.onEvent;
  const [rows, setRows] = useState<readonly TRow[]>([]);
  const [isSnapshotComplete, setIsSnapshotComplete] = useState(false);
  const [error, setError] = useState<DataPlaneClientError | null>(null);

  // Cache must outlive renders without triggering re-renders — a ref holds it.
  const cacheRef = useRef<Map<string, TRow>>(new Map());
  const keyColumnRef = useRef<string | undefined>(opts.keyColumn);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    cacheRef.current = new Map();
    keyColumnRef.current = opts.keyColumn;
    setRows([]);
    setIsSnapshotComplete(false);
    setError(null);

    const flushIfBuffered = () => {
      if (!buffered || cancelled) return;
      setRows(Array.from(cacheRef.current.values()));
    };

    const upsert = (inRows: readonly TRow[]) => {
      const kc = keyColumnRef.current;
      if (!kc) return;
      const m = cacheRef.current;
      for (const row of inRows) {
        const v = (row as Record<string, unknown>)[kc];
        if (v === undefined || v === null) continue;
        m.set(String(v), row);
      }
    };

    const listener: StreamListener<TRow> = {
      onSnapshotBatch: (batch) => {
        opts.onEvent?.onSnapshotBatch?.(batch);
        if (!buffered) return;
        // Pick up keyColumn from the diagnostics if the first batch
        // carries them (the worker attaches diagnostics to the single
        // batch sent to a late joiner; live snapshots don't get them,
        // so consumers should pass `keyColumn` explicitly if they
        // might subscribe before the provider fires diagnostics).
        if (!keyColumnRef.current && batch.diagnostics?.keyColumn) {
          keyColumnRef.current = batch.diagnostics.keyColumn;
        }
        upsert(batch.rows);
        flushIfBuffered();
      },
      onSnapshotComplete: (complete) => {
        opts.onEvent?.onSnapshotComplete?.(complete);
        if (cancelled) return;
        setIsSnapshotComplete(true);
      },
      onRowUpdate: (update) => {
        opts.onEvent?.onRowUpdate?.(update);
        if (!buffered) return;
        upsert(update.rows);
        flushIfBuffered();
      },
      onError: (err) => {
        opts.onEvent?.onError?.(err);
        if (cancelled) return;
        // Transport `err` frames carry the DataPlaneError shape; the
        // DataPlaneClient forwards them as-is.
        setError(err as unknown as DataPlaneClientError);
      },
    };

    client
      .subscribeStream<TRow>(providerId, listener)
      .then((unsubFn) => {
        if (cancelled) {
          unsubFn();
          return;
        }
        unsub = unsubFn;
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err as DataPlaneClientError);
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [client, providerId, buffered, opts.keyColumn, opts.onEvent]);

  return useMemo(() => ({ rows, isSnapshotComplete, error }), [rows, isSnapshotComplete, error]);
}
