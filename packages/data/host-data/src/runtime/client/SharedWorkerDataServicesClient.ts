/**
 * SharedWorkerDataServicesClient — main-thread client. Owns the MessagePort to the
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
  AppDataAckEvent,
  AppDataDeltaEvent,
  AppDataRequest,
  AppDataSnapshotEvent,
  AttachRequest,
  CatalogEvent,
  ConfigInvalidateRequest,
  ConfigSnapshotEvent,
  DetachRequest,
  Event,
  GetConfigRequest,
  HubReadyRequest,
  ListConfigsRequest,
  ProviderStats,
  ProviderStatus,
  Request,
  StopRequest,
} from '../protocol.js';
import { isCatalogEvent, isEvent, isAppDataEvent } from '../protocol.js';
import type { DataProviderConfig, ProviderConfig } from '@starui/types';
import type { ListOptions } from '../config/store.js';
import { AppDataMirror } from '../mirror/AppDataMirror.js';
import { SnapshotReassembler } from '../../hub/SnapshotReassembler.js';

/**
 * Gate for hot-path diagnostic logs. Flip to `true` locally when debugging
 * the worker handshake — the per-delta `console.log` measurably hurts CPU
 * at high message rates even with DevTools closed.
 */
const DEBUG = false;

export type SubId = string;

export interface DataListener<T = unknown> {
  onDelta(rows: readonly T[], replace: boolean): void;
  onStatus(status: ProviderStatus, error?: string): void;
  /** Upstream snapshot buffer progress (wire `rows-received`). */
  onRowsReceived?(count: number): void;
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
 *
 * `onReset` fires when a `replace: true` delta arrives AFTER the
 * initial snapshot has settled — i.e. the provider re-snapshotted
 * (typically because a peer subscriber clicked "refresh", which
 * makes the worker call `provider.restart` and clears the Hub
 * cache). All connected subscribers receive this signal so every
 * grid wipes + repopulates with the fresh snapshot rather than
 * keeping stale rows on screen.
 */
export interface SubscribeHandle<T = unknown> {
  /** Subscription id used for detach and `refresh-provider` RPC. */
  subId: SubId;
  /** Resolves with the fully assembled snapshot (chunk0 + tail chunks). */
  snapshot: Promise<readonly T[]>;
  onUpdate(cb: (rows: readonly T[]) => void): void;
  onReset(cb: (rows: readonly T[]) => void): void;
  onStatus(cb: (status: ProviderStatus, error?: string) => void): void;
  /** In-flight snapshot row count while status is `loading`. */
  onRowsReceived(cb: (count: number) => void): void;
  /**
   * Fires on every loading→ready snapshot assembly, including the
   * initial one and hub-triggered restarts on an existing subId.
   */
  onSnapshotCommit(cb: (rows: readonly T[]) => void): void;
  /** Replay hub cache to this subscriber without upstream I/O. */
  refresh(): Promise<readonly T[]>;
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

export interface SharedWorkerDataServicesClientOpts {
  /** Inject for tests. Default: `() => crypto.randomUUID()`. */
  generateSubId?: () => string;
}

export class SharedWorkerDataServicesClient {
  private readonly port: MessagePort;
  private readonly subs = new Map<SubId, Sub>();
  private readonly generateSubId: () => string;
  private closed = false;

  // ─── AppData (Step 2) ───────────────────────────────────────────
  // The client owns a per-subId map of attached mirrors. Snapshot
  // and delta events are routed by `subId`; ack events route by
  // `reqId` to whichever mirror has that pending request — the
  // mirror tracks its own pending acks, so we just iterate.
  private readonly appDataMirrors = new Map<string, AppDataMirror>();
  private readonly catalogPending = new Map<
    string,
    { resolve: (event: ConfigSnapshotEvent) => void; reject: (err: Error) => void }
  >();
  private readonly catalogReadyWaiters: Array<() => void> = [];

  constructor(port: MessagePort, opts: SharedWorkerDataServicesClientOpts = {}) {
    this.port = port;
    this.generateSubId = opts.generateSubId ?? (() => crypto.randomUUID());
    this.port.addEventListener('message', this.handleMessage);
    this.port.start();
  }

  // ─── public surface ───────────────────────────────────────────

