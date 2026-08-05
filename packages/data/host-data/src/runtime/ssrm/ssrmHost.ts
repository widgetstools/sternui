/**
 * Host SSRM books inside the data-services worker.
 *
 * ## Why here, and not in the ssrm book worker
 *
 * There are two SharedWorkers alive in the lab today: this one, which holds the
 * providers, and the app's own `ssrmBookWorker`, which holds a GENERATED book.
 * A book fed by a provider has to live where the provider's rows already are.
 * The alternative — the feed in this worker, the book in the other one — puts
 * every row through a second port and a second structured clone, and there is
 * no route between two SharedWorkers that does not go through a window, so it
 * would be one forwarding copy PER WINDOW. That is a second copy of the feed,
 * and it scales the wrong way.
 *
 * So: **a fed book lives in the data-services worker; a generated book lives
 * wherever the thing generating it does.** The engine package has no opinion —
 * `createSsrmWorkerHost` serves ports and knows nothing about who mounted it,
 * which is what makes both hostings the same code.
 *
 * ## Injection, for the same reason Perspective is injected
 *
 * `loadSsrm` resolves the engine rather than this file importing it. It keeps
 * `@starui/host-data` free of a dependency on a `react-grid` package, keeps the
 * engine out of every worker asset that will never open a blotter, and makes
 * this module testable with a fake engine and no port anywhere.
 */
import type { SsrmBookSink, SsrmSchemaLike } from './ssrmBookFeed.js';

/** What the engine's own delta looks like. Restated so this file imports none. */
export interface SsrmDeltaLike {
  changed: unknown[];
  removed: unknown[];
}

export interface SsrmEngineLike {
  applyUpdate(rows: readonly Record<string, unknown>[]): SsrmDeltaLike;
  applySnapshot(rows: readonly Record<string, unknown>[]): SsrmDeltaLike;
  readonly size: number;
}

export interface SsrmWorkerHostLike {
  connect(port: MessagePort): void;
  publish(bookId: string, rows: unknown[], removed?: unknown[], origin?: MessagePort): void;
  books(): string[];
  clientCount(bookId: string): number;
}

/** The slice of `@starui/ssrm-engine` this needs, across both its entries. */
export interface SsrmEngineModuleLike {
  createSsrmEngine(options: { schema: SsrmSchemaLike }): SsrmEngineLike;
  createSsrmWorkerHost(options: {
    openBook(bookId: string): { engine: SsrmEngineLike } | Promise<{ engine: SsrmEngineLike }>;
    onFault?(error: unknown, bookId?: string): void;
  }): SsrmWorkerHostLike;
}

export interface SsrmHostOpts {
  /** Resolve the engine — usually `import('@starui/ssrm-engine')` plus its `/worker`. */
  loadSsrm(): Promise<SsrmEngineModuleLike>;
  onError?(stage: 'attach' | 'book' | 'publish', error: unknown): void;
}

export interface SsrmHost {
  /** A `createBook` bound to `name`, shaped for `createSsrmBookFeed`. */
  bookFactoryFor(name: string): (schema: SsrmSchemaLike) => Promise<SsrmBookSink>;
  /** Bind one window's port to the engine host. */
  attach(port: MessagePort): Promise<void>;
  /** Books this host holds, by the name a window passes to `open`. */
  bookNames(): string[];
  readonly attachedPorts: number;
  stop(): Promise<void>;
}

export function createSsrmHost(opts: SsrmHostOpts): SsrmHost {
  const { loadSsrm, onError = () => {} } = opts;

  const engines = new Map<string, SsrmEngineLike>();
  let hostPromise: Promise<SsrmWorkerHostLike> | null = null;
  let attached = 0;
  let stopped = false;

  function engineHost(): Promise<SsrmWorkerHostLike> {
    if (hostPromise === null) {
      hostPromise = (async () => {
        const module = await loadSsrm();
        return module.createSsrmWorkerHost({
          // The host never BUILDS a book here — the feed does, and it does so
          // from a schema only the provider config knows. A window asking for a
          // name that has no book gets a named error rather than an empty one.
          openBook: (bookId) => {
            const engine = engines.get(bookId);
            if (engine === undefined) {
              throw new Error(`no book '${bookId}' — its provider has not built one yet`);
            }
            return { engine };
          },
          onFault: (error, bookId) => onError('book', bookId ? `${bookId}: ${String(error)}` : error),
        });
      })();
    }
    return hostPromise;
  }

  return {
    bookFactoryFor(name: string) {
      return async (schema: SsrmSchemaLike): Promise<SsrmBookSink> => {
        const module = await loadSsrm();
        const host = await engineHost();
        const engine = module.createSsrmEngine({ schema });
        engines.set(name, engine);

        /**
         * Every write is BROADCAST as the patch that was applied.
         *
         * Not as the resulting rows: a tick that moved two prices on 200 rows
         * is 400 cells, where re-reading those rows out of the store would be
         * 24,200 for the same information, several times a second, per window.
         * The host narrows it further per subscriber when a window has declared
         * a viewport; one that has not gets the whole patch, which is the
         * honest default.
         */
        const publish = (rows: readonly Record<string, unknown>[], removed: unknown[]) => {
          try {
            host.publish(name, rows as unknown[], removed);
          } catch (error) {
            onError('publish', error);
          }
        };

        return {
          applyUpdate(rows) {
            const delta = engine.applyUpdate(rows);
            publish(rows, delta.removed);
            return delta;
          },
          applySnapshot(rows) {
            const delta = engine.applySnapshot(rows);
            publish(rows, delta.removed);
            return delta;
          },
          get size() {
            return engine.size;
          },
        };
      };
    },

    async attach(port: MessagePort): Promise<void> {
      if (stopped) return;
      try {
        (await engineHost()).connect(port);
        attached += 1;
      } catch (error) {
        onError('attach', error);
      }
    },

    bookNames: () => [...engines.keys()],

    get attachedPorts() {
      return attached;
    },

    async stop(): Promise<void> {
      stopped = true;
      engines.clear();
    },
  };
}
