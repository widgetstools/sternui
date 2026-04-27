/**
 * DataProvider Configuration Service
 *
 * Wrapper around fetch for managing DataProvider configurations.
 * Providers are stored as UnifiedConfig with componentType='data-provider'.
 */

import type { UnifiedConfig } from '@marketsui/shared-types';
import {
  COMPONENT_TYPES,
  PROVIDER_TYPE_TO_COMPONENT_SUBTYPE,
  COMPONENT_SUBTYPE_TO_PROVIDER_TYPE,
} from '@marketsui/shared-types';
import type { DataProviderConfig, ProviderConfig } from '@marketsui/shared-types';

const DEFAULT_API_URL = 'http://localhost:3001';

export class DataProviderConfigService {
  private apiBase = `${DEFAULT_API_URL}/api/v1/configurations`;

  /**
   * Configure the service with a custom API base URL.
   * Should be called once at app startup (e.g., from manifest customData).
   */
  configure(options: { apiUrl: string }): void {
    const base = options.apiUrl.replace(/\/+$/, '');
    this.apiBase = `${base}/api/v1/configurations`;
  }

  /** Sentinel userId for public (system-scope) rows. */
  static readonly PUBLIC_USER_ID = 'system';

  private resolveStorageUserId(provider: DataProviderConfig, callerUserId: string): string {
    return provider.public ? DataProviderConfigService.PUBLIC_USER_ID : callerUserId;
  }

  private toUnifiedConfig(provider: DataProviderConfig, callerUserId: string): Partial<UnifiedConfig> {
    const componentSubType = PROVIDER_TYPE_TO_COMPONENT_SUBTYPE[provider.providerType];
    if (!componentSubType) {
      throw new Error(`Unknown provider type: ${provider.providerType}`);
    }
    const storageUserId = this.resolveStorageUserId(provider, callerUserId);

    // Extra per-provider fields (description, tags, isDefault) don't have
    // first-class columns in the unified schema, so we stash them inside
    // the opaque `payload`. Visibility (`public`) IS expressed via the
    // userId column ('system' = public) — that's the load-bearing
    // signal; we mirror it inside __providerMeta so the round-trip
    // preserves it even when reading the row back through `getById`
    // without filtering through `userId === 'system'`.
    const payload: Record<string, unknown> = {
      ...(provider.config as unknown as Record<string, unknown>),
      __providerMeta: {
        description: provider.description,
        tags: provider.tags ?? [],
        isDefault: Boolean(provider.isDefault),
        public: Boolean(provider.public),
      },
    };
    return {
      configId: provider.providerId,
      appId: 'stern-platform',
      userId: storageUserId,
      componentType: COMPONENT_TYPES.DATA_PROVIDER,
      componentSubType,
      isTemplate: false,
      displayText: provider.name,
      payload,
      createdBy: callerUserId,
      updatedBy: callerUserId,
    };
  }

  private fromUnifiedConfig(config: UnifiedConfig): DataProviderConfig {
    const providerType = COMPONENT_SUBTYPE_TO_PROVIDER_TYPE[config.componentSubType || ''];
    if (!providerType) {
      throw new Error(`Unknown component subtype: ${config.componentSubType}`);
    }
    const payload = (config.payload ?? {}) as Record<string, unknown>;
    const { __providerMeta, ...rest } = payload;
    const meta = (__providerMeta ?? {}) as Record<string, unknown>;
    // Public iff the row is stored under the system sentinel. The meta
    // mirror in the payload is informational only — the userId column
    // is authoritative.
    const isPublic = config.userId === DataProviderConfigService.PUBLIC_USER_ID;
    return {
      providerId: config.configId,
      name: config.displayText,
      description: (meta.description as string | undefined) ?? undefined,
      providerType,
      config: rest as unknown as ProviderConfig,
      tags: (meta.tags as string[] | undefined) ?? undefined,
      isDefault: Boolean(meta.isDefault),
      userId: config.userId,
      public: isPublic,
    };
  }

