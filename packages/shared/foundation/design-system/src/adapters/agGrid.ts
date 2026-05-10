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
    // Headers use JetBrains Mono so column captions sit on the same
    // tabular baseline as the cell values — keeps numeric / identifier
    // columns aligned and reinforces the trading-terminal voice.
    fontFamily:        typography.fontFamily.sans,
    fontSize:          fontPx,
    headerFontFamily:  typography.fontFamily.mono,
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
    // focusShadow (the box-shadow ring around focused cells/inputs) is
    // the sole focus indicator. inputFocusBorder is hard-disabled
    // (false === "no border" per AG Grid's BorderValue type) so the
    // built-in cyan border that AG Grid would otherwise paint on focus
    // does NOT layer on top of the box-shadow ring — that's the
    // "doubled cyan stripe" we kept hitting on edge-aligned inputs
    // like floating filters.
    inputFocusBorder:   false as const,
    inputFocusShadow:   'none' as const,
    focusShadow:        `0 0 0 2px ${scheme.overlay.infoRing}`,
    // ── Range / selection ──
    // Range selection signals via background tint only. The range
    // border style is hard-disabled so a clicked cell (which is BOTH
    // focused AND a 1x1 range) doesn't render the cyan range border
    // INSIDE the cell on top of the cyan focus ring OUTSIDE — that's
    // the same doubled-stripe issue, just on cells.
    rangeSelectionBorderStyle:     'none' as const,
    rangeSelectionBackgroundColor: scheme.overlay.infoSoft,
    // ── Brand accent ──
    accentColor:        scheme.accent.info,
  };
}

export const agGridDarkParams         = gridParams(dark,  'compact');
export const agGridLightParams        = gridParams(light, 'compact');
export const agGridBlotterDarkParams  = gridParams(dark,  'ultra');
export const agGridBlotterLightParams = gridParams(light, 'ultra');
