// Core UnifiedConfig schema and related types for Stern Configuration Service

// ============================================================================
// Hierarchy Types (Organizational Configuration Inheritance)
// ============================================================================

/**
 * Hierarchy node types — represents organizational levels
 */
export type HierarchyNodeType = 'APP' | 'REGION' | 'CITY' | 'DEPARTMENT' | 'DESK' | 'USER';

/**
 * Strategy for merging inherited configurations
 */
export type InheritanceStrategy = 'REPLACE' | 'SHALLOW_MERGE' | 'DEEP_MERGE';

/**
 * A node in the organizational hierarchy tree
 */
export interface HierarchyNode {
  id: string;
  nodeName: string;
  nodeType: HierarchyNodeType;
  parentId: string | null;
  path: string;                    // "/stern/APAC/HongKong/Equities/EquityTrading"
  level: number;                   // 0 = root (APP)
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Rules for how a config at one hierarchy level merges with its parent
 */
export interface InheritanceRules {
  strategy: InheritanceStrategy;
  overrideParent: boolean;
}

/**
 * Access control for configuration ownership and permissions
 */
export interface AccessControl {
  ownerId: string;
  canEdit: string[];
  canView: string[];
  canMove: string[];               // who can promote to higher level
}

/**
 * Result of resolving a config through the hierarchy
 */
export interface ConfigResolutionResult {
  config: UnifiedConfig;
  source: 'own' | 'inherited';
  inheritedFrom?: string;          // "Desk: Equity Trading"
  resolvedPath: string[];          // ancestor node paths used in resolution
}

// ============================================================================
// Core Configuration Types
// ============================================================================

export interface UnifiedConfig {
  // === Identity ===
  configId: string;           // Unique identifier (UUID)
  appId: string;              // Application identifier
  userId: string;             // User who owns this config

  // === Parent-Child Relationship ===
  parentId?: string | null;   // Optional parent config ID for hierarchical configs (e.g., layouts linked to blotter)

  // === Component Classification ===
  componentType: string;      // 'datasource' | 'grid' | 'profile' | 'workspace' | 'theme' | 'layout' | 'simple-blotter' | 'simple-blotter-layout'
  componentSubType?: string;  // 'stomp' | 'rest' | 'default' | 'custom' | 'shared' | 'direct'

  // === Display ===
  name: string;               // User-friendly name
  description?: string;       // Optional description
  icon?: string;              // Optional icon identifier

  // === Configuration Data ===
  config: Record<string, unknown>;  // Component-specific current configuration (strongly typed)
  settings: ConfigVersion[];        // Version history (profiles, themes, layouts, views, etc.)
  activeSetting: string;            // ID of active version

  // === Metadata ===
  tags?: string[];            // Searchable tags
  category?: string;          // Organizational category
  isShared?: boolean;         // Shared with other users
  isDefault?: boolean;        // System default
  isLocked?: boolean;         // Prevent modifications

  // === Audit ===
  createdBy: string;          // User ID who created
  lastUpdatedBy: string;      // User ID who last updated
  creationTime: Date;         // ISO timestamp
  lastUpdated: Date;          // ISO timestamp

  // === Soft Delete ===
  deletedAt?: Date | null;    // Soft delete timestamp
  deletedBy?: string | null;  // User who deleted

  // === Row kind (ConfigService compat) ===
  rowKind?: string;                    // 'registration' | 'template' | 'instance' | 'workspace'

  // === Hierarchy (optional, backward-compatible) ===
  nodeId?: string;                     // hierarchy node where this config lives
  nodePath?: string;                   // "/stern/APAC/HongKong/.../trader-1"
  inheritanceStrategy?: InheritanceStrategy;
  inheritanceRules?: InheritanceRules;
  isInherited?: boolean;               // true if resolved from parent node
  sourceNodePath?: string;             // path of owning node (if inherited)
  accessControl?: AccessControl;
}

export interface ConfigVersion {
  versionId: string;          // Unique version identifier (UUID)
  name: string;               // Version name (e.g., "Default", "Trading View", "Dark Theme")
  description?: string;       // Optional version description
  config: Record<string, unknown>;  // Version-specific configuration data (strongly typed)
  createdTime: Date;          // Version creation timestamp
  updatedTime: Date;          // Version last update timestamp
  isActive: boolean;          // Whether this version is currently active
  metadata?: Record<string, unknown>;  // Version-specific metadata (strongly typed)
}

export interface ConfigurationFilter {
  // Identity Filters
  configIds?: string[];           // Multiple config IDs
  appIds?: string[];              // Multiple app IDs
  userIds?: string[];             // Multiple user IDs
  parentIds?: string[];           // Multiple parent config IDs (for hierarchical queries)

  // Component Classification Filters
  componentTypes?: string[];      // Multiple component types
  componentSubTypes?: string[];   // Multiple component subtypes

  // Content Filters
  nameContains?: string;          // Name contains text
  descriptionContains?: string;   // Description contains text
  tags?: string[];                // Must have all specified tags
  categories?: string[];          // Multiple categories

  // Boolean Filters
  isShared?: boolean;             // Shared configurations
  isDefault?: boolean;            // Default configurations
  isLocked?: boolean;             // Locked configurations
  includeDeleted?: boolean;       // Include soft-deleted records

  // Date Range Filters
  createdAfter?: Date;            // Created after date
  createdBefore?: Date;           // Created before date
  updatedAfter?: Date;            // Updated after date
  updatedBefore?: Date;           // Updated before date

  // Advanced Filters
  hasVersions?: boolean;          // Has versions in settings array
  activeSettingExists?: boolean;  // Has valid activeSetting reference

  // Hierarchy Filters
  nodeIds?: string[];             // Filter by hierarchy node IDs
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
  lastChecked: Date;
  responseTime: number;
  errorMessage?: string;
  storageType: 'sqlite' | 'mongodb' | 'mock';
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

// Component type constants
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
  SIMPLE_BLOTTER: 'simple-blotter',
  SIMPLE_BLOTTER_LAYOUT: 'simple-blotter-layout',
  CUSTOM: 'custom'
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
  DIRECT: 'direct'
} as const;

export type ComponentType = typeof COMPONENT_TYPES[keyof typeof COMPONENT_TYPES];
export type ComponentSubType = typeof COMPONENT_SUBTYPES[keyof typeof COMPONENT_SUBTYPES];
