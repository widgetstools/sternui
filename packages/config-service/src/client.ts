// ─── ConfigClient ────────────────────────────────────────────────────
//
// A framework-agnostic (no React / no Angular) REST-shaped client for
// component configurations. The interface mirrors the backend REST
// contract exposed by `apps/config-service-server` exactly, so switching
// between local (Dexie) and remote (HTTP) is purely a URL-driven choice:
//
//   createConfigClient({ seedUrl: "/seed-config.json" })
//   createConfigClient({ baseUrl: "https://config-api.example.com/api/v1" })
//
// The unified schema is defined by `AppConfigRow` in ./types.ts. Both
// implementations round-trip that shape without translation.
//
// Out of scope here: appRegistry, userProfile, roles, permissions. Those
// are local-only today (not in the REST contract) — use `ConfigManager`
// directly for them.

import { ConfigManager, createConfigManager } from './config-manager';
import type { AppConfigRow, ConfigManagerOptions } from './types';

// ─── Shared query types ───────────────────────────────────────────────

/**
 * Filter criteria for `queryConfigs` / `queryConfigsPaginated`. Mirrors
 * the server's `ConfigurationFilter` (hierarchy fields removed).
 */
export interface ConfigFilter {
  userIds?: string[];
  appIds?: string[];
  componentTypes?: string[];
  componentSubTypes?: string[];
  isTemplate?: boolean;
  /** Reserved for future soft-delete support. Ignored by the local client. */
  includeDeleted?: boolean;
}

