// Core UnifiedConfig schema for the MarketsUI Configuration Service.
//
// This is the contract shared between:
//   - `@marketsui/config-service` (Dexie / IndexedDB client)
//   - `apps/config-service-server` (REST / SQLite backend)
//   - Every consumer that reads or writes component configurations
//
// The shape intentionally matches `AppConfigRow` in
// `@marketsui/config-service` 1:1 — switching from local to remote
// means pointing at a base URL; no field translation happens at the
// boundary.

// ============================================================================
// Unified Configuration
// ============================================================================

/**
 * The single source of truth for a component configuration row.
 *
 * `payload` holds the component-specific config blob — its shape is
 * determined by `componentType` + `componentSubType` and is opaque to
 * the config service itself. Versioning, tagging, and similar features
 * are the responsibility of the consumer and live inside `payload`.
 */
export interface UnifiedConfig {
  /** Primary key — unique id for this row. */
  configId: string;

  /** Foreign key → application (platform uuid). */
  appId: string;

  /**
   * Owner of this config row. System-level rows (e.g. seeded templates)
   * typically use a reserved user id such as `"system"`.
   */
  userId: string;

  /** Component type: "GRID", "CHART", "HEATMAP", "ORDERTICKET", "DOCK", etc. */
  componentType: string;

  /** Sub-category within the component type (e.g. "CREDIT", "RATES"). */
  componentSubType: string;

  /** True = shareable template. False = a user-specific instance. */
  isTemplate: boolean;

  /** Human-readable label shown in toolbars, menus, and lookups. */
  displayText: string;

  /** Opaque, component-defined configuration payload. */
  payload: Record<string, unknown> | unknown;

  /** User id of the creator. */
  createdBy: string;

  /** User id of the last editor. */
  updatedBy: string;

  /** ISO-8601 timestamp of creation. */
  creationTime: string;

  /** ISO-8601 timestamp of the last modification. */
  updatedTime: string;
}

// ============================================================================
// Query / filtering
// ============================================================================

export interface ConfigurationFilter {
  configIds?: string[];
  appIds?: string[];
  userIds?: string[];
  componentTypes?: string[];
  componentSubTypes?: string[];
  displayTextContains?: string;
  isTemplate?: boolean;
  /** Reserved for future soft-delete support. Ignored when unsupported. */
  includeDeleted?: boolean;
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface StorageHealthStatus {
  isHealthy: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'error';
  lastChecked: string;
  responseTime: number;
  errorMessage?: string;
  storageType: 'sqlite' | 'dexie' | 'mock';
}

export interface BulkUpdateRequest {
  configId: string;
  updates: Partial<UnifiedConfig>;
}

export interface BulkUpdateResult {
  configId: string;
  success: boolean;
  error?: string;
}

export interface CleanupResult {
  removedCount: number;
  configs?: UnifiedConfig[] | undefined;
  dryRun?: boolean;
}

// ============================================================================
// Component type constants
// ============================================================================

export const COMPONENT_TYPES = {
  DATASOURCE: 'datasource',
  DATA_PROVIDER: 'data-provider',
  GRID: 'grid',
  DATA_GRID: 'data-grid',
  PROFILE: 'profile',
  WORKSPACE: 'workspace',
  PAGE: 'page',
  THEME: 'theme',
  LAYOUT: 'layout',
  DOCK: 'dock',
  /** Persisted OpenFin dock-editor configuration (buttons + dropdowns). */
  DOCK_CONFIG: 'dock-config',
  /** Persisted component-registry editor configuration (registry entries). */
  COMPONENT_REGISTRY: 'component-registry',
  /** MarketsGrid profile-set bundle — one row per (appId, userId, instanceId). */
  MARKETS_GRID_PROFILE_SET: 'markets-grid-profile-set',
  SIMPLE_BLOTTER: 'simple-blotter',
  SIMPLE_BLOTTER_LAYOUT: 'simple-blotter-layout',
  CUSTOM: 'custom',
} as const;

export const COMPONENT_SUBTYPES = {
  STOMP: 'stomp',
  WEBSOCKET: 'websocket',
  SOCKETIO: 'socketio',
  REST: 'rest',
  MOCK: 'mock',
  DOCK_APPLICATIONS_MENU_ITEMS: 'dock-applications-menu-items',
  DEFAULT: 'default',
  CUSTOM: 'custom',
  SHARED: 'shared',
  DIRECT: 'direct',
} as const;

export type ComponentType = typeof COMPONENT_TYPES[keyof typeof COMPONENT_TYPES];
export type ComponentSubType = typeof COMPONENT_SUBTYPES[keyof typeof COMPONENT_SUBTYPES];
