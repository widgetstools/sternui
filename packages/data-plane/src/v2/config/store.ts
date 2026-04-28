/**
 * DataProviderConfigStore — thin wrapper over `ConfigManager` for
 * data-provider rows. Replaces v1's `dataProviderConfigService`
 * (which had its own REST mode + an "expectLocalBackend" gate that
 * caused a whole class of races). All persistence goes through
 * ConfigManager directly; mode-switching is its concern, not ours.
 *
 * Schema:
 *   - DataProvider:      `componentType: 'data-provider'`,
 *                        `componentSubType` = providerType.
 *   - AppDataProvider:   `componentType: 'appdata'`.
 *
 *   Visibility:
 *     - Public providers are stored with `userId: 'system'` so any
 *       user can pick them up.
 *     - Private providers store under the active userId.
 *
 * The store is intentionally framework-agnostic — React bindings
 * live in `@marketsui/data-plane-react`.
 */

import type { ConfigManager, AppConfigRow } from '@marketsui/config-service';
import type { DataProviderConfig, ProviderConfig } from '@marketsui/shared-types';

export const PUBLIC_USER_ID = 'system';
export const COMPONENT_TYPE_DATA_PROVIDER = 'data-provider';
export const COMPONENT_TYPE_APPDATA = 'appdata';

export interface AppDataConfig {
  configId: string;
  name: string;
  description?: string;
  isPublic: boolean;
  values: Record<string, unknown>;
  /** Owner user id — `'system'` for public rows. */
  userId: string;
}

export interface ListOptions {
  /**
   * Provider subtype filter. When set, only rows whose
   * `componentSubType` matches are returned (used to scope the
   * MarketsGrid live-provider picker to STOMP-only, etc.).
   */
  subtype?: ProviderConfig['providerType'];
}

// ─── DataProvider CRUD ─────────────────────────────────────────────

export class DataProviderConfigStore {
  constructor(private readonly cm: ConfigManager) {}

  async list(userId: string, opts: ListOptions = {}): Promise<DataProviderConfig[]> {
    const [own, pub] = await Promise.all([
      userId === PUBLIC_USER_ID
        ? Promise.resolve([] as AppConfigRow[])
        : this.cm.getConfigsByUser(userId),
      this.cm.getConfigsByUser(PUBLIC_USER_ID),
    ]);

    const seen = new Set<string>();
    const out: DataProviderConfig[] = [];
    for (const row of [...pub, ...own]) {
      if (row.componentType !== COMPONENT_TYPE_DATA_PROVIDER) continue;
      if (opts.subtype && row.componentSubType !== opts.subtype) continue;
      if (seen.has(row.configId)) continue;
      seen.add(row.configId);
      out.push(rowToProvider(row));
    }
    return out;
  }

  async get(configId: string): Promise<DataProviderConfig | null> {
    const row = await this.cm.getConfig(configId);
    if (!row) return null;
    if (row.componentType !== COMPONENT_TYPE_DATA_PROVIDER) return null;
    return rowToProvider(row);
  }

  async save(provider: DataProviderConfig, callerUserId: string): Promise<DataProviderConfig> {
    const ownerUserId = provider.public ? PUBLIC_USER_ID : callerUserId;
    const configId = provider.providerId ?? generateProviderId();
    const now = new Date().toISOString();
    const existing = await this.cm.getConfig(configId);

    const row: AppConfigRow = {
      configId,
      appId: existing?.appId ?? 'TestApp',
      userId: ownerUserId,
      componentType: COMPONENT_TYPE_DATA_PROVIDER,
      componentSubType: provider.providerType,
      isTemplate: false,
      displayText: provider.name,
      payload: providerToPayload(provider),
      createdBy: existing?.createdBy ?? callerUserId,
      updatedBy: callerUserId,
      creationTime: existing?.creationTime ?? now,
      updatedTime: now,
    };
    await this.cm.saveConfig(row);
    return { ...provider, providerId: configId, userId: ownerUserId, public: ownerUserId === PUBLIC_USER_ID };
  }

