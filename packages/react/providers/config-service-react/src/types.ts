// ─── @starui/config-service-react types ─────────────────────────────
//
// Shape exposed via `useConfigService()` to descendants of
// `<ConfigServiceProvider>`. Mirrors the data-services-react split
// (raw client + typed handles) so hosts read identity, the manager,
// and a MarketsGrid storage factory through a single hook.
//
// New fields land here; never widen on the consumer side without
// updating the JSDoc.

import type {
  ApplicationContext,
  ConfigManager,
  ProfileStorageFactory,
} from '@starui/config-service';

/**
 * The value carried on `<ConfigServiceProvider>`'s context. Returned by
 * `useConfigService()` to every descendant component.
 *
 *   - `configManager` — the live `ConfigManager` the Provider
 *     constructed and `init()`-ed. Hosts that need direct access to
 *     auth tables (`appRegistry` / `userProfile` / `roles` /
 *     `permissions`) read it here.
 *   - `storage` — a ready-to-use `ProfileStorageFactory` for
 *     `<MarketsGrid storage={...} />`. Pre-bound to the same
 *     `ConfigManager`; a host typically passes it straight through
 *     without re-creating it per blotter.
 *   - `appId` / `userId` — convenience copies of the identity the
 *     Provider was constructed with. Same values as
 *     `applicationContext.AppId` / `applicationContext.LoggedInUser.userId`
 *     at provider mount time; reactive consumers should read live
 *     identity off `applicationContext` (or via the AppData mirror)
 *     instead.
 *   - `applicationContext` — point-in-time snapshot of the four
 *     `ApplicationContext` AppData keys the manager publishes during
 *     `init()` (Session 7). Re-renders only when the Provider is
 *     re-mounted; for live updates subscribe to the AppData mirror
 *     directly.
 */
export interface ConfigServiceContextValue {
  configManager: ConfigManager;
  storage: ProfileStorageFactory;
  appId: string;
  userId: string;
  applicationContext: ApplicationContext;
}
