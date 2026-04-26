/**
 * DataPlaneClient — the main-thread SDK consumers use to talk to the
 * worker (SharedWorker in production; dedicated Worker or in-page
 * Router as fallback). Framework-agnostic — React / Angular bindings
 * wrap this with their idiomatic state primitives
 * (`useSyncExternalStore` / `signal()`).
 *
 * Responsibilities
 * ----------------
 *   • Own a single `MessagePort`. Never more than one — connection
 *     multiplexing is the worker's job, not the client's.
 *   • Generate stable ids (reqId + subId) and correlate incoming
 *     messages back to pending requests / subscriptions.
 *   • Expose a typed promise for every one-shot op and a listener
 *     API for every long-lived subscription.
 *   • Surface transport-level errors — a `port.close()` mid-request,
 *     a `messageerror` event, or the worker returning `err` — as
 *     rejections on the correlated promise.
 *
 * What this file does NOT handle
 * ------------------------------
 *   • Reconnection. That's `connect.ts`: when the underlying
 *     SharedWorker disappears, the caller builds a fresh client. The
 *     client instance itself represents one session.
 *   • React / signal integration. Keep it here too and the package
 *     would have a forced React dep.
 *   • Cross-tab broadcast. Cross-tab is free because the SharedWorker
 *     is shared; the client doesn't need to know.
 */

import type { ProviderConfig } from '@marketsui/shared-types';
import {
  type DataPlaneRequest,
  type DataPlaneResponse,
  type SubscribeRequest,
  type SnapshotBatchResponse,
  type SnapshotCompleteResponse,
  type RowUpdateResponse,
  type UpdateResponse,
  type ErrorCode,
  type DataPlaneError,
  isResponse,
} from '../protocol';

export type Unsubscribe = () => void;

export interface KeyedUpdateEvent<T = unknown> {
  providerId: string;
  key: string;
  value: T;
  seq: number;
}

export interface StreamListener<TRow = Record<string, unknown>> {
  onSnapshotBatch?(batch: SnapshotBatchResponse & { rows: readonly TRow[] }): void;
  onSnapshotComplete?(complete: SnapshotCompleteResponse): void;
  onRowUpdate?(update: RowUpdateResponse & { rows: readonly TRow[] }): void;
  onError?(error: DataPlaneError): void;
}

export class DataPlaneClientError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  constructor(code: ErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'DataPlaneClientError';
    this.code = code;
    this.retryable = retryable;
  }
}

interface PendingRequest {
  resolve: (value: DataPlaneResponse) => void;
  reject: (err: Error) => void;
}

interface KeyedSubEntry {
  subId: string;
  onUpdate: (ev: KeyedUpdateEvent) => void;
  onError?: (err: DataPlaneClientError) => void;
}

interface StreamSubEntry {
  subId: string;
  listener: StreamListener;
}

export class DataPlaneClient {
  private readonly port: MessagePort;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly keyedSubs = new Map<string, KeyedSubEntry>();
  private readonly streamSubs = new Map<string, StreamSubEntry>();

  /**
   * Targeted reqId correlation: `get-cached-rows` emits a
   * `snapshot-batch` + `snapshot-complete` tagged with the request's
   * reqId (rather than a subId). We route those back through the
   * pending-request promise by stashing an accumulator here.
   */
  private readonly cachedRowsPending = new Map<
    string,
    { rows: readonly unknown[]; resolved: boolean; resolve: (rows: readonly unknown[]) => void; reject: (err: Error) => void }
  >();

  private counter = 0;

  constructor(port: MessagePort) {
    this.port = port;
    this.port.addEventListener('message', (ev: MessageEvent) => this.route(ev.data));
    this.port.addEventListener('messageerror', (ev: MessageEvent) => {
      // The browser rejects the incoming message (clone failed). We
      // can't correlate, so fail every in-flight request pessimistically.
      const err = new DataPlaneClientError('INTERNAL', `messageerror: ${String(ev)}`, false);
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    });
    this.port.start();
  }

  // ─── One-shot ops ───────────────────────────────────────────────────

  configure(providerId: string, config: ProviderConfig): Promise<void> {
    return this.request({ op: 'configure', reqId: this.mkId('req'), providerId, config }).then(() => undefined);
  }

