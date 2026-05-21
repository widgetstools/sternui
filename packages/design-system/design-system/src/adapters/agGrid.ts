// ─────────────────────────────────────────────────────────────
//  AG Grid Theme Params — StarUI palettes (ag-grid v33+)
// ─────────────────────────────────────────────────────────────

import { iconSetQuartzBold, themeQuartz, type Theme } from 'ag-grid-community';
import { getColorScheme } from '../tokens/semantic';
import {
  DEFAULT_STARUI_PALETTE,
  getStarUIPack,
  type StarUIAgGridMode,
  type StarUIPaletteName,
} from '../tokens/starui';
import { typography } from '../tokens/primitives';

export type AgGridDensity = 'compact' | 'comfort' | 'ultra';

export interface AgGridThemeOptions {
  palette?: StarUIPaletteName;
  mode?: 'dark' | 'light';
  density?: AgGridDensity;
}

function gridParams(
  pack: StarUIAgGridMode,
  palette: StarUIPaletteName,
  mode: 'dark' | 'light',
  density: AgGridDensity = 'compact',
) {
  const scheme = getColorScheme(palette, mode);
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

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const themeCache = new Map<string, Theme>();

export function buildAgGridParams(options: AgGridThemeOptions = {}) {
  const palette = options.palette ?? DEFAULT_STARUI_PALETTE;
  const mode = options.mode ?? 'dark';
  const density = options.density ?? 'compact';
  const pack = getStarUIPack(palette).agGrid[mode];
  return gridParams(pack, palette, mode, density);
}

export function buildAgGridTheme(options: AgGridThemeOptions = {}): Theme {
  const palette = options.palette ?? DEFAULT_STARUI_PALETTE;
  const mode = options.mode ?? 'dark';
  const density = options.density ?? 'compact';
  const key = `${palette}-${mode}-${density}`;
  const cached = themeCache.get(key);
  if (cached) return cached;
  const baked = themeQuartz.withPart(iconSetQuartzBold).withParams(buildAgGridParams(options));
  themeCache.set(key, baked);
  return baked;
}

/** Slate · dark · compact (default product grid chrome) */
export const agGridDarkParams         = buildAgGridParams({ palette: 'slate', mode: 'dark',  density: 'compact' });
export const agGridLightParams        = buildAgGridParams({ palette: 'slate', mode: 'light', density: 'compact' });
export const agGridComfortDarkParams  = buildAgGridParams({ palette: 'slate', mode: 'dark',  density: 'comfort' });
export const agGridComfortLightParams = buildAgGridParams({ palette: 'slate', mode: 'light', density: 'comfort' });
export const agGridBlotterDarkParams  = buildAgGridParams({ palette: 'slate', mode: 'dark',  density: 'ultra' });
export const agGridBlotterLightParams = buildAgGridParams({ palette: 'slate', mode: 'light', density: 'ultra' });

export const agGridDarkTheme         = buildAgGridTheme({ palette: 'slate', mode: 'dark',  density: 'compact' });
export const agGridLightTheme        = buildAgGridTheme({ palette: 'slate', mode: 'light', density: 'compact' });
export const agGridComfortDarkTheme  = buildAgGridTheme({ palette: 'slate', mode: 'dark',  density: 'comfort' });
export const agGridComfortLightTheme = buildAgGridTheme({ palette: 'slate', mode: 'light', density: 'comfort' });
export const agGridBlotterDarkTheme  = buildAgGridTheme({ palette: 'slate', mode: 'dark',  density: 'ultra' });
export const agGridBlotterLightTheme = buildAgGridTheme({ palette: 'slate', mode: 'light', density: 'ultra' });
