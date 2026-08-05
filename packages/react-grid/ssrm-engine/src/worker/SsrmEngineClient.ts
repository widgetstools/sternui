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
import type {
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  SsrmRow,
  SsrmSchema,
} from '../types.js';
import type { SsrmDeltaPush, SsrmOpenResult, SsrmWriteResult } from './protocol.js';
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
}

export class SsrmEngineClient {
  readonly bookId: string;
  readonly schema: SsrmSchema;
  /** Windows attached to this book at the moment this one opened it. */
  readonly clientsAtOpen: number;

  private readonly rpc: SsrmRpcClient;
  private readonly listeners = new Set<SsrmDeltaPushListener>();
  private mirroredSize: number;

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
    return self;
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
    try {
      await this.rpc.call('close', { bookId: this.bookId });
    } catch {
      // A worker that has already gone cannot be told goodbye, and there is
      // nothing left to leak if it has.
    }
    this.rpc.dispose('the book was closed');
  }
}
