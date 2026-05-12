/**
 * ConfigService-backed storage adapter for `<MarketsGrid>` layouts.
 *
 * One `AppConfigRow` per `(appId, userId, instanceId)` — the row's
 * `payload` is a bundle of every layout for that instance:
 *
 *   {
 *     profiles: LayoutSnapshot[]
 *   }
 *
 * (The persisted `profiles:` field name is kept verbatim for back-compat
 * with rows written before the layout rename — a dual-read shim added
 * around this file will also accept `layouts:`.)
 *
 * This matches the original storage design in
 * `docs/plans/MARKETS_GRID_API.md` §Storage ("one row per instance
 * carrying the whole layout set"). Each adapter method implements
 * read-modify-write on the bundle under the hood so LayoutManager
 * and its 242-test suite continue to call the standard per-layout
 * `StorageAdapter` API unchanged.
 *
 * Row-mapping contract (post-rename):
 *   componentType    = "markets-grid-layout-set"
 *   componentSubType = ""
 *   appId            = <host app id>
 *   userId           = <signed-in user id>
 *   configId         = <instanceId>          (primary key scope)
 *   payload          = { layouts: LayoutSnapshot[] }
 *
 * Pre-rename rows wearing `componentType: 'markets-grid-profile-set'`
 * with `payload.profiles` are still recognized on read and rewritten
 * onto the new shape on the next save (see `isLayoutSetRow` and
 * `normalizePayload`).
 *
 * Why bundled, not per-layout:
 *   - Config Browser shows one row per instance instead of N rows — a
 *     much clearer mental model for admins ("this is alice's state for
 *     bond-blotter").
 *   - Single round-trip to hydrate a grid at mount; no client-side
 *     filter across the whole user's config.
 *   - Layout list + switch semantics stay inside the payload shape
 *     we own, rather than leaking into configId naming.
 *
 * Consistency note:
 *   saveLayout does load-modify-write against a single row. Two
 *   tabs mutating the same instance concurrently could race; the
 *   later write wins. Acceptable for the current demo target; a
 *   production REST backend would want optimistic concurrency
 *   (If-Match / version field) to surface conflicts. Not in scope
 *   for v1.
 *
 * Usage at app bootstrap (typical):
 *
 *   const storage = createConfigServiceStorage({
 *     configManager,
 *     appId: host.appId,
 *     userId: currentUser.id,
 *   });
 *   <MarketsGrid storage={storage} ... />
 */

// Type-only import — @starui/core is a peerDependency so the types
// line up exactly with what MarketsGrid expects. No runtime dep on
// core; consumers naturally satisfy the peer by depending on both.
import type { LayoutSnapshot, StorageAdapter } from '@starui/core';
import type { AppConfigRow } from './types';
import type { ConfigManager } from './ConfigManager';

export type { LayoutSnapshot, StorageAdapter };

/** ComponentType used on the AppConfigRow that holds a whole
 *  instance's bundle of layouts. New writes after the Profile → Layout
 *  rename land on `'markets-grid-layout-set'`. Pre-rename rows on disk
 *  carry {@link LEGACY_MARKETS_GRID_LAYOUT_SET_COMPONENT_TYPE} and are
 *  still recognized by `isLayoutSetRow`; the next save rewrites them
 *  to the new componentType so the migration completes gradually. */
export const MARKETS_GRID_LAYOUT_SET_COMPONENT_TYPE = 'markets-grid-layout-set';

/** Pre-rename componentType — recognized on read for back-compat. New
 *  writes never produce this value. */
export const LEGACY_MARKETS_GRID_LAYOUT_SET_COMPONENT_TYPE = 'markets-grid-profile-set';

/** Back-compat re-export of the old component-type name so callers
 *  that imported `MARKETS_GRID_LAYOUT_COMPONENT_TYPE` don't break —
 *  it now just points at the set-style constant. */
export const MARKETS_GRID_LAYOUT_COMPONENT_TYPE = MARKETS_GRID_LAYOUT_SET_COMPONENT_TYPE;

