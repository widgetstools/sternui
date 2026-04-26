/**
 * router.ts — wire-protocol dispatcher for the data-plane.
 *
 * Owns no transport — it accepts incoming `DataPlaneRequest` messages
 * paired with the MessagePort they arrived on and emits
 * `DataPlaneResponse` messages back to that port (direct reply) or
 * through the BroadcastManager (fan-out). This makes the router
 * runnable in three environments with no code change:
 *
 *   • A SharedWorker (production — see `entry.ts`)
 *   • A dedicated `Worker` (fallback for environments without
 *     SharedWorker, e.g. older Safari)
 *   • The main thread (in-page fallback when even `Worker` is
 *     unavailable — useful for tests and for OpenFin view contexts
 *     that block workers)
 *
 * Lifecycle
 * ---------
 *   • First reference to a providerId calls the `ProviderFactory`
 *     (injected) to construct + configure + start the provider. The
 *     result is cached in `providers`.
 *   • `subscribe` (keyed) / `subscribe-stream` (row-stream) register
 *     the caller's port with the BroadcastManager and wire an
 *     event listener into the provider so subsequent updates fan out.
 *   • `unsubscribe` removes the port from broadcast + calls the
 *     provider's cleanup hook. When the last subscriber leaves for
 *     a given provider, the provider is torn down.
 *   • `teardown` explicitly tears down the provider (and every port
 *     subscribed to it).
 *
 * What this file does NOT handle
 * ------------------------------
 *   • Port lifecycle / heartbeat — `entry.ts` is responsible for
 *     detecting dead ports (e.g. via missed heartbeats) and calling
 *     `removePortFromAll(portId)` here. The router doesn't poll.
 *   • SharedWorker connection handshake — same.
 *   • Message-channel cloning — clients and workers communicate by
 *     structured clone already; the router never has to serialize.
 */

import type { ProviderConfig } from '@marketsui/shared-types';
import {
  type DataPlaneError,
  type DataPlaneRequest,
  type DataPlaneResponse,
  type ErrorCode,
} from '../protocol';
import type { ProviderBase, Unsubscribe } from '../providers/ProviderBase';
import type { StreamProviderBase } from '../providers/StreamProviderBase';
import { BroadcastManager } from './broadcastManager';
import { ProviderCache, isExpired, singleFlight } from './cache';
import { defaultProviderFactory, type ProviderFactory, type ProviderInstance } from './providerFactory';

export interface RouterOpts {
  /** Inject a custom factory (e.g. to add STOMP). Defaults to the built-ins. */
  providerFactory?: ProviderFactory;
  /** Inject a broadcast manager so tests can observe fan-out. Defaults to a fresh one. */
  broadcast?: BroadcastManager;
}

interface KeyedSubscription {
  subId: string;
  portId: string;
  providerId: string;
  key: string;
  unsubscribe: Unsubscribe;
}

interface StreamSubscription {
  subId: string;
  portId: string;
  providerId: string;
  unsubscribe: Unsubscribe;
}

interface ProviderSlot {
  instance: ProviderInstance;
  /** Keyed-resource per-key cache (ProviderCache) for `get` dedup/TTL. */
  cache?: ProviderCache;
  /** Monotonic seq for row-stream updates (broadcast to subscribers). */
  streamSeq: number;
}

export class Router {
  private readonly factory: ProviderFactory;
  readonly broadcast: BroadcastManager;

  private readonly providers = new Map<string, ProviderSlot>();
  // In-flight provider construction — subsequent requests for the same id await the same promise.
  private readonly constructing = new Map<string, Promise<ProviderSlot>>();

  private readonly keyedSubs = new Map<string, KeyedSubscription>();
  private readonly streamSubs = new Map<string, StreamSubscription>();

  /** portId is generated once per port; clients don't have to know about it. */
  private readonly portIds = new WeakMap<MessagePort, string>();
  private portCounter = 0;

  constructor(opts: RouterOpts = {}) {
    this.factory = opts.providerFactory ?? defaultProviderFactory;
    this.broadcast = opts.broadcast ?? new BroadcastManager();
  }

