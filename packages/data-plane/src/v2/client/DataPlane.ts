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

/**
 * Two-phase subscription handle returned by `client.subscribe(...)`.
 *
 * The two phases match the natural reload-time flow:
 *   1. await `snapshot` — single Promise that resolves with the full
 *      cache (or rejects if the provider can't deliver one).
 *   2. register `onUpdate` — receive live ticks from now on.
 *
 * Updates that arrive between the snapshot resolving and `onUpdate`
 * being registered are buffered, then flushed in order on
 * registration — nothing is silently dropped.
 */
export interface SubscribeHandle<T = unknown> {
  snapshot: Promise<readonly T[]>;
  onUpdate(cb: (rows: readonly T[]) => void): void;
  onStatus(cb: (status: ProviderStatus, error?: string) => void): void;
  unsubscribe(): void;
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

  /**
   * Two-phase subscription that matches the natural mental model:
   *
   *   1. Reload → connect to (or create) the SharedWorker.
   *   2. Grid requests the snapshot.
   *   3. Worker delivers the snapshot — either from its cache, or by
   *      starting the provider and waiting for its snapshot phase to
   *      complete.
   *   4. Grid applies the snapshot.
   *   5. Grid subscribes for live updates.
   *
   * Returns a handle with:
   *   • `snapshot: Promise<T[]>` — resolves with the full snapshot
   *     once. Awaiting it is step 4 of the flow above.
   *   • `onUpdate(cb)` — registers the live-tick callback. Called only
   *     for post-snapshot updates. If updates arrive between snapshot
   *     resolution and onUpdate registration, they're buffered and
   *     flushed in order on registration.
   *   • `onStatus(cb)` — provider status changes (loading/ready/error).
   *   • `unsubscribe()` — tear down the subscription.
   *
   * Internally this rides the same wire protocol as `attach`: the
   * Hub's first emit is always `{replace: true}` carrying the snapshot,
   * subsequent emits are live deltas. The handle simply unbundles
   * those two phases for the consumer so the snapshot can be awaited
   * and the live-update path doesn't have to also know about
   * `replace: true`.
   */
  subscribe<T = unknown>(
    providerId: string,
    cfg: ProviderConfig | undefined,
    opts: AttachOpts = {},
  ): SubscribeHandle<T> {
    if (this.closed) throw new Error('[DataPlane] client is closed');

    const subId = this.generateSubId();
    // eslint-disable-next-line no-console
    console.log(
      `[v2/client] %csubscribe→worker%c subId=%s provider=%s cfgPassed=%s${opts.extra ? ' extra=' + JSON.stringify(opts.extra) : ''}`,
      'color:#3b82f6', '', subId, providerId, Boolean(cfg),
    );

    let snapshotResolve!: (rows: readonly T[]) => void;
    let snapshotReject!: (err: Error) => void;
    const snapshot = new Promise<readonly T[]>((resolve, reject) => {
      snapshotResolve = resolve;
      snapshotReject = reject;
    });

    let snapshotSettled = false; // true after resolve OR reject
    let updateCb: ((rows: readonly T[]) => void) | null = null;
    let statusCb: ((status: ProviderStatus, error?: string) => void) | null = null;
    const bufferedUpdates: ReadonlyArray<T>[] = [];

    // Snapshot is "the cache state at the moment the provider becomes
    // ready". The Hub's wire protocol sends:
    //   1. an immediate replace=true delta on attach carrying whatever
    //      is currently in the cache (possibly empty if the provider
    //      is still in its loading/snapshot phase);
    //   2. one or more `status` events as the provider transitions;
    //   3. on snapshot-end-token, another replace=true delta with the
    //      now-populated cache, followed by `status: 'ready'`.
    //
    // We hold the LATEST replace=true rows in `latestSnapshotRows` and
    // commit-resolve only when the status reaches `ready`. That way:
    //   - subscribing to an already-ready provider resolves on the
    //     first round-trip (delta + status:ready arrive together);
    //   - subscribing to a still-loading provider waits past the
    //     empty initial replay until the real snapshot lands.
    let latestSnapshotRows: readonly T[] | null = null;
    let currentStatus: ProviderStatus | null = null;
    let currentError: string | undefined;

    const flushBuffered = () => {
      if (!updateCb) return;
      while (bufferedUpdates.length > 0) {
        const next = bufferedUpdates.shift()!;
        updateCb(next);
      }
    };

    const trySettleSnapshot = () => {
      if (snapshotSettled) return;
      if (currentStatus === 'error') {
        snapshotSettled = true;
        snapshotReject(new Error(currentError ?? 'Provider error'));
        return;
      }
      if (currentStatus === 'ready' && latestSnapshotRows !== null) {
        snapshotSettled = true;
        snapshotResolve(latestSnapshotRows);
      }
    };

    const listener: DataListener<T> = {
      onDelta: (rows, replace) => {
        // eslint-disable-next-line no-console
        console.log(
          `[v2/client] %cdelta←worker%c subId=%s rows=%d replace=%s settled=%s`,
          replace ? 'color:#10b981' : 'color:#f59e0b', '',
          subId, rows.length, replace, snapshotSettled,
        );
        if (replace) {
          latestSnapshotRows = rows;
          trySettleSnapshot();
          return;
        }
        // Non-replace delta. Pre-snapshot deltas shouldn't happen
        // under our protocol (the provider buffers during the
        // snapshot phase and emits replace=true at the end), but if
        // they do we queue them rather than dropping. After the
        // snapshot is settled, deltas are live ticks.
        if (updateCb) {
          updateCb(rows);
        } else {
          bufferedUpdates.push(rows);
          // eslint-disable-next-line no-console
          console.log(`[v2/client]   …buffered (no onUpdate handler yet); pending=%d`, bufferedUpdates.length);
        }
      },
      onStatus: (status, error) => {
        // eslint-disable-next-line no-console
        console.log(
          `[v2/client] %cstatus←worker%c subId=%s status=%s%s`,
          'color:#a855f7', '', subId, status, error ? ` error=${JSON.stringify(error)}` : '',
        );
        currentStatus = status;
        currentError = error;
        trySettleSnapshot();
        statusCb?.(status, error);
      },
    };

    this.subs.set(subId, { kind: 'data', listener: listener as DataListener });
    this.send({
      kind: 'attach',
      subId,
      providerId,
      cfg,
      mode: 'data',
      extra: opts.extra,
    });

    return {
      snapshot,
      onUpdate: (cb) => {
        updateCb = cb;
        flushBuffered();
      },
      onStatus: (cb) => {
        statusCb = cb;
      },
      unsubscribe: () => {
        if (!this.subs.delete(subId)) return;
        if (this.closed) return;
        this.send({ kind: 'detach', subId });
        // Reject the snapshot promise if it's still pending so awaiters
        // don't hang on unmount.
        if (!snapshotSettled) {
          snapshotSettled = true;
          snapshotReject(new Error('Subscription cancelled before snapshot arrived'));
        }
      },
    };
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
