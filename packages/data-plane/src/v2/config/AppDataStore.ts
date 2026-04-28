/**
 * AppDataStore — reactive in-memory snapshot of every AppData
 * provider visible to the current user.
 *
 * Lives on the main thread alongside ConfigManager. The container
 * subscribes to changes; whenever a templated reference changes
 * value, the container re-resolves the cfg and re-attaches (which
 * the Hub turns into a `provider.restart(extra)` for the running
 * provider).
 *
 * The store DOES NOT poll. Mutations made via `set()` go through
 * ConfigManager, then the local snapshot updates and listeners fire
 * synchronously. Cross-tab AppData edits (e.g. a second window
 * editing the same provider) aren't observed by this store today —
 * acceptable because AppData is small and the user re-authoring it
 * is a single-window concern.
 */

import {
  AppDataConfigStore,
  PUBLIC_USER_ID,
  type AppDataConfig,
} from './store.js';
import type { ConfigManager } from '@marketsui/config-service';

export class AppDataStore {
  private readonly cm: ConfigManager;
  private readonly store: AppDataConfigStore;
  private readonly userId: string;
  private snapshot = new Map<string, AppDataConfig>();
  private byName = new Map<string, AppDataConfig>();
  private readonly listeners = new Set<() => void>();
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  constructor(cm: ConfigManager, userId: string) {
    this.cm = cm;
    this.store = new AppDataConfigStore(cm);
    this.userId = userId;
  }

  /** Lazy-load the snapshot on first read. Idempotent. */
  ready(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      const rows = await this.store.list(this.userId);
      this.replaceSnapshot(rows);
      this.loaded = true;
    })();
    return this.loadPromise;
  }

  /** Synchronous lookup — returns undefined if `ready()` hasn't run. */
  get(providerName: string, key: string): unknown {
    const row = this.byName.get(providerName);
    if (!row) return undefined;
    return row.values[key];
  }

  /** Replace one key on a named AppData provider. Creates the row if
   *  it doesn't exist (with default `isPublic: false`). */
  async set(providerName: string, key: string, value: unknown): Promise<void> {
    await this.ready();
    let row = this.byName.get(providerName);
    if (!row) {
      row = {
        configId: '',
        name: providerName,
        isPublic: false,
        values: { [key]: value },
        userId: this.userId === PUBLIC_USER_ID ? PUBLIC_USER_ID : this.userId,
      };
    } else {
      row = { ...row, values: { ...row.values, [key]: value } };
    }
    const saved = await this.store.save(row, this.userId);
    this.upsert(saved);
    this.fire();
  }

  /**
   * Replace an entire AppData row. Used by the editor save path so
   * the in-memory snapshot stays consistent without a re-read.
   */
  async upsertConfig(config: AppDataConfig): Promise<AppDataConfig> {
    const saved = await this.store.save(config, this.userId);
    this.upsert(saved);
    this.fire();
    return saved;
  }

  async remove(configId: string): Promise<void> {
    await this.store.remove(configId);
    const row = this.snapshot.get(configId);
    this.snapshot.delete(configId);
    if (row) this.byName.delete(row.name);
    this.fire();
  }

  /**
   * Subscribe to changes. Listener fires once per mutation, after
   * the snapshot has updated. Returns an unsubscribe.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Force a fresh read from ConfigManager. Rarely needed in normal
   *  flow; useful after an external event (e.g. reload notification). */
  async refresh(): Promise<void> {
    const rows = await this.store.list(this.userId);
    this.replaceSnapshot(rows);
    this.fire();
  }

  /** Read-only view of every loaded AppData row. */
  list(): readonly AppDataConfig[] {
    return [...this.snapshot.values()];
  }

  // ─── internals ─────────────────────────────────────────────────

  private replaceSnapshot(rows: AppDataConfig[]): void {
    this.snapshot = new Map();
    this.byName = new Map();
    for (const row of rows) {
      this.snapshot.set(row.configId, row);
      this.byName.set(row.name, row);
    }
  }

  private upsert(row: AppDataConfig): void {
    const old = this.snapshot.get(row.configId);
    if (old && old.name !== row.name) this.byName.delete(old.name);
    this.snapshot.set(row.configId, row);
    this.byName.set(row.name, row);
  }

  private fire(): void {
    for (const l of [...this.listeners]) {
      try { l(); } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppDataStore] listener threw', err);
      }
    }
  }
}
