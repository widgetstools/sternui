/**
 * The window's handle on a worker-held book.
 *
 * Exposes the surface `createSsrmDatasource` already consumes — `getRows`,
 * `grandTotal`, `countFiltered`, `distinctValues`, `setQuickFilter`, the three
 * writes — with every method returning a promise. That is the whole difference,
 * and it is why `createAsyncSsrmDatasource` exists beside the synchronous one
 * rather than replacing it: the in-process engine is still the right thing for
 * a test, a benchmark, or a book small enough to live in the window.
 *
 * `size` is a MIRROR, not a call. It is set by `open` and moved by every delta
 * push, so it is live rather than cached — but it is the worker's last word,
 * not a fresh question, and if the worker stops talking it stops moving.
 */
import type { SsrmDelta } from '../engine.js';
import type { SsrmCalcDiagnostic } from '../calc.js';
import type { SsrmCalcColumnDef } from '../calcAst.js';
import type {
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  SsrmRow,
  SsrmSchema,
} from '../types.js';
import {
  SSRM_HEARTBEAT_MS,
  type SsrmDeltaPush,
  type SsrmIntrospectResult,
  type SsrmOpenResult,
  type SsrmViewport,
  type SsrmWriteResult,
} from './protocol.js';
import {
  createSsrmRpcClient,
  type SsrmRpcClient,
  type SsrmRpcError,
  type SsrmRpcStats,
} from './rpc.js';

export type SsrmDeltaPushListener = (delta: SsrmDeltaPush) => void;

export interface SsrmEngineClientOptions {
  /** Per-call ceiling. A call that passes it FAILS rather than staying pending. */
  timeoutMs?: number;
  /** A worker-side failure with no call to attach it to. Worth logging loudly. */
  onFault?(error: SsrmRpcError): void;
  /**
   * Passed to the worker's `openBook` if this client is the one that builds the
   * book. Ignored when the book is already open — see {@link SsrmOpenParams}.
   */
  bookOptions?: unknown;
  /**
   * How often an idle client says it is still there. 0 disables it.
   *
   * The other half of the refcount. `close` covers unmount and navigation; this
   * covers the window that never gets to send one, because a SharedWorker port
   * has NO disconnect event and the worker outlives the page.
   */
  heartbeatMs?: number;
  /**
   * Send the detach on `pagehide` as well as on `close()`. On by default in a
   * window, and a no-op anywhere without one.
   */
  detachOnPagehide?: boolean;
}

export class SsrmEngineClient {
  readonly bookId: string;
  readonly schema: SsrmSchema;
  /** Windows attached to this book at the moment this one opened it. */
  readonly clientsAtOpen: number;

  private readonly rpc: SsrmRpcClient;
  private readonly listeners = new Set<SsrmDeltaPushListener>();
  private mirroredSize: number;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private detachPagehide: (() => void) | undefined;

  private constructor(rpc: SsrmRpcClient, opened: SsrmOpenResult) {
    this.rpc = rpc;
    this.bookId = opened.bookId;
    this.schema = opened.schema;
    this.clientsAtOpen = opened.clients;
    this.mirroredSize = opened.size;
  }

  static async open(
    port: MessagePort,
    bookId: string,
    options: SsrmEngineClientOptions = {},
  ): Promise<SsrmEngineClient> {
    let self: SsrmEngineClient | null = null;
    const rpc = createSsrmRpcClient(port, {
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      ...(options.onFault === undefined ? {} : { onFault: options.onFault }),
      onPush: (frame) => {
        if (frame.push !== 'delta') return;
        self?.receive(frame);
      },
    });
    const opened = await rpc.call<SsrmOpenResult>('open', {
      bookId,
      ...(options.bookOptions === undefined ? {} : { options: options.bookOptions }),
    });
    self = new SsrmEngineClient(rpc, opened);
    self.startLiveness(options);
    return self;
  }

  /**
   * The two halves of "this window is still here".
   *
   * `pagehide` is the fast path and fires for a close, a navigation and a
   * bfcache eviction alike; it is best-effort because a crashed or killed
   * renderer never runs it. The heartbeat is the backstop that covers exactly
   * that case, and it is why the worker's stale window has to clear Chrome's
   * background-tab timer throttling — see {@link SSRM_STALE_MS}.
   */
  private startLiveness(options: SsrmEngineClientOptions): void {
    const every = options.heartbeatMs ?? SSRM_HEARTBEAT_MS;
    if (every > 0) {
      this.heartbeat = setInterval(() => {
        // A failed heartbeat is not worth reporting: whatever killed it will
        // fail the next real call loudly, and a rejected promise nobody
        // handles in a worker context reaches no console at all.
        void this.heartbeatOnce().catch(() => {});
      }, every);
      // No-op in a browser; in Node it stops a liveness timer from being the
      // reason a test run or a script never exits.
      (this.heartbeat as unknown as { unref?(): void }).unref?.();
    }

    const wantsPagehide = options.detachOnPagehide ?? true;
    const scope = globalThis as unknown as {
      addEventListener?: (type: string, fn: () => void) => void;
      removeEventListener?: (type: string, fn: () => void) => void;
    };
    if (!wantsPagehide || typeof scope.addEventListener !== 'function') return;
    const beacon = () => {
      // NOT `close()` — that awaits a reply this page will not live to read.
      // `postMessage` hands the frame to the port synchronously, which is the
      // most a page being torn down can do.
      void this.rpc.call('close', { bookId: this.bookId }).catch(() => {});
    };
    scope.addEventListener('pagehide', beacon);
    this.detachPagehide = () => scope.removeEventListener?.('pagehide', beacon);
  }

