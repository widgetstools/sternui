// ─────────────────────────────────────────────────────────────
//  FI Design System — Semantic Tokens
//  Stockflux palettes (teal · indigo · amber · slate · grey).
//  Default product palette: slate (`DEFAULT_STOCKFLUX_PALETTE`).
// ─────────────────────────────────────────────────────────────

import { buildSchemesForPack } from './buildColorScheme';
import { typography, radius, spacing, opacity, transition, shadow } from './primitives';
import {
  DEFAULT_STOCKFLUX_PALETTE,
  STOCKFLUX_PALETTES,
  type StockfluxPaletteName,
} from './stockflux';

export type { ColorScheme } from './colorScheme';

const slateSchemes = buildSchemesForPack(STOCKFLUX_PALETTES.slate);

/** Default dark scheme (slate) — backward compatible */
export const dark = slateSchemes.dark;

/** Default light scheme (slate) — backward compatible */
export const light = slateSchemes.light;

export const schemesByPalette: Record<
  StockfluxPaletteName,
  { dark: typeof dark; light: typeof light }
> = {
  teal:   buildSchemesForPack(STOCKFLUX_PALETTES.teal),
  indigo: buildSchemesForPack(STOCKFLUX_PALETTES.indigo),
  amber:  buildSchemesForPack(STOCKFLUX_PALETTES.amber),
  slate:  slateSchemes,
  grey:   buildSchemesForPack(STOCKFLUX_PALETTES.grey),
};

export function getColorScheme(
  palette: StockfluxPaletteName = DEFAULT_STOCKFLUX_PALETTE,
  mode: 'dark' | 'light',
) {
  return schemesByPalette[palette][mode];
}

export const shared = {
  typography,
  radius,
  spacing,
  opacity,
  transition,
  shadow,
} as const;

export const semantic = { dark, light, shared } as const;
