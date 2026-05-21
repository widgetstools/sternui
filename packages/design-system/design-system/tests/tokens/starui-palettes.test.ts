import { describe, it, expect } from 'vitest';
import {
  STARUI_PALETTE_NAMES,
  STARUI_PALETTES,
  DEFAULT_STARUI_PALETTE,
} from '../../src/tokens/starui';
import { schemesByPalette, getColorScheme } from '../../src/tokens/semantic';

describe('StarUI palettes', () => {
  it('exposes five named palettes', () => {
    expect(STARUI_PALETTE_NAMES).toEqual(['teal', 'indigo', 'amber', 'slate', 'grey']);
    expect(DEFAULT_STARUI_PALETTE).toBe('slate');
  });

  it.each(STARUI_PALETTE_NAMES)('%s pack has dark/light hex and agGrid', (name) => {
    const pack = STARUI_PALETTES[name];
    expect(pack.hex.dark.bg).toMatch(/^#/);
    expect(pack.hex.light.bg).toMatch(/^#/);
    expect(pack.agGrid.dark.accent).toMatch(/^#/);
    expect(pack.shadcn.dark.primary).toMatch(/\d/);
  });

  it('trading up/down are palette-locked across brand palettes', () => {
    for (const name of STARUI_PALETTE_NAMES) {
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
