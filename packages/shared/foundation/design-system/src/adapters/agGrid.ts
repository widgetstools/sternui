// ─────────────────────────────────────────────────────────────
//  AG Grid Theme Params — Chroma Desk
//  Mirrors the reference buildAgGridTheme from
//  Markets Design System-latest/showcase.jsx — exports params for
//  AG Grid v31+ Theming API (themeQuartz.withParams(params)).
//
//  Density:
//    compact (standard) — rowHeight 28, headerHeight 32, fontSize 12
//    ultra (blotter)    — rowHeight 22, headerHeight 26, fontSize 11
// ─────────────────────────────────────────────────────────────

import { dark, light, type ColorScheme } from '../tokens/semantic';
import { typography } from '../tokens/primitives';

type Density = 'compact' | 'ultra';

function gridParams(scheme: ColorScheme, density: Density = 'compact') {
  const rowH    = density === 'ultra' ? 22 : 28;
  const headerH = density === 'ultra' ? 26 : 32;
  const fontPx  = density === 'ultra' ? 11 : 12;
  return {
    // ── Typography ──
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
    spacing:            density === 'ultra' ? 4 : 6,
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

export const agGridDarkParams         = gridParams(dark,  'compact');
export const agGridLightParams        = gridParams(light, 'compact');
export const agGridBlotterDarkParams  = gridParams(dark,  'ultra');
export const agGridBlotterLightParams = gridParams(light, 'ultra');
