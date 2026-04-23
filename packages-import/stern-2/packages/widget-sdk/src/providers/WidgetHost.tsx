import React, { createContext, useContext, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PlatformAdapter } from '../types/platform.js';
import type { WidgetHostProps } from '../types/widget.js';
import { WidgetRegistry } from '../registry/WidgetRegistry.js';
import { ConfigClient } from '../services/configClient.js';
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
      retry: 1
    }
  }
});

/**
 * WidgetHost — top-level provider that supplies platform adapter, config client,
 * widget registry, and React Query to all widgets in the tree.
 */
export function WidgetHost({
  apiUrl,
  userId,
  platform,
  registry,
  children
}: WidgetHostProps) {
  const value = useMemo<WidgetHostContextValue>(() => ({
    apiUrl,
    userId,
    platform: platform || new BrowserAdapter(apiUrl),
    registry: registry || new WidgetRegistry(),
    configClient: new ConfigClient(apiUrl)
  }), [apiUrl, userId, platform, registry]);

  return (
    <QueryClientProvider client={defaultQueryClient}>
      <WidgetHostContext.Provider value={value}>
        {children}
      </WidgetHostContext.Provider>
    </QueryClientProvider>
  );
}
