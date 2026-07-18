/**
 * Main-thread client for one provider SharedWorker (ADR Phase 4a).
 *
 * Reuses {@link SharedWorkerDataServicesClient} subscribe/attach semantics
 * against a port scoped to a single `providerId`.
 */

import type { ProviderConfig } from '@wellsfargo-starui/types';
import {
  SharedWorkerDataServicesClient,
  type AttachOpts,
  type SharedWorkerDataServicesClientOpts,
  type SubscribeHandle,
} from '../client/SharedWorkerDataServicesClient.js';
import type { ProviderWorkerReadyRequest } from './ProviderHub.js';

export class ProviderClient {
  readonly appId: string;
  readonly providerId: string;
  private readonly inner: SharedWorkerDataServicesClient;
  private readonly port: MessagePort;
  readonly ready: Promise<void>;

  constructor(
    port: MessagePort,
    opts: {
      appId: string;
      providerId: string;
      clientOpts?: SharedWorkerDataServicesClientOpts;
    },
  ) {
    this.appId = opts.appId;
    this.providerId = opts.providerId;
    this.port = port;

    // Client owns attach/delta routing and calls `port.start()`.
    this.inner = new SharedWorkerDataServicesClient(port, opts.clientOpts);

    const readyReqId = `pwr-${++ProviderClient.seq}`;
    this.ready = new Promise<void>((resolve, reject) => {
      const onReady = (ev: MessageEvent) => {
        const data = ev.data as {
          kind?: string;
          reqId?: string;
          ok?: boolean;
          error?: string;
        };
        if (data?.kind !== 'provider-worker-ready-ok' || data.reqId !== readyReqId) {
          return;
        }
        port.removeEventListener('message', onReady);
        if (data.ok) resolve();
        else reject(new Error(data.error || 'provider-worker-ready failed'));
      };
      port.addEventListener('message', onReady);
      const req: ProviderWorkerReadyRequest = {
        kind: 'provider-worker-ready',
        reqId: readyReqId,
      };
      try {
        port.postMessage(req);
      } catch (err) {
        port.removeEventListener('message', onReady);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private static seq = 0;

  /**
   * Subscribe to this worker's provider. `providerId` is fixed by the
   * SharedWorker name — do not pass a different id.
   */
  subscribe<T = unknown>(
    cfg?: ProviderConfig,
    opts: AttachOpts = {},
  ): SubscribeHandle<T> {
    return this.inner.subscribe(this.providerId, cfg, opts);
  }

  stop(): void {
    this.inner.stop(this.providerId);
  }

  close(): void {
    this.inner.close();
    try {
      this.port.close();
    } catch {
      /* already closed */
    }
  }

  /** Escape hatch for adapters that need the underlying monolith client shape. */
  asDataServicesClient(): SharedWorkerDataServicesClient {
    return this.inner;
  }
}
