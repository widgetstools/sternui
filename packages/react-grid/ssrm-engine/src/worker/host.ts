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
  type SsrmFieldParams,
  type SsrmGetRowsParams,
  type SsrmOpenParams,
  type SsrmOpenResult,
  type SsrmPushFrame,
  type SsrmQuickFilterParams,
  type SsrmRemoveParams,
  type SsrmRpcMethod,
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
}

interface BookEntry {
  /** Memoised so two ports opening the same id do not build two engines. */
  opening: Promise<SsrmBook>;
  book?: SsrmBook;
  clients: Set<MessagePort>;
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
   * lab accumulated several 20-50k books in one process. There is no reliable
   * disconnect event for a SharedWorker port, so this depends on the client
   * saying `close`; a window killed outright leaks its book until the worker
   * itself is collected. Session 2 makes this a real refcount across providers.
   */
  const detach = (bookId: string, port: MessagePort) => {
    const entry = books.get(bookId);
    if (entry === undefined) return;
    entry.clients.delete(port);
    if (entry.clients.size > 0) return;
    books.delete(bookId);
    try {
      entry.book?.dispose?.();
    } catch (error) {
      fault(error, bookId);
    }
  };

  const publish: SsrmWorkerHost['publish'] = (bookId, rows, removed = [], origin) => {
    const entry = books.get(bookId);
    if (entry === undefined || entry.book === undefined) return;
    if (rows.length === 0 && removed.length === 0) return;
    const frame: SsrmPushFrame = {
      push: 'delta',
      bookId,
      rows,
      removed,
      size: entry.book.engine.size,
    };
    for (const port of entry.clients) {
      if (port === origin) continue;
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
      switch (method) {
        case 'open': {
          const { bookId, options: bookOptions } = raw as SsrmOpenParams;
          if (typeof bookId !== 'string' || bookId === '') throw new Error('open needs a bookId');
          const entry = entryFor(bookId, bookOptions);
          const book = await entry.opening;
          entry.clients.add(port);
          opened.add(bookId);
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

  return {
    connect,
    publish,
    fault,
    books: () => [...books.keys()],
    clientCount: (bookId) => books.get(bookId)?.clients.size ?? 0,
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
