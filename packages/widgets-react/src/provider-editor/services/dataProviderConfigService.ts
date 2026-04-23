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

  /**
   * Convert DataProviderConfig to UnifiedConfig format for storage.
   */
  private toUnifiedConfig(provider: DataProviderConfig, userId: string): Partial<UnifiedConfig> {
    const componentSubType = PROVIDER_TYPE_TO_COMPONENT_SUBTYPE[provider.providerType];
    if (!componentSubType) {
      throw new Error(`Unknown provider type: ${provider.providerType}`);
    }

    return {
      configId: provider.providerId,
      appId: 'stern-platform',
      userId,
      componentType: COMPONENT_TYPES.DATA_PROVIDER,
      componentSubType,
      name: provider.name,
      description: provider.description,
      config: provider.config as unknown as Record<string, unknown>,
      settings: [],
      activeSetting: 'default',
      tags: provider.tags || [],
      isDefault: provider.isDefault || false,
      createdBy: userId,
      lastUpdatedBy: userId,
    };
  }

  /**
   * Convert UnifiedConfig back to DataProviderConfig format.
   */
  private fromUnifiedConfig(config: UnifiedConfig): DataProviderConfig {
    const providerType = COMPONENT_SUBTYPE_TO_PROVIDER_TYPE[config.componentSubType || ''];
    if (!providerType) {
      throw new Error(`Unknown component subtype: ${config.componentSubType}`);
    }

    return {
      providerId: config.configId,
      name: config.name,
      description: config.description,
      providerType,
      config: config.config as unknown as ProviderConfig,
      tags: config.tags,
      isDefault: config.isDefault,
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
    const body: Partial<UnifiedConfig> = {
      name: updates.name,
      description: updates.description,
      config: updates.config as unknown as Record<string, unknown>,
      tags: updates.tags,
      isDefault: updates.isDefault,
      lastUpdatedBy: userId,
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

    // Filter by componentType case-insensitively for backward compatibility
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
