// ─────────────────────────────────────────────────────────────
//  AG Grid Theme Params — Chroma Desk
//  Mirrors the reference buildAgGridTheme from
//  Markets Design System-latest/showcase.jsx — exports params for
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
    selectedRowBackgroundColor: scheme.overlay.infoSoft,
    // ── Borders & spacing ──
    borderColor:        scheme.border.primary,
    wrapperBorder:      false as const,
    headerColumnBorder: { style: 'solid' as const, width: 1, color: scheme.border.primary },
    rowBorder:          { style: 'solid' as const, width: 1, color: scheme.border.primary },
    rowHeight:          rowH,
    headerHeight:       headerH,
    spacing,
    borderRadius:       2,
    // ── Focus ──
    inputFocusBorder:   { style: 'solid' as const, width: 1, color: scheme.state.focusRing },
    focusShadow:        `0 0 0 2px ${scheme.overlay.infoRing}`,
    // ── Range / selection ──
    rangeSelectionBorderColor:     scheme.accent.info,
    rangeSelectionBackgroundColor: scheme.overlay.infoSoft,
    // ── Brand accent ──
    accentColor:        scheme.accent.info,
  };
}

export const agGridDarkParams         = gridParams(dark,  'dark',  'compact');
export const agGridLightParams        = gridParams(light, 'light', 'compact');
export const agGridComfortDarkParams  = gridParams(dark,  'dark',  'comfort');
export const agGridComfortLightParams = gridParams(light, 'light', 'comfort');
export const agGridBlotterDarkParams  = gridParams(dark,  'dark',  'ultra');
export const agGridBlotterLightParams = gridParams(light, 'light', 'ultra');
