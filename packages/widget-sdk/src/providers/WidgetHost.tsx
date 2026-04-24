import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfigClient, type ConfigClient } from '@marketsui/config-service';
import type { PlatformAdapter } from '../types/platform.js';
import type { WidgetHostProps } from '../types/widget.js';
import { WidgetRegistry } from '../registry/WidgetRegistry.js';
import { BrowserAdapter } from '../adapters/BrowserAdapter.js';

export interface WidgetHostContextValue {
  apiUrl: string;
  userId: string;
  platform: PlatformAdapter;
  registry: WidgetRegistry;
  configClient: ConfigClient;
}

export const WidgetHostContext = createContext<WidgetHostContextValue | null>(null);

export function useWidgetHost(): WidgetHostContextValue {
  const ctx = useContext(WidgetHostContext);
  if (!ctx) {
    throw new Error('useWidgetHost must be used within a <WidgetHost> provider');
  }
  return ctx;
}

const defaultQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

/**
 * WidgetHost — top-level provider that supplies platform adapter, config
 * client, widget registry, and React Query to all widgets in the tree.
 *
 * `apiUrl` is forwarded to the config client as its REST base URL when
 * non-empty; when empty, the client runs in local Dexie-only mode.
 */
export function WidgetHost({
  apiUrl,
  userId,
  platform,
  registry,
  children,
}: WidgetHostProps) {
  const value = useMemo<WidgetHostContextValue>(() => {
    const configClient = createConfigClient({
      baseUrl: apiUrl && apiUrl.trim().length > 0 ? apiUrl : undefined,
    });
    return {
      apiUrl,
      userId,
      platform: platform || new BrowserAdapter(apiUrl),
      registry: registry || new WidgetRegistry(),
      configClient,
    };
  }, [apiUrl, userId, platform, registry]);

  // Lazy init + dispose on unmount so background seed loading / REST
  // sync loops (if any) tear down with the provider.
  useEffect(() => {
    let disposed = false;
    value.configClient.init().catch((err) => {
      if (!disposed) console.error('ConfigClient init failed', err);
    });
    return () => {
      disposed = true;
      value.configClient.dispose();
    };
  }, [value.configClient]);

  return (
    <QueryClientProvider client={defaultQueryClient}>
      <WidgetHostContext.Provider value={value}>
        {children}
      </WidgetHostContext.Provider>
    </QueryClientProvider>
  );
}
