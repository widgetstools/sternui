/**
 * Hub-internal AppData service boundary (ADR Phase 1).
 *
 * Wraps {@link WorkerAppDataStore} (memory) + optional {@link AppDataConfigStore}
 * (IndexedDB). Providers resolve `{{name.key}}` only via {@link lookup} —
 * they never touch the stores. Wire handlers and hydrate/resync also go
 * through this façade so Phase 2/3 can extract AppData to its own
 * SharedWorker without rewriting call sites.
 *
 * No new MessagePort kinds — main-thread {@link AppDataMirror} still
 * speaks the existing appdata-* RPC protocol.
 */

import type { ConfigManager } from '@starui/host-config';
import type { AppDataRow } from '../protocol.js';
import {
  AppDataConfigStore,
  type AppDataConfig,
} from '../providers/appdata/store.js';
import {
  WorkerAppDataStore,
  type AppDataListener,
} from './WorkerAppDataStore.js';

/** Sync template lookup — same contract STOMP/REST already use. */
export type AppDataLookup = (name: string, key: string) => unknown;

export interface AppDataServiceOpts {
  /** When omitted, persist paths are no-ops (memory-only — unit tests). */
  configManager?: ConfigManager;
}

export class AppDataService {
  private readonly memory = new WorkerAppDataStore();
  private readonly persist: AppDataConfigStore | null;

  constructor(opts: AppDataServiceOpts = {}) {
    this.persist = opts.configManager
      ? new AppDataConfigStore(opts.configManager)
      : null;
  }

  /** Bound lookup for `startProvider` / STOMP reconnect resolve. */
  readonly lookup: AppDataLookup = (name, key) => this.memory.get(name, key);

  isHydrated(): boolean {
    return this.memory.isHydrated();
  }

  snapshot(): readonly AppDataRow[] {
    return this.memory.snapshot();
  }

  get(name: string, key: string): unknown {
    return this.memory.get(name, key);
  }

  upsert(row: AppDataRow): void {
    this.memory.upsert(row);
  }

  remove(configId: string): AppDataRow | null {
    return this.memory.remove(configId);
  }

  /** First-seed hydrate (idempotent — first non-empty seed wins). */
  hydrateFromSeed(rows: readonly AppDataRow[]): void {
    this.memory.hydrate(rows);
  }

  subscribe(listener: AppDataListener): () => void {
    return this.memory.subscribe(listener);
  }

  listenerCount(): number {
    return this.memory.listenerCount();
  }

  /**
   * Boot: IndexedDB → memory. Idempotent. No-op without a persist store
   * or when already hydrated.
   */
  async hydrate(userId = 'worker'): Promise<void> {
    if (!this.persist) return;
    if (this.memory.isHydrated()) return;
    let configs: AppDataConfig[];
    try {
      configs = await this.persist.list(userId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[hub] AppData hydrate failed', err);
      return;
    }
    this.memory.hydrate(configs.map(toAppDataRow));
  }

  /**
   * Full reconcile from IndexedDB (editor invalidate / mirror re-attach
   * when the SharedWorker survives a reload).
   */
  async resync(userId = 'worker'): Promise<void> {
    if (!this.persist) return;
    let configs: AppDataConfig[];
    try {
      configs = await this.persist.list(userId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[hub] AppData resync failed', err);
      return;
    }
    const rows = configs.map(toAppDataRow);
    const nextIds = new Set(rows.map((row) => row.configId));
    for (const existing of this.memory.snapshot()) {
      if (!nextIds.has(existing.configId)) {
        this.memory.remove(existing.configId);
      }
    }
    for (const row of rows) {
      this.memory.upsert(row);
    }
  }

  /**
   * Persist then mutate memory. Returns the canonical row (with any
   * store-assigned ids/timestamps). Without a persist store, upserts
   * `row` as-is.
   */
  async persistUpsert(row: AppDataRow): Promise<AppDataRow> {
    const persisted = this.persist
      ? await this.persist.save(toAppDataConfig(row), row.userId)
      : null;
    const finalRow = persisted ? toAppDataRow(persisted) : row;
    this.memory.upsert(finalRow);
    return finalRow;
  }

  /** Persist delete then drop from memory. */
  async persistRemove(configId: string): Promise<void> {
    if (this.persist) await this.persist.remove(configId);
    this.memory.remove(configId);
  }

  /** True when IndexedDB-backed persistence is available. */
  get hasPersist(): boolean {
    return this.persist != null;
  }
}

function toAppDataConfig(r: AppDataRow): AppDataConfig {
  return {
    configId: r.configId,
    name: r.name,
    description: r.description,
    isPublic: r.isPublic,
    values: r.values,
    userId: r.userId,
  };
}

function toAppDataRow(c: AppDataConfig): AppDataRow {
  return {
    configId: c.configId,
    name: c.name,
    description: c.description,
    isPublic: c.isPublic,
    values: c.values,
    userId: c.userId,
  };
}
