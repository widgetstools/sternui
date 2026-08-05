/**
 * One `SsrmEngine` per book, keyed by a book id, serving N ports.
 *
 * The host owns the engines and the dispatch; it does NOT know how to build a
 * book. That is the caller's `openBook`, because the thing that decides what a
 * book contains — a generator, a provider, a file — belongs to whoever mounted
 * the worker, not to a row engine. It keeps this module free of every app
 * concern and makes it testable over a plain `MessageChannel`.
 *
 * ## Why writes are broadcast as the patch, not as rows
 *
 * `publish` takes the sparse rows the writer applied. A tick that moved two
 * prices on 200 rows is 400 cells; reading those rows back out of the store to
 * broadcast them would be 24,200 cells for the same information, five times a
 * second, to every window. The client merges the patch onto the row AG already
 * holds — which is the shape a live tick has to have anyway, because AG's
 * server row model takes a mutation as a transaction and not as a re-read.
 */
import type { ColumnStore } from '../columnStore.js';
import type { SsrmEngine } from '../engine.js';
import type { SsrmRow, SsrmSchema } from '../types.js';
import {
  SSRM_STALE_MS,
  SSRM_SWEEP_MS,
  type SsrmFieldParams,
  type SsrmGetRowsParams,
  type SsrmIntrospectResult,
  type SsrmOpenParams,
  type SsrmOpenResult,
  type SsrmPushFrame,
  type SsrmQuickFilterParams,
  type SsrmRemoveParams,
  type SsrmRpcMethod,
  type SsrmViewport,
  type SsrmViewportParams,
  type SsrmWriteParams,
  type SsrmWriteResult,
} from './protocol.js';
import { describeError, serveSsrmRpc } from './rpc.js';

/** What `openBook` hands back. `dispose` runs when the last client detaches. */
export interface SsrmBook {
  engine: SsrmEngine;
  dispose?(): void;
}

export interface SsrmWorkerHostOptions {
  /**
   * Build (or find) the book with this id. Called at most once per id while
   * clients are attached — two windows racing to open the same book share one
   * engine, which is the entire point of hosting it here.
   */
  openBook(bookId: string, options?: unknown): SsrmBook | Promise<SsrmBook>;
  /** Anything that failed outside a call. Also pushed to every client. */
  onFault?(error: unknown, bookId?: string): void;
  /** Silence after which a port is presumed gone. See {@link SSRM_STALE_MS}. */
  staleMs?: number;
  /** How often {@link SsrmWorkerHost.sweep} runs on its own. 0 disables the timer. */
  sweepMs?: number;
  /** Injectable clock, so the reaper is testable without waiting 90 seconds. */
  now?(): number;
}

export interface SsrmWorkerHost {
  /** Attach a port — one window's connection. */
  connect(port: MessagePort): void;
  /**
   * Broadcast a write to the book's clients.
   *
   * `origin` is the port that caused it, if any: the window that applied an
   * edit has already shown it, and echoing it back would make AG re-render a
   * row it just wrote.
   */
  publish(bookId: string, rows: SsrmRow[], removed?: unknown[], origin?: MessagePort): void;
  /** Book ids currently held. Zero after every client of a book detaches. */
  books(): string[];
  clientCount(bookId: string): number;
  /** Report a worker-side failure to `onFault` and to every affected client. */
  fault(error: unknown, bookId?: string): void;
  /**
   * Detach every port that has not spoken within `staleMs`, and retire the
   * books that leaves empty. Returns how many ports were reaped.
   *
   * Public because the interval that calls it is the wrong thing to test
   * against: a test drives this directly with an injected clock.
   */
  sweep(): number;
  /** What the host holds — the check a "these windows share a book" claim needs. */
  introspect(): SsrmIntrospectResult;
  /** Stop the sweep timer. For tests and for a host being torn down. */
  dispose(): void;
}

interface BookEntry {
  /** Memoised so two ports opening the same id do not build two engines. */
  opening: Promise<SsrmBook>;
  book?: SsrmBook;
  clients: Set<MessagePort>;
  /**
   * What each client can see, when it has said. Absent means "send me
   * everything" — the honest default, because a window that has not declared a
   * viewport is not one whose updates may be dropped.
   */
  viewports: Map<MessagePort, SsrmViewport>;
  /**
   * Book size as each client last heard it.
   *
   * A client's `size` is a mirror moved by delta pushes, and narrowing can
   * leave a port with nothing to send — so a row inserted outside every
   * viewport would change the book and never reach anyone's mirror. Tracked per
   * port so an otherwise-empty frame is sent exactly when the count moved.
   */
  sizes: Map<MessagePort, number>;
}