  // ─── Public API ─────────────────────────────────────────────────────

  async handleRequest(port: MessagePort, req: DataPlaneRequest): Promise<void> {
    const portId = this.resolvePortId(port);
    try {
      switch (req.op) {
        case 'configure':   await this.handleConfigure(port, req); break;
        case 'get':         await this.handleGet(port, req); break;
        case 'put':         await this.handlePut(port, req); break;
        case 'subscribe':   await this.handleSubscribe(port, portId, req); break;
        case 'unsubscribe': this.handleUnsubscribe(req); break;
        case 'invalidate':  this.handleInvalidate(port, req); break;
        case 'teardown':    await this.handleTeardown(port, req); break;
        case 'ping':        this.reply(port, { op: 'pong', reqId: req.reqId }); break;
        case 'subscribe-stream': await this.handleSubscribeStream(port, portId, req); break;
        case 'get-cached-rows':  this.handleGetCachedRows(port, portId, req); break;
        case 'restart':     await this.handleRestart(port, req); break;
        case 'resolve':     this.handleResolve(port, req); break;
        default: {
          const _exhaustive: never = req;
          throw new Error(`Unknown opcode: ${(_exhaustive as { op: string }).op}`);
        }
      }
    } catch (err) {
      const reqId = (req as { reqId?: string }).reqId ?? '<no-reqId>';
      this.reply(port, {
        op: 'err',
        reqId,
        error: this.err('INTERNAL', err, false),
      });
    }
  }

  /**
   * Call when a port has been detected dead (e.g. by heartbeat
   * timeout). Cleans up every subscription registered against it and
   * tears down any provider whose subscriber count falls to zero.
   */
  async onPortClosed(port: MessagePort): Promise<void> {
    const portId = this.portIds.get(port);
    if (!portId) return;

    // Drop subscriptions held by this port.
    for (const [subId, sub] of [...this.keyedSubs]) {
      if (sub.portId === portId) {
        sub.unsubscribe();
        this.keyedSubs.delete(subId);
      }
    }
    for (const [subId, sub] of [...this.streamSubs]) {
      if (sub.portId === portId) {
        sub.unsubscribe();
        this.streamSubs.delete(subId);
        const slot = this.providers.get(sub.providerId);
        if (slot?.instance.shape === 'stream') {
          slot.instance.provider.unregisterSubscriber(portId);
        }
      }
    }

    // Drop port from every broadcast bucket and tear down empties.
    const affected = this.broadcast.removePortFromAll(portId);
    for (const providerId of affected) {
      if (this.broadcast.getSubscriberCount(providerId) === 0) {
        await this.maybeTeardownProvider(providerId);
      }
    }
  }

  /** Tear down every provider — used by the worker shell during shutdown. */
  async teardownAll(): Promise<void> {
    for (const providerId of [...this.providers.keys()]) {
      await this.teardownProvider(providerId);
    }
  }

  // ─── Handlers ───────────────────────────────────────────────────────

  private async handleConfigure(port: MessagePort, req: Extract<DataPlaneRequest, { op: 'configure' }>): Promise<void> {
    await this.getOrCreate(req.providerId, req.config);
    this.reply(port, { op: 'ok', reqId: req.reqId, cached: false, fetchedAt: 0 });
  }

