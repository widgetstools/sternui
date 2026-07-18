/**
 * ConfigCatalogHub — in-process state for the Config SharedWorker
 * (`starui-config:{appId}`). Owns ConfigManager + catalog cache and
 * serves RPC to all connected ports (ADR Phase 2).
 */

import type { ConfigManager } from '@starui/host-config';
import { ConfigCatalogCache } from '../../hub/ConfigCatalogCache.js';
import {
  asConfigCatalogService,
  type ConfigCatalogService,
} from '../worker/ConfigCatalogService.js';
import type {
  ConfigWorkerEvent,
  ConfigWorkerRequest,
  ConfigWorkerResponse,
} from './protocol.js';

export interface ConfigPortLike {
  postMessage(message: unknown): void;
}

export interface ConfigCatalogHubOpts {
  configManager: ConfigManager;
  /** Pre-built catalog; default constructs from configManager. */
  catalog?: ConfigCatalogService;
}

export class ConfigCatalogHub {
  private readonly configManager: ConfigManager;
  private readonly catalog: ConfigCatalogService;
  private readonly ports = new Set<ConfigPortLike>();
  private hydratePromise: Promise<void> | null = null;

  constructor(opts: ConfigCatalogHubOpts) {
    this.configManager = opts.configManager;
    this.catalog = opts.catalog
      ?? asConfigCatalogService(new ConfigCatalogCache(opts.configManager));
  }

  /** Preload catalog (idempotent). Call before accepting port traffic. */
  async hydrate(): Promise<void> {
    if (!this.hydratePromise) {
      this.hydratePromise = this.catalog.hydrate().catch((err) => {
        this.hydratePromise = null;
        throw err;
      });
    }
    await this.hydratePromise;
    this.broadcast({ kind: 'catalog-changed', full: true });
  }

  trackPort(port: ConfigPortLike): void {
    this.ports.add(port);
  }

  onPortClosed(port: ConfigPortLike): void {
    this.ports.delete(port);
  }

  async handleRequest(port: ConfigPortLike, req: ConfigWorkerRequest): Promise<void> {
    this.trackPort(port);
    try {
      switch (req.kind) {
        case 'config-ready': {
          if (!this.catalog.isReady()) await this.catalog.hydrate();
          this.reply(port, { kind: 'config-ready-ok', reqId: req.reqId, ok: true });
          return;
        }
        case 'config-get-provider': {
          const provider = await this.catalog.ensure(req.providerId);
          this.reply(port, {
            kind: 'config-get-provider-ok',
            reqId: req.reqId,
            ok: true,
            provider,
            providerConfig: provider?.config ?? null,
          });
          return;
        }
        case 'config-list-providers': {
          if (!this.catalog.isReady()) await this.catalog.hydrate();
          this.reply(port, {
            kind: 'config-list-providers-ok',
            reqId: req.reqId,
            ok: true,
            providers: this.catalog.list(req.opts),
          });
          return;
        }
        case 'config-invalidate': {
          await this.catalog.invalidate(req.providerId);
          this.broadcast({
            kind: 'catalog-changed',
            providerId: req.providerId,
            full: req.providerId == null,
          });
          this.reply(port, { kind: 'config-invalidate-ok', reqId: req.reqId, ok: true });
          return;
        }
        default: {
          const _exhaustive: never = req;
          void _exhaustive;
        }
      }
    } catch (err) {
      this.replyError(port, req, err);
    }
  }

  getCatalogService(): ConfigCatalogService {
    return this.catalog;
  }

  /** Exposed for tests / diagnostics. */
  getConfigManager(): ConfigManager {
    return this.configManager;
  }

  private reply(port: ConfigPortLike, msg: ConfigWorkerResponse): void {
    try {
      port.postMessage(msg);
    } catch {
      this.ports.delete(port);
    }
  }

  private replyError(port: ConfigPortLike, req: ConfigWorkerRequest, err: unknown): void {
    const error = err instanceof Error ? err.message : String(err);
    const reqId = req.reqId;
    switch (req.kind) {
      case 'config-ready':
        this.reply(port, { kind: 'config-ready-ok', reqId, ok: false, error });
        return;
      case 'config-get-provider':
        this.reply(port, { kind: 'config-get-provider-ok', reqId, ok: false, error });
        return;
      case 'config-list-providers':
        this.reply(port, { kind: 'config-list-providers-ok', reqId, ok: false, error });
        return;
      case 'config-invalidate':
        this.reply(port, { kind: 'config-invalidate-ok', reqId, ok: false, error });
        return;
      default: {
        const _exhaustive: never = req;
        void _exhaustive;
      }
    }
  }

  private broadcast(event: ConfigWorkerEvent): void {
    for (const port of [...this.ports]) {
      try {
        port.postMessage(event);
      } catch {
        this.ports.delete(port);
      }
    }
  }
}