  /**
   * @deprecated For providers saved in the hub catalog, omit `cfg` and let the
   * worker resolve from {@link getProviderConfig}. Pass `cfg` only for inline
   * editor drafts not yet persisted. Prefer {@link subscribe} or
   * `ProviderClientAdapter` / `useDataProvider` in React apps.
   */
  attach<T = unknown>(
    providerId: string,
    cfg: ProviderConfig | undefined,
    listener: DataListener<T>,
    opts: AttachOpts = {},
  ): SubId {
    if (this.closed) throw new Error('[SharedWorkerDataServicesClient] client is closed');
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
  /**
   * @deprecated When the provider exists in the hub catalog, call
   * `subscribe(providerId)` without `cfg`. Passing `cfg` for catalogued
   * providers duplicates main-thread config and bypasses hub cache invalidation.
   * Keep `cfg` only for unsaved editor drafts. Prefer `ProviderClientAdapter` or
   * `useDataProvider` in React apps.
   */
  subscribe<T = unknown>(
    providerId: string,
    cfg: ProviderConfig | undefined,
    opts: AttachOpts = {},
  ): SubscribeHandle<T> {
    if (this.closed) throw new Error('[SharedWorkerDataServicesClient] client is closed');

    const subId = this.generateSubId();
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log(
        `[data-services/client] %csubscribe→worker%c subId=%s provider=%s cfgPassed=%s${opts.extra ? ' extra=' + JSON.stringify(opts.extra) : ''}`,
        'color:#3b82f6', '', subId, providerId, Boolean(cfg),
      );
    }

    let snapshotResolve!: (rows: readonly T[]) => void;
    let snapshotReject!: (err: Error) => void;
    const snapshot = new Promise<readonly T[]>((resolve, reject) => {
      snapshotResolve = resolve;
      snapshotReject = reject;
    });

    let snapshotSettled = false; // true after resolve OR reject
    let snapshotCommitCb: ((rows: readonly T[]) => void) | null = null;
    let updateCb: ((rows: readonly T[]) => void) | null = null;
    let resetCb: ((rows: readonly T[]) => void) | null = null;
    let statusCb: ((status: ProviderStatus, error?: string) => void) | null = null;
    let rowsReceivedCb: ((count: number) => void) | null = null;
    /** STOMP upstream buffer count before hub cache exists. */
    let upstreamRowCount = 0;
    const bufferedUpdates: ReadonlyArray<T>[] = [];
    /** Replace=true deltas that arrived after the snapshot settled but
     *  before the consumer registered `onReset`. Flushed in order on
     *  registration (last one wins for the visible state, but firing
     *  each lets observability hooks see the full sequence). */
    const bufferedResets: ReadonlyArray<T>[] = [];

    let refreshResolve!: (rows: readonly T[]) => void;
    let refreshReject!: (err: Error) => void;
    let refreshPending: Promise<readonly T[]> | null = null;

    const flushBuffered = () => {
      if (!updateCb) return;
      while (bufferedUpdates.length > 0) {
        const next = bufferedUpdates.shift()!;
        updateCb(next);
      }
    };

    const emitRowsReceived = (reassemblerCount: number) => {
      rowsReceivedCb?.(Math.max(upstreamRowCount, reassemblerCount));
    };

    const reassembler = new SnapshotReassembler<T>({
      onRowsReceived: (count) => emitRowsReceived(count),
      onSnapshotReady: (rows) => {
        if (!snapshotSettled) {
          snapshotSettled = true;
          snapshotResolve(rows);
        }
        snapshotCommitCb?.(rows);
      },
      onTick: (rows) => {
        if (updateCb) updateCb(rows);
        else bufferedUpdates.push(rows);
      },
      onReset: (rows) => {
        if (resetCb) resetCb(rows);
        else bufferedResets.push(rows);
      },
      onCacheRefresh: (rows) => {
        if (refreshPending) {
          refreshPending = null;
          refreshResolve(rows);
        }
      },
    });

    const listener: DataListener<T> = {
      onDelta: (rows, replace) => {
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.log(
            `[data-services/client] %cdelta←worker%c subId=%s rows=%d replace=%s settled=%s`,
            replace ? 'color:#10b981' : 'color:#f59e0b', '',
            subId, rows.length, replace, snapshotSettled,
          );
        }
        reassembler.onDelta(rows, replace);
      },
      onStatus: (status, error) => {
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.log(
            `[data-services/client] %cstatus←worker%c subId=%s status=%s%s`,
            'color:#a855f7', '', subId, status, error ? ` error=${JSON.stringify(error)}` : '',
          );
        }
        if (status === 'loading') upstreamRowCount = 0;
        if (status === 'error' && !snapshotSettled) {
          snapshotSettled = true;
          snapshotReject(new Error(error ?? 'Provider error'));
        }
        if (status === 'error' && refreshPending) {
          const err = new Error(error ?? 'Provider error');
          refreshPending = null;
          refreshReject(err);
        }
        reassembler.onStatus(status, error);
        statusCb?.(status, error);
      },
      onRowsReceived: (count) => {
        upstreamRowCount = count;
        emitRowsReceived(reassembler.getRowCount());
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
      subId,
      snapshot,
      onUpdate: (cb) => {
        updateCb = cb;
        flushBuffered();
      },
      onReset: (cb) => {
        resetCb = cb;
        while (bufferedResets.length > 0) {
          const rows = bufferedResets.shift()!;
          cb(rows);
        }
      },
      onStatus: (cb) => {
        statusCb = cb;
      },
      onRowsReceived: (cb) => {
        rowsReceivedCb = cb;
        cb(Math.max(upstreamRowCount, reassembler.getRowCount()));
      },
      onSnapshotCommit: (cb) => {
        snapshotCommitCb = cb;
      },
      refresh: () => {
        if (refreshPending) return refreshPending;
        if (!snapshotSettled) {
          return Promise.reject(
            new Error('Cannot refresh before the initial snapshot has settled'),
          );
        }
        refreshPending = new Promise<readonly T[]>((resolve, reject) => {
          refreshResolve = resolve;
          refreshReject = reject;
        });
        reassembler.beginCacheRefresh();
        this.send({ kind: 'refresh-provider', subId, providerId });
        return refreshPending;
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
        if (refreshPending) {
          refreshPending = null;
          refreshReject(new Error('Subscription cancelled during cache refresh'));
        }
      },
    };
  }

