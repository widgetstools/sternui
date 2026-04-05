// ─────────────────────────────────────────────────────────────
//  FI Design System — AG Grid Adapter
//  Exports raw param objects for light and dark modes.
//  Each app wraps them with themeQuartz.withParams() locally
//  (avoids importing ag-grid-community from the design system).
// ─────────────────────────────────────────────────────────────

import { dark, light, shared } from '../tokens/semantic';

export const agGridLightParams: Record<string, unknown> = {
  backgroundColor:          light.surface.primary,
  foregroundColor:           light.text.primary,
  headerBackgroundColor:     light.surface.secondary,
  headerForegroundColor:     light.text.secondary,
  oddRowBackgroundColor:     '#fafafa',
  rowHoverColor:             light.surface.secondary,
  selectedRowBackgroundColor:'rgba(14,203,129,0.08)',
  borderColor:               light.border.primary,
  rowBorderColor:            `${light.border.primary}99`,
  fontFamily:                shared.typography.fontFamily.mono,
  fontSize:                  parseInt(shared.typography.fontSize.sm),
  headerFontSize:            parseInt(shared.typography.fontSize.xs) + 1,
  cellHorizontalPaddingScale: 0.6,
  wrapperBorder:             false,
  columnBorder:              false,
};

export const agGridDarkParams: Record<string, unknown> = {
  backgroundColor:          dark.surface.primary,
  foregroundColor:           dark.text.primary,
  headerBackgroundColor:     dark.surface.secondary,
  headerForegroundColor:     dark.text.secondary,
  oddRowBackgroundColor:     dark.surface.primary,
  rowHoverColor:             dark.surface.secondary,
  selectedRowBackgroundColor:`${dark.accent.warning}14`,
  borderColor:               dark.border.primary,
  rowBorderColor:            `${dark.border.primary}99`,
  fontFamily:                shared.typography.fontFamily.mono,
  fontSize:                  parseInt(shared.typography.fontSize.sm),
  headerFontSize:            parseInt(shared.typography.fontSize.xs) + 1,
  cellHorizontalPaddingScale: 0.6,
  wrapperBorder:             false,
  columnBorder:              false,
};
