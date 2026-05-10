/**
 * Stern AG Grid Themes — dark and light variants built on themeQuartz.
 *
 * Surface / border / focus / range / accent colors flow from the design-system
 * adapter (agGridDarkParams / agGridLightParams). Only app-specific geometry
 * (borderRadius, columnBorder, spacing, wrapperBorderRadius) is overridden here.
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
import { agGridDarkParams, agGridLightParams } from '@starui/design-system/adapters/ag-grid';

// App-specific geometry — surfaces/borders/focus/range/accent come from the adapter.
const sternOverrides = {
  borderRadius:       2,
  columnBorder:       true,
  spacing:            6,
  wrapperBorderRadius: 4,
};

export const sternDarkTheme  = themeQuartz.withParams({ ...agGridDarkParams,  ...sternOverrides });
export const sternLightTheme = themeQuartz.withParams({ ...agGridLightParams, ...sternOverrides });