  private async handleGet(port: MessagePort, req: Extract<DataPlaneRequest, { op: 'get' }>): Promise<void> {
    const slot = this.providers.get(req.providerId);
    if (!slot) {
      return this.replyErr(port, req.reqId, 'PROVIDER_NOT_CONFIGURED', 'call configure first', false);
    }
    if (slot.instance.shape !== 'keyed') {
      return this.replyErr(port, req.reqId, 'VALIDATION_FAILED', 'get is not valid on row-stream providers', false);
    }

    const provider = slot.instance.provider;
    const cache = slot.cache!;
    const entry = cache.touch(req.key) ?? cache.set(req.key, cache.newEntry());

    if (entry.data !== undefined && !isExpired(entry)) {
      return this.reply(port, {
        op: 'ok',
        reqId: req.reqId,
        value: entry.data,
        cached: true,
        fetchedAt: entry.fetchedAt,
      });
    }

    try {
      const value = await singleFlight(entry, () => provider.fetch(req.key) as Promise<unknown>);
      entry.data = value;
      entry.fetchedAt = Date.now();
      entry.seq += 1;
      this.reply(port, {
        op: 'ok',
        reqId: req.reqId,
        value,
        cached: false,
        fetchedAt: entry.fetchedAt,
      });
    } catch (err) {
      entry.lastError = { code: 'FETCH_FAILED', message: String(err), at: Date.now() };
      this.replyErr(port, req.reqId, 'FETCH_FAILED', err, true);
    }
  }

  private async handlePut(port: MessagePort, req: Extract<DataPlaneRequest, { op: 'put' }>): Promise<void> {
    const slot = this.providers.get(req.providerId);
    if (!slot || slot.instance.shape !== 'keyed') {
      return this.replyErr(port, req.reqId, 'PROVIDER_NOT_CONFIGURED', 'put requires a configured keyed provider', false);
    }
    // Only AppDataProvider (and anything that extends it) exposes `put`; detect via method presence.
    const provider = slot.instance.provider as ProviderBase & { put?: (k: string, v: unknown) => Promise<void> };
    if (typeof provider.put !== 'function') {
      return this.replyErr(port, req.reqId, 'VALIDATION_FAILED', 'provider does not support put', false);
    }
    await provider.put(req.key, req.value);
    // Update the local cache so subsequent `get`s see the new value without a round-trip.
    const cache = slot.cache!;
    const entry = cache.touch(req.key) ?? cache.set(req.key, cache.newEntry());
    entry.data = req.value;
    entry.fetchedAt = Date.now();
    entry.seq += 1;
    this.reply(port, { op: 'ok', reqId: req.reqId, cached: false, fetchedAt: entry.fetchedAt });
  }

  private async handleSubscribe(
    port: MessagePort,
    portId: string,
    req: Extract<DataPlaneRequest, { op: 'subscribe' }>,
  ): Promise<void> {
    const slot = this.providers.get(req.providerId);
    if (!slot) {
      return this.replyErr(port, req.reqId, 'PROVIDER_NOT_CONFIGURED', 'call configure first', false);
    }
    if (slot.instance.shape !== 'keyed') {
      return this.replyErr(port, req.reqId, 'VALIDATION_FAILED', 'subscribe is for keyed providers; use subscribe-stream', false);
    }
    const provider = slot.instance.provider;
    if (typeof provider.subscribe !== 'function') {
      return this.replyErr(port, req.reqId, 'VALIDATION_FAILED', 'provider does not support subscribe', false);
    }

    this.broadcast.addSubscriber(req.providerId, portId, port);

    const unsub = provider.subscribe(req.key, (value: unknown) => {
      const cache = slot.cache!;
      const entry = cache.touch(req.key) ?? cache.set(req.key, cache.newEntry());
      entry.data = value;
      entry.fetchedAt = Date.now();
      entry.seq += 1;
      this.broadcast.sendToSubscriber(req.providerId, portId, {
        op: 'update',
        subId: req.subId,
        providerId: req.providerId,
        key: req.key,
        value,
        seq: entry.seq,
      });
    });

    this.keyedSubs.set(req.subId, {
      subId: req.subId,
      portId,
      providerId: req.providerId,
      key: req.key,
      unsubscribe: unsub,
    });

    this.reply(port, { op: 'sub-established', reqId: req.reqId, subId: req.subId });
  }

