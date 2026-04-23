/**
 * useAgGridTheme — returns the correct Stern AG Grid theme based on the current
 * dark/light mode from next-themes.
 *
 * Usage:
 *   const { theme } = useAgGridTheme();
 *   <AgGridReact theme={theme} ... />
 */

import { useMemo } from 'react';
import { useTheme } from '@marketsui/ui';
import { sternDarkTheme, sternLightTheme } from './sternAgGridTheme.js';

export function useAgGridTheme() {
  const { resolvedTheme } = useTheme();

  const theme = useMemo(
    () => (resolvedTheme === 'light' ? sternLightTheme : sternDarkTheme),
    [resolvedTheme]
  );

  return { theme };
}
