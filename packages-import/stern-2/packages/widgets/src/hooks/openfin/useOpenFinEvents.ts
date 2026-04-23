/**
 * useOpenFinEvents — type-safe OpenFin IAB event subscription and broadcasting.
 */

import { useCallback, useMemo } from 'react';
import { iabService } from '@stern/openfin-platform';
import type { OpenFinEventMap, OpenFinEventHandler, UnsubscribeFunction } from '@stern/openfin-platform';

export interface UseOpenFinEventsReturn {
  on: <E extends keyof OpenFinEventMap>(event: E, handler: OpenFinEventHandler<E>) => UnsubscribeFunction;
  broadcast: <E extends keyof OpenFinEventMap>(event: E, data: OpenFinEventMap[E]) => Promise<void>;
  isOpenFin: boolean;
}

export function useOpenFinEvents(): UseOpenFinEventsReturn {
  const isOpenFin = typeof window !== 'undefined' && 'fin' in window;

  const on = useCallback(<E extends keyof OpenFinEventMap>(
    event: E,
    handler: OpenFinEventHandler<E>
  ): UnsubscribeFunction => {
    if (!isOpenFin) return () => {};
    return iabService.subscribe(event as string, (message) => {
      handler(message.payload as OpenFinEventMap[E]);
    });
  }, [isOpenFin]);

  const broadcast = useCallback(<E extends keyof OpenFinEventMap>(
    event: E,
    data: OpenFinEventMap[E]
  ): Promise<void> => {
    if (!isOpenFin) return Promise.resolve();
    return iabService.broadcast(event as string, data);
  }, [isOpenFin]);

  return useMemo(() => ({ on, broadcast, isOpenFin }), [on, broadcast, isOpenFin]);
}
