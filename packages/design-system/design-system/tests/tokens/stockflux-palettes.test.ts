import { describe, it, expect } from 'vitest';
import {
  STOCKFLUX_PALETTE_NAMES,
  STOCKFLUX_PALETTES,
  DEFAULT_STOCKFLUX_PALETTE,
} from '../../src/tokens/stockflux';
import { schemesByPalette, getColorScheme } from '../../src/tokens/semantic';

describe('Stockflux palettes', () => {
  it('exposes five named palettes', () => {
    expect(STOCKFLUX_PALETTE_NAMES).toEqual(['teal', 'indigo', 'amber', 'slate', 'grey']);
    expect(DEFAULT_STOCKFLUX_PALETTE).toBe('slate');
  });

  it.each(STOCKFLUX_PALETTE_NAMES)('%s pack has dark/light hex and agGrid', (name) => {
    const pack = STOCKFLUX_PALETTES[name];
    expect(pack.hex.dark.bg).toMatch(/^#/);
    expect(pack.hex.light.bg).toMatch(/^#/);
    expect(pack.agGrid.dark.accent).toMatch(/^#/);
    expect(pack.shadcn.dark.primary).toMatch(/\d/);
  });

  it('trading up/down are palette-locked across brand palettes', () => {
    for (const name of STOCKFLUX_PALETTE_NAMES) {
      if (name === 'teal') continue;
      const { dark } = schemesByPalette[name];
      const tealDark = schemesByPalette.teal.dark;
      expect(dark.accent.positive).toBe(tealDark.accent.positive);
      expect(dark.accent.negative).toBe(tealDark.accent.negative);
    }
  });

  it('getColorScheme defaults to slate dark', () => {
    expect(getColorScheme('slate', 'dark').surface.ground)
      .toBe(schemesByPalette.slate.dark.surface.ground);
  });

  it('brand primary differs between teal and slate in dark mode', () => {
    expect(schemesByPalette.teal.dark.primary.display)
      .not.toBe(schemesByPalette.slate.dark.primary.display);
  });
});
