import {
  getColorScheme,
  DEFAULT_STARUI_PALETTE,
  isStarUIPaletteName,
  type StarUIPaletteName,
} from '@starui/design-system';

/** Persisted choice for the dock Color palette submenu only (not `starui:palette`). */
const DOCK_MENU_PALETTE_STORAGE_KEY = 'starui:dock-menu-palette';

/** Manifest-level overrides for the three required OpenFin palette fields. */
export interface OpenFinPaletteManifestOverrides {
  brandPrimary?: string;
  brandSecondary?: string;
  backgroundPrimary?: string;
}

/**
 * Map a StarUI semantic scheme to OpenFin {@link CustomPaletteSet} fields
 * consumed by `@openfin/ui-library` (dock companion, notifications, chrome).
 */
export function staruiSchemeToOpenFinPalette(
  palette: StarUIPaletteName,
  mode: 'dark' | 'light',
  overrides?: OpenFinPaletteManifestOverrides,
) {
  const scheme = getColorScheme(palette, mode);
  return {
    brandPrimary: overrides?.brandPrimary ?? scheme.primary.color,
    brandPrimaryHover: scheme.primary.hover,
    brandPrimaryActive: scheme.primary.pressed,
    brandPrimaryFocused: scheme.primary.ring,
    brandPrimaryText: scheme.primary.foreground,
    brandSecondary: overrides?.brandSecondary ?? scheme.surface.secondary,
    brandSecondaryHover: scheme.surface.tertiary,
    brandSecondaryText: scheme.text.primary,
    backgroundPrimary: overrides?.backgroundPrimary ?? scheme.surface.ground,
    textDefault: scheme.text.primary,
    textHelp: scheme.text.secondary,
    textInactive: scheme.text.disabled,
    borderNeutral: scheme.border.primary,
    inputBackground: scheme.surface.sunken,
    inputColor: scheme.text.primary,
    inputPlaceholder: scheme.text.muted,
    inputBorder: scheme.border.secondary,
    inputFocused: scheme.primary.ring,
    linkDefault: scheme.primary.color,
    linkHover: scheme.primary.hover,
    statusSuccess: scheme.accent.positive,
    statusWarning: scheme.accent.warning,
    statusCritical: scheme.accent.negative,
    statusActive: scheme.primary.color,
    contentBackground1: scheme.surface.primary,
    contentBackground2: scheme.surface.secondary,
    contentBackground3: scheme.surface.tertiary,
  };
}

/** Light/dark OpenFin palettes for one StarUI palette name. */
export function buildOpenFinThemePalettes(
  palette: StarUIPaletteName = DEFAULT_STARUI_PALETTE,
  overrides?: OpenFinPaletteManifestOverrides,
) {
  return {
    dark: staruiSchemeToOpenFinPalette(palette, 'dark', overrides),
    light: staruiSchemeToOpenFinPalette(palette, 'light', overrides),
  };
}

/**
 * StarUI palette used for OpenFin workspace chrome (`CustomPaletteSet`) and
 * dock menu icon strokes. **Not** tied to the dock palette picker.
 */
export const OPENFIN_CHROME_PALETTE: StarUIPaletteName = DEFAULT_STARUI_PALETTE;

/** @deprecated Use {@link OPENFIN_CHROME_PALETTE} for OpenFin init; use {@link readDockPalette} for dock UI. */
export function readInitialStarUIPalette(): StarUIPaletteName {
  return OPENFIN_CHROME_PALETTE;
}

/**
 * Persist the dock palette picker choice for the ✓ checkmarks in the Color
 * palette submenu only. Does not touch `starui:palette`, `data-palette`,
 * OpenFin `CustomPaletteSet`, or dock icon colors.
 */
export function persistDockPaletteSelection(palette: StarUIPaletteName): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DOCK_MENU_PALETTE_STORAGE_KEY, palette);
  } catch { /* private mode / quota */ }
}

/** Which palette is selected in the dock Color palette submenu (labels only). */
export function readDockPalette(): StarUIPaletteName {
  try {
    const stored = localStorage.getItem(DOCK_MENU_PALETTE_STORAGE_KEY);
    if (stored && isStarUIPaletteName(stored)) return stored;
  } catch { /* storage unavailable */ }
  return DEFAULT_STARUI_PALETTE;
}

/**
 * Fixed icon stroke colors for dock bar + content-menu SVG icons.
 * Theme-aware (dark/light) but **not** driven by the palette picker.
 */
export function dockMenuIconStrokeColors(): { dark: string; light: string } {
  return staruiIconStrokeColors(OPENFIN_CHROME_PALETTE);
}

/** Stroke colors for SVG → data-URL dock/content-menu icons. */
export function staruiIconStrokeColors(
  palette: StarUIPaletteName,
): { dark: string; light: string } {
  return {
    dark: getColorScheme(palette, 'dark').primary.color,
    light: getColorScheme(palette, 'light').primary.color,
  };
}

/** @deprecated Renamed to {@link staruiSchemeToOpenFinPalette}. */
export const stockfluxSchemeToOpenFinPalette = staruiSchemeToOpenFinPalette;

/** @deprecated Renamed to {@link staruiIconStrokeColors}. */
export const stockfluxIconStrokeColors = staruiIconStrokeColors;

/** @deprecated Renamed to {@link readInitialStarUIPalette}. */
export const readInitialStockfluxPalette = readInitialStarUIPalette;