  attachStats(providerId: string, listener: StatsListener): SubId {
    if (this.closed) throw new Error('[SharedWorkerDataServicesClient] client is closed');
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

  /** Await worker catalog preload (`hub-ready` + optional `catalog-ready`). */
  async waitForCatalogReady(): Promise<void> {
    const snap = await this.rpcCatalog({ kind: 'hub-ready' });
    if (snap.ready) return;
    await new Promise<void>((resolve) => {
      this.catalogReadyWaiters.push(resolve);
    });
  }

  /** Read one provider row from the worker catalog (no main-thread Dexie). */
  async getProviderConfig(providerId: string): Promise<DataProviderConfig | null> {
    const snap = await this.rpcCatalog({ kind: 'get-config', providerId });
    return snap.config ?? null;
  }

  /** List provider rows from the worker catalog. */
  async listProviderConfigs(opts: ListOptions = {}): Promise<DataProviderConfig[]> {
    const snap = await this.rpcCatalog({
      kind: 'list-configs',
      subtype: opts.subtype,
      includeAppData: opts.includeAppData,
    });
    return [...(snap.configs ?? [])];
  }

  /** Reload one row or the full catalog in the worker after editor save/remove. */
  async invalidateConfig(providerId?: string): Promise<void> {
    await this.rpcCatalog({ kind: 'config-invalidate', providerId });
  }

  /**
   * Attach a fresh `AppDataMirror` to the hub. The mirror is a
   * pure RPC client — it sends operations to the hub and receives
   * snapshot/delta events back. The hub owns IndexedDB persistence;
   * the mirror never touches Dexie.
   *
   *   const mirror = client.attachAppData({ userId });
   *   await mirror.attach();
   *   await mirror.ready();
   *   mirror.get('positions', 'asOfDate'); // sync read
   *   await mirror.set('positions', 'asOfDate', '2026-05-08');
   *
   * The caller owns the mirror's lifetime — `client.detachAppData(mirror)`
   * or `client.close()` releases the worker-side listener.
   */
  attachAppData(opts: {
    userId: string;
    /** Override the auto-generated subId (used in tests for determinism). */
    subId?: string;
  }): AppDataMirror {
    const subId = opts.subId ?? this.generateSubId();
    const mirror = new AppDataMirror({
      subId,
      userId: opts.userId,
      send: (req: AppDataRequest) => this.sendAppData(req),
    });
    this.appDataMirrors.set(subId, mirror);
    return mirror;
  }

  /** Detach + remove a previously-attached AppData mirror. */
  detachAppData(mirror: AppDataMirror): void {
    for (const [subId, m] of this.appDataMirrors) {
      if (m === mirror) {
        this.appDataMirrors.delete(subId);
        if (!this.closed) this.sendAppData({ kind: 'appdata-detach', subId });
        return;
      }
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.subs.clear();
    this.appDataMirrors.clear();
    for (const [, pending] of this.catalogPending) {
      pending.reject(new Error('[SharedWorkerDataServicesClient] client closed'));
    }
    this.catalogPending.clear();
    for (const resolve of this.catalogReadyWaiters) resolve();
    this.catalogReadyWaiters.length = 0;
    this.port.removeEventListener('message', this.handleMessage);
    try { this.port.close(); } catch { /* MessagePort.close is fine to call twice */ }
  }

  // ─── internals ────────────────────────────────────────────────

  private send(req: Request): void {
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

  private sendAppData(req: AppDataRequest): void {
    if (this.closed) return;
    try {
      this.port.postMessage(req);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SharedWorkerDataServicesClient] AppData postMessage failed', err);
    }
  }

  private rpcCatalog(
    req: Omit<HubReadyRequest, 'reqId'>
      | Omit<GetConfigRequest, 'reqId'>
      | Omit<ListConfigsRequest, 'reqId'>
      | Omit<ConfigInvalidateRequest, 'reqId'>,
  ): Promise<ConfigSnapshotEvent> {
    if (this.closed) {
      return Promise.reject(new Error('[SharedWorkerDataServicesClient] client is closed'));
    }
    const reqId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.catalogPending.set(reqId, { resolve, reject });
      this.send({ ...req, reqId } as Request);
    });
  }

