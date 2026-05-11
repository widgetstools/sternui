// ─────────────────────────────────────────────────────────────
//  AG Grid Theme Params — FI Design System
//  Mirrors the fi-trading-terminal design-system reference and exports params for
//  AG Grid v31+ Theming API (themeQuartz.withParams(params)).
//
//  Density:
//    compact (standard) — rowHeight 28, headerHeight 32, fontSize 12
//    comfort            — rowHeight 36, headerHeight 40, fontSize 13
//    ultra (blotter)    — rowHeight 22, headerHeight 26, fontSize 11
// ─────────────────────────────────────────────────────────────

import { dark, light, type ColorScheme } from '../tokens/semantic';
import { typography } from '../tokens/primitives';

type Density = 'compact' | 'comfort' | 'ultra';

function gridParams(
  scheme: ColorScheme,
  mode: 'dark' | 'light',
  density: Density = 'compact',
) {
  const rowH    = density === 'ultra' ? 22 : density === 'comfort' ? 36 : 28;
  const headerH = density === 'ultra' ? 26 : density === 'comfort' ? 40 : 32;
  const fontPx  = density === 'ultra' ? 11 : density === 'comfort' ? 13 : 12;
  const spacing = density === 'ultra' ? 4 : density === 'comfort' ? 8 : 6;
  return {
    // Ensure browser-native UI (including scrollbars) matches the theme.
    browserColorScheme: mode,
    // ── Typography ──
    // Keep data cells monospace for tabular alignment, but render
    // headers in sans to match the original design-system reference.
    fontFamily:        typography.fontFamily.sans,
    fontSize:          fontPx,
    headerFontFamily:  typography.fontFamily.sans,
    headerFontSize:    Math.max(10, fontPx - 1),
    headerFontWeight:  600,
    cellFontFamily:    typography.fontFamily.mono,
    // ── Surfaces ──
    backgroundColor:        scheme.surface.primary,
    foregroundColor:        scheme.text.primary,
    chromeBackgroundColor:  scheme.surface.secondary,
    headerBackgroundColor:  scheme.surface.secondary,
    headerTextColor:        scheme.text.secondary,
    rowHoverColor:          scheme.surface.secondary,
    selectedRowBackgroundColor: scheme.primary.soft,
    // ── Borders & spacing ──
    borderColor:        scheme.border.primary,
    wrapperBorder:      false as const,
    headerColumnBorder: false as const,
    headerColumnResizeHandleColor: scheme.border.secondary,
    headerColumnResizeHandleHeight: '45%',
    headerColumnResizeHandleWidth: '1px',
    rowBorder:          { style: 'solid' as const, width: 1, color: scheme.border.primary },
    rowHeight:          rowH,
    headerHeight:       headerH,
    spacing,
    borderRadius:       2,
    // ── Focus ──
    inputFocusBorder:   { style: 'solid' as const, width: 1, color: scheme.primary.color },
    focusShadow:        `0 0 0 2px ${scheme.primary.ring}`,
    // ── Range / selection ──
    rangeSelectionBorderColor:     scheme.primary.color,
    rangeSelectionBackgroundColor: scheme.primary.soft,
    // ── Brand primary ──
    accentColor:        scheme.primary.color,
  };
}

export const agGridDarkParams         = gridParams(dark,  'dark',  'compact');
export const agGridLightParams        = gridParams(light, 'light', 'compact');
export const agGridComfortDarkParams  = gridParams(dark,  'dark',  'comfort');
export const agGridComfortLightParams = gridParams(light, 'light', 'comfort');
export const agGridBlotterDarkParams  = gridParams(dark,  'dark',  'ultra');
export const agGridBlotterLightParams = gridParams(light, 'light', 'ultra');
