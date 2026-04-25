/**
 * useDataPlaneAppData — AppData-specific ergonomics around
 * `useDataPlaneValue`.
 *
 * Returns `[value, setValue]` (mirroring `useState`) so components
 * can treat an AppData key as a shared mutable cell without ever
 * touching the client directly. `setValue` is stable across renders
 * and issues a `client.put` behind the scenes; the resulting `update`
 * broadcast flows back through the subscription and updates `value`.
 *
 * Typical use: the backbone of `{{app1.token1}}`-style template
 * bindings — a text input reads `value` from the hook, calls
 * `setValue` on change, and every other component subscribed to
 * `('app1', 'token1')` sees the new value in the next tick.
 */

import { useCallback, useMemo } from 'react';
import type { DataPlaneClientError } from '@marketsui/data-plane/client';
import { useDataPlaneClient } from './context';
import { useDataPlaneValue } from './useDataPlaneValue';

export type SetAppDataValue<T> = (next: T) => Promise<void>;

export interface UseAppDataResult<T> {
  value: T | undefined;
  setValue: SetAppDataValue<T>;
  isLoading: boolean;
  error: DataPlaneClientError | null;
}

export function useDataPlaneAppData<T = unknown>(
  providerId: string,
  key: string,
): UseAppDataResult<T> {
  const client = useDataPlaneClient();
  const { value, isLoading, error } = useDataPlaneValue<T>(providerId, key);

  const setValue = useCallback<SetAppDataValue<T>>(
    async (next) => {
      await client.put(providerId, key, next);
    },
    [client, providerId, key],
  );

  return useMemo(() => ({ value, setValue, isLoading, error }), [value, setValue, isLoading, error]);
}
