import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Single source of truth for the operator's currently-selected app
 * scope. Lifted into context so:
 *
 *   - The top-of-shell `<AppSelector>` can read/write it (header).
 *   - Per-app views (`AppConfigList`, the user-profiles gate) can read
 *     it without prop-drilling.
 *   - Drill-down buttons elsewhere (e.g. `AppsOverview`'s "Open configs"
 *     row action) can SET it before navigating, so the configs page
 *     opens already scoped to the right app.
 *
 * Kept intentionally tiny: just `{ appId, setAppId }`. No persistence
 * or URL syncing yet — operators rarely deep-link, and adding URL
 * sync touches every consumer. If a real bookmarking story lands, this
 * is the one file to update.
 */

interface AppScope {
  appId: string | null;
  setAppId: (next: string | null) => void;
}

const AppScopeCtx = createContext<AppScope | null>(null);

export function AppScopeProvider({ children }: { children: ReactNode }) {
  const [appId, setAppIdState] = useState<string | null>(null);

  const setAppId = useCallback((next: string | null) => {
    setAppIdState(next);
  }, []);

  const value = useMemo<AppScope>(() => ({ appId, setAppId }), [appId, setAppId]);

  return <AppScopeCtx.Provider value={value}>{children}</AppScopeCtx.Provider>;
}

export function useAppScope(): AppScope {
  const ctx = useContext(AppScopeCtx);
  if (!ctx) {
    throw new Error('useAppScope must be used within <AppScopeProvider>');
  }
  return ctx;
}
