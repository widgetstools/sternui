/**
 * useOpenFinThemeSync — bridges OpenFin platform theme events into next-themes.
 *
 * When running inside OpenFin:
 *  1. On mount, reads the current DOM class (set by dock JS injection) for instant sync
 *  2. Falls back to querying platform.Theme.getSelectedScheme()
 *  3. Listens for IAB THEME_CHANGE events (fired by dock toggle-theme action)
 *  4. Calls next-themes setTheme() so CSS variables + React context update together
 *  5. Sets body dataset for AG Grid theme mode
 *
 * When running in a browser, this is a no-op.
 */

import { useEffect } from 'react';
import { useTheme } from '@stern/ui';

const THEME_CHANGE_TOPIC = 'stern-platform:theme-change';

function applyTheme(theme: 'light' | 'dark', setTheme: (t: string) => void) {
  setTheme(theme);
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.setAttribute('data-theme', theme);
  if (document.body) document.body.dataset.agThemeMode = theme;
}

export function useOpenFinThemeSync() {
  const { setTheme } = useTheme();

  // Sync initial theme from DOM class or platform (runs once on mount)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.fin) return;

    // First: check if the dock already injected a theme class (synchronous, no flash)
    const root = document.documentElement;
    if (root.classList.contains('dark')) {
      applyTheme('dark', setTheme);
      return;
    }
    if (root.classList.contains('light')) {
      applyTheme('light', setTheme);
      return;
    }

    // Fallback: query the platform for the current scheme
    const syncFromPlatform = async () => {
      try {
        const { getCurrentSync } = await import('@openfin/workspace-platform');
        const platform = getCurrentSync();
        const scheme = await platform.Theme.getSelectedScheme();
        // 'system' or anything other than 'light' → default to 'dark'
        const theme = (scheme as string) === 'light' ? 'light' : 'dark';
        applyTheme(theme, setTheme);
      } catch {
        // Platform not ready — default to dark (matches our init config)
        applyTheme('dark', setTheme);
      }
    };
    syncFromPlatform();
  }, [setTheme]);

  // Listen for IAB theme change events from the dock
  useEffect(() => {
    if (typeof window === 'undefined' || !window.fin) return;

    const listener = (message: { theme: 'light' | 'dark' }) => {
      applyTheme(message.theme, setTheme);
    };

    fin.InterApplicationBus.subscribe({ uuid: '*' }, THEME_CHANGE_TOPIC, listener);
    return () => {
      fin.InterApplicationBus.unsubscribe({ uuid: '*' }, THEME_CHANGE_TOPIC, listener).catch(() => {});
    };
  }, [setTheme]);
}
