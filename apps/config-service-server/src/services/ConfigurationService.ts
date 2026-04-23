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
  CleanupResult
} from '@marketsui/shared-types';
import { ValidationUtils } from '../utils/validation.js';
import logger from '../utils/logger.js';

/**
 * Configuration service — business logic layer between REST API and storage.
 */
export class ConfigurationService {
  private storage: IConfigurationStorage;

  constructor(storage?: IConfigurationStorage) {
    this.storage = storage || StorageFactory.createStorage();
  }

  async initialize(): Promise<void> {
    try {
      await this.storage.connect();
      logger.info('ConfigurationService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ConfigurationService', { error });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.storage.disconnect();
      logger.info('ConfigurationService shut down successfully');
    } catch (error) {
      logger.error('Error during ConfigurationService shutdown', { error });
    }
  }

  async createConfiguration(configData: Partial<UnifiedConfig>): Promise<UnifiedConfig> {
    const config: UnifiedConfig = {
      ...configData as UnifiedConfig,
      configId: configData.configId || uuidv4(),
      creationTime: new Date(),
      lastUpdated: new Date()
    };

    if (!config.activeSetting || config.activeSetting === '' || config.activeSetting === null) {
      config.activeSetting = 'temp-uuid';
    }

    try {
      const result = await this.storage.create(config);
      logger.info('Configuration created successfully', {
        configId: result.configId,
        componentType: result.componentType,
        userId: result.userId
      });
      return result;
    } catch (error) {
      logger.error('Failed to create configuration', {
        configId: config.configId,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  async findConfigurationById(configId: string): Promise<UnifiedConfig | null> {
    try {
      const result = await this.storage.findById(configId);
      if (result) {
        logger.debug('Configuration found', { configId, componentType: result.componentType });
      } else {
        logger.debug('Configuration not found', { configId });
      }
      return result;
    } catch (error) {
      logger.error('Error finding configuration by ID', { configId, error });
      throw error;
    }
  }

  async findConfigurationByCompositeKey(
    userId: string,
    componentType: string,
    name: string,
    componentSubType?: string
  ): Promise<UnifiedConfig | null> {
    try {
      const result = await this.storage.findByCompositeKey(userId, componentType, name, componentSubType);
      if (result) {
        logger.debug('Configuration found by composite key', {
          userId, componentType, componentSubType, name, configId: result.configId
        });
      }
      return result;
    } catch (error) {
      logger.error('Error finding configuration by composite key', {
        userId, componentType, componentSubType, name, error
      });
      throw error;
    }
  }

  async updateConfiguration(configId: string, updates: Partial<UnifiedConfig>): Promise<UnifiedConfig> {
    try {
      const updateData = {
        ...updates,
        lastUpdated: new Date()
      };

      const result = await this.storage.update(configId, updateData);
      logger.info('Configuration updated successfully', {
        configId,
        componentType: result.componentType,
        updatedBy: result.lastUpdatedBy
      });
      return result;
    } catch (error) {
      logger.error('Failed to update configuration', { configId, error });
      throw error;
    }
  }

  async deleteConfiguration(configId: string): Promise<boolean> {
    try {
      const result = await this.storage.delete(configId);
      if (result) {
        logger.info('Configuration deleted successfully', { configId });
      } else {
        logger.warn('Configuration not found for deletion', { configId });
      }
      return result;
    } catch (error) {
      logger.error('Failed to delete configuration', { configId, error });
      throw error;
    }
  }

  async cloneConfiguration(sourceConfigId: string, newName: string, userId: string): Promise<UnifiedConfig> {
    try {
      const result = await this.storage.clone(sourceConfigId, newName, userId);
      logger.info('Configuration cloned successfully', {
        sourceConfigId, newConfigId: result.configId, newName, userId
      });
      return result;
    } catch (error) {
      logger.error('Failed to clone configuration', { sourceConfigId, newName, userId, error });
      throw error;
    }
  }

  async queryConfigurations(filter: ConfigurationFilter): Promise<UnifiedConfig[]> {
    const validation = ValidationUtils.validateFilter(filter);
    if (validation.error) {
      throw new Error(`Filter validation failed: ${validation.error}`);
    }

    try {
      const results = await this.storage.findByMultipleCriteria(validation.value!);
      logger.debug('Configuration query executed', {
        filterKeys: Object.keys(filter),
        resultCount: results.length
      });
      return results;
    } catch (error) {
      logger.error('Failed to query configurations', { filter, error });
      throw error;
    }
  }

  async queryConfigurationsWithPagination(
    filter: ConfigurationFilter,
    page: number = 1,
    limit: number = 50,
    sortBy: string = 'lastUpdated',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<PaginatedResult<UnifiedConfig>> {
    const paginationValidation = ValidationUtils.validatePagination({ page, limit, sortBy, sortOrder });
    if (paginationValidation.error) {
      throw new Error(`Pagination validation failed: ${paginationValidation.error}`);
    }

    const filterValidation = ValidationUtils.validateFilter(filter);
    if (filterValidation.error) {
      throw new Error(`Filter validation failed: ${filterValidation.error}`);
    }

    try {
      const result = await this.storage.findWithPagination(
        filterValidation.value!, page, limit, sortBy, sortOrder
      );
      logger.debug('Paginated configuration query executed', {
        page, limit, total: result.total, resultCount: result.data.length
      });
      return result;
    } catch (error) {
      logger.error('Failed to execute paginated query', { filter, page, limit, error });
      throw error;
    }
  }

  async findByAppId(appId: string, includeDeleted = false): Promise<UnifiedConfig[]> {
    try {
      const results = await this.storage.findByAppId(appId, includeDeleted);
      logger.debug('Configurations found by app ID', { appId, count: results.length });
      return results;
    } catch (error) {
      logger.error('Failed to find configurations by app ID', { appId, error });
      throw error;
    }
  }

  async findByUserId(userId: string, includeDeleted = false): Promise<UnifiedConfig[]> {
    try {
      const results = await this.storage.findByUserId(userId, includeDeleted);
      logger.debug('Configurations found by user ID', { userId, count: results.length });
      return results;
    } catch (error) {
      logger.error('Failed to find configurations by user ID', { userId, error });
      throw error;
    }
  }

  async findByComponentType(
    componentType: string,
    componentSubType?: string,
    includeDeleted = false
  ): Promise<UnifiedConfig[]> {
    try {
      const results = await this.storage.findByComponentType(componentType, componentSubType, includeDeleted);
      logger.debug('Configurations found by component type', {
        componentType, componentSubType, count: results.length
      });
      return results;
    } catch (error) {
      logger.error('Failed to find configurations by component type', {
        componentType, componentSubType, error
      });
      throw error;
    }
  }

  async bulkCreateConfigurations(configs: Partial<UnifiedConfig>[]): Promise<UnifiedConfig[]> {
    if (configs.length === 0) throw new Error('Configurations array cannot be empty');
    if (configs.length > 50) throw new Error('Cannot create more than 50 configurations at once');

    const preparedConfigs: UnifiedConfig[] = configs.map(configData => ({
      ...configData as UnifiedConfig,
      configId: configData.configId || uuidv4(),
      creationTime: new Date(),
      lastUpdated: new Date()
    }));

    for (const config of preparedConfigs) {
      const validationError = ValidationUtils.validateCompleteConfig(config);
      if (validationError) {
        throw new Error(`Validation failed for config ${config.configId}: ${validationError}`);
      }
    }

    try {
      const results = await this.storage.bulkCreate(preparedConfigs);
      logger.info('Bulk configuration creation completed', { count: results.length });
      return results;
    } catch (error) {
      logger.error('Failed to bulk create configurations', { count: configs.length, error });
      throw error;
    }
  }

  async bulkUpdateConfigurations(updates: BulkUpdateRequest[]): Promise<BulkUpdateResult[]> {
    if (updates.length === 0) throw new Error('Updates array cannot be empty');
    if (updates.length > 50) throw new Error('Cannot update more than 50 configurations at once');

    try {
      const results = await this.storage.bulkUpdate(updates);
      const successCount = results.filter(r => r.success).length;
      logger.info('Bulk configuration update completed', {
        total: results.length, successful: successCount, failed: results.length - successCount
      });
      return results;
    } catch (error) {
      logger.error('Failed to bulk update configurations', { count: updates.length, error });
      throw error;
    }
  }

  async bulkDeleteConfigurations(configIds: string[]): Promise<BulkUpdateResult[]> {
    if (configIds.length === 0) throw new Error('Configuration IDs array cannot be empty');
    if (configIds.length > 50) throw new Error('Cannot delete more than 50 configurations at once');

    try {
      const results = await this.storage.bulkDelete(configIds);
      const successCount = results.filter(r => r.success).length;
      logger.info('Bulk configuration deletion completed', {
        total: results.length, successful: successCount, failed: results.length - successCount
      });
      return results;
    } catch (error) {
      logger.error('Failed to bulk delete configurations', { count: configIds.length, error });
      throw error;
    }
  }

  async cleanupDeletedConfigurations(dryRun = true): Promise<CleanupResult> {
    try {
      const result = await this.storage.cleanup(dryRun);
      logger.info('Cleanup operation completed', { removedCount: result.removedCount, dryRun });
      return result;
    } catch (error) {
      logger.error('Failed to cleanup deleted configurations', { dryRun, error });
      throw error;
    }
  }

  async getHealthStatus(): Promise<StorageHealthStatus> {
    try {
      const status = await this.storage.healthCheck();
      if (!status.isHealthy) {
        logger.warn('Storage health check failed', { status });
      }
      return status;
    } catch (error) {
      logger.error('Failed to get storage health status', { error });
      return {
        isHealthy: false,
        connectionStatus: 'error',
        lastChecked: new Date(),
        responseTime: 0,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        storageType: 'sqlite'
      };
    }
  }
}
