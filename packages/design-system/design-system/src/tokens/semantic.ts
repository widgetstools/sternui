// ─────────────────────────────────────────────────────────────
//  FI Design System — Semantic Tokens
//  StarUI palettes (teal · indigo · amber · slate · grey).
//  Default product palette: slate (`DEFAULT_STARUI_PALETTE`).
// ─────────────────────────────────────────────────────────────

import { buildSchemesForPack } from './buildColorScheme';
import { typography, radius, spacing, opacity, transition, shadow } from './primitives';
import {
  DEFAULT_STARUI_PALETTE,
  STARUI_PALETTES,
  type StarUIPaletteName,
} from './starui';

export type { ColorScheme } from './colorScheme';

const slateSchemes = buildSchemesForPack(STARUI_PALETTES.slate);

/** Default dark scheme (slate) — backward compatible */
export const dark = slateSchemes.dark;

/** Default light scheme (slate) — backward compatible */
export const light = slateSchemes.light;

export const schemesByPalette: Record<
  StarUIPaletteName,
  { dark: typeof dark; light: typeof light }
> = {
  teal:   buildSchemesForPack(STARUI_PALETTES.teal),
  indigo: buildSchemesForPack(STARUI_PALETTES.indigo),
  amber:  buildSchemesForPack(STARUI_PALETTES.amber),
  slate:  slateSchemes,
  grey:   buildSchemesForPack(STARUI_PALETTES.grey),
};

export function getColorScheme(
  palette: StarUIPaletteName = DEFAULT_STARUI_PALETTE,
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
