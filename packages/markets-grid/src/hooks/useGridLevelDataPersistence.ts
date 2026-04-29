import { useEffect, useRef } from 'react';
import type { StorageAdapter } from '@marketsui/core';

/**
 * Loads gridLevelData once on mount via `adapter.loadGridLevelData(gridId)`,
 * delivers the result via `onGridLevelDataLoad`, then watches the
 * `gridLevelData` prop for outgoing changes and persists them via
 * `adapter.saveGridLevelData(gridId, value)`.
 *
 * Optional adapter method (`loadGridLevelData?` / `saveGridLevelData?`) —
 * when missing, both reads and writes silently no-op so older third-party
 * adapters keep working.
 *
 * The `lastPersistedRef` comparison handles two edge cases:
 *   1. React StrictMode's double-effect fires the persist effect on the
 *      second setup with the just-loaded value still in the prop.
 *      Without the comparison we'd write that value back to disk on
 *      mount.
 *   2. Round-trips A → B → A still emit, because each transition differs
 *      from the previously-persisted snapshot.
 *
 * `gridId` is captured once on mount; the load effect deliberately does
 * NOT depend on the prop or callback (both bridged via refs).
 *
 * Extracted verbatim from `MarketsGrid.Host` during Phase C-3.
 */
export function useGridLevelDataPersistence({
  gridId,
  gridLevelData,
  onGridLevelDataLoad,
  adapter,
}: {
  gridId: string;
  gridLevelData: unknown;
  onGridLevelDataLoad: ((data: unknown) => void) | undefined;
  adapter: StorageAdapter | null;
}): void {
  const onGridLevelDataLoadRef = useRef(onGridLevelDataLoad);
  useEffect(() => {
    onGridLevelDataLoadRef.current = onGridLevelDataLoad;
  }, [onGridLevelDataLoad]);

  const lastPersistedRef = useRef<unknown>(undefined);
  const initialLoadRef = useRef(false);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    if (!adapter?.loadGridLevelData) {
      // eslint-disable-next-line no-console
      console.log(`[v2/markets-grid] gridLevelData: adapter has no loadGridLevelData method (using null)`);
      lastPersistedRef.current = null;
      onGridLevelDataLoadRef.current?.(null);
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`[v2/markets-grid] gridLevelData: load → adapter.loadGridLevelData(%s)`, gridId);
    let cancelled = false;
    void adapter
      .loadGridLevelData(gridId)
      .then((loaded) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.log(`[v2/markets-grid] gridLevelData: loaded`, loaded);
        lastPersistedRef.current = loaded;
        onGridLevelDataLoadRef.current?.(loaded);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn(`[v2/markets-grid] gridLevelData: load failed`, err);
        lastPersistedRef.current = null;
        onGridLevelDataLoadRef.current?.(null);
      });
    return () => {
      cancelled = true;
    };
    // gridId is stable per-mount; we deliberately don't depend on the
    // prop or the load-callback (both captured via refs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Skip until the initial load has resolved — otherwise the first
    // render's `gridLevelData` prop (typically `null`/`undefined`)
    // would race the load and clobber persisted state.
    if (!initialLoadRef.current) return;
    if (lastPersistedRef.current === gridLevelData) return;
    if (!adapter?.saveGridLevelData) return;
    // eslint-disable-next-line no-console
    console.log(`[v2/markets-grid] gridLevelData: save`, gridLevelData);
    lastPersistedRef.current = gridLevelData;
    void adapter.saveGridLevelData(gridId, gridLevelData);
  }, [gridLevelData, gridId, adapter]);
}
