/**
 * @markets/component-host/react
 *
 * React hook for the component-host lifecycle.
 *
 * Usage:
 *   import { useComponentHost } from '@markets/component-host/react';
 *
 *   function MyBlotter() {
 *     const { config, saveConfig, theme, isLoading } = useComponentHost<BlotterConfig>();
 *     if (isLoading) return <Spinner />;
 *     return <Grid config={config} onColumnChange={(cols) => saveConfig({ columns: cols })} />;
 *   }
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  readCustomData,
  resolveInstanceId,
  buildFallbackIdentity,
  subscribeToTheme,
  getCurrentTheme,
  onCloseRequested,
  createDebouncedSaver,
  type ComponentHostOptions,
  type ComponentHostState,
  type AppConfigRow,
  type DebouncedSaver,
} from "../src";
import { getConfigManager } from "@markets/openfin-workspace";

/**
 * React hook that resolves component identity, loads config from the
 * config service, subscribes to theme changes, and provides a debounced
 * saveConfig function.
 *
 * Follows React best practices:
 *   - Single useEffect with async init + cancelled flag
 *   - Refs for mutable state to avoid stale closures
 *   - Stable saveConfig via useCallback (safe to pass as prop)
 *   - Full cleanup on unmount (theme, close-requested, saver)
 */
export function useComponentHost<T = unknown>(
  options?: ComponentHostOptions,
): ComponentHostState<T> & { saveConfig: (partial: Partial<T>) => void } {
  const [state, setState] = useState<ComponentHostState<T>>({
    instanceId: "",
    config: null,
    theme: options?.defaultTheme ?? "dark",
    isLoading: true,
    isSaved: false,
    error: null,
  });

  // Refs to hold mutable state without triggering re-renders.
  // The saver and row are accessed by saveConfig (stable callback)
  // and by the close-requested handler (flush on shutdown).
  const saverRef = useRef<DebouncedSaver<T> | null>(null);
  const rowRef = useRef<AppConfigRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubTheme: (() => void) | undefined;
    let unsubClose: (() => void) | undefined;

    async function init() {
      try {
        // Step 1: Read identity from OpenFin (or use fallback in dev mode)
        const customData = await readCustomData();
        const identity = customData ?? buildFallbackIdentity();

        // Step 2: Get ConfigManager singleton and resolve config
        const configManager = await getConfigManager();
        const { config: row, isNew } = await resolveInstanceId(identity, configManager);

        if (cancelled) return;
        rowRef.current = row;

        // Step 3: Read current theme
        const currentTheme = await getCurrentTheme(options?.defaultTheme);

        // Step 4: Create debounced saver
        saverRef.current = createDebouncedSaver<T>(
          identity.instanceId,
          configManager,
          () => rowRef.current,
          options?.debounceMs ?? 300,
        );

        // Step 5: Subscribe to theme changes via IAB
        unsubTheme = await subscribeToTheme((theme) => {
          if (!cancelled) setState((s) => ({ ...s, theme }));
        });
        // If unmounted during subscribe, clean up immediately
        if (cancelled) { unsubTheme?.(); return; }

        // Step 6: Subscribe to close-requested for flush
        unsubClose = await onCloseRequested(async () => {
          await saverRef.current?.flush();
        });
        // If unmounted during subscribe, clean up both
        if (cancelled) { unsubTheme?.(); unsubClose?.(); return; }

        // All done — update state
        setState({
          instanceId: identity.instanceId,
          config: row ? (row.config as T) : null,
          theme: currentTheme,
          isLoading: false,
          isSaved: !isNew,
          error: null,
        });
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            isLoading: false,
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      }
    }

    init();

    // Cleanup: unsubscribe all listeners and cancel pending saves
    return () => {
      cancelled = true;
      unsubTheme?.();
      unsubClose?.();
      saverRef.current?.cancel();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Intentionally empty deps: init runs once at mount. Options are read
  // once — callers must pass a stable ref (useMemo) to change them.

  /**
   * Save a partial config update. Debounced at 300ms (configurable).
   *
   * This is a stable reference (useCallback with no deps) so it can
   * safely be passed as a prop to child components without causing
   * unnecessary re-renders.
   */
  const saveConfig = useCallback((partial: Partial<T>) => {
    if (!saverRef.current || !rowRef.current) return;

    // Optimistic local state update — UI reflects change immediately
    setState((s) => ({
      ...s,
      config: s.config ? { ...s.config, ...partial } : (partial as T),
      isSaved: true,
    }));

    // Merge into row ref so the saver always has the latest
    rowRef.current = {
      ...rowRef.current,
      config: { ...rowRef.current.config, ...partial },
    };

    // Queue the debounced write
    saverRef.current.save(partial);
  }, []);

  return { ...state, saveConfig };
}
