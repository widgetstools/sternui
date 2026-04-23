import type {
  UnifiedConfig,
  ConfigurationFilter,
  PaginatedResult,
  ConfigResolutionResult,
  LayoutInfo
} from '@stern/shared-types';

/**
 * Hierarchy-aware REST client for the configuration service.
 * Used internally by useWidget() and useSettingsScreen().
 */
export class ConfigClient {
  constructor(private baseUrl: string) {}

  // =========================================================================
  // Config CRUD
  // =========================================================================

  async getById(configId: string): Promise<UnifiedConfig | null> {
    const res = await fetch(`${this.baseUrl}/configurations/${configId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch config ${configId} (${res.status})`);
    return res.json();
  }

  async create(data: Partial<UnifiedConfig>): Promise<UnifiedConfig> {
    const res = await fetch(`${this.baseUrl}/configurations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Failed to create config (${res.status})`);
    return res.json();
  }

  async update(configId: string, updates: Partial<UnifiedConfig>): Promise<UnifiedConfig> {
    const res = await fetch(`${this.baseUrl}/configurations/${configId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error(`Failed to update config ${configId} (${res.status})`);
    return res.json();
  }

  async delete(configId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/configurations/${configId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(`Failed to delete config ${configId} (${res.status})`);
  }

  async clone(configId: string, newName: string, userId: string): Promise<UnifiedConfig> {
    const res = await fetch(`${this.baseUrl}/configurations/${configId}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName, userId })
    });
    if (!res.ok) throw new Error(`Failed to clone config ${configId} (${res.status})`);
    return res.json();
  }

  async query(filter: ConfigurationFilter): Promise<UnifiedConfig[]> {
    const params = new URLSearchParams();
    if (filter.componentTypes?.length) params.set('componentType', filter.componentTypes[0]);
    if (filter.componentSubTypes?.length) params.set('componentSubType', filter.componentSubTypes[0]);
    if (filter.userIds?.length) params.set('userId', filter.userIds[0]);
    if (filter.appIds?.length) params.set('appId', filter.appIds[0]);
    if (filter.parentIds?.length) params.set('parentId', filter.parentIds[0]);
    if (filter.nodeIds?.length) params.set('nodeId', filter.nodeIds[0]);

    const url = params.toString()
      ? `${this.baseUrl}/configurations?${params}`
      : `${this.baseUrl}/configurations`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to query configs (${res.status})`);
    return res.json();
  }

  async findByCompositeKey(
    userId: string,
    componentType: string,
    name: string,
    componentSubType?: string
  ): Promise<UnifiedConfig | null> {
    const params = new URLSearchParams({ userId, componentType, name });
    if (componentSubType) params.set('componentSubType', componentSubType);

    const res = await fetch(`${this.baseUrl}/configurations/lookup?${params}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to lookup config (${res.status})`);
    return res.json();
  }

  async getByParent(parentId: string, componentType?: string): Promise<UnifiedConfig[]> {
    const params = new URLSearchParams();
    if (componentType) params.set('componentType', componentType);

    const url = params.toString()
      ? `${this.baseUrl}/configurations/by-parent/${parentId}?${params}`
      : `${this.baseUrl}/configurations/by-parent/${parentId}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to get configs by parent (${res.status})`);
    return res.json();
  }

  // =========================================================================
  // Hierarchy-Aware Operations
  // =========================================================================

  async resolveConfig(
    path: string,
    componentType: string,
    componentSubType?: string
  ): Promise<ConfigResolutionResult | null> {
    const params = new URLSearchParams({ path, componentType });
    if (componentSubType) params.set('componentSubType', componentSubType);

    const res = await fetch(`${this.baseUrl}/configurations/resolved?${params}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to resolve config (${res.status})`);
    return res.json();
  }

  async forkConfig(
    configId: string,
    targetNodeId: string,
    userId: string,
    newName?: string
  ): Promise<UnifiedConfig> {
    const res = await fetch(`${this.baseUrl}/configurations/${configId}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetNodeId, userId, newName })
    });
    if (!res.ok) throw new Error(`Failed to fork config ${configId} (${res.status})`);
    return res.json();
  }

  async promoteConfig(
    configId: string,
    targetNodePath: string,
    userId: string
  ): Promise<UnifiedConfig> {
    const res = await fetch(`${this.baseUrl}/configurations/${configId}/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetNodePath, userId })
    });
    if (!res.ok) throw new Error(`Failed to promote config ${configId} (${res.status})`);
    return res.json();
  }

  // =========================================================================
  // Layout Operations (stored as child configs)
  // =========================================================================

  async getLayouts(parentConfigId: string): Promise<LayoutInfo[]> {
    const configs = await this.getByParent(parentConfigId, 'simple-blotter-layout');
    return configs.map(c => ({
      id: c.configId,
      name: c.name,
      configId: parentConfigId,
      isDefault: c.isDefault || false,
      state: c.config,
      createdAt: c.creationTime instanceof Date ? c.creationTime.toISOString() : String(c.creationTime),
      updatedAt: c.lastUpdated instanceof Date ? c.lastUpdated.toISOString() : String(c.lastUpdated)
    }));
  }

  async saveLayout(
    parentConfigId: string,
    name: string,
    state: unknown,
    userId: string,
    appId: string
  ): Promise<LayoutInfo> {
    const config = await this.create({
      appId,
      userId,
      parentId: parentConfigId,
      componentType: 'simple-blotter-layout',
      name,
      config: state as Record<string, unknown>,
      settings: [],
      activeSetting: 'temp-uuid',
      createdBy: userId,
      lastUpdatedBy: userId
    });

    return {
      id: config.configId,
      name: config.name,
      configId: parentConfigId,
      isDefault: false,
      state: config.config,
      createdAt: config.creationTime instanceof Date ? config.creationTime.toISOString() : String(config.creationTime),
      updatedAt: config.lastUpdated instanceof Date ? config.lastUpdated.toISOString() : String(config.lastUpdated)
    };
  }

  async loadLayout(layoutId: string): Promise<unknown> {
    const config = await this.getById(layoutId);
    return config?.config ?? null;
  }

  async deleteLayout(layoutId: string): Promise<void> {
    await this.delete(layoutId);
  }
}
