// ─── ConfigServiceProvider ──────────────────────────────────────────
//
// React Provider that wires `@starui/config-service` end-to-end so a
// host's `main.tsx` only carries identity + appId + (optional) seed /
// rest URLs.
//
// Layering:
//   <DataServicesProvider services={dataServices}>      ← from data-services-react
//     <ConfigServiceProvider identity={...} appId={...}>
//       ...
//     </ConfigServiceProvider>
//   </DataServicesProvider>
//
// The `useDataServices()` hook is read inside the Provider so the
// `ConfigManager` we construct can publish `ApplicationContext` into
// the same AppData mirror every other piece of the app already reads.

import { useEffect, useState, type ReactNode } from 'react';
import {
  createConfigManager,
  createConfigServiceStorage,
  type AppIdentity,
} from '@starui/config-service';
import { useDataServices } from '@starui/data-services-react';

import { ConfigServiceContext } from './configServiceContext';
import type { ConfigServiceContextValue } from './types';

export interface ConfigServiceProviderProps {
  /**
   * Authenticated identity supplied by the host app. Drives audit
   * stamping and (in REST mode) outbound `Authorization: Bearer …`
   * headers via `identity.getAccessToken`.
   *
   * Hosts that mint a fresh literal on every render should `useMemo`
   * the value — a new object reference re-runs the bootstrap effect
   * and re-initialises the `ConfigManager`.
   */
  identity: AppIdentity;
  /** The app this Provider's ConfigManager is scoped to. Becomes
   *  `ApplicationContext.AppId`. */
  appId: string;
  /** Optional seed JSON URL for first-run local bootstrap (auth
   *  tables — appRegistry / userProfile / roles / permissions). */
  seedUrl?: string;
  /** Optional REST base URL. When set, writes go to REST first and
   *  Dexie second; reads stay local for speed. */
  restUrl?: string;
  /**
   * React children. Optional at the type level so callers (notably
   * `<AppShell>`) can pass a pre-bound element without children and
   * let the shell inject them via `React.cloneElement`. Runtime
   * behaviour is unchanged — the body still renders `{children}`,
   * which is harmless when undefined.
   */
  children?: ReactNode;
}

/**
 * Bootstrap a `ConfigManager`, publish `ApplicationContext` into the
 * surrounding `<DataServicesProvider>`, and expose
 * `{ configManager, storage, appId, userId, applicationContext }` to
 * descendants via `useConfigService()`.
 *
 * Lifecycle:
 *   1. On mount: construct ConfigManager → `init()`.
 *   2. On `init()` resolve: build a `createConfigServiceStorage(...)`
 *      factory and snapshot `getApplicationContext()`; expose via
 *      context.
 *   3. On unmount or prop change: `dispose()` the manager. A pending
 *      bootstrap is short-circuited via the `disposed` guard so a
 *      late `init()` resolution doesn't leak a manager.
 *
 * Errors thrown during bootstrap are rethrown from the next render so
 * the nearest `<ErrorBoundary>` catches them. While bootstrap is
 * pending, the Provider renders `null` — wrap children in `<Suspense>`
 * or your own loader if you want a fallback.
 */
export function ConfigServiceProvider({
  identity,
  appId,
  seedUrl,
  restUrl,
  children,
}: ConfigServiceProviderProps) {
  const dataServices = useDataServices();
  const [value, setValue] = useState<ConfigServiceContextValue | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let disposed = false;

    const manager = createConfigManager({
      appId,
      identity,
      seedConfigUrl: seedUrl,
      configServiceRestUrl: restUrl,
      dataServices,
    });

    manager
      .init()
      .then(() => {
        if (disposed) {
          manager.dispose();
          return;
        }
        const storage = createConfigServiceStorage({ configManager: manager });
        setValue({
          configManager: manager,
          storage,
          appId,
          userId: identity.userId,
          applicationContext: manager.getApplicationContext(),
        });
      })
      .catch((err: unknown) => {
        if (disposed) return;
        manager.dispose();
        setError(err);
      });

    return () => {
      disposed = true;
      manager.dispose();
      setValue(null);
    };
    // The Provider re-bootstraps when any of these inputs change. Hosts
    // that mutate `identity` per render should `useMemo` it; otherwise
    // the manager tears down + re-inits each render and resets pending
    // state. Mirrors the data-services-react `services` invariant.
  }, [appId, identity, seedUrl, restUrl, dataServices]);

  if (error) throw error;
  if (!value) return null;
  return (
    <ConfigServiceContext.Provider value={value}>
      {children}
    </ConfigServiceContext.Provider>
  );
}