/** Payload shape inside the single-row bundle.
 *
 *  `version` is an opaque monotonic counter bumped on every successful
 *  `saveSet`. The adapter uses it to detect concurrent writes from
 *  another tab / device: on save we read the current row's version,
 *  write `expected + 1`, and throw `LayoutSetVersionConflictError` if
 *  the row's version has moved on. Rows predating the version field
 *  are treated as version 0 and self-heal on the first save.
 *
 *  `gridLevelData` is an opaque, top-level field used for state that
 *  needs to survive layout switches (e.g. the v2 data-provider
 *  selection — `{ liveProviderId, historicalProviderId, mode }`). It's
 *  optional so older rows written before the field existed continue to
 *  load cleanly. The adapter never inspects the value; consumers own
 *  its type via `<MarketsGrid gridLevelData={...}>`.
 *
 *  Write path emits `layouts:` (post-rename canonical key). Read path
 *  accepts either `layouts:` or the pre-rename `profiles:` key so
 *  existing rows continue to load without migration; the next save
 *  rewrites them onto the new key. */
interface LayoutSetPayload {
  version: number;
  layouts: LayoutSnapshot[];
  gridLevelData?: unknown;
}

/**
 * Thrown by the ConfigService storage adapter when a `saveLayout`,
 * `deleteLayout`, or other write observes that the backing row's
 * version has advanced since it was loaded — meaning another writer
 * (another tab, another device) beat this one to the row.
 *
 * Consumers `catch` this to surface a "changes conflict" UI. A simple
 * recovery path is to reload and let the user reapply; a nicer one
 * merges + retries. MarketsGrid does not catch this today — it
 * propagates up through LayoutManager's normal error channel, which
 * means failed saves surface as unhandled rejections. Wrapping with a
 * user-visible toast is a deferred follow-up (see
 * docs/plans/MARKETS_GRID_API.md §Deferred).
 */
export class LayoutSetVersionConflictError extends Error {
  readonly name = 'LayoutSetVersionConflictError';
  constructor(
    public readonly expected: number,
    public readonly actual: number,
    public readonly instanceId: string,
  ) {
    super(
      `Layout set for instance "${instanceId}" was modified by another writer. `
      + `Expected version ${expected}, found ${actual}. Reload to see the latest state.`,
    );
  }
}

export interface ConfigServiceStorageOptions {
  /** Already-initialized ConfigManager instance. Bring-your-own so
   *  consumer controls Dexie vs REST mode + init lifecycle. */
  configManager: ConfigManager;
  /** Optional app-id fallback — used when MarketsGrid doesn't pass
   *  `appId` at call time. Most apps leave this undefined and pass
   *  `appId` on the `<MarketsGrid>` prop instead (reactive identity). */
  appId?: string;
  /** Optional user-id fallback — same treatment as `appId`. */
  userId?: string;
  /** Optional display-text used on the stored row. Defaults to
   *  "MarketsGrid layouts: <instanceId>". Only surfaces in the
   *  Config Browser UI. */
  displayTextPrefix?: string;
}

/**
 * Identity of the registered component this MarketsGrid instance is
 * persisting state for — propagated onto the saved AppConfigRow so
 * its `componentType` / `componentSubType` / `isTemplate` /
 * `singleton` fields reflect the registered entry, not a hardcoded
 * "markets-grid-profile-set" placeholder.
 *
 * When omitted (e.g. legacy callers or unit tests that don't model a
 * registered component), the row falls back to
 * `componentType: 'markets-grid-layout-set'`, `componentSubType: ''`,
 * `isTemplate: false` defaults. Pre-rename rows wearing the legacy
 * `'markets-grid-profile-set'` componentType are still recognized
 * on read and rewritten to the new componentType on the next save.
 */
export interface RegisteredComponentIdentity {
  componentType: string;
  componentSubType: string;
  isTemplate?: boolean;
  singleton?: boolean;
}

/** Options the factory receives from MarketsGrid at call time. */
export interface LayoutStorageFactoryOpts {
  instanceId: string;
  appId?: string;
  userId?: string;
  /**
   * Identity of the registered component. When provided, the saver
   * writes `componentType`, `componentSubType`, `isTemplate`, and
   * `singleton` from this object onto every persisted row — ENFORCED
   * on every write, so a stale row from before identity-aware saves
   * gets corrected on the next save.
   */
  registeredIdentity?: RegisteredComponentIdentity;
}

/** Factory type — matches `StorageAdapterFactory` in @starui/markets-grid. */
export type LayoutStorageFactory = (opts: LayoutStorageFactoryOpts) => StorageAdapter;

