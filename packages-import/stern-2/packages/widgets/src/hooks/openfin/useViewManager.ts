/**
 * useViewManager — React hook for creating and managing OpenFin views.
 */

import { useCallback, useState, useEffect } from 'react';
import { platformContext } from '@stern/openfin-platform';
import type { ViewInstance, CreateViewOptions } from '@stern/openfin-platform';

export type { ViewInstance, CreateViewOptions };

export interface UseViewManagerReturn {
  createView: (options: CreateViewOptions) => Promise<{ view: any; instance: ViewInstance }>;
  getViews: () => Promise<ViewInstance[]>;
  getView: (viewId: string) => Promise<ViewInstance | null>;
  deleteView: (viewId: string) => Promise<void>;
  views: ViewInstance[];
  isLoading: boolean;
  error: Error | null;
  refreshViews: () => Promise<void>;
}

export function useViewManager(): UseViewManagerReturn {
  const [views, setViews] = useState<ViewInstance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadViews = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const instances = await platformContext.viewManager?.getViewInstances() || [];
      setViews(instances);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load views'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createView = useCallback(async (options: CreateViewOptions) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await platformContext.viewManager?.createView(options);
      if (!result) throw new Error('Failed to create view');
      await loadViews();
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create view');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [loadViews]);

  const getViews = useCallback(async () => {
    return await platformContext.viewManager?.getViewInstances() || [];
  }, []);

  const getView = useCallback(async (viewId: string) => {
    return await platformContext.viewManager?.getViewInstance(viewId) || null;
  }, []);

  const deleteView = useCallback(async (viewId: string) => {
    setIsLoading(true);
    try {
      await platformContext.viewManager?.deleteViewInstance(viewId);
      await loadViews();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to delete view'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [loadViews]);

  useEffect(() => { loadViews(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { createView, getViews, getView, deleteView, views, isLoading, error, refreshViews: loadViews };
}
