import type {
  UnifiedConfig,
  ConfigurationFilter,
  PaginatedResult,
  StorageHealthStatus,
  BulkUpdateRequest,
  BulkUpdateResult,
  CleanupResult
} from '@marketsui/shared-types';

/**
 * Universal storage interface for configuration management.
 * Supports SQLite (development) and MongoDB (production) implementations.
 */
export interface IConfigurationStorage {
  // Basic CRUD Operations
  create(config: UnifiedConfig): Promise<UnifiedConfig>;
  findById(configId: string, includeDeleted?: boolean): Promise<UnifiedConfig | null>;
  findByCompositeKey(
    userId: string,
    componentType: string,
    name: string,
    componentSubType?: string
  ): Promise<UnifiedConfig | null>;
  update(configId: string, updates: Partial<UnifiedConfig>): Promise<UnifiedConfig>;
  delete(configId: string): Promise<boolean>;

  // Advanced Operations
  clone(sourceConfigId: string, newName: string, userId: string): Promise<UnifiedConfig>;

  // Query Operations with Multiple Criteria
  findByMultipleCriteria(criteria: ConfigurationFilter): Promise<UnifiedConfig[]>;
  findByAppId(appId: string, includeDeleted?: boolean): Promise<UnifiedConfig[]>;
  findByUserId(userId: string, includeDeleted?: boolean): Promise<UnifiedConfig[]>;
  findByComponentType(
    componentType: string,
    componentSubType?: string,
    includeDeleted?: boolean
  ): Promise<UnifiedConfig[]>;

  // Pagination and Sorting
  findWithPagination(
    criteria: ConfigurationFilter,
    page: number,
    limit: number,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc'
  ): Promise<PaginatedResult<UnifiedConfig>>;

  // Bulk Operations
  bulkCreate(configs: UnifiedConfig[]): Promise<UnifiedConfig[]>;
  bulkUpdate(updates: BulkUpdateRequest[]): Promise<BulkUpdateResult[]>;
  bulkDelete(configIds: string[]): Promise<BulkUpdateResult[]>;

  // Maintenance Operations
  cleanup(dryRun?: boolean): Promise<CleanupResult>;
  healthCheck(): Promise<StorageHealthStatus>;

  // Connection Management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