/**
 * Create a layout-storage factory backed by ConfigService.
 *
 * The factory takes `{ instanceId, appId?, userId? }` at call time.
 * MarketsGrid supplies those from its own props.
 *
 * Resolution order for `appId` / `userId`:
 *   1. Call-time opts (from MarketsGrid's appId/userId props)
 *   2. Closure fallback (from `createConfigServiceStorage({ appId, userId })`)
 *   3. Error — thrown on the first CRUD call if neither is available
 *
 * Typical usage:
 *
 *   const storage = createConfigServiceStorage({ configManager });
 *   <MarketsGrid storage={storage} appId="TestApp" userId={userId} />
 *
 * User-switching becomes trivial — change the userId prop; no factory
 * re-creation needed. If you still want app-bootstrap-level scoping,
 * pass `appId`/`userId` to `createConfigServiceStorage({...})` as
 * closure fallbacks; MarketsGrid's props override them.
 */
export function createConfigServiceStorage(
  opts: ConfigServiceStorageOptions,
): LayoutStorageFactory {
  const { configManager } = opts;
  const closureAppId = opts.appId;
  const closureUserId = opts.userId;
  const displayTextPrefix = opts.displayTextPrefix ?? 'MarketsGrid layouts';

  return (factoryOpts: LayoutStorageFactoryOpts): StorageAdapter => {
    const instanceId = factoryOpts.instanceId;
    const appId = factoryOpts.appId ?? closureAppId;
    const userId = factoryOpts.userId ?? closureUserId;
    const identity = factoryOpts.registeredIdentity;

    if (!appId || !userId) {
      throw new Error(
        'createConfigServiceStorage: appId and userId must be supplied ' +
        'either at factory-creation time (createConfigServiceStorage({ appId, userId })) ' +
        'or at call time via MarketsGrid props. ' +
        `Received: appId=${JSON.stringify(appId)}, userId=${JSON.stringify(userId)}.`,
      );
    }

    const rowId = instanceId;

    // Read the bundled row for this instance. Returns null when no
    // row exists yet — the consumer treats null as "first launch,
    // start empty". Filters defensively against rows that happen to
    // share the configId but belong to a different owner.
    //
    // Template-to-instance copy is NOT done here. The launcher
    // (`createComponentInstance` in @starui/openfin-platform) clones
    // the template row onto the new instanceId BEFORE the view opens,
    // so reads from a freshly-launched instance hit a populated row
    // directly. This eliminated the dual-adapter seed race that
    // previously lived in this function.
    const loadSet = async (): Promise<LayoutSetPayload | null> => {
      const row = await configManager.getConfig(rowId);
      if (isLayoutSetRow(row, appId, userId)) {
        return normalizePayload(row.payload);
      }
      return null;
    };

    /**
     * Write the bundle with optimistic-concurrency check.
     *
     * `expectedVersion` is the version the caller observed on its
     * read. `saveSet` re-reads the row right before writing, compares,
     * and throws `LayoutSetVersionConflictError` on mismatch — a
     * cheap way to catch two-tab / two-device races before they
     * silently clobber each other.
     *
     * The read-compare-write isn't atomic at the client (JavaScript
     * isn't transactional across two awaits). For local Dexie the
     * race window is microscopic — JS is single-threaded per tab,
     * and Dexie serializes writes within a tab. For future REST
     * backends, the adapter should add `If-Match: <version>` on the
     * PUT so the server enforces the check; that's deferred until
     * real REST mode lands.
     */
    const saveSet = async (
      set: LayoutSetPayload,
      expectedVersion: number,
    ): Promise<void> => {
      const now = new Date().toISOString();
      const existing = await configManager.getConfig(rowId);
      const actualVersion = isLayoutSetRow(existing, appId, userId)
        ? readVersion(existing.payload)
        : 0;

      if (actualVersion !== expectedVersion) {
        throw new LayoutSetVersionConflictError(expectedVersion, actualVersion, instanceId);
      }

      // Preserve original creationTime if the row already exists.
      const creationTime = isLayoutSetRow(existing, appId, userId)
        ? (existing?.creationTime ?? now)
        : now;

      // Identity-bound fields: when the consumer (typically
      // BlottersMarketsGrid via component-host customData) supplies
      // a registered identity, the row carries the REGISTERED
      // component's type/subtype/isTemplate/singleton — exactly
      // matching the Registry Editor entry. Without identity we
      // fall back to the "markets-grid-layout-set" discriminator so
      // unit tests + non-registered consumers keep working.
      const componentType = identity?.componentType ?? MARKETS_GRID_LAYOUT_SET_COMPONENT_TYPE;
      const componentSubType = identity?.componentSubType ?? '';
      const isTemplate = identity?.isTemplate === true;
      const singleton = identity?.singleton === true;

      const row: AppConfigRow = {
        configId: rowId,
        appId,
        userId,
        // Default visibility: public. Layout-set rows are owned by
        // their `userId` but currently treated as visible to everyone
        // in the app (matches pre-redesign behaviour). When private
        // layout sets become a feature, the consumer can override
        // this via the registered identity. See Decision 6.
        isPublic: existing?.isPublic ?? true,
        displayText: `${displayTextPrefix}: ${instanceId}`,
        componentType,
        componentSubType,
        isTemplate,
        singleton,
        payload: { ...set, version: expectedVersion + 1 },
        createdBy: existing?.createdBy ?? userId,
        updatedBy: userId,
        creationTime,
        updatedTime: now,
      };
      await configManager.saveConfig(row);
    };

    return {
      async loadLayout(gridId: string, layoutId: string): Promise<LayoutSnapshot | null> {
        void gridId; // gridId maps 1:1 to instanceId at this seam
        const set = await loadSet();
        if (!set) return null;
        return set.layouts.find((p) => p.id === layoutId) ?? null;
      },

      async saveLayout(snapshot: LayoutSnapshot): Promise<void> {
        // Load the existing bundle, then upsert the snapshot and
        // write back. The expected-version from the load is threaded
        // into saveSet so a second writer that landed in between
        // gets caught on the version-compare. `gridLevelData` is
        // preserved verbatim — saving a layout must not clobber it.
        const loaded = await loadSet();
        const expectedVersion = loaded?.version ?? 0;
        const layouts = loaded?.layouts ?? [];
        const idx = layouts.findIndex((p) => p.id === snapshot.id);
        if (idx >= 0) {
          layouts[idx] = snapshot;
        } else {
          layouts.push(snapshot);
        }
        await saveSet(
          { version: expectedVersion, layouts, gridLevelData: loaded?.gridLevelData },
          expectedVersion,
        );
      },

      async deleteLayout(gridId: string, layoutId: string): Promise<void> {
        void gridId;
        const loaded = await loadSet();
        if (!loaded) return;
        const filtered = loaded.layouts.filter((p) => p.id !== layoutId);
        if (filtered.length === loaded.layouts.length) return; // not found; no-op
        await saveSet(
          { version: loaded.version, layouts: filtered, gridLevelData: loaded.gridLevelData },
          loaded.version,
        );
      },

      async listLayouts(gridId: string): Promise<LayoutSnapshot[]> {
        void gridId;
        const set = await loadSet();
        return set?.layouts ?? [];
      },

      async loadGridLevelData(gridId: string): Promise<unknown | null> {
        void gridId;
        const set = await loadSet();
        return set?.gridLevelData ?? null;
      },

      async saveGridLevelData(gridId: string, data: unknown): Promise<void> {
        void gridId;
        // Read-modify-write the same bundled row. Keep layouts and
        // version intact — only the `gridLevelData` field changes.
        const loaded = await loadSet();
        const expectedVersion = loaded?.version ?? 0;
        await saveSet(
          {
            version: expectedVersion,
            layouts: loaded?.layouts ?? [],
            gridLevelData: data,
          },
          expectedVersion,
        );
      },
    };
  };
}

