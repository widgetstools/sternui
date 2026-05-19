// ─── @starui/host-config ───────────────────────────────────────
//
// A dual-mode configuration service for MarketsUI applications.
//
// In dev mode (default), all data is stored in Dexie/IndexedDB — no
// backend required. When a REST URL is provided, writes sync to a
// remote backend with Dexie as a local cache.
//
// Usage:
//
//   import { createConfigManager } from "@starui/host-config";
//
//   const configManager = createConfigManager({
//     seedConfigUrl: "http://localhost:5174/seed-config.json",
//   });
//   await configManager.init();
//
//   const config = await configManager.getConfig("my-component-1");

// ─── ConfigClient (framework-agnostic, REST-shaped) ─────────────────
// The recommended entry point for component configuration. Same
// interface for local (Dexie) and remote (HTTP) modes.
export {
  createConfigClient,
  LocalConfigClient,
  RestConfigClient,
  ConfigNotFoundError,
  ConfigClientHttpError,
  OptimisticLockError,
} from './client';
export type {
  ConfigClient,
  CreateConfigClientOptions,
  ConfigFilter,
  PageOptions,
  PaginatedResult,
  CompositeKey,
  CreateConfigInput,
  UpsertConfigInput,
  UpdateConfigOptions,
  BulkUpdateEntry,
  BulkDeleteResult,
  HealthStatus,
  AppRegistryOps,
  UserProfileOps,
  RoleOps,
  PermissionOps,
} from './client';

// ─── Lower-level ConfigManager (deprecated) ─────────────────────────
// Exposed for consumers that still call auth-table getters
// (appRegistry / userProfile / roles / permissions) or dock/snapshot
// helpers directly. New feature code MUST prefer `ConfigClient` — these
// re-exports collapse behind `LocalConfigClient` in the next
// session-set. See Decision 13 and Session 16 of
// `docs/plans/plan-2026-05-07/config-manager-redesign.md`.
/** @deprecated Prefer `createConfigClient` from this same package. */
export { createConfigManager, ConfigManager } from './ConfigManager';
export type { ImpersonatedUser, SaveConfigOptions } from './ConfigManager';

// ─── Database (for advanced use cases only) ──────────────────────────
export { ConfigDatabase } from './db';

// ─── Visibility (Session 4) ──────────────────────────────────────────
// Pure predicate exposed for hosts that want to mirror the framework's
// visibility rule on row arrays they assembled themselves (e.g. a
// remote import).
export { isVisible } from './visibility';
export type { VisibilityContext } from './visibility';

// ─── Effective user / impersonation (Session 8) ──────────────────────
// `getEffectiveUser(ctx)` is the single source of truth for "who am I
// acting as right now": the impersonated user when one is set on
// ApplicationContext, otherwise the real signed-in user. Hosts that
// want to apply the same rule outside ConfigManager (e.g. a "what
// would alice see?" admin preview) call this helper.
export { getEffectiveUser } from './effectiveUser';

// ─── Types ───────────────────────────────────────────────────────────
export type {
  AppConfigRow,
  AppDataMirrorHandle,
  AppIdentity,
  AppRegistryRow,
  ApplicationContext,
  ConfigManagerOptions,
  DataServicesHandle,
  PermissionRow,
  PendingSyncRow,
  RoleRow,
  SeedData,
  UserProfileRow,
} from './types';

// ─── MarketsGrid profile storage (StorageAdapter factory) ───────────
// ConfigService-backed persistence for <MarketsGrid>. Pass the factory
// to MarketsGrid's `storage` prop to opt-in to cross-device profile
// sync scoped by (appId, userId, instanceId).
export {
  createConfigServiceStorage,
  migrateProfilesToConfigService,
  ProfileSetVersionConflictError,
  MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE,
  /** @deprecated alias for `MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE` — same value */
  MARKETS_GRID_PROFILE_COMPONENT_TYPE,
  CONFIG_SERVICE_ADAPTER_BRAND,
  getConfigServiceAdapterBrand,
  type ConfigServiceStorageOptions,
  type ProfileStorageFactory,
  type ProfileStorageFactoryOpts,
  type ProfileSnapshot,
  type RegisteredComponentIdentity,
  type StorageAdapter,
} from './profileStorage';

// ─── ConfigManager.profiles namespace ────────────────────────────────
// First-class API for reading/writing the bundled profile-set row
// without going through StorageAdapter. Same Dexie row, identical
// semantics. See docs/PROFILE-STATE-CONSOLIDATION.md.
export type {
  ProfilesNamespace,
  ProfilesScope,
  ProfilesSaveOptions,
} from './profiles';

// ─── Profile-state consolidation migration (Session 3.2) ────────────
// One-shot copy from the legacy `gc-customizer-v2` Dexie DB into the
// ConfigService bundled row. Runs once on `<ConfigServiceProvider>`
// mount; idempotent via a localStorage flag.
export {
  migrateLegacyProfilesIfNeeded,
  PROFILE_MIGRATION_V1_FLAG,
  LEGACY_PROFILES_DB_NAME,
  LEGACY_PROFILES_TABLE,
  type MigrationOptions,
  type MigrationResult,
} from './migrations/profiles-v1';

// ─── Change notifier (advanced — reserved for tests) ────────────────
// Cross-tab + same-tab event bus that backs `ConfigManager.profiles.
// subscribe`. Not part of the public API for production callers; used
// in tests that simulate two managers sharing one BroadcastChannel.
export { ChangeNotifier } from './changeNotifier';

export { createConfigPort, type ConfigPortOptions } from './createConfigPort';

export {
  CONFIG_BROWSER_TABLES,
  TABLES,
  type ConfigBrowserTableKey,
  type ConfigBrowserTableMeta,
  type TableKey,
  type TableMeta,
} from './configBrowserTables';
