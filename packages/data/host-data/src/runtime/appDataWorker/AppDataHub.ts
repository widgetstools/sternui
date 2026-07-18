/**
 * AppData SharedWorker hub (`starui-appdata:{appId}`) — ADR Phase 3.
 *
 * Reuses the existing `appdata-*` wire protocol so {@link AppDataMirror}
 * works unchanged. Adds `appdata-lookup` for cross-process template
 * resolution (provider workers / remote callers).
 */

import type { ConfigManager } from '@starui/host-config';
import { AppDataService } from '../worker/AppDataService.js';
import type {
  AppDataAttachRequest,
  AppDataDetachRequest,
  AppDataEvent,
  AppDataRemoveRequest,
  AppDataRequest,
  AppDataSetRequest,
  AppDataUpsertRequest,
} from '../protocol.js';
import { isAppDataRequest } from '../protocol.js';

export interface AppDataPortLike {
  postMessage(message: unknown): void;
}

export type AppDataLookupRequest = {
  kind: 'appdata-lookup';
  reqId: string;
  name: string;
  key: string;
};

export type AppDataLookupResponse =
  | { kind: 'appdata-lookup-ok'; reqId: string; ok: true; value: unknown }
  | { kind: 'appdata-lookup-ok'; reqId: string; ok: false; error: string };

export type AppDataWorkerReadyRequest = { kind: 'appdata-worker-ready'; reqId: string };
export type AppDataWorkerReadyResponse =
  | { kind: 'appdata-worker-ready-ok'; reqId: string; ok: true }
  | { kind: 'appdata-worker-ready-ok'; reqId: string; ok: false; error: string };

export type AppDataHubRequest =
  | AppDataRequest
  | AppDataLookupRequest
  | AppDataWorkerReadyRequest;

export type AppDataHubOutbound =
  | AppDataEvent
  | AppDataLookupResponse
  | AppDataWorkerReadyResponse;

export function isAppDataHubRequest(msg: unknown): msg is AppDataHubRequest {
  if (!msg || typeof msg !== 'object') return false;
  const kind = (msg as { kind?: unknown }).kind;
  if (kind === 'appdata-lookup' || kind === 'appdata-worker-ready') return true;
  return isAppDataRequest(msg);
}

export interface AppDataHubOpts {
  configManager?: ConfigManager;
  /** Injected service (tests). */
  appData?: AppDataService;
}

export class AppDataHub {
  private readonly appData: AppDataService;
  private readonly listeners = new Map<string, { subId: string; port: AppDataPortLike }>();
  private readonly ports = new Set<AppDataPortLike>();

  constructor(opts: AppDataHubOpts = {}) {
    this.appData = opts.appData ?? new AppDataService({ configManager: opts.configManager });
    this.appData.subscribe((op, row) => {
      const event: Extract<AppDataEvent, { kind: 'appdata-delta' }> & { subId: string } = {
        kind: 'appdata-delta',
        subId: '',
        op,
        row,
      };
      for (const [, entry] of this.listeners) {
        event.subId = entry.subId;
        try {
          entry.port.postMessage(event);
        } catch {
          this.listeners.delete(entry.subId);
        }
      }
    });
  }

  async hydrate(userId = 'worker'): Promise<void> {
    await this.appData.hydrate(userId);
  }

  trackPort(port: AppDataPortLike): void {
    this.ports.add(port);
  }

  onPortClosed(port: AppDataPortLike): void {
    this.ports.delete(port);
    for (const [subId, entry] of this.listeners) {
      if (entry.port === port) this.listeners.delete(subId);
    }
  }

  getService(): AppDataService {
    return this.appData;
  }

  /** Sync in-process lookup (same worker realm as providers later). */
  lookup(name: string, key: string): unknown {
    return this.appData.lookup(name, key);
  }

  async handleRequest(port: AppDataPortLike, req: AppDataHubRequest): Promise<void> {
    this.trackPort(port);
    switch (req.kind) {
      case 'appdata-worker-ready': {
        try {
          if (!this.appData.isHydrated() && this.appData.hasPersist) {
            await this.appData.hydrate();
          }
          this.reply(port, { kind: 'appdata-worker-ready-ok', reqId: req.reqId, ok: true });
        } catch (err) {
          this.reply(port, {
            kind: 'appdata-worker-ready-ok',
            reqId: req.reqId,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }
      case 'appdata-lookup': {
        try {
          const value = this.appData.lookup(req.name, req.key);
          this.reply(port, {
            kind: 'appdata-lookup-ok',
            reqId: req.reqId,
            ok: true,
            value,
          });
        } catch (err) {
          this.reply(port, {
            kind: 'appdata-lookup-ok',
            reqId: req.reqId,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }
      case 'appdata-attach':
        await this.handleAttach(port, req);
        return;
      case 'appdata-detach':
        this.handleDetach(req);
        return;
      case 'appdata-set':
        await this.handleSet(port, req);
        return;
      case 'appdata-upsert':
        await this.handleUpsert(port, req);
        return;
      case 'appdata-remove':
        await this.handleRemove(port, req);
        return;
      default: {
        const _exhaustive: never = req;
        void _exhaustive;
      }
    }
  }

  private async handleAttach(port: AppDataPortLike, req: AppDataAttachRequest): Promise<void> {
    if (this.appData.hasPersist && this.appData.isHydrated()) {
      await this.appData.resync();
    } else if (req.seed && !this.appData.isHydrated()) {
      this.appData.hydrateFromSeed(req.seed);
    }
    this.listeners.set(req.subId, { subId: req.subId, port });
    const event: AppDataEvent = {
      kind: 'appdata-snapshot',
      subId: req.subId,
      rows: this.appData.snapshot(),
    };
    try {
      port.postMessage(event);
    } catch {
      this.listeners.delete(req.subId);
    }
  }

  private handleDetach(req: AppDataDetachRequest): void {
    this.listeners.delete(req.subId);
  }

  private async handleSet(port: AppDataPortLike, req: AppDataSetRequest): Promise<void> {
    try {
      if (this.appData.hasPersist) {
        await this.appData.persistUpsert(req.row);
      } else {
        this.appData.upsert(req.row);
      }
      this.ack(port, req.reqId, true);
    } catch (err) {
      this.ack(port, req.reqId, false, err);
    }
  }

  private async handleUpsert(port: AppDataPortLike, req: AppDataUpsertRequest): Promise<void> {
    try {
      if (this.appData.hasPersist) {
        await this.appData.persistUpsert(req.row);
      } else {
        this.appData.upsert(req.row);
      }
      this.ack(port, req.reqId, true);
    } catch (err) {
      this.ack(port, req.reqId, false, err);
    }
  }

  private async handleRemove(port: AppDataPortLike, req: AppDataRemoveRequest): Promise<void> {
    try {
      if (this.appData.hasPersist) {
        await this.appData.persistRemove(req.configId);
      } else {
        this.appData.remove(req.configId);
      }
      this.ack(port, req.reqId, true);
    } catch (err) {
      this.ack(port, req.reqId, false, err);
    }
  }

  private ack(port: AppDataPortLike, reqId: string, ok: boolean, err?: unknown): void {
    const event: AppDataEvent = ok
      ? { kind: 'appdata-ack', reqId, ok: true }
      : {
          kind: 'appdata-ack',
          reqId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
    this.reply(port, event);
  }

  private reply(port: AppDataPortLike, msg: AppDataHubOutbound): void {
    try {
      port.postMessage(msg);
    } catch {
      this.ports.delete(port);
    }
  }
}