  async create(provider: DataProviderConfig, userId: string): Promise<DataProviderConfig> {
    const unifiedConfig = this.toUnifiedConfig(provider, userId);
    const res = await fetch(this.apiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(unifiedConfig),
    });
    if (!res.ok) throw new Error(`Failed to create provider (${res.status})`);
    return this.fromUnifiedConfig(await res.json());
  }

  async update(providerId: string, updates: Partial<DataProviderConfig>, userId: string): Promise<DataProviderConfig> {
    const payload: Record<string, unknown> = {
      ...((updates.config as unknown as Record<string, unknown>) ?? {}),
      __providerMeta: {
        description: updates.description,
        tags: updates.tags ?? [],
        isDefault: Boolean(updates.isDefault),
      },
    };
    const body: Partial<UnifiedConfig> = {
      displayText: updates.name,
      payload,
      updatedBy: userId,
    };
    if (updates.providerType) {
      body.componentSubType = PROVIDER_TYPE_TO_COMPONENT_SUBTYPE[updates.providerType];
    }

    const res = await fetch(`${this.apiBase}/${providerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Failed to update provider (${res.status})`);
    return this.fromUnifiedConfig(await res.json());
  }

  async delete(providerId: string): Promise<void> {
    const res = await fetch(`${this.apiBase}/${providerId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to delete provider (${res.status})`);
  }

  async getById(providerId: string): Promise<DataProviderConfig | null> {
    const res = await fetch(`${this.apiBase}/${providerId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch provider (${res.status})`);
    return this.fromUnifiedConfig(await res.json());
  }

  async getByUser(userId: string): Promise<DataProviderConfig[]> {
    const params = new URLSearchParams({ includeDeleted: 'false' });
    const res = await fetch(`${this.apiBase}/by-user/${userId}?${params}`);
    if (!res.ok) throw new Error(`Failed to fetch providers (${res.status})`);

    const configs: UnifiedConfig[] = await res.json();

    // Filter componentType case-insensitively for backward compatibility.
    return configs
      .filter(c => {
        const type = c.componentType?.toLowerCase();
        return type === 'data-provider' || type === 'dataprovider' || type === 'datasource';
      })
      .map(c => this.fromUnifiedConfig(c));
  }

  async search(query: string, userId: string): Promise<DataProviderConfig[]> {
    const all = await this.getByUser(userId);
    const term = query.toLowerCase();
    return all.filter(
      p =>
        p.name.toLowerCase().includes(term) ||
        p.description?.toLowerCase().includes(term) ||
        p.tags?.some(t => t.toLowerCase().includes(term))
    );
  }

  /**
   * Return every DataProvider visible to the given user — both public
   * (stored under userId='system') and the user's own private rows.
   * Used by the MarketsGrid customizer dropdowns and any UI that
   * surfaces "providers I can pick from".
   *
   * Optionally filter by provider subtype (e.g. only STOMP providers
   * for the MarketsGrid Data section).
   */
  async listVisible(userId: string, opts?: { subtype?: ProviderConfig['providerType'] }): Promise<DataProviderConfig[]> {
    const [publicProviders, userProviders] = await Promise.all([
      this.getByUser(DataProviderConfigService.PUBLIC_USER_ID),
      userId === DataProviderConfigService.PUBLIC_USER_ID
        ? Promise.resolve<DataProviderConfig[]>([])
        : this.getByUser(userId),
    ]);

    // Dedupe by providerId: a private row with the same id as a public
    // one would shadow it, but in practice the IDs are uniformly unique.
    const seen = new Set<string>();
    const merged: DataProviderConfig[] = [];
    for (const p of [...publicProviders, ...userProviders]) {
      const id = p.providerId ?? `${p.name}::${p.providerType}`;
      if (seen.has(id)) continue;
      seen.add(id);
      if (opts?.subtype && p.providerType !== opts.subtype) continue;
      merged.push(p);
    }
    return merged;
  }
}

export const dataProviderConfigService = new DataProviderConfigService();
