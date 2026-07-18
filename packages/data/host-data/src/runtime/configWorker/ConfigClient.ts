/**
 * Main-thread client for the Config SharedWorker (ADR Phase 2).
 */

import type { DataProviderConfig, ProviderConfig } from '@starui/types';
import type { ListOptions } from '../config/store.js';
import type {
  ConfigWorkerEvent,
  ConfigWorkerInbound,
  ConfigWorkerRequest,
  ConfigWorkerResponse,
} from './protocol.js';

type Pending = {
  resolve: (value: ConfigWorkerResponse) => void;
  reject: (err: Error) => void;
};

export type CatalogChangedHandler = (ev: Extract<ConfigWorkerEvent, { kind: 'catalog-changed' }>) => void;

export class ConfigClient {
  private readonly port: MessagePort;
  private readonly pending = new Map<string, Pending>();
  private readonly catalogListeners = new Set<CatalogChangedHandler>();
  private reqSeq = 0;
  private closed = false;
  readonly ready: Promise<void>;

  constructor(port: MessagePort) {
    this.port = port;
    this.port.onmessage = (ev: MessageEvent) => {
      this.onMessage(ev.data as ConfigWorkerInbound);
    };
    this.port.start?.();
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
    for (const [, p] of this.pending) {
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

  private request(req: ConfigWorkerRequest): Promise<ConfigWorkerResponse> {
    if (this.closed) return Promise.reject(new Error('ConfigClient closed'));
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
    pending.resolve(msg);
  }
}