  /** The worker's last reported book size. See the note on this class. */
  get size(): number {
    return this.mirroredSize;
  }

  private receive(frame: SsrmDeltaPush): void {
    this.mirroredSize = frame.size;
    for (const listener of this.listeners) listener(frame);
  }

  /** Writes that landed in the worker — from a tick, or from another window. */
  subscribe(listener: SsrmDeltaPushListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getRows(request: SsrmGetRowsRequest): Promise<SsrmGetRowsResult> {
    return this.rpc.call('getRows', { bookId: this.bookId, request });
  }

  grandTotal(request: SsrmGetRowsRequest): Promise<Record<string, unknown>> {
    return this.rpc.call('grandTotal', { bookId: this.bookId, request });
  }

  countFiltered(request: SsrmGetRowsRequest): Promise<number> {
    return this.rpc.call('countFiltered', { bookId: this.bookId, request });
  }

  distinctValues(field: string): Promise<unknown[] | null> {
    return this.rpc.call('distinctValues', { bookId: this.bookId, field });
  }

  setQuickFilter(text: string): Promise<boolean> {
    return this.rpc.call('setQuickFilter', { bookId: this.bookId, text });
  }

  /**
   * Install the book's calculated columns, as expression ASTs.
   *
   * The AST crosses as plain data; the parse stays in the window with
   * `@starui/engine`, and the evaluation happens where the book is. Answers
   * whether anything changed, so a caller only purges the grid when it did.
   */
  setCalcColumns(columns: SsrmCalcColumnDef[]): Promise<boolean> {
    return this.rpc.call('setCalcColumns', { bookId: this.bookId, columns });
  }

  /**
   * What the worker's calculated columns did — refusals, runtime failures, and
   * fields an expression named that the book does not have.
   *
   * Worth a round trip because a SharedWorker's `console.warn` reaches nobody:
   * without this, a refused column is a column of blanks with no way to ask
   * why, which is the exact ambiguity between "no value" and "went wrong" that
   * this project has already paid for once.
   */
  calcDiagnostics(): Promise<SsrmCalcDiagnostic[]> {
    return this.rpc.call('calcDiagnostics', { bookId: this.bookId });
  }

  /**
   * Tell the worker what this window can see, so a tick sends only those rows.
   *
   * `null` clears it and restores "send me everything", which is also the state
   * of a client that never calls this — a window whose viewport is unknown must
   * not have its updates dropped.
   */
  setViewport(viewport: SsrmViewport | null): Promise<void> {
    return this.rpc.call('setViewport', { bookId: this.bookId, viewport });
  }

  /** What the worker holds: books, clients per book, and the reaper's count. */
  introspect(): Promise<SsrmIntrospectResult> {
    return this.rpc.call('introspect', {});
  }

  /** One liveness ping. The interval calls this; a test calls it directly. */
  heartbeatOnce(): Promise<void> {
    return this.rpc.call('heartbeat', { bookId: this.bookId });
  }

  applyUpdate(rows: SsrmRow[]): Promise<SsrmDelta> {
    return this.write('applyUpdate', { bookId: this.bookId, rows });
  }

  applySnapshot(rows: SsrmRow[]): Promise<SsrmDelta> {
    return this.write('applySnapshot', { bookId: this.bookId, rows });
  }

  applyRemove(keys: unknown[]): Promise<SsrmDelta> {
    return this.write('applyRemove', { bookId: this.bookId, keys });
  }

  private async write(
    method: 'applyUpdate' | 'applySnapshot' | 'applyRemove',
    params: unknown,
  ): Promise<SsrmDelta> {
    const result = await this.rpc.call<SsrmWriteResult>(method, params);
    this.mirroredSize = result.size;
    return { changed: result.changed, removed: result.removed };
  }

  /** The book as the worker holds it, asked rather than mirrored. */
  async fetchSize(): Promise<number> {
    this.mirroredSize = await this.rpc.call<number>('size', { bookId: this.bookId });
    return this.mirroredSize;
  }

  stats(): SsrmRpcStats {
    return this.rpc.stats();
  }

  /**
   * Detach. **Not optional on a SharedWorker**: it outlives the page, and a
   * book nobody detaches from survives a reload, so the next load builds a
   * second one beside it.
   */
  async close(): Promise<void> {
    this.listeners.clear();
    if (this.heartbeat !== undefined) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    this.detachPagehide?.();
    this.detachPagehide = undefined;
    try {
      await this.rpc.call('close', { bookId: this.bookId });
    } catch {
      // A worker that has already gone cannot be told goodbye, and there is
      // nothing left to leak if it has.
    }
    this.rpc.dispose('the book was closed');
  }
}
