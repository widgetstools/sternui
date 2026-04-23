import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LayoutInfo } from '@stern/shared-types';
import type { WidgetContext, WidgetConfig } from '../types/widget.js';
import { useWidgetHost } from '../providers/WidgetHost.js';

/**
 * useWidget(configId) — the main hook for all widget components.
 * Fetches config, manages layouts, wires lifecycle, and exposes platform communication.
 */
export function useWidget(configId: string): WidgetContext {
  const { userId, platform, configClient } = useWidgetHost();
  const queryClient = useQueryClient();

  const instanceId = useMemo(() => platform.getInstanceId(), [platform]);
  const launchData = useMemo(() => platform.getLaunchData(), [platform]);

  // ─── Config Query ──────────────────────────────────
  const {
    data: config,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['config', configId],
    queryFn: () => configClient.getById(configId),
    enabled: !!configId
  });

  // ─── Layouts ───────────────────────────────────────
  const {
    data: layouts = []
  } = useQuery({
    queryKey: ['layouts', configId],
    queryFn: () => configClient.getLayouts(configId),
    enabled: !!configId
  });

  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);

  const activeLayout = useMemo(
    () => layouts.find(l => l.id === activeLayoutId) || null,
    [layouts, activeLayoutId]
  );

  // ─── Lifecycle handlers ────────────────────────────
  const saveHandlersRef = useRef<Array<() => Promise<void> | void>>([]);
  const destroyHandlersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    const unsubSave = platform.onPlatformSave(async () => {
      for (const handler of saveHandlersRef.current) {
        await handler();
      }
    });

    const unsubDestroy = platform.onPlatformDestroy(() => {
      for (const handler of destroyHandlersRef.current) {
        handler();
      }
    });

    return () => {
      unsubSave();
      unsubDestroy();
    };
  }, [platform]);

  // ─── Config Operations ─────────────────────────────
  const updateConfig = useCallback(async (updates: Partial<WidgetConfig>) => {
    await configClient.update(configId, updates);
    queryClient.invalidateQueries({ queryKey: ['config', configId] });
  }, [configId, configClient, queryClient]);

  const saveConfig = useCallback(async (fullConfig?: WidgetConfig) => {
    if (fullConfig) {
      await configClient.update(configId, fullConfig);
    } else if (config) {
      await configClient.update(configId, config);
    }
    queryClient.invalidateQueries({ queryKey: ['config', configId] });
  }, [configId, config, configClient, queryClient]);

  const refetchConfig = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // ─── Hierarchy Operations ──────────────────────────
  const configSource = config?.isInherited ? 'inherited' as const : 'own' as const;
  const inheritedFrom = config?.sourceNodePath;

  const forkConfig = useCallback(async (newName?: string): Promise<WidgetConfig> => {
    if (!config?.nodeId) {
      throw new Error('Cannot fork: config has no nodeId');
    }
    const forked = await configClient.forkConfig(configId, config.nodeId, userId, newName);
    return forked;
  }, [configId, config, userId, configClient]);

  const promoteConfig = useCallback(async (targetNodePath: string) => {
    await configClient.promoteConfig(configId, targetNodePath, userId);
  }, [configId, userId, configClient]);

  // ─── Layout Operations ─────────────────────────────
  const saveLayout = useCallback(async (name: string, state: unknown): Promise<LayoutInfo> => {
    const layout = await configClient.saveLayout(configId, name, state, userId, config?.appId || 'default-app');
    queryClient.invalidateQueries({ queryKey: ['layouts', configId] });
    return layout;
  }, [configId, userId, config, configClient, queryClient]);

  const loadLayout = useCallback(async (layoutId: string): Promise<unknown> => {
    const state = await configClient.loadLayout(layoutId);
    setActiveLayoutId(layoutId);
    return state;
  }, [configClient]);

  const deleteLayout = useCallback(async (layoutId: string) => {
    await configClient.deleteLayout(layoutId);
    if (activeLayoutId === layoutId) {
      setActiveLayoutId(null);
    }
    queryClient.invalidateQueries({ queryKey: ['layouts', configId] });
  }, [configId, activeLayoutId, configClient, queryClient]);

  const setActiveLayout = useCallback((layoutId: string) => {
    setActiveLayoutId(layoutId);
  }, []);

  // ─── Lifecycle ─────────────────────────────────────
  const onSave = useCallback((handler: () => Promise<void> | void) => {
    saveHandlersRef.current.push(handler);
  }, []);

  const onDestroy = useCallback((handler: () => void) => {
    destroyHandlersRef.current.push(handler);
  }, []);

  // ─── Communication ─────────────────────────────────
  const open = useCallback(async (widgetType: string, data?: Record<string, unknown>) => {
    await platform.openWidget(widgetType, data);
  }, [platform]);

  const broadcast = useCallback((topic: string, data: unknown) => {
    platform.broadcast(topic, data);
  }, [platform]);

  const subscribe = useCallback((topic: string, handler: (data: unknown) => void) => {
    return platform.subscribe(topic, handler);
  }, [platform]);

  // ─── Settings ──────────────────────────────────────
  const openSettings = useCallback(async (screenId: string, data?: Record<string, unknown>) => {
    await platform.openSettingsScreen(screenId, {
      configId,
      instanceId,
      viewId: instanceId
    }, data);
  }, [platform, configId, instanceId]);

  return {
    id: instanceId,
    configId,
    isOpenFin: platform.isOpenFin,

    config: config || null,
    isLoading,
    error: error as Error | null,
    updateConfig,
    saveConfig,
    refetchConfig,

    configSource,
    inheritedFrom,
    forkConfig,
    promoteConfig,

    layouts,
    activeLayout,
    saveLayout,
    loadLayout,
    deleteLayout,
    setActiveLayout,

    onSave,
    onDestroy,

    open,
    broadcast,
    subscribe,
    launchData,

    openSettings,
    platform
  };
}