/** Rebuilt from the store rather than repeated by the caller. */
function schemaOf(store: ColumnStore): SsrmSchema {
  const fields = [];
  for (const field of store.fields) {
    const type = store.fieldType(field);
    if (type !== undefined) fields.push({ field, type });
  }
  return { keyField: store.keyField, fields };
}

export function createSsrmWorkerHost(options: SsrmWorkerHostOptions): SsrmWorkerHost {
  const books = new Map<string, BookEntry>();
  const staleMs = options.staleMs ?? SSRM_STALE_MS;
  const sweepMs = options.sweepMs ?? SSRM_SWEEP_MS;
  const clock = options.now ?? (() => Date.now());
  /** Last time each attached port said anything. Any call counts. */
  const lastSeen = new Map<MessagePort, number>();
  let reaped = 0;
  let sweepTimer: ReturnType<typeof setInterval> | undefined;

  const allPorts = (): Set<MessagePort> => {
    const ports = new Set<MessagePort>();
    for (const entry of books.values()) for (const port of entry.clients) ports.add(port);
    return ports;
  };

  const fault = (error: unknown, bookId?: string) => {
    options.onFault?.(error, bookId);
    const frame: SsrmPushFrame = {
      push: 'fault',
      ...(bookId === undefined ? {} : { bookId }),
      error: describeError(error),
    };
    const targets = bookId === undefined ? allPorts() : (books.get(bookId)?.clients ?? new Set());
    for (const port of targets) {
      try {
        port.postMessage(frame);
      } catch {
        /* a dead port cannot be told anything */
      }
    }
  };

  const entryFor = (bookId: string, bookOptions: unknown): BookEntry => {
    const existing = books.get(bookId);
    if (existing !== undefined) return existing;
    const entry: BookEntry = {
      clients: new Set(),
      viewports: new Map(),
      sizes: new Map(),
      opening: Promise.resolve().then(() => options.openBook(bookId, bookOptions)),
    };
    entry.opening.then(
      (book) => {
        entry.book = book;
      },
      (error) => {
        // A book that failed to open must not be cached as a rejected promise
        // forever: the next window would inherit a failure it had no part in.
        books.delete(bookId);
        fault(error, bookId);
      },
    );
    books.set(bookId, entry);
    return entry;
  };

  const engineFor = async (bookId: unknown): Promise<SsrmEngine> => {
    if (typeof bookId !== 'string' || bookId === '') throw new Error('a call carried no bookId');
    const entry = books.get(bookId);
    if (entry === undefined) throw new Error(`book '${bookId}' is not open on this port`);
    return (await entry.opening).engine;
  };

  /**
   * Drop a port from a book and retire the book with its last client.
   *
   * A SharedWorker OUTLIVES its pages, so a book nobody retires survives a
   * reload and the next load builds a second one beside it — which is how the
   * lab accumulated several 20-50k books in one process.
   *
   * There are two ways in. `close` is the clean one and covers unmount and a
   * normal navigation. The other is {@link sweep}, because **a SharedWorker
   * port has no disconnect event**: a window killed outright — crashed, task-
   * managed, or unplugged — sends nothing, and without a reaper its book lives
   * as long as the worker does.
   */
  const detach = (bookId: string, port: MessagePort) => {
    const entry = books.get(bookId);
    if (entry === undefined) return;
    entry.clients.delete(port);
    entry.viewports.delete(port);
    entry.sizes.delete(port);
    if (entry.clients.size > 0) return;
    books.delete(bookId);
    try {
      entry.book?.dispose?.();
    } catch (error) {
      fault(error, bookId);
    }
    stopSweepIfIdle();
  };

  /** Ports the host still believes in but has not heard from. */
  const sweep = (): number => {
    const cutoff = clock() - staleMs;
    const stale: MessagePort[] = [];
    for (const port of allPorts()) {
      const seen = lastSeen.get(port);
      if (seen === undefined || seen <= cutoff) stale.push(port);
    }
    for (const port of stale) {
      lastSeen.delete(port);
      reaped += 1;
      for (const bookId of [...books.keys()]) detach(bookId, port);
      try {
        port.close();
      } catch {
        /* a port that is already gone is the case this exists for */
      }
    }
    return stale.length;
  };

  /**
   * The timer runs only while something is attached.
   *
   * A SharedWorker with a live interval is a SharedWorker that cannot be
   * collected, so a reaper left running after the last book closed would keep
   * the whole worker resident to watch nothing.
   */
  function startSweep(): void {
    if (sweepTimer !== undefined || sweepMs <= 0) return;
    sweepTimer = setInterval(() => {
      try {
        sweep();
      } catch (error) {
        fault(error);
      }
    }, sweepMs);
    // No-op in a worker; in Node it stops the sweep from being the reason a
    // test run never exits.
    (sweepTimer as unknown as { unref?(): void }).unref?.();
  }

  function stopSweepIfIdle(): void {
    if (sweepTimer === undefined || books.size > 0) return;
    clearInterval(sweepTimer);
    sweepTimer = undefined;
  }

  /**
   * Narrow a patch to what one subscriber can see.
   *
   * `null` means "send it all", and it is the answer for a port with no
   * declared viewport AND for a grouped request — under grouping a position in
   * one level's index is not a displayed row index, so filtering by it would
   * drop updates for rows that ARE on screen. Silently pushing at the wrong
   * rows is the failure mode this refuses.
   */
  const visibleFilter = (entry: BookEntry, port: MessagePort): Set<unknown> | null => {
    const viewport = entry.viewports.get(port);
    if (viewport === undefined || entry.book === undefined) return null;
    let keys: unknown[] | null;
    try {
      keys = entry.book.engine.visibleKeys(viewport.request, viewport.startRow, viewport.endRow);
    } catch (error) {
      // A viewport the engine cannot answer must not cost the window its
      // updates. Report it, then fall back to the whole patch.
      fault(error);
      return null;
    }
    return keys === null ? null : new Set(keys);
  };

  const publish: SsrmWorkerHost['publish'] = (bookId, rows, removed = [], origin) => {
    const entry = books.get(bookId);
    if (entry === undefined || entry.book === undefined) return;
    if (rows.length === 0 && removed.length === 0) return;
    const size = entry.book.engine.size;
    const keyField = entry.book.engine.store.keyField;

    for (const port of entry.clients) {
      if (port === origin) continue;
      const visible = visibleFilter(entry, port);
      // Removals are never narrowed. A row that left the book has to leave
      // every window that holds it, and "holds it" is AG's block cache — which
      // is far larger than a viewport.
      const narrowed =
        visible === null ? rows : rows.filter((row) => visible.has(row[keyField]));
      // Nothing to say only when the count has not moved either — see `sizes`.
      if (narrowed.length === 0 && removed.length === 0 && entry.sizes.get(port) === size) {
        continue;
      }
      entry.sizes.set(port, size);
      const frame: SsrmPushFrame = {
        push: 'delta',
        bookId,
        rows: narrowed,
        removed,
        size,
      };
      try {
        port.postMessage(frame);
      } catch (error) {
        fault(error, bookId);
      }
    }
  };

  const connect: SsrmWorkerHost['connect'] = (port) => {
    /** Books this port opened, so it can be detached from all of them. */
    const opened = new Set<string>();

    const dispatch = async (method: SsrmRpcMethod, raw: unknown): Promise<unknown> => {
      // Every call is a heartbeat. A window driving a grid never needs to send
      // one; the dedicated method is for a window that is attached and idle,
      // which is what a background blotter is.
      lastSeen.set(port, clock());

      switch (method) {
        case 'heartbeat':
          return null;
        case 'introspect':
          return introspect();
        case 'setViewport': {
          const { bookId, viewport } = raw as SsrmViewportParams;
          const entry = books.get(bookId);
          if (entry === undefined) throw new Error(`book '${bookId}' is not open on this port`);
          if (viewport === null) entry.viewports.delete(port);
          else entry.viewports.set(port, viewport);
          return null;
        }
        case 'open': {
          const { bookId, options: bookOptions } = raw as SsrmOpenParams;
          if (typeof bookId !== 'string' || bookId === '') throw new Error('open needs a bookId');
          const entry = entryFor(bookId, bookOptions);
          const book = await entry.opening;
          entry.clients.add(port);
          entry.sizes.set(port, book.engine.size);
          opened.add(bookId);
          startSweep();
          return {
            bookId,
            size: book.engine.size,
            schema: schemaOf(book.engine.store),
            clients: entry.clients.size,
          } satisfies SsrmOpenResult;
        }
        case 'close': {
          const { bookId } = raw as SsrmOpenParams;
          opened.delete(bookId);
          detach(bookId, port);
          if (opened.size === 0) lastSeen.delete(port);
          return null;
        }
        case 'getRows': {
          const { bookId, request } = raw as SsrmGetRowsParams;
          return (await engineFor(bookId)).getRows(request);
        }
        case 'grandTotal': {
          const { bookId, request } = raw as SsrmGetRowsParams;
          return (await engineFor(bookId)).grandTotal(request);
        }
        case 'countFiltered': {
          const { bookId, request } = raw as SsrmGetRowsParams;
          return (await engineFor(bookId)).countFiltered(request);
        }
        case 'distinctValues': {
          const { bookId, field } = raw as SsrmFieldParams;
          return (await engineFor(bookId)).distinctValues(field);
        }
        case 'setQuickFilter': {
          const { bookId, text } = raw as SsrmQuickFilterParams;
          return (await engineFor(bookId)).setQuickFilter(text);
        }
        case 'size':
          return (await engineFor((raw as SsrmOpenParams).bookId)).size;
        case 'applyUpdate':
        case 'applySnapshot':
        case 'applyRemove': {
          const bookId = (raw as SsrmWriteParams).bookId;
          const engine = await engineFor(bookId);
          const delta =
            method === 'applyRemove'
              ? engine.applyRemove((raw as SsrmRemoveParams).keys)
              : method === 'applySnapshot'
                ? engine.applySnapshot((raw as SsrmWriteParams).rows)
                : engine.applyUpdate((raw as SsrmWriteParams).rows);
          // Other windows are told what this one wrote. The originator is not:
          // it has already applied it locally.
          publish(
            bookId,
            method === 'applyRemove' ? [] : (raw as SsrmWriteParams).rows,
            delta.removed,
            port,
          );
          return { ...delta, size: engine.size } satisfies SsrmWriteResult;
        }
        default:
          throw new Error(`unknown method '${String(method)}'`);
      }
    };

    serveSsrmRpc(port, dispatch);
  };

  function introspect(): SsrmIntrospectResult {
    const report: SsrmIntrospectResult['books'] = [];
    for (const [bookId, entry] of books) {
      report.push({
        bookId,
        clients: entry.clients.size,
        size: entry.book?.engine.size ?? 0,
        viewports: entry.viewports.size,
      });
    }
    return { books: report, reaped, staleMs, sweepMs };
  }

  return {
    connect,
    publish,
    fault,
    sweep,
    introspect,
    books: () => [...books.keys()],
    clientCount: (bookId) => books.get(bookId)?.clients.size ?? 0,
    dispose() {
      if (sweepTimer !== undefined) clearInterval(sweepTimer);
      sweepTimer = undefined;
    },
  };
}

/** The `SharedWorkerGlobalScope` bits this needs; `lib.dom` does not declare it. */
interface SharedWorkerScopeLike {
  onconnect: ((event: { ports: readonly MessagePort[] }) => void) | null;
  addEventListener?(type: 'error' | 'unhandledrejection', listener: (event: unknown) => void): void;
}

/**
 * Mount a host on `self.onconnect` — the whole worker entry, in one call.
 *
 * The `error` / `unhandledrejection` listeners are not decoration. An unhandled
 * rejection in a SharedWorker reaches NO console anywhere: the worker keeps
 * running and whatever awaited that promise never settles, which from a window
 * is indistinguishable from a hang. Routing them to `onFault` puts them on
 * every client's console instead.
 */
export function serveSsrmEngineWorker(options: SsrmWorkerHostOptions): SsrmWorkerHost {
  const host = createSsrmWorkerHost(options);
  const scope = globalThis as unknown as SharedWorkerScopeLike;
  scope.onconnect = (event) => {
    for (const port of event.ports) host.connect(port);
  };
  scope.addEventListener?.('error', (event) => host.fault(event));
  scope.addEventListener?.('unhandledrejection', (event) => host.fault(event));
  return host;
}