  async remove(configId: string): Promise<void> {
    await this.cm.deleteConfig(configId);
  }
}

// ─── AppData CRUD ─────────────────────────────────────────────────

export class AppDataConfigStore {
  constructor(private readonly cm: ConfigManager) {}

  async list(userId: string): Promise<AppDataConfig[]> {
    const [own, pub] = await Promise.all([
      userId === PUBLIC_USER_ID
        ? Promise.resolve([] as AppConfigRow[])
        : this.cm.getConfigsByUser(userId),
      this.cm.getConfigsByUser(PUBLIC_USER_ID),
    ]);
    const seen = new Set<string>();
    const out: AppDataConfig[] = [];
    for (const row of [...pub, ...own]) {
      if (row.componentType !== COMPONENT_TYPE_APPDATA) continue;
      if (seen.has(row.configId)) continue;
      seen.add(row.configId);
      out.push(rowToAppData(row));
    }
    return out;
  }

  async get(configId: string): Promise<AppDataConfig | null> {
    const row = await this.cm.getConfig(configId);
    if (!row) return null;
    if (row.componentType !== COMPONENT_TYPE_APPDATA) return null;
    return rowToAppData(row);
  }

  async save(appData: AppDataConfig, callerUserId: string): Promise<AppDataConfig> {
    const ownerUserId = appData.isPublic ? PUBLIC_USER_ID : callerUserId;
    const configId = appData.configId || generateAppDataId();
    const now = new Date().toISOString();
    const existing = await this.cm.getConfig(configId);

    const row: AppConfigRow = {
      configId,
      appId: existing?.appId ?? 'TestApp',
      userId: ownerUserId,
      componentType: COMPONENT_TYPE_APPDATA,
      componentSubType: 'appdata',
      isTemplate: false,
      displayText: appData.name,
      payload: { description: appData.description, values: appData.values },
      createdBy: existing?.createdBy ?? callerUserId,
      updatedBy: callerUserId,
      creationTime: existing?.creationTime ?? now,
      updatedTime: now,
    };
    await this.cm.saveConfig(row);
    return { ...appData, configId, userId: ownerUserId };
  }

  async remove(configId: string): Promise<void> {
    await this.cm.deleteConfig(configId);
  }
}

// ─── helpers ───────────────────────────────────────────────────────

function rowToProvider(row: AppConfigRow): DataProviderConfig {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const meta = (payload.__providerMeta ?? {}) as Record<string, unknown>;
  const { __providerMeta: _, ...config } = payload;
  return {
    providerId: row.configId,
    name: row.displayText,
    description: (meta.description as string | undefined) ?? undefined,
    providerType: row.componentSubType as DataProviderConfig['providerType'],
    config: config as unknown as ProviderConfig,
    tags: (meta.tags as string[] | undefined) ?? undefined,
    isDefault: Boolean(meta.isDefault),
    userId: row.userId,
    public: row.userId === PUBLIC_USER_ID,
  };
}

function providerToPayload(p: DataProviderConfig): Record<string, unknown> {
  return {
    ...(p.config as unknown as Record<string, unknown>),
    __providerMeta: {
      description: p.description,
      tags: p.tags ?? [],
      isDefault: Boolean(p.isDefault),
      public: Boolean(p.public),
    },
  };
}

function rowToAppData(row: AppConfigRow): AppDataConfig {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  return {
    configId: row.configId,
    name: row.displayText,
    description: payload.description as string | undefined,
    isPublic: row.userId === PUBLIC_USER_ID,
    values: (payload.values as Record<string, unknown>) ?? {},
    userId: row.userId,
  };
}

function generateProviderId(): string {
  return `dp-${crypto.randomUUID()}`;
}

function generateAppDataId(): string {
  return `ad-${crypto.randomUUID()}`;
}
