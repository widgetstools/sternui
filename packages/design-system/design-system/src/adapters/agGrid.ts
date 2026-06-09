// ─────────────────────────────────────────────────────────────
//  AG Grid Theme Params — Quartz (ag-grid v33+)
//
//  Token-driven STARUI chrome — colors from staruiHex AG Grid packs.
//  Structural params aligned with starui-aggrid.jsx (4px radius, 12px pad).
// ─────────────────────────────────────────────────────────────

import { iconSetQuartzLight, themeQuartz, type Theme } from 'ag-grid-community';
import { dark, light, type ColorScheme } from '../tokens/semantic';
import { stockfluxSlateAgGrid } from '../tokens/stockfluxSlate';

/** AG Grid Quartz compactness preset — maps to `theme.withParams` structural knobs. */
export type GridDensity = 'ultra' | 'compact' | 'comfort';

export const GRID_DENSITY_ORDER: readonly GridDensity[] = ['ultra', 'compact', 'comfort'];

export const GRID_DENSITY_LABELS: Record<GridDensity, string> = {
  ultra: 'Ultra',
  compact: 'Compact',
  comfort: 'Comfortable',
};

type AgPack = { [K in keyof (typeof stockfluxSlateAgGrid)['dark']]: string };

const AG_GRID_INTER_FONT = { googleFont: 'Inter' } as const;
const AG_GRID_MONO_FONT = { googleFont: 'JetBrains Mono' } as const;

/**
 * Structural theme params per density — aligned with AG Grid compactness guidance
 * (`spacing`, fixed `rowHeight` / `headerHeight`, font sizes).
 * @see https://www.ag-grid.com/javascript-data-grid/theming-compactness/
 */
export function gridDensityStructuralParams(density: GridDensity) {
  const rowH = density === 'ultra' ? 22 : density === 'comfort' ? 40 : 30;
  const headerH = density === 'ultra' ? 26 : density === 'comfort' ? 42 : 32;
  const fontPx = density === 'ultra' ? 10 : density === 'comfort' ? 14 : 12;
  const headerFontPx = density === 'ultra' ? 10 : density === 'comfort' ? 13 : 11;
  const spacing = density === 'ultra' ? 4 : density === 'comfort' ? 8 : 6;
  const iconPx = density === 'ultra' ? 12 : density === 'comfort' ? 16 : 14;

  return {
    fontFamily: AG_GRID_INTER_FONT,
    fontSize: fontPx,
    headerFontFamily: AG_GRID_MONO_FONT,
    headerFontSize: headerFontPx,
    iconSize: iconPx,
    borderRadius: 2,
    wrapperBorderRadius: 2,
    cellHorizontalPaddingScale: 1,
    rowVerticalPaddingScale: 1,
    columnBorder: true as const,
    rowHeight: rowH,
    headerHeight: headerH,
    spacing,
  };
}

/** Infer the closest preset from persisted row/header heights (settings panel edits). */
export function inferGridDensity(rowHeight?: number, headerHeight?: number): GridDensity {
  for (const density of GRID_DENSITY_ORDER) {
    const p = gridDensityStructuralParams(density);
    if (p.rowHeight === rowHeight && p.headerHeight === headerHeight) return density;
  }
  return 'compact';
}

const densityThemeCache = new WeakMap<Theme, Map<GridDensity, Theme>>();

/** Apply a density preset on top of any Quartz theme (colors unchanged). */
export function applyGridDensityToTheme(theme: Theme, density: GridDensity): Theme {
  if (typeof theme?.withParams !== 'function') return theme;
  let byDensity = densityThemeCache.get(theme);
  if (!byDensity) {
    byDensity = new Map();
    densityThemeCache.set(theme, byDensity);
  }
  const cached = byDensity.get(density);
  if (cached) return cached;
  const next = theme.withParams(gridDensityStructuralParams(density));
  byDensity.set(density, next);
  return next;
}

export interface GridDensitySettingsSlice {
  gridDensity?: GridDensity;
  rowHeight?: number;
  headerHeight?: number;
}

/** Resolve active density from module state — explicit field wins, else height inference. */
export function resolveGridDensity(settings?: GridDensitySettingsSlice | null): GridDensity {
  if (settings?.gridDensity) return settings.gridDensity;
  return inferGridDensity(settings?.rowHeight, settings?.headerHeight);
}

function gridParams(
  pack: AgPack,
  scheme: ColorScheme,
  mode: 'dark' | 'light',
  density: GridDensity = 'compact',
) {
  const colors = pack;
  const structural = gridDensityStructuralParams(density);

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
