import type {
  AppConfigRow,
  ConfigurationFilter,
  PaginatedResult,
  StorageHealthStatus,
  BulkUpdateRequest,
  BulkUpdateResult,
  CleanupResult,
} from '@starui/shared-types';

/**
 * Universal storage interface for configuration management.
 * Backend-agnostic — SQLite today, any other engine tomorrow.
 *
 * Visibility (Decision 6 in the redesign): list methods accept an
 * optional `effectiveUserId`. When provided, results are filtered to
 * `(isPublic = 1 OR userId = effectiveUserId)`. When omitted, no
 * visibility filter applies — admin / unfiltered paths only.
 */
export interface IConfigurationStorage {
  // Basic CRUD
  create(config: AppConfigRow): Promise<AppConfigRow>;
  findById(configId: string, includeDeleted?: boolean): Promise<AppConfigRow | null>;
  findByCompositeKey(
    userId: string,
    componentType: string,
    displayText: string,
    componentSubType?: string,
  ): Promise<AppConfigRow | null>;
  update(configId: string, updates: Partial<AppConfigRow>): Promise<AppConfigRow>;
  delete(configId: string): Promise<boolean>;

  // Clone
  clone(sourceConfigId: string, newDisplayText: string, userId: string): Promise<AppConfigRow>;

  // Query — when `criteria.effectiveUserId` is set the visibility filter applies
  findByMultipleCriteria(criteria: ConfigurationFilter): Promise<AppConfigRow[]>;
  findByAppId(
    appId: string,
    includeDeleted?: boolean,
    effectiveUserId?: string,
  ): Promise<AppConfigRow[]>;
  findByUserId(
    userId: string,
    includeDeleted?: boolean,
    effectiveUserId?: string,
  ): Promise<AppConfigRow[]>;
  findByComponentType(
    componentType: string,
    componentSubType?: string,
    includeDeleted?: boolean,
    effectiveUserId?: string,
  ): Promise<AppConfigRow[]>;

  // Pagination
  findWithPagination(
    criteria: ConfigurationFilter,
    page: number,
    limit: number,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
  ): Promise<PaginatedResult<AppConfigRow>>;

  // Bulk
  bulkCreate(configs: AppConfigRow[]): Promise<AppConfigRow[]>;
  bulkUpdate(updates: BulkUpdateRequest[]): Promise<BulkUpdateResult[]>;
  bulkDelete(configIds: string[]): Promise<BulkUpdateResult[]>;

  // Maintenance
  cleanup(dryRun?: boolean): Promise<CleanupResult>;
  healthCheck(): Promise<StorageHealthStatus>;

  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
