// ─────────────────────────────────────────────────────────────
//  AG Grid Theme Params — Quartz (ag-grid v33+)
//
//  Dark chrome colors match the platform Quartz dark preset; light mode
//  reuses the same structural params (fonts, radii, borders) with the
//  Stockflux SLATE color pack for surfaces.
// ─────────────────────────────────────────────────────────────

import { iconSetQuartzLight, themeQuartz, type Theme } from 'ag-grid-community';
import { dark, light, type ColorScheme } from '../tokens/semantic';
import { stockfluxSlateAgGrid } from '../tokens/stockfluxSlate';
import { typography } from '../tokens/primitives';

type Density = 'compact' | 'comfort' | 'ultra';
type AgPack = { [K in keyof (typeof stockfluxSlateAgGrid)['dark']]: string };

/** Shared with the reference Quartz dark theme (non-color params also apply to light). */
const AG_GRID_INTER_FONT = { googleFont: 'Inter' } as const;

const agGridDarkColorOverrides = {
  bg: '#0C0F14',
  chrome: '#181923',
  fg: '#FFFFFF',
  odd: '#000000',
} as const;

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function resolveColorPack(pack: AgPack, mode: 'dark' | 'light'): AgPack {
  if (mode === 'dark') {
    return { ...pack, ...agGridDarkColorOverrides };
  }
  return pack;
}

/** Non-color params from the Quartz dark reference theme (both color schemes). */
function quartzStructuralParams(density: Density) {
  const rowH = density === 'ultra' ? 22 : density === 'comfort' ? 38 : 30;
  const headerH = density === 'ultra' ? 26 : density === 'comfort' ? 40 : 32;
  const fontPx = density === 'ultra' ? 11 : density === 'comfort' ? 13 : 12;
  const headerFontPx = density === 'ultra' ? 10 : density === 'comfort' ? 12 : 11;
  const iconPx = density === 'ultra' ? 11 : density === 'comfort' ? 13 : 12;
  const spacing = density === 'ultra' ? 4 : density === 'comfort' ? 8 : 6;

  return {
    fontFamily: AG_GRID_INTER_FONT,
    fontSize: fontPx,
    headerFontFamily: AG_GRID_INTER_FONT,
    headerFontSize: headerFontPx,
    iconSize: iconPx,
    borderRadius: 2,
    wrapperBorderRadius: 2,
    rowVerticalPaddingScale: 1,
    columnBorder: true as const,
    rowHeight: rowH,
    headerHeight: headerH,
    spacing,
  };
}

function gridParams(
  pack: AgPack,
  scheme: ColorScheme,
  mode: 'dark' | 'light',
  density: Density = 'compact',
) {
  const colors = resolveColorPack(pack, mode);
  const structural = quartzStructuralParams(density);

  return {
    browserColorScheme: mode,
    ...structural,

    headerFontWeight: 700,
    cellFontFamily: typography.fontFamily.mono,
    cellTextColor: colors.fg,

    backgroundColor: colors.bg,
    foregroundColor: colors.fg,
    chromeBackgroundColor: colors.chrome,
    headerBackgroundColor: colors.header,
    headerTextColor: colors.headerText,
    rowHoverColor: colors.hover,
    selectedRowBackgroundColor: colors.sel,
    oddRowBackgroundColor: colors.odd,

    borderColor: colors.border,
    wrapperBorder: true as const,
    rowBorder: { style: 'solid' as const, width: 1, color: colors.rowBorder },
    cellHorizontalPadding: 10,

    inputBackgroundColor: colors.inputBg,
    inputBorder: { style: 'solid' as const, width: 1, color: colors.inputBorder },
    inputFocusBorder: { style: 'solid' as const, width: 1, color: colors.inputFocus },
    focusShadow: `0 0 0 2px ${scheme.primary.ring}`,

    rangeSelectionBorderColor: colors.accent,
    rangeSelectionBackgroundColor: colors.accentSoft,

    menuBackgroundColor: colors.menu,
    menuTextColor: colors.menuText,
    menuBorder: { style: 'solid' as const, width: 1, color: colors.menuBorder },

    tooltipBackgroundColor: colors.tooltip,
    tooltipTextColor: colors.tooltipText,

    checkboxCheckedBackgroundColor: colors.accent,
    checkboxCheckedBorderColor: colors.accent,
    checkboxUncheckedBackgroundColor: colors.inputBg,
    checkboxUncheckedBorderColor: colors.inputBorder,

    toggleButtonOnBackgroundColor: colors.accent,
    toggleButtonOffBackgroundColor: colors.toggleOff,

    accentColor: colors.accent,
  };
}

export const agGridDarkParams = gridParams(
  { ...stockfluxSlateAgGrid.dark },
  dark,
  'dark',
  'compact',
);
export const agGridLightParams = gridParams(
  { ...stockfluxSlateAgGrid.light },
  light,
  'light',
  'compact',
);
export const agGridComfortDarkParams = gridParams(
  { ...stockfluxSlateAgGrid.dark },
  dark,
  'dark',
  'comfort',
);
export const agGridComfortLightParams = gridParams(
  { ...stockfluxSlateAgGrid.light },
  light,
  'light',
  'comfort',
);
export const agGridBlotterDarkParams = gridParams(
  { ...stockfluxSlateAgGrid.dark },
  dark,
  'dark',
  'ultra',
);
export const agGridBlotterLightParams = gridParams(
  { ...stockfluxSlateAgGrid.light },
  light,
  'light',
  'ultra',
);

const bake = (params: ReturnType<typeof gridParams>): Theme =>
  themeQuartz.withPart(iconSetQuartzLight).withParams(params);

export const agGridDarkTheme = bake(agGridDarkParams);
export const agGridLightTheme = bake(agGridLightParams);
export const agGridComfortDarkTheme = bake(agGridComfortDarkParams);
export const agGridComfortLightTheme = bake(agGridComfortLightParams);
export const agGridBlotterDarkTheme = bake(agGridBlotterDarkParams);
export const agGridBlotterLightTheme = bake(agGridBlotterLightParams);
