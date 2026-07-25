/**
 * SsrmControlClient — window-side control-port wrapper for the SSRM
 * provider worker. Owns ONE SharedWorker port speaking the control
 * dialect (configure / restart / state + broadcast subscription).
 *
 * The DATA path is separate by design: a window opens a second port to
 * the same worker (`new SharedWorker(sameUrl, sameName)`) and hands it
 * to `@finos/perspective`'s client (`perspective.worker(...)`) — the
 * worker's accept path discriminates the dialects on first message.
 * Keeping the protobuf stream off the control port means neither
 * protocol ever sees the other's frames.
 */

import {
  isSsrmControlEvent,
  type DatasetStateSnapshot,
  type SsrmControlRequest,
  type SsrmDatasetConfig,
  type SsrmStateEvent,
} from '../types.js';

export type SsrmStateListener = (state: DatasetStateSnapshot, tableName: string | null) => void;

interface ControlPortLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', cb: (ev: MessageEvent) => void): void;
  start?(): void;
  close?(): void;
}

export interface SsrmControlClientOpts {
  /** Reply timeout per request. Default 30s (a cold worker boots wasm). */
  requestTimeoutMs?: number;
}

export class SsrmControlClient {
  private readonly port: ControlPortLike;
  private readonly timeoutMs: number;
  private readonly listeners = new Set<SsrmStateListener>();
  private readonly pending = new Map<
    number,
    { resolve: (v: { state: DatasetStateSnapshot; tableName: string | null }) => void;
      reject: (e: Error) => void }
  >();
  private nextReqId = 1;

  constructor(worker: { port: MessagePort } | MessagePort, opts: SsrmControlClientOpts = {}) {
    this.port = 'port' in worker ? worker.port : worker;
    this.timeoutMs = opts.requestTimeoutMs ?? 30_000;
    this.port.addEventListener('message', (ev) => this.onMessage(ev.data));
    this.port.start?.();
  }

  /** Subscribe to DatasetState broadcasts. Returns unsubscribe. */
  onState(listener: SsrmStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  configure(config: SsrmDatasetConfig): Promise<{ state: DatasetStateSnapshot; tableName: string | null }> {
    return this.request({ kind: 'ssrm-configure', reqId: 0, config });
  }

  restart(): Promise<{ state: DatasetStateSnapshot; tableName: string | null }> {
    return this.request({ kind: 'ssrm-restart', reqId: 0 });
  }

  requestState(): Promise<{ state: DatasetStateSnapshot; tableName: string | null }> {
    return this.request({ kind: 'ssrm-state', reqId: 0 });
  }

  close(): void {
    this.port.close?.();
    this.pending.clear();
    this.listeners.clear();
  }

  private request(
    req: SsrmControlRequest,
  ): Promise<{ state: DatasetStateSnapshot; tableName: string | null }> {
    const reqId = this.nextReqId++;
    const wired: SsrmControlRequest = { ...req, reqId };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error(`[ssrm] ${req.kind} timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(reqId, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.port.postMessage(wired);
    });
  }

  private onMessage(data: unknown): void {
    if (!isSsrmControlEvent(data)) return;
    if (data.kind === 'ssrm-ack') {
      const waiter = this.pending.get(data.reqId);
      if (!waiter) return;
      this.pending.delete(data.reqId);
      if (data.error) waiter.reject(new Error(data.error));
      else waiter.resolve({ state: data.state, tableName: data.tableName });
      return;
    }
    const event: SsrmStateEvent = data;
    for (const listener of this.listeners) listener(event.state, event.tableName);
  }
}
