import type { SerializedState } from '../core/types';
import type { GridStore } from './createGridStore';

interface AutoSaveCore {
  /** Snapshot every module's serialized state. */
  serializeAll(): Record<string, SerializedState>;
}

export interface AutoSaveOptions {
  core: AutoSaveCore;
  store: GridStore;
  /**
   * Called with the latest snapshot after the debounce window settles.
   * May be async; the engine ensures only one persist is in flight at a
   * time and coalesces any updates that arrive during that window.
   */
  persist: (snapshot: Record<string, SerializedState>) => void | Promise<void>;
  /** Debounce window in ms. Default 300 — short enough to feel "instant",
   *  long enough that a burst of keystrokes batches into one write. */
  debounceMs?: number;
  /** Optional error sink. Defaults to console.warn. Persist failures are
   *  *never* re-thrown — auto-save must not break the UI. */
  onError?: (err: unknown) => void;
}

export interface AutoSaveHandle {
  /** Stop subscribing and cancel any pending debounced flush. Does NOT wait
   *  for an in-flight persist to complete — call `flushNow()` first if you
   *  need a clean shutdown. */
  dispose(): void;
  /** Cancel the debounce timer and persist immediately. Resolves once the
   *  resulting persist (if any) settles. Safe to call from the explicit
   *  Save All button or from `beforeunload`. */
  flushNow(): Promise<void>;
}

/**
 * Debounced auto-save engine. Subscribes to a GridStore; whenever any module
 * mutates, schedules a serialize+persist after `debounceMs` of quiet.
 *
 * Concurrency contract:
 *  - At most one persist is in flight at any time.
 *  - If updates arrive while a persist is running, they coalesce into a
 *    single follow-up persist that fires immediately after the in-flight one
 *    completes (using the *latest* snapshot at that moment, not the snapshot
 *    that triggered the queued write).
 *  - This mirrors what IndexedDB transactions naturally serialize, but also
 *    works correctly for slower adapters (REST) and avoids out-of-order writes.
 */
export function startAutoSave(opts: AutoSaveOptions): AutoSaveHandle {
  const debounceMs = opts.debounceMs ?? 300;
  const onError = opts.onError ?? defaultOnError;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> | null = null;
  let pending = false; // a write was requested while another was in flight
  let disposed = false;

  // Re-entrant-safe runner. Returns a promise that resolves once *its* persist
  // (and any chained pending writes) finish — callers can await it for tests
  // and for flushNow().
  const drain = async (): Promise<void> => {
    if (inflight) {
      // Coalesce: mark a follow-up and join the in-flight chain.
      pending = true;
      return inflight;
    }
    inflight = (async () => {
      try {
        // Loop runs at least once; re-runs whenever pending was set during the
        // previous persist. Always grabs a fresh snapshot — never reuses a
        // stale one.
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (disposed) return;
          let snap: Record<string, SerializedState>;
          try {
            snap = opts.core.serializeAll();
          } catch (err) {
            onError(err);
            return;
          }
          try {
            await opts.persist(snap);
          } catch (err) {
            onError(err);
          }
          if (!pending) return;
          pending = false;
          // Loop again to flush whatever came in while we were persisting.
        }
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  };

  const schedule = () => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      // We intentionally don't await here — schedule() is called from the
      // synchronous store subscriber, which can't be async. Errors are caught
      // inside drain() via onError; the floating promise can't reject.
      void drain();
    }, debounceMs);
  };

  const unsubscribe = opts.store.subscribe(() => {
    schedule();
  });

  return {
    dispose() {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      unsubscribe();
    },
    async flushNow() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await drain();
    },
  };
}

const defaultOnError = (err: unknown): void => {
  // eslint-disable-next-line no-console
  console.warn('[core-v2] auto-save persist failed:', err);
};