  private handleMessage = (ev: MessageEvent): void => {
    if (isCatalogEvent(ev.data)) {
      this.routeCatalogEvent(ev.data);
      return;
    }
    if (isAppDataEvent(ev.data)) {
      this.routeAppDataEvent(ev.data);
      return;
    }
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
      case 'rows-received':
        if (sub.kind === 'data') {
          sub.listener.onRowsReceived?.(event.count);
        }
        return;
    }
  };

  private routeCatalogEvent(event: CatalogEvent): void {
    if (event.kind === 'catalog-ready') {
      for (const resolve of this.catalogReadyWaiters) resolve();
      this.catalogReadyWaiters.length = 0;
      return;
    }
    const pending = this.catalogPending.get(event.reqId);
    if (!pending) return;
    this.catalogPending.delete(event.reqId);
    if (event.ok) pending.resolve(event);
    else pending.reject(new Error(event.error ?? 'Catalog request failed'));
  }

  private routeAppDataEvent(event: AppDataSnapshotEvent | AppDataDeltaEvent | AppDataAckEvent): void {
    if (event.kind === 'appdata-ack') {
      // Ack events don't carry a subId — every mirror is asked to
      // resolve its pending request matching reqId. Mirrors with no
      // such reqId are no-ops, so this is safe.
      for (const mirror of this.appDataMirrors.values()) mirror.handleEvent(event);
      return;
    }
    const mirror = this.appDataMirrors.get(event.subId);
    if (!mirror) return; // mirror detached before this event landed; drop.
    mirror.handleEvent(event);
  }
}

/**
 * Test helper: build a SharedWorkerDataServicesClient wired to an in-process Hub via a
 * MessageChannel. Saves every consumer from rebuilding this in their
 * own tests.
 *
 * Usage:
 *   const { client } = createInPageWiring(attachPort);
 *   client.attach(...)
 *   ... hub.handleRequest fires ... events stream back to the client
 */
export interface InPageWiring {
  client: SharedWorkerDataServicesClient;
  /** Disconnect both ends. */
  close(): void;
}

export function createInPageWiring(
  attachToHub: (clientPort: MessagePort) => void,
  opts?: SharedWorkerDataServicesClientOpts,
): InPageWiring {
  const channel = new MessageChannel();
  attachToHub(channel.port2);
  const client = new SharedWorkerDataServicesClient(channel.port1, opts);
  return {
    client,
    close: () => {
      client.close();
      try { channel.port2.close(); } catch { /* idempotent */ }
    },
  };
}
