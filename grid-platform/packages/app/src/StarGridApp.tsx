import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LOGGED_IN_USER_ID } from '@stargrid/types';
import { BrowserRuntime } from '@stargrid/host-browser';
import type { RuntimePort } from '@stargrid/host';
import type { ConfigClient, ConfigManager } from '@stargrid/host-config';
import {
  createConfigClient,
  createConfigServiceStorage,
  createConfigPort,
} from '@stargrid/host-config';
import { buildGridHostContext, storageFactoryForPersistence } from './buildHostContext.js';
import { StarGridAppProvider } from './StarGridAppContext.js';
import type { StarGridAppOptions, StarGridAppState } from './types.js';

export interface StarGridAppProps extends StarGridAppOptions {
  readonly children: ReactNode;
}

function isConfigManager(value: ConfigManager | ConfigClient): value is ConfigManager {
  return typeof (value as ConfigManager).init === 'function';
}

/**
 * `<StarGridApp>` — declarative root for StarGrid consumer apps.
 *
 * Collapses runtime bootstrap, optional ConfigManager wiring, and
 * per-grid `GridHostContext` assembly into one component. Children
 * read the shell via `useStarGridApp()` / `useStarGridHost({ gridId })`.
 *
 * MarketsGrid accepts `host={useStarGridHost({ gridId })}` or reads
 * the same context when the `host` prop is omitted (see grid package).
 */
export function StarGridApp({
  appId,
  userId = LOGGED_IN_USER_ID,
  instanceId,
  componentType = 'MarketsGrid',
  persistence = 'localStorage',
  runtime: runtimeProp,
  configManager: configManagerProp,
  data: dataProp,
  loading = null,
  plugins = [],
  children,
}: StarGridAppProps): ReactNode {
  const [resolved, setResolved] = useState<{
    runtime: RuntimePort;
    configManager?: ConfigClient;
    configManagerInner?: ConfigManager;
    data?: import('@stargrid/host').DataPort;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const runtime =
        runtimeProp !== undefined
          ? await Promise.resolve(runtimeProp)
          : new BrowserRuntime({
              identity: {
                appId,
                userId,
                instanceId: instanceId ?? appId,
                componentType,
              },
            });

      let configManager: ConfigClient | undefined;
      let configManagerInner: ConfigManager | undefined;
      if (configManagerProp !== undefined) {
        const raw = await Promise.resolve(configManagerProp);
        if (isConfigManager(raw)) {
          await raw.init();
          configManagerInner = raw;
          configManager = createConfigClient({ configManager: raw });
        } else {
          configManager = raw;
        }
      }

      const data = dataProp !== undefined ? await Promise.resolve(dataProp) : undefined;

      if (!cancelled) {
        setResolved({ runtime, configManager, configManagerInner, data });
        for (const plugin of plugins) {
          await plugin.register?.({ appId });
        }
      }
    }

    void boot().catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[StarGridApp] bootstrap failed:', err);
    });

    return () => {
      cancelled = true;
    };
  }, [appId, userId, instanceId, componentType, runtimeProp, configManagerProp, dataProp, plugins]);

  const [theme, setThemeState] = useState(resolved?.runtime.getTheme() ?? 'dark');

  useEffect(() => {
    if (!resolved) return;
    setThemeState(resolved.runtime.getTheme());
    return resolved.runtime.onThemeChanged(setThemeState);
  }, [resolved]);

  const appState = useMemo<StarGridAppState | null>(() => {
    if (!resolved) return null;

    const configStorageFactory =
      persistence === 'config' && resolved.configManagerInner
        ? createConfigServiceStorage({ configManager: resolved.configManagerInner })
        : undefined;

    const storageFactory = storageFactoryForPersistence(persistence, configStorageFactory);

    const configPort =
      resolved.configManagerInner !== undefined
        ? createConfigPort({
            configManager: resolved.configManagerInner,
            appId,
            userId,
          })
        : undefined;

    return {
      runtime: resolved.runtime,
      configManager: resolved.configManager,
      configPort,
      data: resolved.data,
      storageFactory,
      theme,
      setTheme: resolved.runtime.setTheme.bind(resolved.runtime),
      onThemeChanged: resolved.runtime.onThemeChanged.bind(resolved.runtime),
      hostForGrid: (scope) =>
        buildGridHostContext(resolved.runtime, storageFactory, scope, {
          data: resolved.data,
          config: configPort,
        }),
    };
  }, [resolved, persistence, appId, userId, theme]);

  if (!appState) return loading;

  return <StarGridAppProvider value={appState}>{children}</StarGridAppProvider>;
}
