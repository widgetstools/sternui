/**
 * Main-thread client for the Config SharedWorker (ADR Phase 2).
 */

import type { DataProviderConfig, ProviderConfig } from '@wellsfargo-starui/types';
import type { ListOptions } from '../config/store.js';
import { SUBSCRIBER_PING_INTERVAL_MS } from '../worker/hubTypes.js';
import type {
  ConfigWorkerEvent,
  ConfigWorkerInbound,
  ConfigWorkerRequest,
  ConfigWorkerResponse,
} from './protocol.js';

type Pending = {
  resolve: (value: ConfigWorkerResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Backstop for a Config SharedWorker that never replies — a missing or
 * CSP-blocked worker asset fires `error` on the SharedWorker (logged, not
 * thrown), so without this every request, including the `config-ready`
 * handshake awaited on the first-paint path, would hang forever. Sized
 * well above a cold Dexie open + seed, well below "user gives up".
 */
export const CONFIG_CLIENT_TIMEOUT_MS = 30_000;

export type CatalogChangedHandler = (ev: Extract<ConfigWorkerEvent, { kind: 'catalog-changed' }>) => void;

export class ConfigClient {
  private readonly port: MessagePort;
  private readonly pending = new Map<string, Pending>();
  private readonly catalogListeners = new Set<CatalogChangedHandler>();
  private reqSeq = 0;
  private closed = false;
  private readonly timeoutMs: number;
  private readonly pingTimer: ReturnType<typeof setInterval>;
  readonly ready: Promise<void>;

  constructor(port: MessagePort, opts: { timeoutMs?: number } = {}) {
    this.timeoutMs = opts.timeoutMs ?? CONFIG_CLIENT_TIMEOUT_MS;
    this.port = port;
    this.port.onmessage = (ev: MessageEvent) => {
      this.onMessage(ev.data as ConfigWorkerInbound);
    };
    this.port.start?.();
    // Heartbeat so the worker can evict this port when the window closes.
    this.pingTimer = setInterval(() => {
      if (this.closed) return;
      try {
        this.port.postMessage({ kind: 'config-ping' });
      } catch {
        /* port died; close() is the caller's job */
      }
    }, SUBSCRIBER_PING_INTERVAL_MS);
    this.ready = this.request({ kind: 'config-ready', reqId: this.nextId() }).then((res) => {
      if (res.kind !== 'config-ready-ok' || !res.ok) {
        throw new Error(
          res.kind === 'config-ready-ok' && !res.ok
            ? res.error
            : 'config-ready failed',
        );
      }
    });
  }

  async getProvider(
    providerId: string,
  ): Promise<{ provider: DataProviderConfig | null; providerConfig: ProviderConfig | null }> {
    await this.ready;
    const res = await this.request({
      kind: 'config-get-provider',
      reqId: this.nextId(),
      providerId,
    });
    if (res.kind !== 'config-get-provider-ok' || !res.ok) {
      throw new Error(
        res.kind === 'config-get-provider-ok' && !res.ok
          ? res.error
          : 'config-get-provider failed',
      );
    }
    return { provider: res.provider, providerConfig: res.providerConfig };
  }

  async getProviderConfig(providerId: string): Promise<ProviderConfig | null> {
    const { providerConfig } = await this.getProvider(providerId);
    return providerConfig;
  }

  async listProviders(opts?: ListOptions): Promise<DataProviderConfig[]> {
    await this.ready;
    const res = await this.request({
      kind: 'config-list-providers',
      reqId: this.nextId(),
      opts,
    });
    if (res.kind !== 'config-list-providers-ok' || !res.ok) {
      throw new Error(
        res.kind === 'config-list-providers-ok' && !res.ok
          ? res.error
          : 'config-list-providers failed',
      );
    }
    return res.providers;
  }

  async invalidate(providerId?: string): Promise<void> {
    await this.ready;
    const res = await this.request({
      kind: 'config-invalidate',
      reqId: this.nextId(),
      providerId,
    });
    if (res.kind !== 'config-invalidate-ok' || !res.ok) {
      throw new Error(
        res.kind === 'config-invalidate-ok' && !res.ok
          ? res.error
          : 'config-invalidate failed',
      );
    }
  }

  onCatalogChange(handler: CatalogChangedHandler): () => void {
    this.catalogListeners.add(handler);
    return () => {
      this.catalogListeners.delete(handler);
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.pingTimer);
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('ConfigClient closed'));
    }
    this.pending.clear();
    this.catalogListeners.clear();
    try {
      this.port.close();
    } catch {
      /* already closed */
    }
  }

  private nextId(): string {
    this.reqSeq += 1;
    return `cfg-${this.reqSeq}`;
  }

  private request(
    req: Exclude<ConfigWorkerRequest, { kind: 'config-ping' }>,
  ): Promise<ConfigWorkerResponse> {
    if (this.closed) return Promise.reject(new Error('ConfigClient closed'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.delete(req.reqId)) return;
        reject(new Error(
          `Config SharedWorker did not reply to '${req.kind}' within `
            + `${this.timeoutMs}ms (worker asset missing, blocked, or wedged)`,
        ));
      }, this.timeoutMs);
      this.pending.set(req.reqId, { resolve, reject, timer });
      try {
        this.port.postMessage(req);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(req.reqId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private onMessage(msg: ConfigWorkerInbound): void {
    if (!msg || typeof msg !== 'object') return;
    if (msg.kind === 'catalog-changed') {
      for (const listener of [...this.catalogListeners]) {
        try {
          listener(msg);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[ConfigClient] catalog listener threw', err);
        }
      }
      return;
    }
    const pending = this.pending.get(msg.reqId);
    if (!pending) return;
    this.pending.delete(msg.reqId);
    clearTimeout(pending.timer);
    pending.resolve(msg);
  }
}
