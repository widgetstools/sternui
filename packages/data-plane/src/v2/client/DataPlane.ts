/**
 * DataPlane — main-thread client. Owns the MessagePort to the
 * SharedWorker (or in-process Hub for tests), routes incoming events
 * to the right per-subscription listener, and exposes a small
 * surface to the rest of the app.
 *
 * Three methods cover everything:
 *   • `attach(providerId, cfg, listener, opts?)` — subscribe to data.
 *     Returns a subId. The first emit is always the cache replace +
 *     current status (Hub guarantees), so the consumer never starts
 *     in an "I haven't seen anything yet" state.
 *   • `attachStats(providerId, listener)` — subscribe to live stats.
 *   • `stop(providerId)` — explicit teardown of the upstream
 *     connection. The Hub does not auto-tear-down.
 *
 * No request/response correlation — attach + detach + stop are all
 * fire-and-forget. The port either delivers events back or it
 * doesn't (in which case `useProviderStream` shows status: 'loading'
 * forever, which surfaces the issue).
 */

import type {
  AttachRequest,
  DetachRequest,
  Event,
  ProviderStats,
  ProviderStatus,
  Request,
  StopRequest,
} from '../protocol.js';
import { isEvent } from '../protocol.js';
import type { ProviderConfig } from '@marketsui/shared-types';

export type SubId = string;

export interface DataListener<T = unknown> {
  onDelta(rows: readonly T[], replace: boolean): void;
  onStatus(status: ProviderStatus, error?: string): void;
}

export interface StatsListener {
  onStats(stats: ProviderStats): void;
}

export interface AttachOpts {
  /**
   * Restart payload. When the provider is already running, the Hub
   * forwards this to `provider.restart(extra)`. Common uses:
   *   - `{ asOfDate: '...' }` for historical mode.
   *   - `{ __refresh: Date.now() }` for a manual refresh.
   */
  extra?: Record<string, unknown>;
}

interface DataSub {
  kind: 'data';
  listener: DataListener;
}
interface StatsSub {
  kind: 'stats';
  listener: StatsListener;
}
type Sub = DataSub | StatsSub;

export interface DataPlaneOpts {
  /** Inject for tests. Default: `() => crypto.randomUUID()`. */
  generateSubId?: () => string;
}

export class DataPlane {
  private readonly port: MessagePort;
  private readonly subs = new Map<SubId, Sub>();
  private readonly generateSubId: () => string;
  private closed = false;

  constructor(port: MessagePort, opts: DataPlaneOpts = {}) {
    this.port = port;
    this.generateSubId = opts.generateSubId ?? (() => crypto.randomUUID());
    this.port.addEventListener('message', this.handleMessage);
    this.port.start();
  }

  // ─── public surface ───────────────────────────────────────────

  attach<T = unknown>(
    providerId: string,
    cfg: ProviderConfig | undefined,
    listener: DataListener<T>,
    opts: AttachOpts = {},
  ): SubId {
    if (this.closed) throw new Error('[DataPlane] client is closed');
    const subId = this.generateSubId();
    this.subs.set(subId, { kind: 'data', listener: listener as DataListener });
    this.send({
      kind: 'attach',
      subId,
      providerId,
      cfg,
      mode: 'data',
      extra: opts.extra,
    });
    return subId;
  }

  attachStats(providerId: string, listener: StatsListener): SubId {
    if (this.closed) throw new Error('[DataPlane] client is closed');
    const subId = this.generateSubId();
    this.subs.set(subId, { kind: 'stats', listener });
    this.send({
      kind: 'attach',
      subId,
      providerId,
      mode: 'stats',
    });
    return subId;
  }

  detach(subId: SubId): void {
    if (!this.subs.delete(subId)) return;
    if (this.closed) return;
    this.send({ kind: 'detach', subId });
  }

  stop(providerId: string): void {
    if (this.closed) return;
    this.send({ kind: 'stop', providerId });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.subs.clear();
    this.port.removeEventListener('message', this.handleMessage);
    try { this.port.close(); } catch { /* MessagePort.close is fine to call twice */ }
  }

  // ─── internals ────────────────────────────────────────────────

  private send(req: Request | AttachRequest | DetachRequest | StopRequest): void {
    try {
      this.port.postMessage(req);
    } catch (err) {
      // postMessage can throw on dead ports / structured-clone failures.
      // Surface via the affected listener if we can identify it.
      const subId = (req as { subId?: string }).subId;
      if (subId) {
        const sub = this.subs.get(subId);
        if (sub?.kind === 'data') {
          sub.listener.onStatus('error', err instanceof Error ? err.message : String(err));
        }
      }
    }
  }

  private handleMessage = (ev: MessageEvent): void => {
    if (!isEvent(ev.data)) return;
    const event: Event = ev.data;
    const sub = this.subs.get(event.subId);
    if (!sub) return; // listener detached before this event landed; drop.
    switch (event.kind) {
      case 'delta':
        if (sub.kind === 'data') {
          sub.listener.onDelta(event.rows, Boolean(event.replace));
        }
        return;
      case 'status':
        if (sub.kind === 'data') {
          sub.listener.onStatus(event.status, event.error);
        }
        return;
      case 'stats':
        if (sub.kind === 'stats') {
          sub.listener.onStats(event.stats);
        }
        return;
    }
  };
}

/**
 * Test helper: build a DataPlane wired to an in-process Hub via a
 * MessageChannel. Saves every consumer from rebuilding this in their
 * own tests.
 *
 * Usage:
 *   const { client, hub } = createInPageDataPlane();
 *   client.attach(...)
 *   ... hub.handleRequest fires ... events stream back to the client
 */
export interface InPageWiring {
  client: DataPlane;
  /** Disconnect both ends. */
  close(): void;
}

export function createInPageWiring(
  attachToHub: (clientPort: MessagePort) => void,
  opts?: DataPlaneOpts,
): InPageWiring {
  const channel = new MessageChannel();
  attachToHub(channel.port2);
  const client = new DataPlane(channel.port1, opts);
  return {
    client,
    close: () => {
      client.close();
      try { channel.port2.close(); } catch { /* idempotent */ }
    },
  };
}