  async get<T = unknown>(providerId: string, key: string): Promise<T> {
    const res = await this.request({ op: 'get', reqId: this.mkId('req'), providerId, key });
    if (res.op !== 'ok') throw this.unexpected(res);
    return res.value as T;
  }

  put(providerId: string, key: string, value: unknown): Promise<void> {
    return this.request({ op: 'put', reqId: this.mkId('req'), providerId, key, value }).then(() => undefined);
  }

  invalidate(providerId: string, key?: string): Promise<void> {
    return this.request({ op: 'invalidate', reqId: this.mkId('req'), providerId, key }).then(() => undefined);
  }

  teardown(providerId: string): Promise<void> {
    return this.request({ op: 'teardown', reqId: this.mkId('req'), providerId }).then(() => undefined);
  }

  /**
   * Re-run the provider's snapshot/configure cycle. Existing
   * subscribers stay attached and receive the new snapshot via the
   * standard event stream — no resubscribe needed. `extra` is
   * forwarded to the provider's `restart()` (used for date-driven
   * historical providers via `{ asOfDate }`).
   */
  restart(providerId: string, extra?: Record<string, unknown>): Promise<void> {
    return this.request({ op: 'restart', reqId: this.mkId('req'), providerId, extra }).then(() => undefined);
  }

  /**
   * Substitute `{{providerId.key}}` tokens in `template` against the
   * configured AppData providers. Tokens that don't resolve are left
   * as-is in the output.
   */
  async resolve(template: string): Promise<string> {
    const res = await this.request({ op: 'resolve', reqId: this.mkId('req'), template });
    if (res.op !== 'ok') throw this.unexpected(res);
    return (res.value as string) ?? template;
  }

  async ping(): Promise<void> {
    const res = await this.request({ op: 'ping', reqId: this.mkId('req') });
    if (res.op !== 'pong') throw this.unexpected(res);
  }

  // ─── Keyed-resource subscription ────────────────────────────────────

  async subscribe<T = unknown>(
    providerId: string,
    key: string,
    onUpdate: (ev: KeyedUpdateEvent<T>) => void,
    onError?: (err: DataPlaneClientError) => void,
  ): Promise<Unsubscribe> {
    const reqId = this.mkId('req');
    const subId = this.mkId('sub');
    const req: SubscribeRequest = { op: 'subscribe', reqId, subId, providerId, key };

    this.keyedSubs.set(subId, {
      subId,
      onUpdate: onUpdate as (ev: KeyedUpdateEvent) => void,
      onError,
    });

    try {
      const res = await this.request(req);
      if (res.op !== 'sub-established') throw this.unexpected(res);
    } catch (err) {
      this.keyedSubs.delete(subId);
      throw err;
    }

    return () => {
      if (!this.keyedSubs.delete(subId)) return;
      // Fire-and-forget — the worker will clean up whether or not we hear back.
      this.port.postMessage({ op: 'unsubscribe', subId } satisfies DataPlaneRequest);
    };
  }

  // ─── Row-stream subscription ────────────────────────────────────────

  async subscribeStream<TRow = Record<string, unknown>>(
    providerId: string,
    listener: StreamListener<TRow>,
  ): Promise<Unsubscribe> {
    const reqId = this.mkId('req');
    const subId = this.mkId('sub');
    const req: DataPlaneRequest = { op: 'subscribe-stream', reqId, subId, providerId };

    this.streamSubs.set(subId, {
      subId,
      listener: listener as StreamListener,
    });

    try {
      const res = await this.request(req);
      if (res.op !== 'sub-established') throw this.unexpected(res);
    } catch (err) {
      this.streamSubs.delete(subId);
      throw err;
    }

    return () => {
      if (!this.streamSubs.delete(subId)) return;
      this.port.postMessage({ op: 'unsubscribe', subId } satisfies DataPlaneRequest);
    };
  }

  /**
   * Late-joiner escape hatch. Returns the cached row-set as a single
   * array. Callers who want the batched / complete flow should use
   * `subscribeStream` — this helper is for one-shot reads of the
   * current snapshot.
   */
  async getCachedRows<TRow = Record<string, unknown>>(providerId: string): Promise<readonly TRow[]> {
    const reqId = this.mkId('req');
    return new Promise((resolve, reject) => {
      this.cachedRowsPending.set(reqId, {
        rows: [],
        resolved: false,
        resolve: (rows) => resolve(rows as readonly TRow[]),
        reject,
      });
      this.port.postMessage({ op: 'get-cached-rows', reqId, providerId } satisfies DataPlaneRequest);
    });
  }

