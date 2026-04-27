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

/**
 * Optional persistence hooks the worker shell can wire into a host
 * config store (e.g. `@marketsui/config-service`). When supplied,
 * keys flagged `durability: 'persisted'` are:
 *   - read at `configure()` time via `loadPersisted(providerId)` and
 *     overlaid on top of the config's seed values
 *   - written via `savePersisted(providerId, snapshot)` on every `put`
 *     to a persisted key. The shell may debounce / batch.
 *
 * Volatile keys never touch these hooks — they live for the worker's
 * lifetime only.
 */
export interface AppDataPersistenceHooks {
  loadPersisted: (providerId: string) => Promise<Record<string, unknown>>;
  savePersisted: (providerId: string, snapshot: Record<string, unknown>) => Promise<void>;
}

export class AppDataProvider extends ProviderBase<AppDataProviderConfig, unknown> {
  readonly type: ProviderType = 'appdata';

  private readonly state = new Map<string, unknown>();
  private readonly subs = new Map<string, Set<ProviderEmitter<unknown>>>();
  /** Set of keys that should be written through on `put`. */
  private readonly persistedKeys = new Set<string>();
  private readonly hooks: AppDataPersistenceHooks | undefined;

  constructor(id: string, hooks?: AppDataPersistenceHooks) {
    super(id);
    this.hooks = hooks;
  }

  async configure(config: AppDataProviderConfig): Promise<void> {
    // Capture for `restart()` (inherited from ProviderBase).
    this.lastConfig = config;

    // Seed initial variables from the config (volatile state).
    this.persistedKeys.clear();
    if (config.variables) {
      for (const [k, v] of Object.entries(config.variables)) {
        this.state.set(k, v.value);
        if (v.durability === 'persisted') this.persistedKeys.add(k);
      }
    }

    // Overlay persisted values from the host store. Persisted values
    // win over the config's seed — the seed represents "first-run
    // defaults", the store represents "what the user actually saved".
    if (this.hooks && this.persistedKeys.size > 0) {
      try {
        const stored = await this.hooks.loadPersisted(this.id);
        for (const k of this.persistedKeys) {
          if (Object.prototype.hasOwnProperty.call(stored, k)) {
            this.state.set(k, stored[k]);
          }
        }
      } catch (err) {
        // Failure to load shouldn't crash the provider — we fall back
        // to the seed values. Log so the host shell can surface it.
        // eslint-disable-next-line no-console
        console.warn(`[AppDataProvider:${this.id}] loadPersisted failed`, err);
      }
    }
  }

  /**
   * Read a key's value synchronously — used by the worker router's
   * `resolve` handler to substitute `{{providerId.key}}` tokens
   * without going through the async `fetch` path. Returns `undefined`
   * for unknown keys (mirrors `Map.get` semantics).
   */
  peek(key: string): unknown {
    return this.state.get(key);
  }

  /** Whether `key` has ever been written. Distinguishes "never set" from "set to undefined". */
  has(key: string): boolean {
    return this.state.has(key);
  }

  async fetch(key: string): Promise<unknown> {
    return this.state.get(key);
  }

  /**
   * Write a key's value and fan out to every subscriber. Public on
   * this provider (unlike the abstract base) because the router's
   * `put` opcode routes directly here.
   *
   * If `key` is flagged `durability: 'persisted'` and persistence
   * hooks are wired up, the full snapshot of persisted keys is
   * written through to the host store. We write the whole snapshot
   * (rather than per-key) so the host can store one row per provider
   * — see DATA_PLANE_INTEGRATION.md §7 decision 2. The hook itself is
   * fire-and-forget from this provider's perspective; failures are
   * logged but don't block the in-memory write or the subscriber
   * fanout.
   */
  async put(key: string, value: unknown): Promise<void> {
    this.state.set(key, value);

    if (this.hooks && this.persistedKeys.has(key)) {
      const snapshot: Record<string, unknown> = {};
      for (const k of this.persistedKeys) {
        if (this.state.has(k)) snapshot[k] = this.state.get(k);
      }
      void this.hooks.savePersisted(this.id, snapshot).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(`[AppDataProvider:${this.id}] savePersisted failed`, err);
      });
    }

    const subs = this.subs.get(key);
    if (!subs) return;
    // Snapshot the set before iterating so a callback that calls
    // `unsubscribe()` mid-flight doesn't mutate the iterator.
    for (const emit of [...subs]) emit(value);
  }

  /** Whether `key` is flagged for write-through persistence. */
  isPersisted(key: string): boolean {
    return this.persistedKeys.has(key);
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
