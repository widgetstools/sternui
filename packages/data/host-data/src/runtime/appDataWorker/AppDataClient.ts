/**
 * Main-thread client for the AppData SharedWorker (ADR Phase 3).
 *
 * Speaks the existing `appdata-*` protocol so {@link AppDataMirror}
 * works unchanged, plus `appdata-lookup` for cross-process template
 * resolution (provider workers / remote callers).
 */

import { AppDataMirror } from '../mirror/AppDataMirror.js';
import {
  isAppDataEvent,
  type AppDataEvent,
  type AppDataRequest,
} from '../protocol.js';
import type {
  AppDataHubOutbound,
  AppDataLookupRequest,
  AppDataLookupResponse,
  AppDataWorkerReadyRequest,
  AppDataWorkerReadyResponse,
} from './AppDataHub.js';

type PendingRpc = {
  resolve: (value: AppDataWorkerReadyResponse | AppDataLookupResponse) => void;
  reject: (err: Error) => void;
};

export class AppDataClient {
  private readonly port: MessagePort;
  private readonly pending = new Map<string, PendingRpc>();
  private readonly mirrors = new Map<string, AppDataMirror>();
  private reqSeq = 0;
  private subSeq = 0;
  private closed = false;
  readonly ready: Promise<void>;

  constructor(port: MessagePort) {
    this.port = port;
    this.port.onmessage = (ev: MessageEvent) => {
      this.onMessage(ev.data as AppDataHubOutbound | AppDataEvent);
    };
    this.port.start?.();
    this.ready = this.requestReady().then((res) => {
      if (!res.ok) {
        throw new Error(res.error || 'appdata-worker-ready failed');
      }
    });
  }

  /**
   * Attach a fresh {@link AppDataMirror}. Caller owns lifetime —
   * {@link detachAppData} or {@link close}.
   */
  attachAppData(opts: { userId: string; subId?: string }): AppDataMirror {
    const subId = opts.subId ?? this.nextSubId();
    const mirror = new AppDataMirror({
      subId,
      userId: opts.userId,
      send: (req: AppDataRequest) => this.sendAppData(req),
    });
    this.mirrors.set(subId, mirror);
    return mirror;
  }

  detachAppData(mirror: AppDataMirror): void {
    for (const [subId, m] of this.mirrors) {
      if (m === mirror) {
        this.mirrors.delete(subId);
        if (!this.closed) this.sendAppData({ kind: 'appdata-detach', subId });
        return;
      }
    }
  }

  /**
   * Cross-process template lookup (async). Prefer {@link AppDataMirror.get}
   * after attach when sync reads are required on the main thread.
   */
  async lookup(name: string, key: string): Promise<unknown> {
    await this.ready;
    const res = await this.requestLookup({
      kind: 'appdata-lookup',
      reqId: this.nextId(),
      name,
      key,
    });
    if (!res.ok) {
      throw new Error(res.error || 'appdata-lookup failed');
    }
    return res.value;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const [subId] of this.mirrors) {
      try {
        this.sendAppData({ kind: 'appdata-detach', subId });
      } catch {
        /* port may already be dead */
      }
    }
    this.mirrors.clear();
    for (const [, p] of this.pending) {
      p.reject(new Error('AppDataClient closed'));
    }
    this.pending.clear();
    try {
      this.port.close();
    } catch {
      /* already closed */
    }
  }

  private nextId(): string {
    this.reqSeq += 1;
    return `ad-${this.reqSeq}`;
  }

  private nextSubId(): string {
    this.subSeq += 1;
    return `ad-sub-${this.subSeq}`;
  }

  private sendAppData(req: AppDataRequest): void {
    if (this.closed) return;
    try {
      this.port.postMessage(req);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[AppDataClient] AppData postMessage failed', err);
    }
  }

  private requestReady(): Promise<AppDataWorkerReadyResponse> {
    const req: AppDataWorkerReadyRequest = {
      kind: 'appdata-worker-ready',
      reqId: this.nextId(),
    };
    return this.requestRpc(req) as Promise<AppDataWorkerReadyResponse>;
  }

  private requestLookup(req: AppDataLookupRequest): Promise<AppDataLookupResponse> {
    return this.requestRpc(req) as Promise<AppDataLookupResponse>;
  }

  private requestRpc(
    req: AppDataWorkerReadyRequest | AppDataLookupRequest,
  ): Promise<AppDataWorkerReadyResponse | AppDataLookupResponse> {
    if (this.closed) return Promise.reject(new Error('AppDataClient closed'));
    return new Promise((resolve, reject) => {
      this.pending.set(req.reqId, { resolve, reject });
      try {
        this.port.postMessage(req);
      } catch (err) {
        this.pending.delete(req.reqId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private onMessage(msg: unknown): void {
    if (!msg || typeof msg !== 'object') return;
    const kind = (msg as { kind?: string }).kind;

    if (kind === 'appdata-worker-ready-ok' || kind === 'appdata-lookup-ok') {
      const res = msg as AppDataWorkerReadyResponse | AppDataLookupResponse;
      const pending = this.pending.get(res.reqId);
      if (!pending) return;
      this.pending.delete(res.reqId);
      pending.resolve(res);
      return;
    }

    if (isAppDataEvent(msg)) {
      this.routeAppDataEvent(msg);
    }
  }

  private routeAppDataEvent(event: AppDataEvent): void {
    if (event.kind === 'appdata-ack') {
      for (const mirror of this.mirrors.values()) mirror.handleEvent(event);
      return;
    }
    const mirror = this.mirrors.get(event.subId);
    if (mirror) mirror.handleEvent(event);
  }
}
