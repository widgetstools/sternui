/**
 * AppDataMirror — main-thread synchronous-read view of the
 * authoritative AppData state held by the SharedWorkerDataServicesHub.
 *
 * Responsibilities:
 *   - Apply snapshot + delta events from the worker, keep two indexes
 *     in sync (`byConfigId`, `byName`).
 *   - Expose `get(name, key)` SYNCHRONOUSLY so template resolution
 *     (`{{positions.asOfDate}}`) doesn't have to await on the render
 *     path.
 *   - Provide async `set` / `upsertConfig` / `remove` that:
 *       1. persist via the configured `AppDataConfigStore`
 *          (ConfigManager-backed; same path as the legacy main-thread
 *          store), AND
 *       2. post the persisted row to the hub for fan-out.
 *     Consumers `await` the resulting promise; resolution means the
 *     row has been persisted AND the hub has acked the broadcast.
 *
 * This is the "fan-out bus" persistence shape — see
 * docs/plans/plan-2026-05-07/data-services-step2.md §Persistence.
 */

import type {
  AppDataAckEvent,
  AppDataDeltaEvent,
  AppDataRequest,
  AppDataRow,
  AppDataSnapshotEvent,
} from '../protocol.js';
import { AppDataConfigStore, type AppDataConfig } from '../providers/appdata/store.js';
import { PUBLIC_USER_ID } from '../config/store.js';
import type { ConfigManager } from '@starui/config-service';

export interface AppDataMirrorOpts {
  /** Identifier for this mirror's subscription on the hub. */
  subId: string;
  /** ConfigManager for persistence. */
  configManager: ConfigManager;
  /** Logged-in user id — used as `userId` on freshly-created rows. */
  userId: string;
  /**
   * Send an AppData request to the hub. The mirror does NOT depend
   * on the client class directly — anything that can serialise an
   * `AppDataRequest` works (used in tests with `createInPageWiring`).
   */
  send: (req: AppDataRequest) => void;
}

interface PendingAck {
  resolve: () => void;
  reject: (err: Error) => void;
}

let nextReqId = 0;
function makeReqId(): string {
  return `req-${++nextReqId}-${Date.now()}`;
}

export class AppDataMirror {
  private readonly subId: string;
  private readonly send: (req: AppDataRequest) => void;
  private readonly configManager: ConfigManager;
  private readonly userId: string;
  private readonly store: AppDataConfigStore;

  private readonly byConfigId = new Map<string, AppDataRow>();
  private readonly byName = new Map<string, AppDataRow>();
  private readonly listeners = new Set<() => void>();
  private readonly pending = new Map<string, PendingAck>();

  private snapshotApplied = false;
  private readonly readyPromise: Promise<void>;
  private readyResolve: (() => void) | null = null;

  constructor(opts: AppDataMirrorOpts) {
    this.subId = opts.subId;
    this.send = opts.send;
    this.configManager = opts.configManager;
    this.userId = opts.userId;
    this.store = new AppDataConfigStore(opts.configManager);
    this.readyPromise = new Promise<void>((resolve) => { this.readyResolve = resolve; });
  }

  // ─── Wire-up (called by the client) ─────────────────────────────

  /**
   * Send the initial attach with a seed read from ConfigManager.
   * Idempotent — calling twice does nothing on subsequent calls.
   * The client owns event routing; it calls this once per mirror.
   */
  async attach(): Promise<void> {
    let seed: readonly AppDataRow[] = [];
    try {
      const rows = await this.store.list(this.userId);
      seed = rows.map(toRow);
    } catch (err) {
      // Persistence read failed — attach with empty seed; the hub
      // will use whatever it already has (possibly empty), and the
      // mirror will start empty until another window seeds.
      // eslint-disable-next-line no-console
      console.warn('[AppDataMirror] seed read failed; attaching empty', err);
    }
    this.send({ kind: 'appdata-attach', subId: this.subId, seed });
  }

