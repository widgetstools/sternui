/**
 * AppDataProvider — in-memory reactive k/v store.
 *
 * The backbone for template bindings (`{{app1.token1}}` →
 * `client.subscribe('app1', 'token1', …)`). Any component can `put`
 * a key; any other component can `subscribe` and re-render on change.
 *
 * Characteristics
 * ---------------
 *   • Volatile — state lives for the worker's lifetime only. Survives
 *     cross-tab SharedWorker sharing, doesn't survive worker restart.
 *     Durable values belong in `@marketsui/config-service`.
 *   • Synchronous — `put` notifies subscribers inline. No queue.
 *   • No TTL / no eviction — a caller with a key reference keeps the
 *     value alive. Use `invalidate(key)` to explicitly drop.
 *   • Type-erased — values are `unknown`. Callers choose how to
 *     narrow (template-binding compilers, typed hook wrappers).
 */

import type { AppDataProviderConfig, ProviderType } from '@marketsui/shared-types';
import { ProviderBase, type ProviderEmitter, type Unsubscribe } from './ProviderBase';

export class AppDataProvider extends ProviderBase<AppDataProviderConfig, unknown> {
  readonly type: ProviderType = 'appdata';

  private readonly state = new Map<string, unknown>();
  private readonly subs = new Map<string, Set<ProviderEmitter<unknown>>>();

  async configure(config: AppDataProviderConfig): Promise<void> {
    // Seed initial variables from the config. Callers may update
    // them later via `put`.
    if (config.variables) {
      for (const [k, v] of Object.entries(config.variables)) {
        this.state.set(k, v.value);
      }
    }
  }

  async fetch(key: string): Promise<unknown> {
    return this.state.get(key);
  }

  /**
   * Write a key's value and fan out to every subscriber. Public on
   * this provider (unlike the abstract base) because the router's
   * `put` opcode routes directly here.
   */
  async put(key: string, value: unknown): Promise<void> {
    this.state.set(key, value);
    const subs = this.subs.get(key);
    if (!subs) return;
    // Snapshot the set before iterating so a callback that calls
    // `unsubscribe()` mid-flight doesn't mutate the iterator.
    for (const emit of [...subs]) emit(value);
  }

  /** Explicit drop — not part of ProviderBase but routed via `invalidate`. */
  drop(key: string): void {
    this.state.delete(key);
  }

  override subscribe(key: string, emit: ProviderEmitter<unknown>): Unsubscribe {
    let bucket = this.subs.get(key);
    if (!bucket) {
      bucket = new Set();
      this.subs.set(key, bucket);
    }
    bucket.add(emit);
    this.track(key);

    // Deliver current value synchronously if one exists, matching the
    // MockProvider contract (new subscribers don't wait for the next
    // write to get data).
    if (this.state.has(key)) emit(this.state.get(key));

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      const b = this.subs.get(key);
      if (b) {
        b.delete(emit);
        if (b.size === 0) this.subs.delete(key);
      }
      this.untrack(key);
    };
  }

  async teardown(): Promise<void> {
    this.state.clear();
    this.subs.clear();
  }

  // ─── Introspection (useful for tests + debug tools) ─────────────────

  keys(): string[] {
    return [...this.state.keys()];
  }

  subscriberCount(key: string): number {
    return this.subs.get(key)?.size ?? 0;
  }
}