export interface PageOptions {
  page: number;
  limit: number;
  sortBy?: keyof AppConfigRow;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** Composite-key lookup params (same fields as the server's /lookup route). */
export interface CompositeKey {
  userId: string;
  componentType: string;
  /** The human-readable label — stored as `displayText` in the unified schema. */
  displayText: string;
  componentSubType?: string;
}

/** Minimal fields required to create a new config row. */
export type CreateConfigInput = Omit<AppConfigRow, 'creationTime' | 'updatedTime'>;

/**
 * Upsert input — the full row sans timestamps (they're stamped by the
 * implementation). The `configId` must be present so the row can be
 * identified for update semantics.
 */
export type UpsertConfigInput = Omit<AppConfigRow, 'creationTime' | 'updatedTime'>;

export interface BulkUpdateEntry {
  configId: string;
  patch: Partial<AppConfigRow>;
}

export interface BulkDeleteResult {
  configId: string;
  success: boolean;
}

export interface HealthStatus {
  isHealthy: boolean;
  [key: string]: unknown;
}

// ─── The client interface ─────────────────────────────────────────────

/**
 * Framework-agnostic configuration client. Same interface whether the
 * implementation is Dexie-backed or REST-backed.
 */
export interface ConfigClient {
  /** One-time initialization (seed loading, sync loop, etc.). Idempotent. */
  init(): Promise<void>;

  /** Release resources (stop intervals, close DB). */
  dispose(): void;

  // ── Single-resource CRUD ────────────────────────────────────────────

  createConfig(input: CreateConfigInput): Promise<AppConfigRow>;
  getConfig(configId: string): Promise<AppConfigRow | undefined>;
  updateConfig(configId: string, patch: Partial<AppConfigRow>): Promise<AppConfigRow>;
  /**
   * Upsert — create if missing, overwrite if present. The caller provides
   * the complete row (incl. `configId`). Timestamps are stamped on the
   * server/client side so the caller can omit them.
   */
  upsertConfig(row: UpsertConfigInput): Promise<AppConfigRow>;
  deleteConfig(configId: string): Promise<boolean>;

  // ── Specialized lookups ──────────────────────────────────────────────

  findByCompositeKey(key: CompositeKey): Promise<AppConfigRow | undefined>;

  // ── Clone ────────────────────────────────────────────────────────────

  cloneConfig(configId: string, newDisplayText: string, userId: string): Promise<AppConfigRow>;

  // ── Bulk ─────────────────────────────────────────────────────────────

  bulkCreate(inputs: CreateConfigInput[]): Promise<AppConfigRow[]>;
  bulkUpdate(updates: BulkUpdateEntry[]): Promise<AppConfigRow[]>;
  bulkDelete(configIds: string[]): Promise<BulkDeleteResult[]>;

  // ── Query ────────────────────────────────────────────────────────────

  queryConfigs(filter: ConfigFilter): Promise<AppConfigRow[]>;
  queryConfigsPaginated(
    filter: ConfigFilter,
    options: PageOptions,
  ): Promise<PaginatedResult<AppConfigRow>>;

  findByAppId(appId: string, includeDeleted?: boolean): Promise<AppConfigRow[]>;
  findByUserId(
    userId: string,
    options?: { includeDeleted?: boolean; componentType?: string; componentSubType?: string },
  ): Promise<AppConfigRow[]>;
  findByComponentType(
    componentType: string,
    componentSubType?: string,
    includeDeleted?: boolean,
  ): Promise<AppConfigRow[]>;

  // ── System ───────────────────────────────────────────────────────────

  getHealth(): Promise<HealthStatus>;
}

// ─── Factory ──────────────────────────────────────────────────────────

export interface CreateConfigClientOptions {
  /**
   * REST base URL of the remote config service (e.g. "/api/v1" or
   * "https://config.example.com/api/v1"). When provided, returns a
   * RestConfigClient. When omitted/empty, returns a LocalConfigClient
   * backed by Dexie.
   */
  baseUrl?: string;

  /** Seed data URL for first-run local init. Local mode only. */
  seedUrl?: string;

  /**
   * Escape hatch — pass an existing ConfigManager (e.g. the one used
   * for appRegistry/roles/permissions) to share the same Dexie database.
   * Local mode only.
   */
  configManager?: ConfigManager;

  /** Optional fetch implementation override (useful for tests). */
  fetchImpl?: typeof fetch;
}

/**
 * Create a ConfigClient. Chooses Local vs Rest based on whether baseUrl
 * is provided. Same interface either way — swap implementations at
 * runtime by swapping configuration.
 */
export function createConfigClient(options: CreateConfigClientOptions = {}): ConfigClient {
  if (options.baseUrl && options.baseUrl.trim().length > 0) {
    return new RestConfigClient(options.baseUrl, options.fetchImpl ?? fetch.bind(globalThis));
  }
  const manager =
    options.configManager ??
    createConfigManager({ seedConfigUrl: options.seedUrl });
  return new LocalConfigClient(manager);
}

// ─── LocalConfigClient (Dexie) ────────────────────────────────────────

export class LocalConfigClient implements ConfigClient {
  constructor(private readonly manager: ConfigManager) {}

  async init(): Promise<void> {
    await this.manager.init();
  }

  dispose(): void {
    this.manager.dispose();
  }

  async createConfig(input: CreateConfigInput): Promise<AppConfigRow> {
    const now = new Date().toISOString();
    const row: AppConfigRow = { ...input, creationTime: now, updatedTime: now };
    await this.manager.saveConfig(row);
    return row;
  }

  getConfig(configId: string): Promise<AppConfigRow | undefined> {
    return this.manager.getConfig(configId);
  }

  async updateConfig(configId: string, patch: Partial<AppConfigRow>): Promise<AppConfigRow> {
    const existing = await this.manager.getConfig(configId);
    if (!existing) throw new ConfigNotFoundError(configId);
    const next: AppConfigRow = { ...existing, ...patch, configId, updatedTime: new Date().toISOString() };
    await this.manager.saveConfig(next);
    return next;
  }

  async upsertConfig(row: UpsertConfigInput): Promise<AppConfigRow> {
    const existing = await this.manager.getConfig(row.configId);
    const now = new Date().toISOString();
    const full: AppConfigRow = {
      ...row,
      creationTime: existing?.creationTime ?? now,
      updatedTime: now,
    };
    await this.manager.saveConfig(full);
    return full;
  }

  async deleteConfig(configId: string): Promise<boolean> {
    const existing = await this.manager.getConfig(configId);
    if (!existing) return false;
    await this.manager.deleteConfig(configId);
    return true;
  }

  async findByCompositeKey(key: CompositeKey): Promise<AppConfigRow | undefined> {
    const rows = await this.manager.getConfigsByUser(key.userId);
    return rows.find(
      (r) =>
        r.componentType === key.componentType &&
        r.displayText === key.displayText &&
        (key.componentSubType === undefined || r.componentSubType === key.componentSubType),
    );
  }

  async cloneConfig(
    configId: string,
    newDisplayText: string,
    userId: string,
  ): Promise<AppConfigRow> {
    const src = await this.manager.getConfig(configId);
    if (!src) throw new ConfigNotFoundError(configId);
    const now = new Date().toISOString();
    const clone: AppConfigRow = {
      ...src,
      configId: generateId(),
      displayText: newDisplayText,
      userId,
      isTemplate: false,
      createdBy: userId,
      updatedBy: userId,
      creationTime: now,
      updatedTime: now,
    };
    await this.manager.saveConfig(clone);
    return clone;
  }

  async bulkCreate(inputs: CreateConfigInput[]): Promise<AppConfigRow[]> {
    return Promise.all(inputs.map((i) => this.createConfig(i)));
  }

  async bulkUpdate(updates: BulkUpdateEntry[]): Promise<AppConfigRow[]> {
    return Promise.all(updates.map((u) => this.updateConfig(u.configId, u.patch)));
  }

  async bulkDelete(configIds: string[]): Promise<BulkDeleteResult[]> {
    const results: BulkDeleteResult[] = [];
    for (const id of configIds) {
      const ok = await this.deleteConfig(id);
      results.push({ configId: id, success: ok });
    }
    return results;
  }

  async queryConfigs(filter: ConfigFilter): Promise<AppConfigRow[]> {
    const all = await this.manager.getAllConfigs();
    return all.filter((r) => matchesFilter(r, filter));
  }

  async queryConfigsPaginated(
    filter: ConfigFilter,
    options: PageOptions,
  ): Promise<PaginatedResult<AppConfigRow>> {
    let items = await this.queryConfigs(filter);
    if (options.sortBy) {
      const { sortBy, sortOrder = 'asc' } = options;
      items = [...items].sort((a, b) => {
        const av = a[sortBy] as unknown as string;
        const bv = b[sortBy] as unknown as string;
        if (av === bv) return 0;
        const cmp = av < bv ? -1 : 1;
        return sortOrder === 'asc' ? cmp : -cmp;
      });
    }
    const total = items.length;
    const start = (options.page - 1) * options.limit;
    return {
      items: items.slice(start, start + options.limit),
      total,
      page: options.page,
      limit: options.limit,
    };
  }

  async findByAppId(appId: string): Promise<AppConfigRow[]> {
    return this.manager.getConfigsByApp(appId);
  }

  async findByUserId(
    userId: string,
    options?: { includeDeleted?: boolean; componentType?: string; componentSubType?: string },
  ): Promise<AppConfigRow[]> {
    const rows = await this.manager.getConfigsByUser(userId);
    return rows.filter((r) => {
      if (options?.componentType && r.componentType !== options.componentType) return false;
      if (options?.componentSubType && r.componentSubType !== options.componentSubType) return false;
      return true;
    });
  }

  async findByComponentType(
    componentType: string,
    componentSubType?: string,
  ): Promise<AppConfigRow[]> {
    const rows = await this.manager.getAllConfigs();
    return rows.filter((r) => {
      if (r.componentType !== componentType) return false;
      if (componentSubType !== undefined && r.componentSubType !== componentSubType) return false;
      return true;
    });
  }

  async getHealth(): Promise<HealthStatus> {
    return { isHealthy: true, mode: 'local' };
  }
}

// ─── RestConfigClient ─────────────────────────────────────────────────

export class RestConfigClient implements ConfigClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async init(): Promise<void> {
    /* nothing to do — the server owns lifecycle */
  }

  dispose(): void {
    /* no-op */
  }

  // Single-resource CRUD --------------------------------------------------

  async createConfig(input: CreateConfigInput): Promise<AppConfigRow> {
    return this.request<AppConfigRow>('/configurations', { method: 'POST', body: input });
  }

  async getConfig(configId: string): Promise<AppConfigRow | undefined> {
    return this.request<AppConfigRow | undefined>(
      `/configurations/${encodeURIComponent(configId)}`,
      { method: 'GET', allow404: true },
    );
  }

  async updateConfig(configId: string, patch: Partial<AppConfigRow>): Promise<AppConfigRow> {
    return this.request<AppConfigRow>(`/configurations/${encodeURIComponent(configId)}`, {
      method: 'PUT',
      body: patch,
    });
  }

  /**
   * REST upsert. The server has update (PUT /:id → 404 if missing) and
   * create (POST /) — we try update first, fall back to create on 404.
   */
  async upsertConfig(row: UpsertConfigInput): Promise<AppConfigRow> {
    try {
      return await this.updateConfig(row.configId, row);
    } catch (err) {
      if (err instanceof ConfigClientHttpError && err.status === 404) {
        return this.createConfig(row);
      }
      throw err;
    }
  }

  async deleteConfig(configId: string): Promise<boolean> {
    const res = await this.request<{ success: boolean } | undefined>(
      `/configurations/${encodeURIComponent(configId)}`,
      { method: 'DELETE', allow404: true },
    );
    return Boolean(res?.success);
  }

  async findByCompositeKey(key: CompositeKey): Promise<AppConfigRow | undefined> {
    const qs = new URLSearchParams({
      userId: key.userId,
      componentType: key.componentType,
      name: key.displayText,
    });
    if (key.componentSubType) qs.set('componentSubType', key.componentSubType);
    return this.request<AppConfigRow | undefined>(`/configurations/lookup?${qs}`, {
      method: 'GET',
      allow404: true,
    });
  }

  async cloneConfig(
    configId: string,
    newDisplayText: string,
    userId: string,
  ): Promise<AppConfigRow> {
    return this.request<AppConfigRow>(
      `/configurations/${encodeURIComponent(configId)}/clone`,
      { method: 'POST', body: { newName: newDisplayText, userId } },
    );
  }

  // Bulk ------------------------------------------------------------------

  async bulkCreate(inputs: CreateConfigInput[]): Promise<AppConfigRow[]> {
    return this.request<AppConfigRow[]>('/configurations/bulk', {
      method: 'POST',
      body: { configs: inputs },
    });
  }

  async bulkUpdate(updates: BulkUpdateEntry[]): Promise<AppConfigRow[]> {
    return this.request<AppConfigRow[]>('/configurations/bulk', {
      method: 'PUT',
      body: { updates },
    });
  }

  async bulkDelete(configIds: string[]): Promise<BulkDeleteResult[]> {
    const res = await this.request<{ results: BulkDeleteResult[] }>('/configurations/bulk', {
      method: 'DELETE',
      body: { configIds },
    });
    return res.results;
  }

  // Query -----------------------------------------------------------------

  async queryConfigs(filter: ConfigFilter): Promise<AppConfigRow[]> {
    return this.request<AppConfigRow[]>(`/configurations?${filterToQuery(filter)}`, {
      method: 'GET',
    });
  }

  async queryConfigsPaginated(
    filter: ConfigFilter,
    options: PageOptions,
  ): Promise<PaginatedResult<AppConfigRow>> {
    const qs = filterToQuery(filter);
    const pageQs = new URLSearchParams({
      page: String(options.page),
      limit: String(options.limit),
    });
    if (options.sortBy) pageQs.set('sortBy', String(options.sortBy));
    if (options.sortOrder) pageQs.set('sortOrder', options.sortOrder);
    return this.request<PaginatedResult<AppConfigRow>>(
      `/configurations?${qs}&${pageQs}`,
      { method: 'GET' },
    );
  }

  async findByAppId(appId: string, includeDeleted?: boolean): Promise<AppConfigRow[]> {
    const qs = new URLSearchParams();
    if (includeDeleted) qs.set('includeDeleted', 'true');
    return this.request<AppConfigRow[]>(
      `/configurations/by-app/${encodeURIComponent(appId)}?${qs}`,
      { method: 'GET' },
    );
  }

  async findByUserId(
    userId: string,
    options?: { includeDeleted?: boolean; componentType?: string; componentSubType?: string },
  ): Promise<AppConfigRow[]> {
    const qs = new URLSearchParams();
    if (options?.includeDeleted) qs.set('includeDeleted', 'true');
    if (options?.componentType) qs.set('componentType', options.componentType);
    if (options?.componentSubType) qs.set('componentSubType', options.componentSubType);
    return this.request<AppConfigRow[]>(
      `/configurations/by-user/${encodeURIComponent(userId)}?${qs}`,
      { method: 'GET' },
    );
  }

  async findByComponentType(
    componentType: string,
    componentSubType?: string,
    includeDeleted?: boolean,
  ): Promise<AppConfigRow[]> {
    const qs = new URLSearchParams();
    if (componentSubType) qs.set('componentSubType', componentSubType);
    if (includeDeleted) qs.set('includeDeleted', 'true');
    return this.request<AppConfigRow[]>(
      `/configurations/by-component/${encodeURIComponent(componentType)}?${qs}`,
      { method: 'GET' },
    );
  }

  async getHealth(): Promise<HealthStatus> {
    return this.request<HealthStatus>('/configurations/system/health', { method: 'GET' });
  }

  // ── internals ─────────────────────────────────────────────────────────

  private async request<T>(
    path: string,
    init: { method: string; body?: unknown; allow404?: boolean },
  ): Promise<T> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}${path}`;
    const res = await this.fetchImpl(url, {
      method: init.method,
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (res.status === 404 && init.allow404) {
      return undefined as unknown as T;
    }
    if (!res.ok) {
      let detail: string | undefined;
      try {
        detail = JSON.stringify(await res.json());
      } catch {
        /* ignore */
      }
      throw new ConfigClientHttpError(res.status, `${init.method} ${path}`, detail);
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }
}

// ─── Errors ───────────────────────────────────────────────────────────

export class ConfigNotFoundError extends Error {
  constructor(public readonly configId: string) {
    super(`Configuration not found: ${configId}`);
    this.name = 'ConfigNotFoundError';
  }
}

export class ConfigClientHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
    public readonly detail?: string,
  ) {
    super(`HTTP ${status} for ${endpoint}${detail ? ` — ${detail}` : ''}`);
    this.name = 'ConfigClientHttpError';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function matchesFilter(row: AppConfigRow, filter: ConfigFilter): boolean {
  if (filter.userIds && !filter.userIds.includes(row.userId)) return false;
  if (filter.appIds && !filter.appIds.includes(row.appId)) return false;
  if (filter.componentTypes && !filter.componentTypes.includes(row.componentType)) return false;
  if (filter.componentSubTypes && !filter.componentSubTypes.includes(row.componentSubType)) {
    return false;
  }
  if (filter.isTemplate !== undefined && row.isTemplate !== filter.isTemplate) return false;
  return true;
}

function filterToQuery(filter: ConfigFilter): string {
  const qs = new URLSearchParams();
  if (filter.userIds?.length) qs.set('userId', filter.userIds[0]);
  if (filter.appIds?.length) qs.set('appId', filter.appIds[0]);
  if (filter.componentTypes?.length) qs.set('componentType', filter.componentTypes[0]);
  if (filter.componentSubTypes?.length) qs.set('componentSubType', filter.componentSubTypes[0]);
  if (filter.isTemplate !== undefined) qs.set('isTemplate', String(filter.isTemplate));
  if (filter.includeDeleted) qs.set('includeDeleted', 'true');
  return qs.toString();
}

function generateId(): string {
  // Prefer crypto.randomUUID; fall back to a simple timestamp+random combo
  // for very old runtimes.
  const g = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  if (g?.randomUUID) return g.randomUUID();
  return `cfg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
