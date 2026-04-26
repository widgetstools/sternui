/**
 * useDataPlaneRestart — returns a stable callback that triggers
 * `DataPlaneClient.restart(providerId, extra)`.
 *
 * Existing subscribers (any consumer holding a `useDataPlaneRowStream`
 * or `useDataPlaneValue` for the same provider) stay attached and
 * receive the fresh snapshot through their existing event stream —
 * the hook is fire-and-forget for the UI side.
 *
 * Common consumer: a MarketsGrid in historical mode, where the
 * toolbar's date picker fires
 *   `restart({ asOfDate: '2026-04-01' })`
 * to re-fetch the historical snapshot for the chosen date.
 */
import { useCallback } from 'react';
import { useDataPlaneClient } from './context';

export interface UseRestartResult {
  restart: (extra?: Record<string, unknown>) => Promise<void>;
}

export function useDataPlaneRestart(providerId: string): UseRestartResult {
  const client = useDataPlaneClient();

  const restart = useCallback(
    async (extra?: Record<string, unknown>) => {
      await client.restart(providerId, extra);
    },
    [client, providerId],
  );

  return { restart };
}