  // ─── Inspection ─────────────────────────────────────────────────────

  /** Close the port. Pending requests reject with TRANSPORT_CLOSED. */
  close(): void {
    const err = new DataPlaneClientError('TRANSPORT_CLOSED', 'port closed by client', false);
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    this.keyedSubs.clear();
    this.streamSubs.clear();
    this.cachedRowsPending.clear();
    this.port.close();
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private request(req: DataPlaneRequest): Promise<DataPlaneResponse> {
    const reqId = (req as { reqId?: string }).reqId!;
    return new Promise((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject });
      try {
        this.port.postMessage(req);
      } catch (err) {
        this.pending.delete(reqId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private route(raw: unknown): void {
    if (!isResponse(raw)) return;
    const res = raw;

    switch (res.op) {
      case 'ok':
      case 'pong':
      case 'sub-established': {
        const reqId = (res as { reqId: string }).reqId;
        const pending = this.pending.get(reqId);
        if (pending) {
          this.pending.delete(reqId);
          pending.resolve(res);
        }
        return;
      }
      case 'err': {
        const pending = this.pending.get(res.reqId);
        if (pending) {
          this.pending.delete(res.reqId);
          pending.reject(new DataPlaneClientError(res.error.code, res.error.message, res.error.retryable));
          return;
        }
        // Error for a subscription — forward to the listener.
        for (const sub of this.keyedSubs.values()) {
          sub.onError?.(new DataPlaneClientError(res.error.code, res.error.message, res.error.retryable));
        }
        for (const sub of this.streamSubs.values()) {
          sub.listener.onError?.(res.error);
        }
        const cached = this.cachedRowsPending.get(res.reqId);
        if (cached && !cached.resolved) {
          cached.resolved = true;
          this.cachedRowsPending.delete(res.reqId);
          cached.reject(new DataPlaneClientError(res.error.code, res.error.message, res.error.retryable));
        }
        return;
      }
      case 'update': {
        const sub = this.keyedSubs.get((res as UpdateResponse).subId);
        if (!sub) return;
        const u = res as UpdateResponse;
        sub.onUpdate({ providerId: u.providerId, key: u.key, value: u.value, seq: u.seq });
        return;
      }
      case 'snapshot-batch': {
        const batch = res as SnapshotBatchResponse;
        // reqId-tagged batches are targeted replays from get-cached-rows.
        if (batch.reqId) {
          const acc = this.cachedRowsPending.get(batch.reqId);
          if (acc) acc.rows = [...acc.rows, ...batch.rows];
          // Broadcast subscribers with an active subId receive it too if subId is set.
        }
        if (batch.subId) {
          const sub = this.streamSubs.get(batch.subId);
          sub?.listener.onSnapshotBatch?.(batch as SnapshotBatchResponse & { rows: readonly Record<string, unknown>[] });
        }
        return;
      }
      case 'snapshot-complete': {
        const complete = res as SnapshotCompleteResponse;
        if (complete.reqId) {
          const acc = this.cachedRowsPending.get(complete.reqId);
          if (acc && !acc.resolved) {
            acc.resolved = true;
            this.cachedRowsPending.delete(complete.reqId);
            acc.resolve(acc.rows);
          }
        }
        if (complete.subId) {
          const sub = this.streamSubs.get(complete.subId);
          sub?.listener.onSnapshotComplete?.(complete);
        }
        return;
      }
      case 'row-update': {
        const update = res as RowUpdateResponse;
        const sub = this.streamSubs.get(update.subId);
        sub?.listener.onRowUpdate?.(update as RowUpdateResponse & { rows: readonly Record<string, unknown>[] });
        return;
      }
    }
  }

  private unexpected(res: DataPlaneResponse): DataPlaneClientError {
    return new DataPlaneClientError('INTERNAL', `unexpected response op: ${res.op}`, false);
  }

  private mkId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${++this.counter}`;
  }
}