  private handleUnsubscribe(req: Extract<DataPlaneRequest, { op: 'unsubscribe' }>): void {
    const keyed = this.keyedSubs.get(req.subId);
    if (keyed) {
      keyed.unsubscribe();
      this.keyedSubs.delete(req.subId);
      // If this was the last subscription for this port on this provider, pull from broadcast too.
      const still = [...this.keyedSubs.values()].some(
        (s) => s.portId === keyed.portId && s.providerId === keyed.providerId,
      );
      const stream = [...this.streamSubs.values()].some(
        (s) => s.portId === keyed.portId && s.providerId === keyed.providerId,
      );
      if (!still && !stream) this.broadcast.removeSubscriber(keyed.providerId, keyed.portId);
      void this.maybeTeardownProvider(keyed.providerId);
      return;
    }

    const stream = this.streamSubs.get(req.subId);
    if (stream) {
      stream.unsubscribe();
      this.streamSubs.delete(req.subId);
      const slot = this.providers.get(stream.providerId);
      if (slot?.instance.shape === 'stream') {
        slot.instance.provider.unregisterSubscriber(stream.portId);
      }
      const still = [...this.streamSubs.values()].some(
        (s) => s.portId === stream.portId && s.providerId === stream.providerId,
      );
      const keyedStill = [...this.keyedSubs.values()].some(
        (s) => s.portId === stream.portId && s.providerId === stream.providerId,
      );
      if (!still && !keyedStill) this.broadcast.removeSubscriber(stream.providerId, stream.portId);
      void this.maybeTeardownProvider(stream.providerId);
    }
  }

  private handleInvalidate(port: MessagePort, req: Extract<DataPlaneRequest, { op: 'invalidate' }>): void {
    const slot = this.providers.get(req.providerId);
    if (!slot) {
      return this.replyErr(port, req.reqId, 'PROVIDER_NOT_CONFIGURED', 'unknown provider', false);
    }
    if (slot.instance.shape === 'keyed') {
      if (req.key) slot.cache?.delete(req.key);
      else slot.cache?.clear();
    }
    // Row-stream invalidate is a no-op for now (callers re-subscribe instead).
    this.reply(port, { op: 'ok', reqId: req.reqId, cached: false, fetchedAt: 0 });
  }

  private async handleTeardown(port: MessagePort, req: Extract<DataPlaneRequest, { op: 'teardown' }>): Promise<void> {
    await this.teardownProvider(req.providerId);
    this.reply(port, { op: 'ok', reqId: req.reqId, cached: false, fetchedAt: 0 });
  }

  /**
   * Re-run the provider's snapshot/configure cycle. Existing subscribers
   * stay attached and receive the new snapshot via the standard listener
   * path; no re-subscribe is needed on the client side.
   *
   * For STOMP/Stream providers, `restart()` is implemented in
   * `StreamProviderBase` and re-broadcasts via `addListener` callbacks
   * already wired up in `handleSubscribeStream`. For keyed providers
   * (AppData, REST), `restart()` re-fetches; existing key subscribers
   * receive an `update` for any key whose value changes via the
   * `subscribe` emitter chain.
   */
  private async handleRestart(port: MessagePort, req: Extract<DataPlaneRequest, { op: 'restart' }>): Promise<void> {
    const slot = this.providers.get(req.providerId);
    if (!slot) {
      return this.replyErr(port, req.reqId, 'PROVIDER_NOT_CONFIGURED', 'call configure first', false);
    }
    await slot.instance.provider.restart(req.extra);
    this.reply(port, { op: 'ok', reqId: req.reqId, cached: false, fetchedAt: 0 });
  }

  /**
   * Substitute `{{providerId.key}}` tokens in a template string. Each
   * `providerId` must resolve to a configured AppData provider; the
   * key is read synchronously via `provider.peek(key)`. Tokens that
   * reference a non-AppData provider, an unknown provider id, or an
   * unknown key are left as-is in the output (with a console warning)
   * so downstream consumers can decide how to handle them.
   */
  private handleResolve(port: MessagePort, req: Extract<DataPlaneRequest, { op: 'resolve' }>): void {
    const out = req.template.replace(/\{\{([^{}]+)\}\}/g, (full, expr: string) => {
      const dot = expr.indexOf('.');
      if (dot < 0) return full;
      const providerId = expr.slice(0, dot).trim();
      const key = expr.slice(dot + 1).trim();
      const slot = this.providers.get(providerId);
      if (!slot || slot.instance.shape !== 'keyed') return full;
      const provider = slot.instance.provider as { type?: string; peek?: (k: string) => unknown };
      if (provider.type !== 'appdata' || typeof provider.peek !== 'function') return full;
      const value = provider.peek(key);
      if (value === undefined) return full;
      return typeof value === 'string' ? value : JSON.stringify(value);
    });
    this.reply(port, { op: 'ok', reqId: req.reqId, value: out, cached: false, fetchedAt: Date.now() });
  }

