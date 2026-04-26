/**
 * bufferedDispatch — wrap a fanout sink with conflate-by-key and/or
 * trailing-edge throttle.
 *
 * Two knobs, both optional:
 *   • conflateByKey — when set, the buffer is keyed by `row[key]`. A
 *     second update for the same key value replaces the first within
 *     the same throttle window. Drops intermediate values; the last
 *     write wins. Maps cleanly onto AG-Grid's `applyTransaction({
 *     update })` upsert semantics.
 *   • throttleMs   — flush window in milliseconds. 0 / undefined →
 *     immediate flush (effectively a passthrough). When set, calls
 *     fill the buffer; a single timer scheduled on the first call of
 *     each window flushes everything at the trailing edge.
 *
 * Designed for the data-plane's row-update fanout. Each subscriber
 * gets its own bufferedDispatch instance so consumers don't fight
 * over a shared buffer.
 *
 * The buffer is intentionally NOT bounded — we trust the throttle
 * window to keep memory in check. If a producer fires faster than
 * conflateByKey can collapse, the buffer can grow unbounded; that's
 * a sign throttleMs is set too high for the data rate.
 */

export interface BufferedDispatchOpts<TRow extends Record<string, unknown>> {
  conflateByKey?: string;
  throttleMs?: number;
  /** Receives the flushed batch. Called with at least one row. */
  flush: (rows: TRow[]) => void;
  /** Optional clock injection for tests. Defaults to global setTimeout/clearTimeout. */
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface BufferedDispatchHandle<TRow extends Record<string, unknown>> {
  /** Push rows into the buffer. Triggers an immediate flush if no throttle is set. */
  push: (rows: readonly TRow[]) => void;
  /** Force-flush any pending rows now. */
  flushNow: () => void;
  /** Cancel any pending flush + drop the buffer. Idempotent. */
  teardown: () => void;
}

export function bufferedDispatch<TRow extends Record<string, unknown>>(
  opts: BufferedDispatchOpts<TRow>,
): BufferedDispatchHandle<TRow> {
  const { conflateByKey, throttleMs, flush } = opts;
  const setTimer = opts.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  // Conflated mode keeps a Map keyed by row[conflateByKey]; non-conflated
  // mode keeps an ordered list. Choosing once up front avoids per-push
  // branching.
  const conflated = !!conflateByKey;
  const map: Map<unknown, TRow> | null = conflated ? new Map() : null;
  const list: TRow[] = conflated ? [] : [];

  let timer: unknown = null;

  const drainAndFlush = (): void => {
    let payload: TRow[];
    if (conflated && map) {
      if (map.size === 0) return;
      payload = [...map.values()];
      map.clear();
    } else {
      if (list.length === 0) return;
      payload = list.splice(0, list.length);
    }
    flush(payload);
  };

  const scheduleFlush = (): void => {
    if (timer != null) return;
    timer = setTimer(() => {
      timer = null;
      drainAndFlush();
    }, throttleMs ?? 0);
  };

  const push = (rows: readonly TRow[]): void => {
    if (rows.length === 0) return;

    if (!throttleMs) {
      // Immediate-mode fast path: skip buffering entirely.
      flush([...rows]);
      return;
    }

    if (conflated && map && conflateByKey) {
      for (const row of rows) {
        const key = row[conflateByKey];
        // Map.set replaces — last write wins (the upsert semantic).
        map.set(key, row);
      }
    } else {
      list.push(...rows);
    }
    scheduleFlush();
  };

  const flushNow = (): void => {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
    drainAndFlush();
  };

  const teardown = (): void => {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
    if (conflated && map) map.clear();
    else list.length = 0;
  };

  return { push, flushNow, teardown };
}
