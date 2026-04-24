import type {
  UnifiedConfig,
  ConfigurationFilter,
  PaginatedResult,
  StorageHealthStatus,
  BulkUpdateRequest,
  BulkUpdateResult,
  CleanupResult,
} from '@marketsui/shared-types';

/**
 * Universal storage interface for configuration management.
 * Backend-agnostic — SQLite today, any other engine tomorrow.
 */
export interface IConfigurationStorage {
  // Basic CRUD
  create(config: UnifiedConfig): Promise<UnifiedConfig>;
  findById(configId: string, includeDeleted?: boolean): Promise<UnifiedConfig | null>;
  findByCompositeKey(
    userId: string,
    componentType: string,
    displayText: string,
    componentSubType?: string,
  ): Promise<UnifiedConfig | null>;
  update(configId: string, updates: Partial<UnifiedConfig>): Promise<UnifiedConfig>;
  delete(configId: string): Promise<boolean>;

  // Clone
  clone(sourceConfigId: string, newDisplayText: string, userId: string): Promise<UnifiedConfig>;

  // Query
  findByMultipleCriteria(criteria: ConfigurationFilter): Promise<UnifiedConfig[]>;
  findByAppId(appId: string, includeDeleted?: boolean): Promise<UnifiedConfig[]>;
  findByUserId(userId: string, includeDeleted?: boolean): Promise<UnifiedConfig[]>;
  findByComponentType(
    componentType: string,
    componentSubType?: string,
    includeDeleted?: boolean,
  ): Promise<UnifiedConfig[]>;

  // Pagination
  findWithPagination(
    criteria: ConfigurationFilter,
    page: number,
    limit: number,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
  ): Promise<PaginatedResult<UnifiedConfig>>;

  // Bulk
  bulkCreate(configs: UnifiedConfig[]): Promise<UnifiedConfig[]>;
  bulkUpdate(updates: BulkUpdateRequest[]): Promise<BulkUpdateResult[]>;
  bulkDelete(configIds: string[]): Promise<BulkUpdateResult[]>;

  // Maintenance
  cleanup(dryRun?: boolean): Promise<CleanupResult>;
  healthCheck(): Promise<StorageHealthStatus>;

  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
