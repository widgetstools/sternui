// ─────────────────────────────────────────────────────────────
//  AG Grid Theme Params — Quartz (ag-grid v33+)
//
//  Token-driven STARUI chrome — colors from staruiHex AG Grid packs.
//  Structural params aligned with starui-aggrid.jsx (4px radius, 12px pad).
// ─────────────────────────────────────────────────────────────

import { iconSetQuartzLight, themeQuartz, type Theme } from 'ag-grid-community';
import { dark, light, type ColorScheme } from '../tokens/semantic';
import { stockfluxSlateAgGrid } from '../tokens/stockfluxSlate';

type Density = 'compact' | 'comfort' | 'ultra';
type AgPack = { [K in keyof (typeof stockfluxSlateAgGrid)['dark']]: string };

const AG_GRID_INTER_FONT = { googleFont: 'Inter' } as const;
const AG_GRID_MONO_FONT = { googleFont: 'JetBrains Mono' } as const;

/** Non-color params aligned with STARUI grid demo. */
function quartzStructuralParams(density: Density) {
  const rowH = density === 'ultra' ? 22 : density === 'comfort' ? 40 : 30;
  const headerH = density === 'ultra' ? 26 : density === 'comfort' ? 42 : 32;
  const fontPx = density === 'ultra' ? 11 : density === 'comfort' ? 13 : 12;
  const headerFontPx = density === 'ultra' ? 10 : density === 'comfort' ? 12 : 11;

  return {
    fontFamily: AG_GRID_INTER_FONT,
    fontSize: fontPx,
    headerFontFamily: AG_GRID_MONO_FONT,
    headerFontSize: headerFontPx,
    iconSize: 14,
    borderRadius: 2,
    wrapperBorderRadius: 2,
    cellHorizontalPaddingScale: 1,
    rowVerticalPaddingScale: 1,
    columnBorder: true as const,
    rowHeight: rowH,
    headerHeight: headerH,
    spacing: 6,
  };
}

function gridParams(
  pack: AgPack,
  scheme: ColorScheme,
  mode: 'dark' | 'light',
  density: Density = 'compact',
) {
  const colors = pack;
  const structural = quartzStructuralParams(density);

  return {
    browserColorScheme: mode,
    ...structural,

    headerFontWeight: 700,
    cellFontFamily: AG_GRID_MONO_FONT,
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
    wrapperBorder: false as const,
    rowBorder: { style: 'solid' as const, width: 1, color: colors.rowBorder },
    cellHorizontalPadding: 12,

    inputBackgroundColor: colors.inputBg,
    inputBorder: { style: 'solid' as const, width: 1, color: colors.inputBorder },
    inputFocusBorder: { style: 'solid' as const, width: 1, color: colors.inputFocus },
    focusShadow: scheme.elevation.glow,

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