  private async handleSubscribeStream(
    port: MessagePort,
    portId: string,
    req: Extract<DataPlaneRequest, { op: 'subscribe-stream' }>,
  ): Promise<void> {
    const slot = this.providers.get(req.providerId);
    if (!slot) {
      return this.replyErr(port, req.reqId, 'PROVIDER_NOT_CONFIGURED', 'call configure first', false);
    }
    if (slot.instance.shape !== 'stream') {
      return this.replyErr(port, req.reqId, 'VALIDATION_FAILED', 'subscribe-stream is for row-stream providers only', false);
    }

    this.broadcast.addSubscriber(req.providerId, portId, port);
    slot.instance.provider.registerSubscriber(portId);

    const provider = slot.instance.provider as StreamProviderBase;
    const subId = req.subId;
    const providerId = req.providerId;
    let batch = 0;

    const off = provider.addListener({
      onSnapshotBatch: (rows) => {
        this.broadcast.sendToSubscriber(providerId, portId, {
          op: 'snapshot-batch',
          providerId,
          subId,
          rows,
          batch: batch++,
          isFinal: false,
        });
      },
      onSnapshotComplete: () => {
        this.broadcast.sendToSubscriber(providerId, portId, {
          op: 'snapshot-complete',
          providerId,
          subId,
          rowCount: provider.getCache().length,
        });
      },
      onRowUpdate: (rows) => {
        slot.streamSeq += 1;
        this.broadcast.sendToSubscriber(providerId, portId, {
          op: 'row-update',
          providerId,
          subId,
          rows,
          seq: slot.streamSeq,
        });
      },
      onError: (err) => {
        this.broadcast.sendToSubscriber(providerId, portId, {
          op: 'err',
          reqId: req.reqId,
          error: this.err('FETCH_FAILED', err, true),
        });
      },
    });

    this.streamSubs.set(subId, { subId, portId, providerId, unsubscribe: off });
    this.reply(port, { op: 'sub-established', reqId: req.reqId, subId });
  }

