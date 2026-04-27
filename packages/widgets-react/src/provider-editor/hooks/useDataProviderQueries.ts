/**
 * React Query hooks for Data Provider operations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DataProviderConfig, ProviderConfig } from '@marketsui/shared-types';
import { useToast } from '@marketsui/ui';
import { dataProviderConfigService } from '@marketsui/data-plane';

export const dataProviderKeys = {
  all: ['dataProviders'] as const,
  lists: () => [...dataProviderKeys.all, 'list'] as const,
  list: (userId: string) => [...dataProviderKeys.lists(), userId] as const,
  /** Public + private merged list, optionally subtype-filtered. */
  visible: (userId: string, subtype?: string) =>
    [...dataProviderKeys.lists(), 'visible', userId, subtype ?? 'all'] as const,
  details: () => [...dataProviderKeys.all, 'detail'] as const,
  detail: (id: string) => [...dataProviderKeys.details(), id] as const,
};

export function useDataProviders(userId: string) {
  return useQuery({
    queryKey: dataProviderKeys.list(userId),
    queryFn: () => dataProviderConfigService.getByUser(userId),
    enabled: !!userId,
  });
}

/**
 * Returns every provider visible to the given user — public rows
 * (stored under userId='system') plus the user's own private rows —
 * with optional `subtype` filter. Used by the DataProviderSelector.
 */
export function useVisibleDataProviders(
  userId: string,
  subtype?: ProviderConfig['providerType'],
) {
  return useQuery({
    queryKey: dataProviderKeys.visible(userId, subtype),
    queryFn: () => dataProviderConfigService.listVisible(userId, { subtype }),
    enabled: !!userId,
  });
}

export function useDataProvider(providerId: string | null) {
  return useQuery({
    queryKey: dataProviderKeys.detail(providerId || ''),
    queryFn: () => (providerId ? dataProviderConfigService.getById(providerId) : null),
    enabled: !!providerId,
  });
}

export function useCreateDataProvider() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ provider, userId }: { provider: DataProviderConfig; userId: string }) =>
      dataProviderConfigService.create(provider, userId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: dataProviderKeys.list(variables.userId) });
      toast({ title: 'Provider Created', description: 'Data provider created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Creation Failed', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateDataProvider() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({
      providerId,
      updates,
      userId,
    }: {
      providerId: string;
      updates: Partial<DataProviderConfig>;
      userId: string;
    }) => dataProviderConfigService.update(providerId, updates, userId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: dataProviderKeys.list(variables.userId) });
      queryClient.invalidateQueries({ queryKey: dataProviderKeys.detail(variables.providerId) });
      toast({ title: 'Provider Updated', description: 'Data provider updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Update Failed', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteDataProvider() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ providerId }: { providerId: string; userId: string }) =>
      dataProviderConfigService.delete(providerId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: dataProviderKeys.list(variables.userId) });
      toast({ title: 'Provider Deleted', description: 'Data provider deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Deletion Failed', description: error.message, variant: 'destructive' });
    },
  });
}
