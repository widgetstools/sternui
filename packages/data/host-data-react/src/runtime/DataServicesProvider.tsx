/**
 * Legacy bootstrap provider — prefer {@link DataHubProvider} for new apps.
 */

import {
  createContext,
  use,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type { SharedWorkerDataServicesClient } from '@starui/host-data/runtime/client';
import {
  AppDataMirror,
  DataProviderConfigStore,
  type DataServices,
} from '@starui/host-data/runtime';
import { LOGGED_IN_USER_ID } from '@starui/types';

export interface ContextValue {
  client: SharedWorkerDataServicesClient;
  appData: AppDataMirror;
  configStore: DataProviderConfigStore;
}

const DataServicesContext = createContext<ContextValue | null>(null);
const DataServicesUserIdContext = createContext<string | null>(null);

export interface DataServicesProviderProps {
  /** Bootstrap result from `bootstrapDataServices(...)`. */
  services: DataServices;
  /**
   * Hydration mode for the AppData mirror.
   *   - `'lazy'` (default): render immediately. Components see
   *     `useAppDataStore().loaded === false` on first paint;
   *     templates resolve once the mirror snapshot arrives.
   *   - `'eager'`: suspend until `services.ready` resolves. Wrap
   *     this Provider in a `<Suspense fallback>` boundary to control
   *     the loading UI.
   */
  mode?: 'eager' | 'lazy';
  /** Session user id for AppData ownership and provider list scope. */
  userId?: string;
  children?: ReactNode;
}

export function DataServicesProvider({
  services,
  mode = 'lazy',
  userId,
  children,
}: DataServicesProviderProps): ReactNode {
  if (mode === 'eager') use(services.ready);

  const effectiveUserId = userId ?? LOGGED_IN_USER_ID;

  const value = useMemo<ContextValue>(() => ({
    client: services.client,
    appData: services.appData,
    configStore: new DataProviderConfigStore(
      services.configManager,
      (providerId) => services.client.invalidateConfig(providerId),
    ),
  }), [services]);

  return (
    <DataServicesContext.Provider value={value}>
      <DataServicesUserIdContext.Provider value={effectiveUserId}>
        {children}
      </DataServicesUserIdContext.Provider>
    </DataServicesContext.Provider>
  );
}

export function useDataServicesContext(): ContextValue {
  const ctx = useContext(DataServicesContext);
  if (!ctx) {
    throw new Error(
      'useDataServices requires <DataServicesProvider> or <DataHubProvider>',
    );
  }
  return ctx;
}

export function useUserIdFromContext(): string {
  const ctx = useContext(DataServicesUserIdContext);
  if (ctx === null) {
    throw new Error(
      'useDataProvidersList requires <DataServicesProvider> or <DataHubProvider>',
    );
  }
  return ctx;
}