  private handleGetCachedRows(
    port: MessagePort,
    portId: string,
    req: Extract<DataPlaneRequest, { op: 'get-cached-rows' }>,
  ): void {
    const slot = this.providers.get(req.providerId);
    if (!slot) {
      return this.replyErr(port, req.reqId, 'PROVIDER_NOT_CONFIGURED', 'unknown provider', false);
    }
    if (slot.instance.shape !== 'stream') {
      return this.replyErr(port, req.reqId, 'VALIDATION_FAILED', 'get-cached-rows is only for row-stream providers', false);
    }

    const provider = slot.instance.provider;

    if (!provider.shouldReceiveCached(portId)) {
      // Subscriber already received live snapshot (or snapshot still in progress).
      // Send an empty batch + immediate complete so the client's bootstrap
      // sequence doesn't block. Matches stern-1's behavior exactly.
      this.reply(port, {
        op: 'snapshot-batch',
        reqId: req.reqId,
        providerId: req.providerId,
        rows: [],
        batch: 0,
        isFinal: true,
      });
      this.reply(port, {
        op: 'snapshot-complete',
        reqId: req.reqId,
        providerId: req.providerId,
        rowCount: provider.getCache().length,
      });
      return;
    }

    // Late joiner — deliver the cached snapshot in one batch.
    const rows = provider.getCache();
    const stats = provider.getStatistics();
    this.reply(port, {
      op: 'snapshot-batch',
      reqId: req.reqId,
      providerId: req.providerId,
      rows,
      batch: 0,
      isFinal: true,
      diagnostics: {
        keyColumn: (slot.instance.provider as unknown as { cache: { keyColumn: string } }).cache.keyColumn,
        cacheSize: rows.length,
        rowsReceived: stats.snapshotRowsReceived,
        skipped: 0,
      },
    });
    this.reply(port, {
      op: 'snapshot-complete',
      reqId: req.reqId,
      providerId: req.providerId,
      rowCount: rows.length,
    });
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private async getOrCreate(providerId: string, config: ProviderConfig): Promise<ProviderSlot> {
    const existing = this.providers.get(providerId);
    if (existing) return existing;
    const pending = this.constructing.get(providerId);
    if (pending) return pending;

    const build = this.factory(providerId, config).then(async (instance) => {
      const slot: ProviderSlot = {
        instance,
        cache: instance.shape === 'keyed' ? new ProviderCache() : undefined,
        streamSeq: 0,
      };
      if (instance.shape === 'stream') {
        await instance.provider.start();
      }
      this.providers.set(providerId, slot);
      return slot;
    }).finally(() => {
      this.constructing.delete(providerId);
    });

    this.constructing.set(providerId, build);
    return build;
  }

  private async maybeTeardownProvider(providerId: string): Promise<void> {
    const slot = this.providers.get(providerId);
    if (!slot) return;

    // Keyed-resource providers (AppData, REST-per-endpoint, etc.) hold
    // no expensive upstream connection — keep them around even with
    // zero subscribers so subsequent get/put from a different component
    // still works. AppData in particular is pure memory and MUST NOT
    // be torn down on idle (it'd lose state).
    //
    // Row-stream providers DO hold a transport (STOMP / WebSocket /
    // SocketIO) and should release it when nobody's watching.
    if (slot.instance.shape !== 'stream') return;

    if (this.broadcast.getSubscriberCount(providerId) !== 0) return;
    const anyKeyed = [...this.keyedSubs.values()].some((s) => s.providerId === providerId);
    const anyStream = [...this.streamSubs.values()].some((s) => s.providerId === providerId);
    if (anyKeyed || anyStream) return;
    await this.teardownProvider(providerId);
  }

  private async teardownProvider(providerId: string): Promise<void> {
    const slot = this.providers.get(providerId);
    if (!slot) return;
    this.providers.delete(providerId);

    // Drop every subscription referencing this provider.
    for (const [subId, sub] of [...this.keyedSubs]) {
      if (sub.providerId === providerId) {
        sub.unsubscribe();
        this.keyedSubs.delete(subId);
      }
    }
    for (const [subId, sub] of [...this.streamSubs]) {
      if (sub.providerId === providerId) {
        sub.unsubscribe();
        this.streamSubs.delete(subId);
      }
    }

    try {
      if (slot.instance.shape === 'stream') {
        await slot.instance.provider.stop();
      } else {
        await slot.instance.provider.teardown();
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[Router] teardown(${providerId}) threw`, err);
    }
  }

  private resolvePortId(port: MessagePort): string {
    const existing = this.portIds.get(port);
    if (existing) return existing;
    const id = `port-${Date.now().toString(36)}-${++this.portCounter}`;
    this.portIds.set(port, id);
    return id;
  }

  private reply(port: MessagePort, response: DataPlaneResponse): void {
    try {
      port.postMessage(response);
    } catch {
      // Port closed between request and reply. Treat as port-closed.
      void this.onPortClosed(port);
    }
  }

  private replyErr(port: MessagePort, reqId: string, code: ErrorCode, err: unknown, retryable: boolean): void {
    this.reply(port, { op: 'err', reqId, error: this.err(code, err, retryable) });
  }

  private err(code: ErrorCode, err: unknown, retryable: boolean): DataPlaneError {
    const message = err instanceof Error ? err.message : String(err);
    return { code, message, retryable };
  }
}
