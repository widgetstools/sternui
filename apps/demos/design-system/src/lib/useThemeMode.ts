import { useCallback, useState } from 'react';
import { applyTheme, getTheme } from '@starui/design-system';

/** Tracks the active theme mode and toggles dark↔light via the design system. */
export function useThemeMode() {
  const [mode, setMode] = useState<'dark' | 'light'>(() => getTheme().theme as 'dark' | 'light');
  const toggle = useCallback(() => {
    const next: 'dark' | 'light' = mode === 'dark' ? 'light' : 'dark';
    applyTheme({ theme: next });
    setMode(next);
  }, [mode]);
  return { mode, toggle };
}
