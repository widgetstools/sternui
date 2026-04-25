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

  private toUnifiedConfig(provider: DataProviderConfig, userId: string): Partial<UnifiedConfig> {
    const componentSubType = PROVIDER_TYPE_TO_COMPONENT_SUBTYPE[provider.providerType];
    if (!componentSubType) {
      throw new Error(`Unknown provider type: ${provider.providerType}`);
    }

    // Extra per-provider fields (description, tags, isDefault) don't have
    // first-class columns in the unified schema, so we stash them inside
    // the opaque `payload`.
    const payload: Record<string, unknown> = {
      ...(provider.config as unknown as Record<string, unknown>),
      __providerMeta: {
        description: provider.description,
        tags: provider.tags ?? [],
        isDefault: Boolean(provider.isDefault),
      },
    };
    return {
      configId: provider.providerId,
      appId: 'stern-platform',
      userId,
      componentType: COMPONENT_TYPES.DATA_PROVIDER,
      componentSubType,
      isTemplate: false,
      displayText: provider.name,
      payload,
      createdBy: userId,
      updatedBy: userId,
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
    return {
      providerId: config.configId,
      name: config.displayText,
      description: (meta.description as string | undefined) ?? undefined,
      providerType,
      config: rest as unknown as ProviderConfig,
      tags: (meta.tags as string[] | undefined) ?? undefined,
      isDefault: Boolean(meta.isDefault),
      userId: config.userId,
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
}

export const dataProviderConfigService = new DataProviderConfigService();
