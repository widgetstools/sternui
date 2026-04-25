/**
 * broadcastManager.ts — port subscription registry + fan-out.
 *
 * Direct port of stern-1's `BroadcastManager`
 * (`/Users/develop/Documents/projects/stern-1/client/src/workers/engine/BroadcastManager.ts`)
 * generalized for the data-plane's broader message set. Keeps two maps:
 *
 *   providerId → (portId → MessagePort)
 *
 * and offers targeted + broadcast delivery with automatic dead-port
 * cleanup. A port that throws on `postMessage` is presumed closed and
 * purged from every provider it was registered against.
 *
 * What this doesn't do
 * --------------------
 * • No message buffering — if a subscriber can't keep up, messages
 *   drop (stern-1's rule: fast consumers must not be penalised by
 *   slow ones).
 * • No per-subscriber filtering — subscribers to `(providerId, *)`
 *   get every broadcast for that provider. Filtering by key / subId
 *   is the router's job.
 * • No ordering guarantees across providers — sequence is preserved
 *   per (providerId, port) but not globally.
 */

import type { DataPlaneResponse } from '../protocol';

export class BroadcastManager {
  private readonly subs = new Map<string, Map<string, MessagePort>>();

  /** Add a (providerId, portId) → port mapping. Safe to call repeatedly. */
  addSubscriber(providerId: string, portId: string, port: MessagePort): void {
    let perProvider = this.subs.get(providerId);
    if (!perProvider) {
      perProvider = new Map();
      this.subs.set(providerId, perProvider);
    }
    perProvider.set(portId, port);
  }

  /** Remove one subscriber. Drops the provider bucket when it empties. */
  removeSubscriber(providerId: string, portId: string): void {
    const perProvider = this.subs.get(providerId);
    if (!perProvider) return;
    perProvider.delete(portId);
    if (perProvider.size === 0) this.subs.delete(providerId);
  }

  /** Remove a port from every provider it was subscribed to. */
  removePortFromAll(portId: string): string[] {
    const affected: string[] = [];
    for (const [providerId, perProvider] of this.subs) {
      if (perProvider.has(portId)) {
        perProvider.delete(portId);
        affected.push(providerId);
        if (perProvider.size === 0) this.subs.delete(providerId);
      }
    }
    return affected;
  }

  /** How many ports are listening to a given provider. */
  getSubscriberCount(providerId: string): number {
    return this.subs.get(providerId)?.size ?? 0;
  }

  /** Port IDs currently listening to a given provider. */
  getSubscribers(providerId: string): string[] {
    const perProvider = this.subs.get(providerId);
    return perProvider ? Array.from(perProvider.keys()) : [];
  }

  getActiveProviders(): string[] {
    return Array.from(this.subs.keys());
  }

  /**
   * Fan a response out to every subscriber of `providerId`. Ports
   * whose `postMessage` throws (closed / transferred away) are
   * removed as a side effect and the list of removed port IDs is
   * returned so the router can run provider-level cleanup if the
   * count drops to zero.
   */
  broadcast(providerId: string, message: DataPlaneResponse): string[] {
    const perProvider = this.subs.get(providerId);
    if (!perProvider) return [];
    const dead: string[] = [];
    for (const [portId, port] of perProvider) {
      try {
        port.postMessage(message);
      } catch {
        dead.push(portId);
      }
    }
    for (const portId of dead) perProvider.delete(portId);
    if (perProvider.size === 0) this.subs.delete(providerId);
    return dead;
  }

  /**
   * Targeted delivery to one port. Used for late-joiner replay and
   * `reqId`-correlated responses that must not fan out.
   * Returns `true` on success, `false` if the port was unknown or
   * dead (in which case it's removed as a side effect).
   */
  sendToSubscriber(
    providerId: string,
    portId: string,
    message: DataPlaneResponse,
  ): boolean {
    const perProvider = this.subs.get(providerId);
    if (!perProvider) return false;
    const port = perProvider.get(portId);
    if (!port) return false;
    try {
      port.postMessage(message);
      return true;
    } catch {
      perProvider.delete(portId);
      if (perProvider.size === 0) this.subs.delete(providerId);
      return false;
    }
  }
}
