import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
  isDark: true,
});

// IAB topic name. Kept as a local literal (rather than importing
// @marketsui/openfin-platform) because this context has to work in
// every window — including windows that don't bundle the platform
// package. Value must match IAB_THEME_CHANGED in dock.ts.
const IAB_THEME_CHANGED = 'theme-changed';

declare const fin: unknown;

/**
 * ThemeProvider — wraps the app and manages the `[data-theme]` attribute
 * on `<html>`. Persists the choice in `localStorage` under key `theme`.
 *
 * When running inside OpenFin, it also subscribes to the `theme-changed`
 * InterApplicationBus topic so that clicking the dock's theme toggle
 * flips every window's theme in sync, not just the provider window.
 *
 * Pattern mirrors `fi-trading-reference` and is documented in
 * `packages/design-system/README.md`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme');
    return stored === 'light' ? 'light' : 'dark';
  });

  // Apply theme on every change — locally + persist.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.dataset.agThemeMode = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Subscribe to the dock's theme-toggle IAB broadcast. No-op outside OpenFin.
  useEffect(() => {
    const finRef = (globalThis as unknown as { fin?: any }).fin;
    if (!finRef?.InterApplicationBus || !finRef?.me) return;

    let unsubscribed = false;
    const handler = (data: { isDark?: boolean }) => {
      if (unsubscribed) return;
      const next: Theme = data?.isDark === false ? 'light' : 'dark';
      setTheme(next);
    };

    finRef.InterApplicationBus
      .subscribe({ uuid: finRef.me.identity.uuid }, IAB_THEME_CHANGED, handler)
      .catch((err: unknown) => console.warn('IAB theme subscription failed', err));

    return () => {
      unsubscribed = true;
      finRef.InterApplicationBus
        .unsubscribe({ uuid: finRef.me.identity.uuid }, IAB_THEME_CHANGED, handler)
        .catch(() => { /* ignore */ });
    };
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