/** Guard: does this row belong to a markets-grid layout-set owned
 *  by `(appId, userId)`? */
/**
 * Recognise a layout-set row owned by `(appId, userId)`.
 *
 * Identification is by **payload shape** — specifically, the presence
 * of a `layouts` (or pre-rename `profiles`) array on the payload — NOT
 * the row's `componentType`. The latter is now identity-bound (see
 * `RegisteredComponentIdentity` above): a row written for a
 * registered "blotter / positions" component carries
 * `componentType: 'blotter'`, not the legacy
 * `'markets-grid-layout-set'` placeholder.
 *
 * Legacy rows (pre-identity-aware writes, or pre-rename) still have
 * `componentType` of `'markets-grid-layout-set'` or
 * `'markets-grid-profile-set'` and a `profiles`/`layouts` payload —
 * both checks pass, so they continue to load. The next save corrects
 * the row to identity-bound form on the new componentType.
 */
function isLayoutSetRow(
  row: AppConfigRow | null | undefined,
  appId: string,
  userId: string,
): row is AppConfigRow {
  if (!row) return false;
  if (row.appId !== appId || row.userId !== userId) return false;
  // Identity-bound rows or legacy rows both produce a layouts/profiles
  // array in payload — that's the discriminator.
  const payload = row.payload as { layouts?: unknown; profiles?: unknown } | null | undefined;
  return Array.isArray(payload?.layouts)
    || Array.isArray(payload?.profiles)
    || row.componentType === MARKETS_GRID_LAYOUT_SET_COMPONENT_TYPE
    || row.componentType === LEGACY_MARKETS_GRID_LAYOUT_SET_COMPONENT_TYPE;
}

