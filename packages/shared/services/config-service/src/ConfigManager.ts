// ─── ConfigManager ───────────────────────────────────────────────────
//
// The ConfigManager is the main entry point for the config service.
// It provides CRUD operations for all six database tables and handles
// two modes of operation:
//
//   1. DEV MODE (default) — all reads and writes go to Dexie/IndexedDB.
//      No backend required. Perfect for local development.
//
//   2. REST MODE — when `configServiceRestUrl` is provided, writes go
//      to REST first, then mirror to Dexie. Reads always come from
//      Dexie for speed. Failed REST writes are queued in PENDING_SYNC
//      and retried every 10 seconds.
//
// On first run, if a `seedConfigUrl` is provided and the database is
// empty, the ConfigManager fetches the seed file and populates the
// APP_REGISTRY, USER_PROFILE, and ROLES tables.

import { ConfigDatabase } from './db';
import { OptimisticLockError } from './errors';
import type {
  AppConfigRow,
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
import { isVisible, type VisibilityContext } from './visibility';

/**
 * Subset of `ApplicationContext.ImpersonatedUser` used by
 * `setImpersonatedUser`. Kept as a structural alias so callers can pass
 * either a freshly-constructed object literal or the
 * `LoggedInUser` shape they already hold.
 */
export type ImpersonatedUser = { userId: string; displayName?: string };

/**
 * Fixed name of the framework-owned AppData provider (Decision 4 in
 * `config-manager-redesign.md`). Every ConfigManager that's wired
 * with `dataServices` writes its identity / profile keys into this
 * single named row; consumers read it via `appData.get(...)`.
 */
const APPLICATION_CONTEXT_NAME = 'ApplicationContext';

/**
 * Optional behavior knobs on a single `saveConfig` call. Adding fields
 * here is non-breaking; existing call sites pass nothing and get the
 * pre-Session-6 last-write-wins semantics.
 */
export interface SaveConfigOptions {
  /**
   * The `updatedTime` the caller observed at edit-start. When supplied
   * AND the manager is in REST mode, the value flows out as an
   * `If-Match` header so the server can refuse a stale write with HTTP
   * 412 (Decision 12.5 / Session 6). Local mode applies the same check
   * against Dexie before persisting.
   */
  expectedUpdatedTime?: string;
}

// Dev placeholders used when the host app doesn't pass `appId` /
// `identity`. Keep these aligned with the JSDoc on the option fields
// so first-run docs and runtime defaults can never drift.
const DEFAULT_APP_ID = 'dev-app';
const DEFAULT_IDENTITY: AppIdentity = {
  userId: 'dev-user',
  displayName: 'Dev User',
};

// How often to retry failed REST writes.
// 10 seconds is a balance: short enough to recover quickly after a
// network blip, long enough not to flood the server with retries.
const PENDING_SYNC_INTERVAL_MS = 10_000;

// How many times to retry a failed REST write before giving up.
// After MAX_SYNC_RETRIES, the row stays in PENDING_SYNC for manual
// investigation — it is never automatically deleted on failure.
const MAX_SYNC_RETRIES = 10;

/**
 * Create a new ConfigManager instance.
 *
 * @deprecated Prefer `createConfigClient(...)` from `./client`. Per
 * Decision 13 (config-manager-redesign), `ConfigClient` is the canonical
 * forward-looking surface for component configuration; `ConfigManager`
 * is collapsing to a private implementation detail behind the
 * `LocalConfigClient` wrapper. Use `createConfigClient` for new feature
 * code; keep `createConfigManager` only for legacy paths that still
 * need the auth-table / dock-snapshot helper methods that haven't been
 * lifted onto `ConfigClient` yet (those follow in the next session-set,
 * after which this factory will be removed).
 *
 * @example
 * ```typescript
 * const configManager = createConfigManager({
 *   seedConfigUrl: "http://localhost:5174/seed-config.json",
 * });
 * await configManager.init();
 *
 * // Use the config manager
 * const config = await configManager.getConfig("my-component-1");
 * ```
 */
export function createConfigManager(options: ConfigManagerOptions = {}): ConfigManager {
  return new ConfigManager(options);
}

/**
 * The ConfigManager provides CRUD operations for all config service
 * database tables. It handles seeding, dual-mode persistence, and
 * sync retry logic.
 *
 * @deprecated New feature code should consume `ConfigClient` (from
 * `./client`) instead. `ConfigManager` is being collapsed behind
 * `LocalConfigClient` — see Decision 13 in
 * `docs/plans/plan-2026-05-07/config-manager-redesign.md` and the
 * follow-up session-set that removes the factory and class.
 */
export class ConfigManager {
  private db: ConfigDatabase;
  private seedConfigUrl: string | undefined;
  private restUrl: string | undefined;
  private readonly appId: string;
  private readonly identity: AppIdentity;
  private dataServices: DataServicesHandle | undefined;
  private drainIntervalId: ReturnType<typeof setInterval> | undefined;
  private isInitialized = false;
  /** True after `dispose()` — IndexedDB is closed; `init()` becomes a no-op. */
  private disposed = false;
  /** Single-flight guard so concurrent `init()` calls share one bootstrap. */
  private initInFlight: Promise<void> | undefined;

  constructor(options: ConfigManagerOptions = {}) {
    this.db = new ConfigDatabase();
    this.seedConfigUrl = options.seedConfigUrl;
    this.restUrl = options.configServiceRestUrl;
    this.appId = options.appId ?? DEFAULT_APP_ID;
    this.identity = options.identity ?? DEFAULT_IDENTITY;
    this.dataServices = options.dataServices;
  }

  // ─── Identity accessors ──────────────────────────────────────────
  // Read-only views over the construction-time appId / identity. Every
  // write path that needs to stamp owner / audit fields (Session 3) and
  // every read path that needs to apply visibility (Session 4) goes
  // through these.

  /**
   * The app this ConfigManager belongs to. Defaults to `"dev-app"`
   * when the host doesn't supply `appId`.
   */
  getAppId(): string {
    return this.appId;
  }

  /**
   * The authenticated identity this ConfigManager was constructed
   * with. Defaults to `{ userId: "dev-user", displayName: "Dev User" }`
   * when the host doesn't supply `identity`.
   */
  getIdentity(): AppIdentity {
    return this.identity;
  }

  // ─── ApplicationContext / data-services wiring (Session 7) ────────
  //
  // ConfigManager publishes a single named AppData row called
  // `"ApplicationContext"` whose `values` carry `AppId`,
  // `LoggedInUser`, `ImpersonatedUser`, and `LoggedInUserProfile`.
  // Every component (any window, any layer) reads identity sync via
  // the main-thread mirror — no prop drilling, no context plumbing.
  //
  // Two wiring shapes are supported:
  //   1. Construction-time:
  //      `createConfigManager({ identity, appId, dataServices })`.
  //   2. Late wiring:
  //      `const cm = createConfigManager({ identity, appId });`
  //      `cm.setDataServices(ds);`
  //      `await cm.init();`
  //   The late path exists because today's `bootstrapDataServices`
  //   takes a `ConfigManager` (it keeps the reference for editor
  //   flows). Without late wiring the host would have to construct
  //   two ConfigManagers — one to seed the bundle, one to publish
  //   ApplicationContext — which doubles the IndexedDB connection
  //   and splits ownership.

  /**
   * Wire (or rewire) the data-services bundle. When set BEFORE
   * `init()`, the four ApplicationContext keys are published as part
   * of init; AFTER `init()`, the next call needs to be made
   * explicitly via a future helper (Session 8 lands the impersonation
   * setter) — Session 7 only handles the seed-time publish.
   *
   * Passing `undefined` detaches the handle so init() becomes a
   * silent no-op for AppData. Mostly useful in tests.
   */
  setDataServices(handle: DataServicesHandle | undefined): void {
    this.dataServices = handle;
  }

  /**
   * Read the ApplicationContext keys published into AppData by
   * `init()`. Sync because the main-thread mirror is sync; throws
   * before init has run (or when no `dataServices` was wired).
   *
   * Components that want to reactively re-render on ApplicationContext
   * change should subscribe to the AppDataMirror directly via
   * `dataServices.appData.subscribe(...)` — this method is a
   * point-in-time read.
   */
  getApplicationContext(): ApplicationContext {
    if (!this.dataServices) {
      throw new Error(
        'ConfigManager.getApplicationContext requires dataServices to be configured. ' +
          'Pass `dataServices` in `createConfigManager(...)` or call `setDataServices(...)` ' +
          'before `init()`.',
      );
    }

    const appData = this.dataServices.appData;
    const appId = appData.get(APPLICATION_CONTEXT_NAME, 'AppId');
    const loggedInUser = appData.get(APPLICATION_CONTEXT_NAME, 'LoggedInUser');
    const impersonatedUser = appData.get(APPLICATION_CONTEXT_NAME, 'ImpersonatedUser');
    const loggedInUserProfile = appData.get(
      APPLICATION_CONTEXT_NAME,
      'LoggedInUserProfile',
    );

    if (
      typeof appId !== 'string' ||
      loggedInUser === undefined ||
      loggedInUserProfile === undefined
    ) {
      throw new Error(
        'ConfigManager.getApplicationContext called before init() published the ' +
          'ApplicationContext keys. Await `configManager.init()` first.',
      );
    }

    return {
      AppId: appId,
      LoggedInUser: loggedInUser as ApplicationContext['LoggedInUser'],
      ImpersonatedUser:
        (impersonatedUser as ApplicationContext['ImpersonatedUser']) ?? null,
      LoggedInUserProfile:
        loggedInUserProfile as ApplicationContext['LoggedInUserProfile'],
    };
  }

  // ─── Effective user / impersonation (Session 8) ──────────────────
  //
  // The framework exposes a single "effective user" slot that drives
  // visibility (Session 4) AND `AppConfigRow.userId` owner stamping
  // (Session 3). When `ImpersonatedUser` is set in
  // `ApplicationContext` (via `setImpersonatedUser` below), the
  // effective user becomes the impersonated user; otherwise it falls
  // back to the construction-time identity (which equals
  // `LoggedInUser`).
  //
  // Audit fields (`createdBy` / `updatedBy`) deliberately bypass this
  // helper — they always reflect the real signed-in user via
  // `this.identity.userId`, so impersonation can never rewrite history.

  /**
   * Resolve the user whose ownership / visibility applies to the next
   * write or read. Reads `ImpersonatedUser` live from the AppData
   * mirror so a flip via `setImpersonatedUser` is visible to the
   * subsequent call without any explicit refresh.
   *
   * No-op when `dataServices` isn't wired (back-compat for tests and
   * hosts that haven't opted into ApplicationContext): falls back to
   * `identity.userId`. Same fallback when AppData is wired but the
   * `ImpersonatedUser` slot is empty / null.
   */
  private getEffectiveUserId(): string {
    if (!this.dataServices) {
      return this.identity.userId;
    }
    const impersonated = this.dataServices.appData.get(
      APPLICATION_CONTEXT_NAME,
      'ImpersonatedUser',
    ) as ImpersonatedUser | null | undefined;
    if (impersonated && typeof impersonated === 'object' && impersonated.userId) {
      return impersonated.userId;
    }
    return this.identity.userId;
  }

  /**
   * Set or clear the impersonated user on `ApplicationContext`. After
   * the returned promise resolves, every subsequent visibility check
   * and owner stamp on this manager uses the new effective user; audit
   * fields keep tracking the real logged-in user.
   *
   * Pass `null` to clear impersonation. Throws if the manager wasn't
   * wired with `dataServices` — there's no AppData slot to write to.
   */
  async setImpersonatedUser(user: ImpersonatedUser | null): Promise<void> {
    if (!this.dataServices) {
      throw new Error(
        'ConfigManager.setImpersonatedUser requires dataServices to be ' +
          'configured. Pass `dataServices` in `createConfigManager(...)` ' +
          'or call `setDataServices(...)` before `init()`.',
      );
    }
    await this.dataServices.appData.set(
      APPLICATION_CONTEXT_NAME,
      'ImpersonatedUser',
      user,
    );
  }

  // ─── Visibility (Session 4) ───────────────────────────────────────
  //
  // Every list path that returns AppConfigRow[] runs the rows through
  // `isVisible(row, ctx)` so cross-app and not-mine-private rows never
  // leak. The effective user comes from `getEffectiveUserId()` so an
  // active impersonation flips visibility immediately.

  /**
   * The visibility context applied to every filtered read. Built fresh
   * each call so an impersonation swap (Session 8) is visible
   * immediately on the next list call.
   */
  private get visibilityContext(): VisibilityContext {
    return { appId: this.appId, effectiveUserId: this.getEffectiveUserId() };
  }

  // ─── Owner / audit field stamping (Session 3) ─────────────────────
  //
  // Every write path in this manager funnels its row through
  // `stampWrite` so audit fields (`createdBy`, `updatedBy`,
  // `creationTime`, `updatedTime`) follow a single rule:
  //
  //   - On insert: createdBy / creationTime default to the current
  //     identity / now if the caller didn't supply them.
  //   - On every write (insert OR update): updatedBy / updatedTime are
  //     stamped unconditionally from the current identity / now.
  //
  // Audit fields ALWAYS reflect the real logged-in user
  // (`identity.userId`). The OWNER slot (`AppConfigRow.userId`) flows
  // through `getEffectiveUserId()` so impersonation (Session 8) flips
  // ownership without ever touching audit. Owner stamping for
  // `AppConfigRow` happens inline in `saveConfig` / `saveSnapshot`;
  // the helper itself only handles the audit slots so it stays safe
  // to reuse on auth tables (`appRegistry`, `userProfile`, `roles`,
  // `permissions`) which have no owner concept.

  /**
   * Stamp audit fields (`createdBy`, `updatedBy`, `creationTime`,
   * `updatedTime`) on a row destined for any of the manager's tables.
   * Mutates the row in place and returns it for chaining.
   *
   * @param row - the row about to be persisted
   * @param isInsert - whether this is a first-time insert (controls
   *   whether `createdBy` / `creationTime` get defaulted)
   */
  private stampWrite<
    T extends {
      createdBy?: string;
      updatedBy?: string;
      creationTime?: string;
      updatedTime?: string;
    },
  >(row: T, isInsert: boolean): T {
    const auditUser = this.identity.userId;
    const now = new Date().toISOString();
    if (isInsert) {
      row.createdBy = row.createdBy ?? auditUser;
      row.creationTime = row.creationTime ?? now;
    }
    row.updatedBy = auditUser;
    row.updatedTime = now;
    return row;
  }

  // ─── Initialization ──────────────────────────────────────────────

  /**
   * Initialize the config service.
   *
   * On first run (empty database), this loads seed data from the
   * seed config URL. In REST mode, it also starts the background
   * loop that retries failed remote writes.
   *
   * Safe to call multiple times — only runs once.
   *
   * If `dispose()` runs while this promise is pending (e.g. React Strict
   * Mode effect cleanup), the bootstrap exits without throwing and
   * leaves `isInitialized` false so a fresh manager instance can own
   * the database on the next mount.
   */
  async init(): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (this.isInitialized) {
      return;
    }
    if (this.initInFlight) {
      await this.initInFlight;
      return;
    }
    this.initInFlight = this.performInit();
    try {
      await this.initInFlight;
    } finally {
      this.initInFlight = undefined;
    }
  }

  private async performInit(): Promise<void> {
    try {
      // Seed the database if it's empty and a seed URL is provided
      await this.seedIfEmpty();
      if (this.disposed) {
        return;
      }

      // Publish ApplicationContext into AppData (Session 7). Sequenced
      // AFTER seeding so `LoggedInUserProfile` resolves against the
      // freshly-seeded auth tables on first run, and BEFORE the REST
      // drain so consumers reading via the mirror see identity from the
      // very first render.
      await this.publishApplicationContext();
      if (this.disposed) {
        return;
      }

      // In REST mode, start the background sync drain loop
      if (this.restUrl) {
        this.startSyncDrain();
      }

      this.isInitialized = true;
      console.log(
        `ConfigManager initialized (mode: ${this.restUrl ? "REST" : "local"})`,
      );
    } catch (err) {
      if (this.disposed) {
        return;
      }
      throw err;
    }
  }

  /**
   * Publish the four `ApplicationContext` keys into AppData. No-op
   * when `dataServices` wasn't wired — see option JSDoc.
   *
   * Awaits `appData.ready()` first so the worker's persisted snapshot
   * has been applied: otherwise the four sequential `set()` calls
   * each see an empty `byName` map and would fan-out four separate
   * configIds racing the snapshot. Once ready, each `set()` merges
   * into the same row by name.
   */
  private async publishApplicationContext(): Promise<void> {
    if (!this.dataServices) {
      return;
    }

    const appData = this.dataServices.appData;
    await appData.ready();
    if (this.disposed) {
      return;
    }

    const profile = await this.computeLoggedInUserProfile();
    const loggedInUser: ApplicationContext['LoggedInUser'] = {
      userId: this.identity.userId,
      ...(this.identity.displayName !== undefined
        ? { displayName: this.identity.displayName }
        : {}),
    };

    const contextValues: Record<string, unknown> = {
      AppId: this.appId,
      LoggedInUser: loggedInUser,
      ImpersonatedUser: null,
      LoggedInUserProfile: profile,
    };

    const publishRow = appData.publishNamedRow?.bind(appData);
    if (publishRow) {
      await publishRow(APPLICATION_CONTEXT_NAME, contextValues);
      return;
    }

    // Sequential — `AppDataMirror.set` reads `byName` after each
    // round-trip, so awaiting in order keeps the four keys on a
    // single row instead of racing four inserts. (Fallback when the
    // mirror does not implement `publishNamedRow`, e.g. minimal test
    // fakes.)
    await appData.set(APPLICATION_CONTEXT_NAME, 'AppId', this.appId);
    await appData.set(APPLICATION_CONTEXT_NAME, 'LoggedInUser', loggedInUser);
    await appData.set(APPLICATION_CONTEXT_NAME, 'ImpersonatedUser', null);
    await appData.set(APPLICATION_CONTEXT_NAME, 'LoggedInUserProfile', profile);
  }

  /**
   * Resolve the current identity into a `LoggedInUserProfile` payload
   * — the seeded user's roles + the union of those roles' permissions.
   *
   * If the user has no profile row yet (first-run, JIT provisioning
   * deferred per Decision 8), returns empty arrays so consumers see a
   * deterministic shape rather than `undefined`.
   */
  private async computeLoggedInUserProfile(): Promise<
    ApplicationContext['LoggedInUserProfile']
  > {
    const profile = await this.db.userProfile.get(this.identity.userId);
    if (!profile) {
      return { roles: [], permissions: [] };
    }

    const roles: RoleRow[] = [];
    const permissionIds = new Set<string>();
    for (const roleId of profile.roleIds) {
      const role = await this.db.roles.get(roleId);
      if (!role) continue;
      roles.push(role);
      for (const permId of role.permissionIds) {
        permissionIds.add(permId);
      }
    }

    const permissions: PermissionRow[] = [];
    for (const permId of permissionIds) {
      const perm = await this.db.permissions.get(permId);
      if (perm) permissions.push(perm);
    }

    return { roles, permissions };
  }

  /**
   * Clean up resources. Call this when the application is shutting down.
   * Stops the PENDING_SYNC drain loop and closes the database.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.isInitialized = false;
    if (this.drainIntervalId !== undefined) {
      clearInterval(this.drainIntervalId);
      this.drainIntervalId = undefined;
    }
    this.db.close();
  }

  /**
   * Returns true if the ConfigManager is running in REST mode
   * (remote backend enabled), false for local-only mode.
   */
  isRestMode(): boolean {
    return this.restUrl !== undefined;
  }

  /**
   * The configured REST endpoint, or `undefined` in local-only mode.
   * Surfaces the live mode source-of-truth for diagnostic UIs (e.g.
   * the ConfigBrowser header chip) so they don't have to re-read
   * OpenFin customData independently — that path is unset for views
   * launched by the dock without a registry-driven `customData`.
   */
  getRestUrl(): string | undefined {
    return this.restUrl;
  }

  // ─── APP_CONFIG operations ────────────────────────────────────────

  /**
   * Get a single config by its ID.
   * Returns undefined if no config exists with that ID.
   */
  async getConfig(configId: string): Promise<AppConfigRow | undefined> {
    return this.db.appConfig.get(configId);
  }

  /**
   * Save a config (create or update).
   * In REST mode, also sends to the remote backend.
   *
   * Owner / audit stamping (Decisions 5 + 7):
   *   - On INSERT: if the caller didn't set `userId` (owner) it
   *     defaults to the **effective** user via `getEffectiveUserId()`
   *     — the impersonated user when impersonation is active, the
   *     real signed-in user otherwise. `createdBy` / `creationTime`
   *     default from the **real** identity / now if absent.
   *   - On EVERY write: `updatedBy` / `updatedTime` are unconditionally
   *     stamped from the current identity / now — audit fields always
   *     reflect the real logged-in user, never an impersonated one.
   *
   * The extra `getConfig` read on the write path is acceptable: config
   * writes are rare and the read is local Dexie.
   */
  async saveConfig(config: AppConfigRow, options?: SaveConfigOptions): Promise<void> {
    const existing = await this.db.appConfig.get(config.configId);
    const isInsert = existing === undefined;

    // Optimistic locking (Decision 12.5 / Session 6). When the caller
    // captured an `updatedTime` at edit-start, refuse the write if Dexie
    // has moved on. The same `expectedUpdatedTime` is forwarded to the
    // server as `If-Match` below so REST mode shares one rule.
    if (
      !isInsert &&
      options?.expectedUpdatedTime !== undefined &&
      existing !== undefined &&
      existing.updatedTime !== options.expectedUpdatedTime
    ) {
      throw new OptimisticLockError(existing);
    }

    if (isInsert) {
      // Owner defaults to the effective user (Session 8): equals the
      // impersonated user when one is set, otherwise the real
      // logged-in user. Audit fields are stamped from the real user
      // independently inside `stampWrite`.
      config.userId = config.userId ?? this.getEffectiveUserId();
    }
    this.stampWrite(config, isInsert);

    if (this.restUrl) {
      await this.syncToRest('upsert', 'configurations', config.configId, config, {
        ifMatch: options?.expectedUpdatedTime,
      });
    }
    await this.db.appConfig.put(config);
  }

  /**
   * Delete a config by its ID.
   * In REST mode, also deletes from the remote backend.
   */
  async deleteConfig(configId: string): Promise<void> {
    if (this.restUrl) {
      await this.syncToRest("delete", "configurations", configId, undefined);
    }
    await this.db.appConfig.delete(configId);
  }

  /**
   * Get all configs belonging to a specific app, filtered by visibility
   * (Decision 6 / Session 4): cross-app rows are excluded, and private
   * rows are returned only when owned by the current effective user.
   *
   * For admin / migration paths that need cross-app access, use
   * `getConfigsByAppUnfiltered` instead.
   */
  async getConfigsByApp(appId: string): Promise<AppConfigRow[]> {
    const rows = await this.db.appConfig.where("appId").equals(appId).toArray();
    return rows.filter((r) => isVisible(r, this.visibilityContext));
  }

  /**
   * Get all configs belonging to a specific user, filtered by
   * visibility (Decision 6 / Session 4): only rows under the manager's
   * `appId` are returned. For cross-app GC and migration paths use
   * `getConfigsByUserUnfiltered`.
   */
  async getConfigsByUser(userId: string): Promise<AppConfigRow[]> {
    const rows = await this.db.appConfig.where("userId").equals(userId).toArray();
    return rows.filter((r) => isVisible(r, this.visibilityContext));
  }

  /**
   * Get every row visible to the current caller. Use sparingly — prefer
   * the indexed queries (`getConfigsByApp`, `getConfigsByUser`, etc.).
   *
   * For admin / migration paths that need every row regardless of
   * visibility (cross-app re-stamping, exports, GC across apps), use
   * `getAllConfigsUnfiltered`.
   */
  async getAllConfigs(): Promise<AppConfigRow[]> {
    const rows = await this.db.appConfig.toArray();
    return rows.filter((r) => isVisible(r, this.visibilityContext));
  }

  /**
   * Get every row in the appConfig table, **bypassing the visibility
   * filter**. Reserved for admin and migration paths that need to see
   * rows across apps (e.g. realign-to-platform-scope, registry
   * migrations, full exports, the multi-app admin browser in Session
   * 12). New feature code should use `getAllConfigs` and let visibility
   * apply.
   */
  async getAllConfigsUnfiltered(): Promise<AppConfigRow[]> {
    return this.db.appConfig.toArray();
  }

  /**
   * Get every row owned by `userId`, **bypassing the visibility
   * filter**. Reserved for cross-app GC / migration paths where the
   * caller does its own appId narrowing after the read.
   */
  async getConfigsByUserUnfiltered(userId: string): Promise<AppConfigRow[]> {
    return this.db.appConfig.where("userId").equals(userId).toArray();
  }

  /**
   * Get every row under `appId`, **bypassing the visibility filter**.
   * Reserved for the multi-app admin browser and exports that show
   * private rows regardless of ownership.
   */
  async getConfigsByAppUnfiltered(appId: string): Promise<AppConfigRow[]> {
    return this.db.appConfig.where("appId").equals(appId).toArray();
  }

  /**
   * Get template configs, optionally filtered by component type and
   * subtype. Templates are base configurations that get cloned for new
   * instances.
   *
   * Visibility (Session 4) applies — cross-app templates and private
   * templates owned by other users are hidden.
   *
   * IndexedDB cannot index boolean values, so we scan via `toArray()`
   * and filter `isTemplate` in JS rather than querying the index.
   */
  async getTemplates(
    componentType?: string,
    componentSubType?: string,
  ): Promise<AppConfigRow[]> {
    const all = await this.db.appConfig.toArray();

    const ctx = this.visibilityContext;
    return all.filter((row) => {
      if (!row.isTemplate) return false;
      if (!isVisible(row, ctx)) return false;
      if (componentType && row.componentType !== componentType) return false;
      if (componentSubType && row.componentSubType !== componentSubType) return false;
      return true;
    });
  }

  /**
   * Check if a config exists with the given ID.
   */
  async configExists(configId: string): Promise<boolean> {
    const count = await this.db.appConfig.where("configId").equals(configId).count();
    return count > 0;
  }

  // ─── APP_REGISTRY operations ──────────────────────────────────────

  /**
   * Get an app registry entry by its ID.
   */
  async getAppRegistry(appId: string): Promise<AppRegistryRow | undefined> {
    return this.db.appRegistry.get(appId);
  }

  /**
   * Get all registered apps.
   */
  async getAllApps(): Promise<AppRegistryRow[]> {
    return this.db.appRegistry.toArray();
  }

  /**
   * Upsert an app registry entry.
   * In REST mode, also sends to the remote backend.
   *
   * Audit fields are stamped from the current identity via
   * `stampWrite`. There is no owner concept on this table — `appId` is
   * the primary key.
   */
  async saveAppRegistry(row: AppRegistryRow): Promise<void> {
    const existing = await this.db.appRegistry.get(row.appId);
    this.stampWrite(row, existing === undefined);

    if (this.restUrl) {
      await this.syncToRest("upsert", "app-registry", row.appId, row);
    }
    await this.db.appRegistry.put(row);
  }

  /**
   * Delete an app registry entry by ID.
   * In REST mode, also deletes from the remote backend.
   */
  async deleteAppRegistry(appId: string): Promise<void> {
    if (this.restUrl) {
      await this.syncToRest("delete", "app-registry", appId, undefined);
    }
    await this.db.appRegistry.delete(appId);
  }

  // ─── USER_PROFILE operations ──────────────────────────────────────

  /**
   * Get a user profile by user ID.
   */
  async getUserProfile(userId: string): Promise<UserProfileRow | undefined> {
    return this.db.userProfile.get(userId);
  }

  /**
   * Get all user profiles for a specific app.
   */
  async getUsersByApp(appId: string): Promise<UserProfileRow[]> {
    return this.db.userProfile.where("appId").equals(appId).toArray();
  }

  /** Get every row in the userProfile table. */
  async getAllUserProfiles(): Promise<UserProfileRow[]> {
    return this.db.userProfile.toArray();
  }

  /**
   * Upsert a user profile.
   * In REST mode, also sends to the remote backend.
   *
   * Audit fields are stamped from the current identity via
   * `stampWrite`. The row's `userId` is the user this profile belongs
   * to (the row's primary key), which is independent of `createdBy` /
   * `updatedBy` (audit — who last edited).
   */
  async saveUserProfile(row: UserProfileRow): Promise<void> {
    const existing = await this.db.userProfile.get(row.userId);
    this.stampWrite(row, existing === undefined);

    if (this.restUrl) {
      await this.syncToRest("upsert", "user-profiles", row.userId, row);
    }
    await this.db.userProfile.put(row);
  }

  /**
   * Delete a user profile by ID.
   * In REST mode, also deletes from the remote backend.
   */
  async deleteUserProfile(userId: string): Promise<void> {
    if (this.restUrl) {
      await this.syncToRest("delete", "user-profiles", userId, undefined);
    }
    await this.db.userProfile.delete(userId);
  }

  // ─── ROLES operations ─────────────────────────────────────────────

  /**
   * Get a role definition by its ID.
   */
  async getRole(roleId: string): Promise<RoleRow | undefined> {
    return this.db.roles.get(roleId);
  }

  /**
   * Get all role definitions.
   */
  async getAllRoles(): Promise<RoleRow[]> {
    return this.db.roles.toArray();
  }

  /**
   * Upsert a role definition.
   * In REST mode, also sends to the remote backend.
   *
   * Audit fields are stamped from the current identity via
   * `stampWrite`. There is no owner concept on this table — `roleId`
   * is the primary key.
   */
  async saveRole(row: RoleRow): Promise<void> {
    const existing = await this.db.roles.get(row.roleId);
    this.stampWrite(row, existing === undefined);

    if (this.restUrl) {
      await this.syncToRest("upsert", "roles", row.roleId, row);
    }
    await this.db.roles.put(row);
  }

  /**
   * Delete a role by ID.
   * In REST mode, also deletes from the remote backend.
   */
  async deleteRole(roleId: string): Promise<void> {
    if (this.restUrl) {
      await this.syncToRest("delete", "roles", roleId, undefined);
    }
    await this.db.roles.delete(roleId);
  }

  // ─── PERMISSIONS operations ────────────────────────────────────────

  /**
   * Get a permission definition by its ID.
   */
  async getPermission(permissionId: string): Promise<PermissionRow | undefined> {
    return this.db.permissions.get(permissionId);
  }

  /**
   * Get all permission definitions.
   */
  async getAllPermissions(): Promise<PermissionRow[]> {
    return this.db.permissions.toArray();
  }

  /**
   * Get all permissions in a specific category (e.g. "config", "admin").
   */
  async getPermissionsByCategory(category: string): Promise<PermissionRow[]> {
    return this.db.permissions.where("category").equals(category).toArray();
  }

  /**
   * Upsert a permission definition.
   * In REST mode, also sends to the remote backend.
   *
   * Audit fields are stamped from the current identity via
   * `stampWrite`. There is no owner concept on this table —
   * `permissionId` is the primary key.
   */
  async savePermission(row: PermissionRow): Promise<void> {
    const existing = await this.db.permissions.get(row.permissionId);
    this.stampWrite(row, existing === undefined);

    if (this.restUrl) {
      await this.syncToRest("upsert", "permissions", row.permissionId, row);
    }
    await this.db.permissions.put(row);
  }

  /**
   * Delete a permission by ID.
   * In REST mode, also deletes from the remote backend.
   */
  async deletePermission(permissionId: string): Promise<void> {
    if (this.restUrl) {
      await this.syncToRest("delete", "permissions", permissionId, undefined);
    }
    await this.db.permissions.delete(permissionId);
  }

  /**
   * Get all permissions that a user has across all their roles.
   *
   * Looks up the user's roles, collects all permissionIds from those
   * roles, deduplicates them, and returns the full PermissionRow for each.
   */
  async getUserPermissions(userId: string): Promise<PermissionRow[]> {
    const user = await this.db.userProfile.get(userId);
    if (!user) {
      return [];
    }

    // Collect all permissionIds from all of the user's roles.
    //
    // NOTE — N+1 query pattern: we make one DB call per role, then one
    // per permission. For the typical case (a few roles, ~10 permissions)
    // this is fast enough and much easier to read than a batched query.
    // If performance becomes an issue with many roles, consider fetching
    // all roles in one call using `.where("roleId").anyOf(user.roleIds)`.
    const allPermissionIds = new Set<string>();
    for (const roleId of user.roleIds) {
      const role = await this.db.roles.get(roleId);
      if (role) {
        for (const permId of role.permissionIds) {
          allPermissionIds.add(permId); // Set deduplicates automatically
        }
      }
    }

    // Fetch the full PermissionRow for each unique permissionId
    const permissions: PermissionRow[] = [];
    for (const permId of allPermissionIds) {
      const perm = await this.db.permissions.get(permId);
      if (perm) {
        permissions.push(perm);
      }
    }

    return permissions;
  }

  /**
   * Check if a user has a specific permission.
   * Returns true if any of the user's roles grant the permission.
   */
  async userHasPermission(userId: string, permissionId: string): Promise<boolean> {
    const user = await this.db.userProfile.get(userId);
    if (!user) {
      return false;
    }

    for (const roleId of user.roleIds) {
      const role = await this.db.roles.get(roleId);
      if (role && role.permissionIds.includes(permissionId)) {
        return true;
      }
    }

    return false;
  }

  // ─── Workspace snapshot convenience methods ────────────────────────
  // Snapshots are stored as APP_CONFIG rows with
  // componentType = "WORKSPACE_SNAPSHOT". The config field holds
  // the snapshot payload (e.g. { instanceIds: [...] }).

  /**
   * Save a workspace snapshot as an APP_CONFIG row.
   * In REST mode, also sends to the remote backend.
   *
   * Owner / audit (Decisions 5 + 7): the row is owned by the manager's
   * **effective** user (the impersonated user when impersonation is
   * active, otherwise the real signed-in user). Audit fields always
   * follow the real signed-in user. The previous `"system"` placeholder
   * has been dropped now that `ConfigManager.saveConfig` centralises
   * stamping.
   *
   * @param snapshotId - Unique ID for this snapshot
   * @param appId - The app this snapshot belongs to
   * @param snapshotData - The snapshot payload (e.g. { instanceIds: [...] })
   */
  async saveSnapshot(snapshotId: string, appId: string, snapshotData: any): Promise<void> {
    // Owner / audit fields are filled by `saveConfig` → `stampWrite`.
    // We deliberately omit them here so the central path is the single
    // source of truth.
    const row = {
      configId: snapshotId,
      appId,
      // Snapshots are app-wide artefacts, visible to everyone using
      // the app — public by definition. Decision 6.
      isPublic: true,
      displayText: `Snapshot ${snapshotId}`,
      componentType: "WORKSPACE_SNAPSHOT",
      componentSubType: "",
      isTemplate: false,
      payload: snapshotData,
    } as unknown as AppConfigRow;
    await this.saveConfig(row);
  }

  /**
   * Get a specific workspace snapshot by its ID.
   * Returns the snapshot's config payload, or undefined if not found.
   */
  async getSnapshot(snapshotId: string): Promise<any | undefined> {
    const row = await this.getConfig(snapshotId);
    if (!row || row.componentType !== "WORKSPACE_SNAPSHOT") {
      return undefined;
    }
    return row.payload;
  }

  /**
   * Get the most recently saved snapshot for a given app.
   * Returns the snapshot's config payload, or undefined if none exist.
   */
  async getLatestSnapshot(appId: string): Promise<any | undefined> {
    const allForApp = await this.getConfigsByApp(appId);

    // Filter to only snapshots, then sort by updatedTime descending
    const snapshots = allForApp
      .filter((row) => row.componentType === "WORKSPACE_SNAPSHOT")
      .sort((a, b) => b.updatedTime.localeCompare(a.updatedTime));

    if (snapshots.length === 0) {
      return undefined;
    }
    return snapshots[0].payload;
  }

  // Note: dock + registry config persistence used to live here as
  // domain-specific shims (`saveDockConfig`, `loadDockConfig`, …).
  // They've been removed — ConfigManager stays a GENERIC (configId →
  // AppConfigRow) store, and domain helpers live in
  // `@starui/openfin-platform/db.ts` alongside the types they
  // wrap. That file builds AppConfigRow instances directly and
  // passes them to `saveConfig`, matching the pattern MarketsGrid's
  // `createConfigServiceStorage` uses.

  // ─── Seeding ──────────────────────────────────────────────────────

  /**
   * Load seed data from the seed config URL if the database is empty.
   *
   * Only runs on first launch — if APP_REGISTRY already has entries,
   * seeding is skipped. This prevents overwriting user changes on
   * subsequent app starts.
   */
  private async seedIfEmpty(): Promise<void> {
    if (!this.seedConfigUrl) {
      return;
    }

    // Check if the database already has data
    const appCount = await this.db.appRegistry.count();
    if (appCount > 0) {
      console.log("ConfigManager: Database already seeded, skipping.");
      return;
    }

    console.log(`ConfigManager: Seeding database from ${this.seedConfigUrl}`);

    try {
      const response = await fetch(this.seedConfigUrl);
      if (!response.ok) {
        // Log prominently — a developer starting the app for the first time
        // needs to know that seeding failed (database will be empty).
        console.error(
          `ConfigManager: ⚠️ Failed to fetch seed data from ${this.seedConfigUrl} (HTTP ${response.status}). ` +
          "The database will start empty. Check that the dev server is running and the seedConfigUrl is correct.",
        );
        return;
      }

      const seedData: SeedData = await response.json();

      // Insert seed data into each table using a transaction
      // so that either all tables are seeded or none are.
      await this.db.transaction(
        "rw",
        [this.db.appRegistry, this.db.userProfile, this.db.roles, this.db.permissions],
        async () => {
          if (seedData.permissions && seedData.permissions.length > 0) {
            await this.db.permissions.bulkPut(seedData.permissions);
            console.log(`ConfigManager: Seeded ${seedData.permissions.length} permissions.`);
          }

          if (seedData.roles && seedData.roles.length > 0) {
            await this.db.roles.bulkPut(seedData.roles);
            console.log(`ConfigManager: Seeded ${seedData.roles.length} roles.`);
          }

          if (seedData.appRegistry && seedData.appRegistry.length > 0) {
            await this.db.appRegistry.bulkPut(seedData.appRegistry);
            console.log(`ConfigManager: Seeded ${seedData.appRegistry.length} app registry entries.`);
          }

          if (seedData.userProfiles && seedData.userProfiles.length > 0) {
            await this.db.userProfile.bulkPut(seedData.userProfiles);
            console.log(`ConfigManager: Seeded ${seedData.userProfiles.length} user profiles.`);
          }
        },
      );

      console.log("ConfigManager: Database seeding complete.");
    } catch (error) {
      console.error("ConfigManager: Error seeding database.", error);
    }
  }

  // ─── REST sync ────────────────────────────────────────────────────

  /**
   * Attempt to sync a write operation to the remote REST backend.
   *
   * If the REST call fails, the operation is queued in PENDING_SYNC
   * for automatic retry later.
   */
  private async syncToRest(
    operation: "upsert" | "delete",
    tableName: string,
    recordId: string,
    payload: any,
    options?: { ifMatch?: string },
  ): Promise<void> {
    if (!this.restUrl) {
      return;
    }

    try {
      const url = `${this.restUrl}/${tableName}/${recordId}`;
      const method = operation === "delete" ? "DELETE" : "PUT";

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      // Outbound auth (Decision 2 / Session 6). The host owns refresh —
      // we just call before each request and attach the bearer header.
      // The server doesn't verify yet (Decision 16 deferred) but
      // plumbing it now means later sessions don't have to revisit.
      if (this.identity.getAccessToken) {
        const token = await this.identity.getAccessToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
      }
      if (options?.ifMatch !== undefined) {
        headers["If-Match"] = options.ifMatch;
      }

      const response = await fetch(url, {
        method,
        headers,
        body: operation === "delete" ? undefined : JSON.stringify(payload),
      });

      // 412 from the server means the row's `updatedTime` has moved on
      // since `expectedUpdatedTime` was captured. This is a USER-facing
      // error (the editor must reload); never queue it for retry.
      if (response.status === 412) {
        let currentRow: AppConfigRow | undefined;
        try {
          currentRow = (await response.json()) as AppConfigRow;
        } catch {
          currentRow = undefined;
        }
        throw new OptimisticLockError(currentRow);
      }

      if (!response.ok) {
        throw new Error(`REST sync failed with HTTP ${response.status}`);
      }
    } catch (error) {
      // Optimistic-lock failures are caller-visible; do not queue for retry.
      if (error instanceof OptimisticLockError) {
        throw error;
      }

      console.warn(
        `ConfigManager: REST sync failed for ${operation} ${tableName}/${recordId}. Queuing for retry.`,
        error,
      );

      // Queue the failed operation for retry
      const pendingEntry: PendingSyncRow = {
        operation,
        tableName,
        recordId,
        payload,
        createdAt: new Date().toISOString(),
        retries: 0,
      };
      await this.db.pendingSync.add(pendingEntry);
    }
  }

  /**
   * Start the background loop that retries failed REST writes.
   * Runs every 10 seconds. Only active in REST mode.
   */
  private startSyncDrain(): void {
    this.drainIntervalId = setInterval(async () => {
      await this.drainPendingSync();
    }, PENDING_SYNC_INTERVAL_MS);
  }

  /**
   * Process all entries in the PENDING_SYNC table.
   *
   * For each entry:
   *   - Retry the REST call
   *   - On success: delete the entry from PENDING_SYNC
   *   - On failure: increment the retry counter
   *   - After MAX_SYNC_RETRIES: log an error and stop retrying
   */
  private async drainPendingSync(): Promise<void> {
    if (!this.restUrl) {
      return;
    }

    const pendingEntries = await this.db.pendingSync.toArray();
    if (pendingEntries.length === 0) {
      return;
    }

    console.log(`ConfigManager: Draining ${pendingEntries.length} pending sync entries.`);

    for (const entry of pendingEntries) {
      // `id` is auto-assigned by Dexie on insert (++id primary key).
      // It should always be present on rows read from the database,
      // but we guard here so a corrupt row doesn't crash the drain loop.
      if (entry.id === undefined) {
        console.warn("ConfigManager: Skipping pending sync entry with no id.", entry);
        continue;
      }

      // Skip entries that have exceeded the retry limit
      if (entry.retries >= MAX_SYNC_RETRIES) {
        console.error(
          `ConfigManager: Giving up on sync for ${entry.tableName}/${entry.recordId} after ${entry.retries} retries.`,
        );
        continue;
      }

      try {
        const url = `${this.restUrl}/${entry.tableName}/${entry.recordId}`;
        const method = entry.operation === "delete" ? "DELETE" : "PUT";

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (this.identity.getAccessToken) {
          const token = await this.identity.getAccessToken();
          if (token) headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(url, {
          method,
          headers,
          body: entry.operation === "delete" ? undefined : JSON.stringify(entry.payload),
        });

        if (response.ok) {
          // Success — remove from the queue
          await this.db.pendingSync.delete(entry.id);
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (err) {
        // Failed again — increment the retry counter
        console.warn("Pending sync retry failed for entry", entry.id, err);
        await this.db.pendingSync.update(entry.id, {
          retries: entry.retries + 1,
        });
      }
    }
  }
}
