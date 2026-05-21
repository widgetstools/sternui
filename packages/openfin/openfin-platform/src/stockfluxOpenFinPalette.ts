import {
  getColorScheme,
  getTheme,
  DEFAULT_STOCKFLUX_PALETTE,
  type StockfluxPaletteName,
} from '@starui/design-system';

/** Manifest-level overrides for the three required OpenFin palette fields. */
export interface OpenFinPaletteManifestOverrides {
  brandPrimary?: string;
  brandSecondary?: string;
  backgroundPrimary?: string;
}

/**
 * Map a Stockflux semantic scheme to OpenFin {@link CustomPaletteSet} fields
 * consumed by `@openfin/ui-library` (dock companion, notifications, chrome).
 */
export function stockfluxSchemeToOpenFinPalette(
  palette: StockfluxPaletteName,
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

/** Light/dark OpenFin palettes for one Stockflux palette name. */
export function buildOpenFinThemePalettes(
  palette: StockfluxPaletteName = DEFAULT_STOCKFLUX_PALETTE,
  overrides?: OpenFinPaletteManifestOverrides,
) {
  return {
    dark: stockfluxSchemeToOpenFinPalette(palette, 'dark', overrides),
    light: stockfluxSchemeToOpenFinPalette(palette, 'light', overrides),
  };
}

/** Resolve palette at platform init from persisted host appearance. */
export function readInitialStockfluxPalette(): StockfluxPaletteName {
  return getTheme().palette ?? DEFAULT_STOCKFLUX_PALETTE;
}

/** Stroke colors for SVG → data-URL dock/content-menu icons. */
export function stockfluxIconStrokeColors(
  palette: StockfluxPaletteName,
): { dark: string; light: string } {
  return {
    dark: getColorScheme(palette, 'dark').primary.color,
    light: getColorScheme(palette, 'light').primary.color,
  };
}
