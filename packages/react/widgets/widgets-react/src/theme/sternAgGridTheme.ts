/**
 * Stern AG Grid Themes — dark and light variants built on themeQuartz.
 *
 * Usage:
 *   import { sternDarkTheme, sternLightTheme } from '@starui/widgets-react';
 *   <AgGridReact theme={sternDarkTheme} ... />
 *
 * Or use the useAgGridTheme() hook for automatic dark/light switching:
 *   import { useAgGridTheme } from '@starui/widgets-react';
 *   const { theme } = useAgGridTheme();
 *   <AgGridReact theme={theme} ... />
 */

import { themeQuartz } from 'ag-grid-community';

export const sternDarkTheme = themeQuartz.withParams({
  backgroundColor: 'var(--ds-surface-primary)',
  borderRadius: 2,
  browserColorScheme: 'dark',
  chromeBackgroundColor: {
    ref: 'foregroundColor',
    mix: 0.07,
    onto: 'backgroundColor',
  },
  columnBorder: true,
  foregroundColor: 'var(--ds-text-primary)',
  oddRowBackgroundColor: 'var(--ds-surface-secondary)',
  spacing: 6,
  wrapperBorderRadius: 4,
});

export const sternLightTheme = themeQuartz.withParams({
  borderRadius: 2,
  browserColorScheme: 'light',
  columnBorder: true,
  headerFontFamily: {
    googleFont: 'IBM Plex Sans',
  },
  oddRowBackgroundColor: 'var(--ds-surface-secondary)',
  spacing: 6,
  wrapperBorderRadius: 4,
});
