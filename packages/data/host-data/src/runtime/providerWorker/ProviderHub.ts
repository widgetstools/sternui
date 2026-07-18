/**
 * One-provider SharedWorker hub (`starui-provider:{appId}:{providerId}`).
 *
 * Scopes {@link SharedWorkerDataServicesHub} to a single `providerId`.
 * Optional template cache prefetches AppData `{{…}}` (Phase 4d) before
 * the inner hub starts the transport.
 */

import type {
  AttachRequest,
  Event,
  RefreshProviderRequest,
  Request,
  StopRequest,
} from '../protocol.js';
import { isRequest } from '../protocol.js';
import {
  SharedWorkerDataServicesHub,
  type PortLike,
  type SharedWorkerDataServicesHubOpts,
} from '../worker/SharedWorkerDataServicesHub.js';
import type {
  AsyncAppDataLookup,
  ProviderAppDataLookupCache,
} from './providerAppDataLookupCache.js';

export type ProviderWorkerReadyRequest = {
  kind: 'provider-worker-ready';
  reqId: string;
};

export type ProviderWorkerReadyResponse =
  | { kind: 'provider-worker-ready-ok'; reqId: string; ok: true; providerId: string }
  | { kind: 'provider-worker-ready-ok'; reqId: string; ok: false; error: string };

export type ProviderHubRequest = Request | ProviderWorkerReadyRequest;

export function isProviderHubRequest(msg: unknown): msg is ProviderHubRequest {
  if (!msg || typeof msg !== 'object') return false;
  const kind = (msg as { kind?: unknown }).kind;
  if (kind === 'provider-worker-ready') return true;
  return isRequest(msg);
}

export interface ProviderHubOpts extends SharedWorkerDataServicesHubOpts {
  /** Fixed provider id for this SharedWorker realm. */
  providerId: string;
  /** Injected hub (tests). */
  hub?: SharedWorkerDataServicesHub;
  /**
   * When set with {@link templateLookupAsync}, prefetch `{{…}}` from AppData SW
   * before the transport starts (ADR Phase 4d).
   */
  templateCache?: ProviderAppDataLookupCache;
  templateLookupAsync?: AsyncAppDataLookup;
}

export class ProviderHub {
  readonly providerId: string;
  private readonly hub: SharedWorkerDataServicesHub;
  private readonly templateCache?: ProviderAppDataLookupCache;
  private readonly templateLookupAsync?: AsyncAppDataLookup;

  constructor(opts: ProviderHubOpts) {
    this.providerId = opts.providerId;
    this.templateCache = opts.templateCache;
    this.templateLookupAsync = opts.templateLookupAsync;
    this.hub = opts.hub ?? new SharedWorkerDataServicesHub(opts);
  }

  getInnerHub(): SharedWorkerDataServicesHub {
    return this.hub;
  }

  async hydrate(userId = 'worker'): Promise<void> {
    await this.hub.hydrateCatalog();
    await this.hub.hydrateAppData(userId);
  }

  onPortClosed(port: PortLike): void {
    this.hub.onPortClosed(port);
  }

  async dispose(): Promise<void> {
    await this.hub.dispose();
  }

  handleRequest(port: PortLike, req: ProviderHubRequest): void {
    if (req.kind === 'provider-worker-ready') {
      try {
        port.postMessage({
          kind: 'provider-worker-ready-ok',
          reqId: req.reqId,
          ok: true,
          providerId: this.providerId,
        } satisfies ProviderWorkerReadyResponse);
      } catch {
        /* port dead */
      }
      return;
    }

    switch (req.kind) {
      case 'attach':
        void this.handleAttach(port, req);
        return;
      case 'stop':
        this.handleStop(port, req);
        return;
      case 'refresh-provider':
        this.handleRefresh(port, req);
        return;
      case 'detach':
      case 'ping':
      case 'hub-ready':
      case 'get-config':
      case 'list-configs':
      case 'config-invalidate':
      case 'hub-introspect':
        this.hub.handleRequest(port, req);
        return;
      default: {
        const _exhaustive: never = req;
        void _exhaustive;
      }
    }
  }

  private async handleAttach(port: PortLike, req: AttachRequest): Promise<void> {
    if (req.providerId !== this.providerId) {
      const event: Event = {
        subId: req.subId,
        kind: 'status',
        status: 'error',
        error:
          `Provider worker '${this.providerId}' rejected attach for '${req.providerId}'.`,
      };
      try {
        port.postMessage(event);
      } catch {
        /* port dead */
      }
      return;
    }
    try {
      if (this.templateCache && this.templateLookupAsync) {
        const cfg =
          req.cfg ??
          this.hub.getCatalogService()?.getProviderConfig(req.providerId) ??
          undefined;
        if (cfg) {
          await this.templateCache.hydrateFromCfg(cfg, this.templateLookupAsync);
        }
      }
    } catch (err) {
      const event: Event = {
        subId: req.subId,
        kind: 'status',
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
      try {
        port.postMessage(event);
      } catch {
        /* port dead */
      }
      return;
    }
    this.hub.handleRequest(port, req);
  }

  private handleStop(_port: PortLike, req: StopRequest): void {
    if (req.providerId !== this.providerId) return;
    this.hub.handleRequest(_port, req);
  }

  private handleRefresh(port: PortLike, req: RefreshProviderRequest): void {
    if (req.providerId !== this.providerId) {
      const event: Event = {
        subId: req.subId,
        kind: 'status',
        status: 'error',
        error:
          `Provider worker '${this.providerId}' rejected refresh for '${req.providerId}'.`,
      };
      try {
        port.postMessage(event);
      } catch {
        /* port dead */
      }
      return;
    }
    this.hub.handleRequest(port, req);
  }
}
