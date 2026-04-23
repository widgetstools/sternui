import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SettingsScreenContext } from '../types/settings.js';
import type { WidgetConfig } from '../types/widget.js';
import { useWidgetHost } from '../providers/WidgetHost.js';

/**
 * useSettingsScreen() — hook for config screen components.
 * Reads parent identity from URL search params, loads parent config,
 * and provides save/close operations.
 */
export function useSettingsScreen(): SettingsScreenContext {
  const { userId, configClient, platform } = useWidgetHost();
  const queryClient = useQueryClient();

  // Parse parent identity from URL
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const parentConfigId = params.get('parentConfigId') || '';
  const parentInstanceId = params.get('parentInstanceId') || '';
  const parentViewId = params.get('parentViewId') || '';

  // Parse launch data
  const launchData = useMemo(() => {
    try {
      const dataParam = params.get('data');
      if (dataParam) return JSON.parse(atob(dataParam));
    } catch {
      // Invalid data
    }
    return null;
  }, [params]);

  // Load parent config
  const {
    data: config,
    isLoading,
    error
  } = useQuery({
    queryKey: ['config', parentConfigId],
    queryFn: () => configClient.getById(parentConfigId),
    enabled: !!parentConfigId
  });

  const configSource = config?.isInherited ? 'inherited' as const : 'own' as const;
  const inheritedFrom = config?.sourceNodePath;

  const saveConfig = useCallback(async (updates: Partial<WidgetConfig>) => {
    await configClient.update(parentConfigId, updates);
    queryClient.invalidateQueries({ queryKey: ['config', parentConfigId] });

    // Notify parent via broadcast
    platform.broadcast('settings-saved', {
      parentConfigId,
      parentInstanceId,
      updates
    });
  }, [parentConfigId, parentInstanceId, configClient, queryClient, platform]);

  const close = useCallback((result?: unknown) => {
    // Send result back to parent via BroadcastChannel
    platform.broadcast('settings-result', {
      type: 'settings-result',
      targetId: parentInstanceId,
      result
    });

    // Close the window
    window.close();
  }, [parentInstanceId, platform]);

  const forkAndSave = useCallback(async (updates: Partial<WidgetConfig>, newName?: string) => {
    if (!config?.nodeId) {
      throw new Error('Cannot fork: config has no nodeId');
    }

    // Fork the config
    const forked = await configClient.forkConfig(parentConfigId, config.nodeId, userId, newName);

    // Apply updates to the forked config
    await configClient.update(forked.configId, updates);

    // Notify parent
    platform.broadcast('settings-forked', {
      parentConfigId,
      parentInstanceId,
      newConfigId: forked.configId
    });
  }, [parentConfigId, parentInstanceId, config, userId, configClient, platform]);

  return {
    parentConfigId,
    parentInstanceId,
    parentViewId,

    config: config || null,
    isLoading,
    error: error as Error | null,

    saveConfig,
    close,
    launchData,

    configSource,
    inheritedFrom,
    forkAndSave
  };
}
