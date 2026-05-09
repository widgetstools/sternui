// ─────────────────────────────────────────────────────────────
//  AG Grid Theme Params — Chroma Desk
//  Plug into AG Grid 35+ via theme: themeQuartz.withParams(params).
// ─────────────────────────────────────────────────────────────

import { dark, light, type ColorScheme } from '../tokens/semantic';
import { typography } from '../tokens/primitives';

function gridParams(scheme: ColorScheme) {
  return {
    backgroundColor:   scheme.surface.primary,
    foregroundColor:   scheme.text.primary,
    headerBackgroundColor: scheme.surface.secondary,
    headerTextColor:       scheme.text.secondary,
    borderColor:           scheme.border.primary,
    rowHoverColor:         scheme.surface.secondary,
    selectedRowBackgroundColor: scheme.overlay.infoSoft,
    oddRowBackgroundColor: scheme.surface.primary,
    accentColor:           scheme.accent.info,
    fontFamily:            typography.fontFamily.sans,
    fontSize:              12,
    headerFontFamily:      typography.fontFamily.sans,
    headerFontWeight:      600,
    cellHorizontalPadding: 10,
    rowHeight:             28,
    headerHeight:          32,
  };
}

function blotterParams(scheme: ColorScheme) {
  return {
    ...gridParams(scheme),
    fontFamily:       typography.fontFamily.mono,
    headerFontFamily: typography.fontFamily.sans,
    rowHeight:        24,
    headerHeight:     28,
  };
}

export const agGridDarkParams         = gridParams(dark);
export const agGridLightParams        = gridParams(light);
export const agGridBlotterDarkParams  = blotterParams(dark);
export const agGridBlotterLightParams = blotterParams(light);
