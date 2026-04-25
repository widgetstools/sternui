/**
 * ProviderBase — the shape every data-plane provider MUST implement.
 *
 * Semantics
 * ---------
 *   configure(config)   — set up the transport (open the socket,
 *                         validate auth, warm caches, etc.).
 *                         Idempotent: calling twice with identical
 *                         config should be a no-op.
 *   fetch(key)          — one-shot read. Returns the current value
 *                         for `key`. Pull-only providers (REST, Mock)
 *                         implement this as the primary data path.
 *                         Push providers (STOMP, WS) may implement
 *                         it as "return last-seen snapshot" or throw
 *                         `KEY_NOT_SUBSCRIBED`.
 *   subscribe(key,emit) — optional push channel. Providers that can
 *                         deliver real-time updates override this to
 *                         wire `emit(value)` into their transport. The
 *                         returned `Unsubscribe` MUST be idempotent —
 *                         safe to call more than once.
 *   teardown()          — release transport resources. Called once per
 *                         provider lifetime. After teardown the
 *                         provider must not emit any more values.
 *
 * The router in `worker/router.ts` is the only caller. It handles
 * cache bookkeeping, port broadcast, and in-flight dedup — providers
 * don't think about any of that.
 *
 * Concurrency
 * -----------
 * Providers run inside a SharedWorker (single-threaded JS). They
 * don't need locks, but they DO need to be reentrancy-aware for
 * `subscribe`: multiple consumers calling `subscribe(sameKey)` share
 * one underlying transport subscription (the provider maintains a
 * local refcount). Unsubscribing the last consumer tears down the
 * upstream subscription.
 *
 * The `ProviderBase` abstract class provides the refcount scaffolding
 * for subclasses that want it via `track()` / `untrack()` — pull-only
 * providers can ignore these and omit `subscribe` entirely.
 */

import type { ProviderType } from '@marketsui/shared-types';

export type Unsubscribe = () => void;

export type ProviderEmitter<T> = (value: T) => void;

export abstract class ProviderBase<TConfig = unknown, TValue = unknown> {
  /** Discriminator matching `shared-types` ProviderType literals. */
  abstract readonly type: ProviderType;

  /** Stable provider id assigned by the router on `configure`. */
  readonly id: string;

  constructor(id: string) {
    this.id = id;
  }

  abstract configure(config: TConfig): Promise<void>;

  abstract fetch(key: string): Promise<TValue>;

  /**
   * Optional push channel. Providers that only pull (REST polling,
   * Mock batch) omit this and the router falls back to TTL-driven
   * re-fetch.
   *
   * Contract:
   *   • `emit(value)` MAY be called synchronously inside `subscribe`
   *     (to deliver a cached snapshot to a new consumer).
   *   • After `Unsubscribe` is invoked, `emit` MUST NOT be called
   *     again for this subscription.
   *   • Multiple consumers subscribing to the same key share one
   *     upstream connection — implementations use `track/untrack`
   *     below to avoid opening duplicates.
   */
  subscribe?(key: string, emit: ProviderEmitter<TValue>): Unsubscribe;

  abstract teardown(): Promise<void>;

  // ─── Refcount helpers (optional, used by push-providers) ──────────

  private readonly refs = new Map<string, number>();

  /** Increment subscription refcount for `key`. Returns new count. */
  protected track(key: string): number {
    const n = (this.refs.get(key) ?? 0) + 1;
    this.refs.set(key, n);
    return n;
  }

  /** Decrement. Returns new count. Clamped at 0. */
  protected untrack(key: string): number {
    const n = Math.max(0, (this.refs.get(key) ?? 0) - 1);
    if (n === 0) this.refs.delete(key);
    else this.refs.set(key, n);
    return n;
  }

  protected refcount(key: string): number {
    return this.refs.get(key) ?? 0;
  }
}