  /**
   * Route an AppData event from the hub. The client's message
   * dispatcher dispatches by `subId` for delta/snapshot events and
   * by `reqId` for ack events.
   */
  handleEvent(event: AppDataSnapshotEvent | AppDataDeltaEvent | AppDataAckEvent): void {
    switch (event.kind) {
      case 'appdata-snapshot':
        this.applySnapshot(event.rows);
        return;
      case 'appdata-delta':
        if (event.op === 'upsert') this.applyUpsert(event.row);
        else this.applyRemove(event.row.configId);
        this.fire();
        return;
      case 'appdata-ack': {
        const pending = this.pending.get(event.reqId);
        if (!pending) return;
        this.pending.delete(event.reqId);
        if (event.ok) pending.resolve();
        else pending.reject(new Error(event.error ?? 'AppData operation failed'));
        return;
      }
    }
  }

  // ─── Public surface (consumed by hooks and direct callers) ───────

  /** Sync read. Returns undefined for unknown name/key or pre-snapshot. */
  get(name: string, key: string): unknown {
    const row = this.byName.get(name);
    if (!row) return undefined;
    return row.values[key];
  }

  /** All rows in arbitrary order. */
  list(): readonly AppDataConfig[] {
    return [...this.byConfigId.values()].map(rowToConfig);
  }

  /** Whether the initial snapshot has been applied. */
  isReady(): boolean {
    return this.snapshotApplied;
  }

  /** Resolves once the initial snapshot has arrived. */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * Set a single key on a named provider. Creates the row if it
   * doesn't exist. Persists then broadcasts; resolution means the
   * row is durable AND every attached mirror (including this one)
   * has applied the delta.
   */
  async set(name: string, key: string, value: unknown): Promise<void> {
    const existing = this.byName.get(name);
    const config: AppDataConfig = existing
      ? rowToConfig({ ...existing, values: { ...existing.values, [key]: value } })
      : {
          configId: '',
          name,
          isPublic: false,
          values: { [key]: value },
          userId: this.userId === PUBLIC_USER_ID ? PUBLIC_USER_ID : this.userId,
        };
    await this.upsertConfig(config);
  }

  /** Replace an entire AppData row. */
  async upsertConfig(config: AppDataConfig): Promise<AppDataConfig> {
    const saved = await this.store.save(config, this.userId);
    const row = toRow(saved);
    await this.broadcastUpsert(row);
    return saved;
  }

  /** Delete an AppData row by configId. */
  async remove(configId: string): Promise<void> {
    await this.store.remove(configId);
    const reqId = makeReqId();
    const ack = this.awaitAck(reqId);
    this.send({ kind: 'appdata-remove', reqId, configId });
    await ack;
  }

  /** Subscribe to ANY change. Listener fires after the local mirror
   *  is updated. Returns unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ─── Internals ─────────────────────────────────────────────────

  private async broadcastUpsert(row: AppDataRow): Promise<void> {
    const reqId = makeReqId();
    const ack = this.awaitAck(reqId);
    this.send({ kind: 'appdata-set', reqId, row });
    await ack;
  }

  private awaitAck(reqId: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject });
    });
  }

  private applySnapshot(rows: readonly AppDataRow[]): void {
    this.byConfigId.clear();
    this.byName.clear();
    for (const row of rows) {
      this.byConfigId.set(row.configId, row);
      this.byName.set(row.name, row);
    }
    this.snapshotApplied = true;
    this.readyResolve?.();
    this.fire();
  }

  private applyUpsert(row: AppDataRow): void {
    const previous = this.byConfigId.get(row.configId);
    if (previous && previous.name !== row.name) {
      if (this.byName.get(previous.name) === previous) {
        this.byName.delete(previous.name);
      }
    }
    this.byConfigId.set(row.configId, row);
    this.byName.set(row.name, row);
  }

  private applyRemove(configId: string): void {
    const row = this.byConfigId.get(configId);
    if (!row) return;
    this.byConfigId.delete(configId);
    if (this.byName.get(row.name) === row) this.byName.delete(row.name);
  }

  private fire(): void {
    for (const l of [...this.listeners]) {
      try { l(); } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppDataMirror] listener threw', err);
      }
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

function toRow(c: AppDataConfig): AppDataRow {
  return {
    configId: c.configId,
    name: c.name,
    description: c.description,
    isPublic: c.isPublic,
    values: c.values,
    userId: c.userId,
  };
}

function rowToConfig(r: AppDataRow): AppDataConfig {
  return {
    configId: r.configId,
    name: r.name,
    description: r.description,
    isPublic: r.isPublic,
    values: r.values,
    userId: r.userId,
  };
}
