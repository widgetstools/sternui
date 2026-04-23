/**
 * useOpenfinTheme — listens to theme changes from OpenFin Dock and applies to DOM.
 * One-way: Dock → Components (never Components → Dock).
 */

import { useEffect } from 'react';
import { OpenFinCustomEvents } from '@stern/openfin-platform';
import { platformContext } from '@stern/openfin-platform';

export function useOpenfinTheme() {
  // Listen for theme change events from dock via IAB
  useEffect(() => {
    if (typeof window === 'undefined' || !window.fin) return;

    const topic = OpenFinCustomEvents.THEME_CHANGE;
    const listener = (message: any, _identity: any) => {
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(message.theme);
      if (document.body) {
        document.body.dataset.agThemeMode = message.theme;
      }
    };

    fin.InterApplicationBus.subscribe({ uuid: '*' }, topic, listener);
    return () => { fin.InterApplicationBus.unsubscribe({ uuid: '*' }, topic, listener); };
  }, []);

  // Sync initial theme from OpenFin platform on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !window.fin) return;

    const syncInitialTheme = async () => {
      try {
        const { getCurrentSync } = await import('@openfin/workspace-platform');
        const platformInstance = getCurrentSync();
        const currentScheme = await platformInstance.Theme.getSelectedScheme();
        if (currentScheme && (currentScheme === 'light' || currentScheme === 'dark')) {
          const root = document.documentElement;
          root.classList.remove('light', 'dark');
          root.classList.add(currentScheme);
          if (document.body) document.body.dataset.agThemeMode = currentScheme;
        }
      } catch (error) {
        platformContext.logger.warn('Could not get initial platform theme', error, 'useOpenfinTheme');
      }
    };
    syncInitialTheme();
  }, []);
}
