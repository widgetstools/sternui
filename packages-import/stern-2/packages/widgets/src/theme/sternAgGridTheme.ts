/**
 * Stern AG Grid Themes — dark and light variants built on themeQuartz.
 *
 * Usage:
 *   import { sternDarkTheme, sternLightTheme } from '@stern/widgets';
 *   <AgGridReact theme={sternDarkTheme} ... />
 *
 * Or use the useAgGridTheme() hook for automatic dark/light switching:
 *   import { useAgGridTheme } from '@stern/widgets';
 *   const { theme } = useAgGridTheme();
 *   <AgGridReact theme={theme} ... />
 */

import { themeQuartz } from 'ag-grid-community';

export const sternDarkTheme = themeQuartz.withParams({
  backgroundColor: '#1f2836',
  borderRadius: 2,
  browserColorScheme: 'dark',
  chromeBackgroundColor: {
    ref: 'foregroundColor',
    mix: 0.07,
    onto: 'backgroundColor',
  },
  columnBorder: true,
  foregroundColor: '#FFF',
  oddRowBackgroundColor: '#1B2433',
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
  oddRowBackgroundColor: '#EEF4FF',
  spacing: 6,
  wrapperBorderRadius: 4,
});
