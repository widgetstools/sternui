/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

/**
 * Module-private subscription manager for the parent OpenFin window's
 * `options-changed` event. Multiple hooks (`useTabsHidden`,
 * `useColorLinking`, …) read from the same options object; without this
 * manager each one would attach its own `win.on('options-changed', …)`
 * listener and the runtime would fan out N copies of every event for
 * the same window.
 *
 * Behavior:
 *   - First subscriber resolves `fin.me.getCurrentWindow()`, registers a
 *     single `options-changed` handler, and fires every registered
 *     callback once with the initial `getOptions()` result.
 *   - Subsequent subscribers piggyback on the same listener and also
 *     receive a one-shot fire with the current options snapshot.
 *   - When the last subscriber unsubscribes, the listener is removed.
 *
 * Callbacks are added synchronously, so an `options-changed` event that
 * fires immediately after `subscribeWindowOptions` returns will reach
 * the new callback even if the underlying window hasn't been resolved
 * yet — the handler iterates `callbacks` at fire time.
 *
 * Outside an OpenFin runtime, `subscribeWindowOptions` is a noop.
 */

type OptionsCallback = (opts: unknown) => void;

const callbacks = new Set<OptionsCallback>();
let active: { win: any; handler: () => Promise<void> } | null = null;
let initPromise: Promise<void> | null = null;

function isOpenFin(): boolean {
  return typeof fin !== 'undefined' && fin?.me?.getCurrentWindow;
}

function fireAll(opts: unknown): void {
  for (const cb of Array.from(callbacks)) {
    try {
      cb(opts);
    } catch (err) {
      console.warn('[windowOptionsSubscription] callback threw:', err);
    }
  }
}

function ensureListener(): Promise<void> {
  if (active) return Promise.resolve();
  if (initPromise) return initPromise;
  if (!isOpenFin()) return Promise.resolve();

  initPromise = (async () => {
    try {
      const win = await fin.me.getCurrentWindow();
      const handler = async () => {
        try {
          const opts = await win.getOptions();
          fireAll(opts);
        } catch (err) {
          console.warn('[windowOptionsSubscription] options re-read failed:', err);
        }
      };
      try {
        win.on('options-changed', handler);
      } catch (err) {
        console.warn('[windowOptionsSubscription] win.on failed:', err);
      }
      active = { win, handler };
      try {
        const opts = await win.getOptions();
        fireAll(opts);
      } catch (err) {
        console.warn('[windowOptionsSubscription] initial getOptions failed:', err);
      }
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Subscribe to the parent window's options stream. The callback is
 * fired once with the current `getOptions()` snapshot and again on
 * every `options-changed` event. Returns a cleanup function; the
 * underlying listener is torn down when the last callback detaches.
 */
export function subscribeWindowOptions(cb: OptionsCallback): () => void {
  if (!isOpenFin()) {
    return () => {
      /* noop — non-OpenFin */
    };
  }

  callbacks.add(cb);

  if (active) {
    // Listener already up — fire current options for this new
    // subscriber so it doesn't have to wait for the next event.
    const win = active.win;
    void (async () => {
      try {
        const opts = await win.getOptions();
        if (callbacks.has(cb)) cb(opts);
      } catch (err) {
        console.warn('[windowOptionsSubscription] late initial fire failed:', err);
      }
    })();
  } else {
    void ensureListener();
  }

  return () => {
    if (!callbacks.delete(cb)) return;
    if (callbacks.size === 0 && active) {
      try {
        active.win.removeListener('options-changed', active.handler);
      } catch (err) {
        console.warn('[windowOptionsSubscription] removeListener failed:', err);
      }
      active = null;
    }
  };
}

/**
 * Test-only reset of the shared listener state. Production code never
 * calls this; tests use it to isolate cases that install different
 * mocked `fin` runtimes.
 */
export function __resetWindowOptionsSubscriptionForTests(): void {
  if (active) {
    try {
      active.win.removeListener('options-changed', active.handler);
    } catch {
      /* swallow */
    }
  }
  callbacks.clear();
  active = null;
  initPromise = null;
}
