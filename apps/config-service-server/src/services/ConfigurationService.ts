import { v4 as uuidv4 } from 'uuid';
import { IConfigurationStorage } from '../storage/IConfigurationStorage.js';
import { StorageFactory } from '../storage/StorageFactory.js';
import type {
  UnifiedConfig,
  ConfigurationFilter,
  PaginatedResult,
  StorageHealthStatus,
  BulkUpdateRequest,
  BulkUpdateResult,
  CleanupResult,
} from '@marketsui/shared-types';
import { ValidationUtils } from '../utils/validation.js';
import logger from '../utils/logger.js';

/**
 * Business-logic layer between the REST routes and the storage engine.
 * Stamps timestamps + ids, validates input, logs outcomes.
 */
export class ConfigurationService {
  private storage: IConfigurationStorage;

  constructor(storage?: IConfigurationStorage) {
    this.storage = storage || StorageFactory.createStorage();
  }

  async initialize(): Promise<void> {
    await this.storage.connect();
    logger.info('ConfigurationService initialized');
  }

  async shutdown(): Promise<void> {
    await this.storage.disconnect();
    logger.info('ConfigurationService shut down');
  }

  async createConfiguration(input: Partial<UnifiedConfig>): Promise<UnifiedConfig> {
    const now = new Date().toISOString();
    const config: UnifiedConfig = {
      configId: input.configId || uuidv4(),
      appId: input.appId ?? '',
      userId: input.userId ?? '',
      componentType: input.componentType ?? '',
      componentSubType: input.componentSubType ?? '',
      isTemplate: Boolean(input.isTemplate),
      displayText: input.displayText ?? '',
      payload: input.payload ?? null,
      createdBy: input.createdBy ?? input.userId ?? 'system',
      updatedBy: input.updatedBy ?? input.userId ?? 'system',
      creationTime: now,
      updatedTime: now,
    };

    const error = ValidationUtils.validateConfig(config).error;
    if (error) throw new Error(`Validation failed: ${error}`);

    const result = await this.storage.create(config);
    logger.info('Configuration created', {
      configId: result.configId,
      componentType: result.componentType,
      userId: result.userId,
    });
    return result;
  }

  findConfigurationById(configId: string): Promise<UnifiedConfig | null> {
    return this.storage.findById(configId);
  }

  findConfigurationByCompositeKey(
    userId: string,
    componentType: string,
    displayText: string,
    componentSubType?: string,
  ): Promise<UnifiedConfig | null> {
    return this.storage.findByCompositeKey(userId, componentType, displayText, componentSubType);
  }

  async updateConfiguration(
    configId: string,
    updates: Partial<UnifiedConfig>,
  ): Promise<UnifiedConfig> {
    const result = await this.storage.update(configId, {
      ...updates,
      updatedTime: new Date().toISOString(),
    });
    logger.info('Configuration updated', {
      configId,
      componentType: result.componentType,
      updatedBy: result.updatedBy,
    });
    return result;
  }

  deleteConfiguration(configId: string): Promise<boolean> {
    return this.storage.delete(configId);
  }

  cloneConfiguration(
    sourceConfigId: string,
    newDisplayText: string,
    userId: string,
  ): Promise<UnifiedConfig> {
    return this.storage.clone(sourceConfigId, newDisplayText, userId);
  }

  async queryConfigurations(filter: ConfigurationFilter): Promise<UnifiedConfig[]> {
    const v = ValidationUtils.validateFilter(filter);
    if (v.error) throw new Error(`Filter validation failed: ${v.error}`);
    return this.storage.findByMultipleCriteria(v.value!);
  }

  async queryConfigurationsWithPagination(
    filter: ConfigurationFilter,
    page = 1,
    limit = 50,
    sortBy = 'updatedTime',
    sortOrder: 'asc' | 'desc' = 'desc',
  ): Promise<PaginatedResult<UnifiedConfig>> {
    const p = ValidationUtils.validatePagination({ page, limit, sortBy, sortOrder });
    if (p.error) throw new Error(`Pagination validation failed: ${p.error}`);
    const f = ValidationUtils.validateFilter(filter);
    if (f.error) throw new Error(`Filter validation failed: ${f.error}`);
    return this.storage.findWithPagination(f.value!, page, limit, sortBy, sortOrder);
  }

  findByAppId(appId: string, includeDeleted = false): Promise<UnifiedConfig[]> {
    return this.storage.findByAppId(appId, includeDeleted);
  }

  findByUserId(userId: string, includeDeleted = false): Promise<UnifiedConfig[]> {
    return this.storage.findByUserId(userId, includeDeleted);
  }

  findByComponentType(
    componentType: string,
    componentSubType?: string,
    includeDeleted = false,
  ): Promise<UnifiedConfig[]> {
    return this.storage.findByComponentType(componentType, componentSubType, includeDeleted);
  }

  async bulkCreateConfigurations(configs: Partial<UnifiedConfig>[]): Promise<UnifiedConfig[]> {
    if (!configs || configs.length === 0) throw new Error('Configurations array cannot be empty');
    if (configs.length > 50) throw new Error('Cannot create more than 50 configurations at once');
    const now = new Date().toISOString();
    const prepared: UnifiedConfig[] = configs.map((c) => ({
      configId: c.configId || uuidv4(),
      appId: c.appId ?? '',
      userId: c.userId ?? '',
      componentType: c.componentType ?? '',
      componentSubType: c.componentSubType ?? '',
      isTemplate: Boolean(c.isTemplate),
      displayText: c.displayText ?? '',
      payload: c.payload ?? null,
      createdBy: c.createdBy ?? c.userId ?? 'system',
      updatedBy: c.updatedBy ?? c.userId ?? 'system',
      creationTime: now,
      updatedTime: now,
    }));
    for (const c of prepared) {
      const err = ValidationUtils.validateConfig(c).error;
      if (err) throw new Error(`Validation failed for ${c.configId}: ${err}`);
    }
    const results = await this.storage.bulkCreate(prepared);
    logger.info('Bulk configuration creation completed', { count: results.length });
    return results;
  }

  async bulkUpdateConfigurations(updates: BulkUpdateRequest[]): Promise<BulkUpdateResult[]> {
    if (!updates || updates.length === 0) throw new Error('Updates array cannot be empty');
    if (updates.length > 50) throw new Error('Cannot update more than 50 configurations at once');
    return this.storage.bulkUpdate(updates);
  }

  async bulkDeleteConfigurations(configIds: string[]): Promise<BulkUpdateResult[]> {
    if (!configIds || configIds.length === 0) throw new Error('configIds array cannot be empty');
    if (configIds.length > 50) throw new Error('Cannot delete more than 50 configurations at once');
    return this.storage.bulkDelete(configIds);
  }

  cleanupDeletedConfigurations(dryRun = true): Promise<CleanupResult> {
    return this.storage.cleanup(dryRun);
  }

  async getHealthStatus(): Promise<StorageHealthStatus> {
    try {
      return await this.storage.healthCheck();
    } catch (error) {
      return {
        isHealthy: false,
        connectionStatus: 'error',
        lastChecked: new Date().toISOString(),
        responseTime: 0,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        storageType: 'sqlite',
      };
    }
  }
}
