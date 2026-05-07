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
let active: { win: any; handler: (evt: unknown) => void; lastOpts: unknown } | null = null;
let initPromise: Promise<void> | null = null;
let probedEventShape = false;

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

/**
 * The `options-changed` event in OpenFin Workspace carries the new
 * options on the event object itself — typical shapes seen in the wild
 * include `{ options, diff }` or `{ newOptions }` or `{ options:
 * { ... } }`. Probing each candidate avoids an IPC round-trip back to
 * `getOptions()` on every event.
 *
 * Returns the new options if a usable shape is found, otherwise `null`
 * to signal the caller should fall back to `win.getOptions()`.
 */
function extractOptionsFromEvent(evt: unknown): unknown {
  if (!evt || typeof evt !== 'object') return null;
  const e = evt as any;
  // Most common: event.options is the full new options.
  if (e.options && typeof e.options === 'object' && e.options.workspacePlatform) return e.options;
  if (e.newOptions && typeof e.newOptions === 'object' && e.newOptions.workspacePlatform) return e.newOptions;
  // Sometimes the event IS the new options (older runtime) — check for
  // the workspacePlatform marker directly on the event.
  if (e.workspacePlatform) return e;
  return null;
}

function ensureListener(): Promise<void> {
  if (active) return Promise.resolve();
  if (initPromise) return initPromise;
  if (!isOpenFin()) return Promise.resolve();

  initPromise = (async () => {
    try {
      const win = await fin.me.getCurrentWindow();
      const handler = (evt: unknown) => {
        // One-shot probe so we can confirm the event payload shape per
        // runtime. Removes itself after the first event.
        if (!probedEventShape) {
          probedEventShape = true;
          const e = evt as any;
          // eslint-disable-next-line no-console
          console.log('[windowOptionsSubscription] options-changed event shape:', {
            keys: e && typeof e === 'object' ? Object.keys(e) : null,
            hasOptions: Boolean(e?.options),
            hasNewOptions: Boolean(e?.newOptions),
            hasDirectWorkspacePlatform: Boolean(e?.workspacePlatform),
          });
        }
        const direct = extractOptionsFromEvent(evt);
        if (direct) {
          if (active) active.lastOpts = direct;
          fireAll(direct);
          return;
        }
        // Fallback for runtimes that don't include the new options on
        // the event payload — pay the IPC round-trip.
        void (async () => {
          try {
            const opts = await win.getOptions();
            if (active) active.lastOpts = opts;
            fireAll(opts);
          } catch (err) {
            console.warn('[windowOptionsSubscription] options re-read failed:', err);
          }
        })();
      };
      try {
        win.on('options-changed', handler);
      } catch (err) {
        console.warn('[windowOptionsSubscription] win.on failed:', err);
      }
      active = { win, handler, lastOpts: undefined };
      try {
        const opts = await win.getOptions();
        active.lastOpts = opts;
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
    // Listener already up — fire the cached `lastOpts` for this new
    // subscriber synchronously so it doesn't have to wait for the next
    // event AND doesn't pay an IPC round-trip just to re-read what we
    // already have. If the cache hasn't been seeded yet (init still
    // in flight), the in-flight initial getOptions() will fan out to
    // this subscriber once it resolves.
    if (active.lastOpts !== undefined) {
      try {
        cb(active.lastOpts);
      } catch (err) {
        console.warn('[windowOptionsSubscription] cached fire threw:', err);
      }
    }
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
  probedEventShape = false;
}
