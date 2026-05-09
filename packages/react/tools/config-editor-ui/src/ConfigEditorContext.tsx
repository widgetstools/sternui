import { createContext, useContext, type ReactNode } from 'react';
import type { ConfigClient } from '@starui/config-service';

const Ctx = createContext<ConfigClient | null>(null);

export interface ConfigEditorProviderProps {
  client: ConfigClient;
  children: ReactNode;
}

/**
 * Wires a `ConfigClient` (Local or REST — engine-agnostic) into
 * descendant editor components. Hosts construct the client themselves
 * (e.g. via `createConfigClient` from `@starui/config-service`, or by
 * pulling `configManager` from `@starui/config-service-react` and
 * wrapping it) so this package never reaches into Dexie or REST
 * directly.
 */
export function ConfigEditorProvider({
  client,
  children,
}: ConfigEditorProviderProps) {
  return <Ctx.Provider value={client}>{children}</Ctx.Provider>;
}

export function useConfigClient(): ConfigClient {
  const c = useContext(Ctx);
  if (!c) {
    throw new Error(
      'useConfigClient must be used within <ConfigEditorProvider>',
    );
  }
  return c;
}