/** Defensively normalize the persisted payload back into a
 *  LayoutSetPayload. Guards against malformed / legacy shapes.
 *
 *  Pre-version rows (written before the version-field landed) are
 *  treated as version 0 — they self-heal on the next save when the
 *  adapter writes a proper version field. No explicit migration
 *  pass required.
 *
 *  Pre-rename rows carry `profiles:` instead of `layouts:`; we accept
 *  either key on read so existing data loads without migration. */
function normalizePayload(payload: unknown): LayoutSetPayload {
  const p = payload as {
    layouts?: unknown;
    profiles?: unknown;
    version?: unknown;
    gridLevelData?: unknown;
  } | null | undefined;
  const arr = Array.isArray(p?.layouts)
    ? p!.layouts
    : Array.isArray(p?.profiles)
      ? p!.profiles
      : [];
  const layouts: LayoutSnapshot[] = [];
  for (const raw of arr as unknown[]) {
    const snap = normalizeSnapshot(raw);
    if (snap) layouts.push(snap);
  }
  // `gridLevelData` is intentionally opaque — pass through whatever the
  // row carried (or undefined). Pre-`gridLevelData` rows omit the field
  // and self-heal on the next saveGridLevelData call.
  return { version: readVersion(p), layouts, gridLevelData: p?.gridLevelData };
}

/** Pull the `version` number out of a payload, tolerating the pre-
 *  version-field shape. Missing / non-numeric values map to 0. */
function readVersion(payload: unknown): number {
  const v = (payload as { version?: unknown } | null | undefined)?.version;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function normalizeSnapshot(raw: unknown): LayoutSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<LayoutSnapshot> & { gridId?: string };
  if (!p.id || !p.gridId) return null;
  return {
    id: String(p.id),
    gridId: String(p.gridId),
    name: String(p.name ?? ''),
    state: (p.state ?? {}) as LayoutSnapshot['state'],
    createdAt: Number(p.createdAt ?? Date.now()),
    updatedAt: Number(p.updatedAt ?? Date.now()),
  };
}

/**
 * One-shot migration helper: copy layouts from local Dexie/Memory
 * storage into ConfigService bundled storage for a given `(gridId,
 * instanceId, userId)` tuple.
 *
 * Consumer-triggered — NOT called automatically. Trading apps that
 * want to migrate users write a small admin action that invokes this
 * once per known instance.
 *
 * Strategy:
 *   "skip-if-exists" (default) — no-op when target already has any
 *   layouts in the bundle (cross-device safety: user may have newer
 *   data on another device already synced).
 *
 *   "overwrite" — unconditionally rewrites the target bundle with
 *   the source layout list.
 *
 * Returns `{ migrated: boolean, count?: number, reason?: string }`.
 */
export async function migrateLayoutsToConfigService(params: {
  source: StorageAdapter;
  target: LayoutStorageFactory;
  gridId: string;
  instanceId?: string;
  /** App + user identity passed into the factory at call time. If the
   *  factory was built with closure-level fallbacks these may be
   *  omitted — otherwise they're required, same rule as MarketsGrid. */
  appId?: string;
  userId?: string;
  strategy?: 'skip-if-exists' | 'overwrite';
}): Promise<{ migrated: boolean; count?: number; reason?: string }> {
  const effectiveInstanceId = params.instanceId ?? params.gridId;
  const targetAdapter = params.target({
    instanceId: effectiveInstanceId,
    appId: params.appId,
    userId: params.userId,
  });
  const strategy = params.strategy ?? 'skip-if-exists';

  const existing = await targetAdapter.listLayouts(effectiveInstanceId);
  if (existing.length > 0 && strategy === 'skip-if-exists') {
    return { migrated: false, reason: 'target-has-layouts' };
  }

  const sourceLayouts = await params.source.listLayouts(params.gridId);
  if (sourceLayouts.length === 0) {
    return { migrated: false, reason: 'no-source-layouts' };
  }

  // Rewrite gridId to the target's instanceId so snapshots round-trip
  // cleanly through the bundled adapter. saveLayout is sequential
  // but load-modify-writes the same bundle each time — acceptable for
  // a one-shot migration at small sizes.
  for (const layout of sourceLayouts) {
    await targetAdapter.saveLayout({ ...layout, gridId: effectiveInstanceId });
  }

  return { migrated: true, count: sourceLayouts.length };
}
