// ─────────────────────────────────────────────────────────────
//  AG Grid Theme Params — Stockflux SLATE BLUE (ag-grid v33+)
//
//  Color pack is sourced from tokens/stockfluxSlate.ts (aggrid-theme.js
//  `palettes.slate`) so grid chrome cannot drift from the reference kit.
// ─────────────────────────────────────────────────────────────

import { iconSetQuartzBold, themeQuartz, type Theme } from 'ag-grid-community';
import { dark, light, type ColorScheme } from '../tokens/semantic';
import { stockfluxSlateAgGrid } from '../tokens/stockfluxSlate';
import { typography } from '../tokens/primitives';

type Density = 'compact' | 'comfort' | 'ultra';
type AgPack =
  | (typeof stockfluxSlateAgGrid)['dark']
  | (typeof stockfluxSlateAgGrid)['light'];

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function gridParams(
  pack: AgPack,
  scheme: ColorScheme,
  mode: 'dark' | 'light',
  density: Density = 'compact',
) {
  const rowH    = density === 'ultra' ? 22 : density === 'comfort' ? 38 : 30;
  const headerH = density === 'ultra' ? 26 : density === 'comfort' ? 40 : 32;
  const fontPx  = density === 'ultra' ? 11 : density === 'comfort' ? 13 : 12;
  const headerFontPx = density === 'ultra' ? 9 : density === 'comfort' ? 11 : 10;
  const spacing = density === 'ultra' ? 4 : density === 'comfort' ? 8 : 6;

  return {
    browserColorScheme: mode,

    fontFamily:        typography.fontFamily.sans,
    fontSize:          fontPx,
    headerFontFamily:  typography.fontFamily.sans,
    headerFontSize:    headerFontPx,
    headerFontWeight:  700,
    cellFontFamily:    typography.fontFamily.mono,
    cellTextColor:     pack.fg,
    iconSize:          13,

    backgroundColor:        pack.bg,
    foregroundColor:        pack.fg,
    chromeBackgroundColor:  pack.chrome,
    headerBackgroundColor:  pack.header,
    headerTextColor:        pack.headerText,
    rowHoverColor:          pack.hover,
    selectedRowBackgroundColor: pack.sel,
    oddRowBackgroundColor:  pack.odd,

    borderColor:        pack.border,
    wrapperBorder:      true as const,
    wrapperBorderRadius: 3,
    headerColumnBorder: false as const,
    // Vertical 1px rule between data-row cells (Stockflux blotter look —
    // makes columns read as distinct in dense numeric tables).
    columnBorder:       true as const,
    headerColumnResizeHandleColor: hexToRgba(pack.accent, 0.5),
    headerColumnResizeHandleHeight: '30%',
    headerColumnResizeHandleWidth: 2,
    rowBorder:          { style: 'solid' as const, width: 1, color: pack.rowBorder },
    rowHeight:          rowH,
    headerHeight:       headerH,
    spacing,
    borderRadius:       3,
    cellHorizontalPadding: 10,

    inputBackgroundColor: pack.inputBg,
    inputBorder:          { style: 'solid' as const, width: 1, color: pack.inputBorder },
    inputFocusBorder:     { style: 'solid' as const, width: 1, color: pack.inputFocus },
    focusShadow:          `0 0 0 2px ${scheme.primary.ring}`,

    rangeSelectionBorderColor:     pack.accent,
    rangeSelectionBackgroundColor: pack.accentSoft,

    menuBackgroundColor: pack.menu,
    menuTextColor:       pack.menuText,
    menuBorder:          { style: 'solid' as const, width: 1, color: pack.menuBorder },

    tooltipBackgroundColor: pack.tooltip,
    tooltipTextColor:       pack.tooltipText,

    checkboxCheckedBackgroundColor:   pack.accent,
    checkboxCheckedBorderColor:       pack.accent,
    checkboxUncheckedBackgroundColor: pack.inputBg,
    checkboxUncheckedBorderColor:     pack.inputBorder,

    toggleButtonOnBackgroundColor:  pack.accent,
    toggleButtonOffBackgroundColor: pack.toggleOff,

    accentColor: pack.accent,
  };
}

export const agGridDarkParams         = gridParams(stockfluxSlateAgGrid.dark,  dark,  'dark',  'compact');
export const agGridLightParams        = gridParams(stockfluxSlateAgGrid.light, light, 'light', 'compact');
export const agGridComfortDarkParams  = gridParams(stockfluxSlateAgGrid.dark,  dark,  'dark',  'comfort');
export const agGridComfortLightParams = gridParams(stockfluxSlateAgGrid.light, light, 'light', 'comfort');
export const agGridBlotterDarkParams  = gridParams(stockfluxSlateAgGrid.dark,  dark,  'dark',  'ultra');
export const agGridBlotterLightParams = gridParams(stockfluxSlateAgGrid.light, light, 'light', 'ultra');

const bake = (params: ReturnType<typeof gridParams>): Theme =>
  themeQuartz.withPart(iconSetQuartzBold).withParams(params);

export const agGridDarkTheme         = bake(agGridDarkParams);
export const agGridLightTheme        = bake(agGridLightParams);
export const agGridComfortDarkTheme  = bake(agGridComfortDarkParams);
export const agGridComfortLightTheme = bake(agGridComfortLightParams);
export const agGridBlotterDarkTheme  = bake(agGridBlotterDarkParams);
export const agGridBlotterLightTheme = bake(agGridBlotterLightParams);
