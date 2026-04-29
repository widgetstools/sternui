import { useEffect, useImperativeHandle, useRef, type ForwardedRef } from 'react';
import type { GridApi } from 'ag-grid-community';
import type { GridPlatform, UseProfileManagerResult } from '@marketsui/core';
import type { MarketsGridHandle } from '../types';

/**
 * Build the imperative handle exposed via `forwardRef` and fire `onReady`
 * exactly once when the handle is first populated.
 *
 * The handle becomes non-null when AG-Grid's `onGridReady` has fired (api
 * becomes non-null), which in turn has already let GridPlatform run the
 * module pipeline including the active-profile apply. Consumers reading
 * `ref.current` before that see `null`; after, they see the stable
 * handle.
 *
 * `onReady` fires exactly once per mount.
 *
 * Extracted verbatim from `MarketsGrid.Host` during Phase C-3.
 */
export function useImperativeMarketsGridHandle({
  forwardedRef,
  api,
  platform,
  profiles,
  onReady,
}: {
  forwardedRef: ForwardedRef<MarketsGridHandle>;
  api: GridApi | null;
  platform: GridPlatform;
  profiles: UseProfileManagerResult;
  onReady: ((handle: MarketsGridHandle) => void) | undefined;
}): void {
  const handleRef = useRef<MarketsGridHandle | null>(null);
  handleRef.current = api ? { gridApi: api, platform, profiles } : null;

  useImperativeHandle(
    forwardedRef,
    () => handleRef.current as MarketsGridHandle,
    [api, platform, profiles],
  );

  const readyFiredRef = useRef(false);
  useEffect(() => {
    if (!readyFiredRef.current && handleRef.current) {
      readyFiredRef.current = true;
      // eslint-disable-next-line no-console
      console.log(`[v2/markets-grid] handle delivered to onReady (gridApi alive — consumer can now subscribe)`);
      onReady?.(handleRef.current);
    }
  }, [api, onReady]);
}
