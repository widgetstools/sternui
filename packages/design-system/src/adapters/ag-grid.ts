// ─────────────────────────────────────────────────────────────
//  FI Design System — AG Grid Adapter
//  Exports raw param objects for light and dark modes.
//  Each app wraps them with themeQuartz.withParams() locally
//  (avoids importing ag-grid-community from the design system).
// ─────────────────────────────────────────────────────────────

import { dark, light, shared } from '../tokens/semantic';

// Note: AG-Grid v35 uses `headerTextColor` (not `headerForegroundColor`) and
// has no `rowBorderColor` equivalent — those were renamed/removed between
// v31 and v35. Keeping the adapter aligned with what the installed grid
// actually accepts.
export const agGridLightParams: Record<string, unknown> = {
  backgroundColor:            light.surface.primary,
  foregroundColor:            light.text.primary,
  headerBackgroundColor:      light.surface.secondary,
  headerTextColor:            light.text.secondary,
  oddRowBackgroundColor:      light.surface.ground,
  rowHoverColor:              light.surface.secondary,
  selectedRowBackgroundColor: light.overlay.infoSoft,
  borderColor:                light.border.primary,
  fontFamily:                 shared.typography.fontFamily.mono,
  fontSize:                   parseInt(shared.typography.fontSize.sm),
  headerFontSize:             parseInt(shared.typography.fontSize.xs) + 1,
  cellHorizontalPaddingScale: 0.6,
  wrapperBorder:              false,
  columnBorder:               false,
};

export const agGridDarkParams: Record<string, unknown> = {
  backgroundColor:            dark.surface.primary,
  foregroundColor:            dark.text.primary,
  headerBackgroundColor:      dark.surface.secondary,
  headerTextColor:            dark.text.secondary,
  oddRowBackgroundColor:      dark.surface.primary,
  rowHoverColor:              dark.surface.secondary,
  selectedRowBackgroundColor: dark.overlay.infoSoft,
  borderColor:                dark.border.primary,
  fontFamily:                 shared.typography.fontFamily.mono,
  fontSize:                   parseInt(shared.typography.fontSize.sm),
  headerFontSize:             parseInt(shared.typography.fontSize.xs) + 1,
  cellHorizontalPaddingScale: 0.6,
  wrapperBorder:              false,
  columnBorder:               false,
};
