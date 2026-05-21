import { describe, expect, it } from 'vitest';
import {
  buildOpenFinThemePalettes,
  dockMenuIconStrokeColors,
  OPENFIN_CHROME_PALETTE,
  persistDockPaletteSelection,
  readDockPalette,
  staruiSchemeToOpenFinPalette,
  staruiIconStrokeColors,
} from './staruiOpenFinPalette';

describe('staruiOpenFinPalette', () => {
  it('maps teal dark primary to brandPrimary', () => {
    const palette = staruiSchemeToOpenFinPalette('teal', 'dark');
    expect(palette.brandPrimary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(palette.textDefault).toBeTruthy();
    expect(palette.backgroundPrimary).toBeTruthy();
  });

  it('builds distinct light and dark palettes', () => {
    const { dark, light } = buildOpenFinThemePalettes('indigo');
    expect(dark.backgroundPrimary).not.toBe(light.backgroundPrimary);
    expect(dark.brandPrimary).toBeTruthy();
    expect(light.brandPrimary).toBeTruthy();
  });

  it('applies manifest overrides on required fields only', () => {
    const palette = staruiSchemeToOpenFinPalette('slate', 'dark', {
      brandPrimary: '#ABCDEF',
    });
    expect(palette.brandPrimary).toBe('#ABCDEF');
    expect(palette.brandPrimaryHover).toBeTruthy();
  });

  it('returns per-mode accent strokes for icons', () => {
    const strokes = staruiIconStrokeColors('amber');
    expect(strokes.dark).toMatch(/^#[0-9a-f]{6}$/i);
    expect(strokes.light).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('OPENFIN_CHROME_PALETTE is stable slate default', () => {
    expect(OPENFIN_CHROME_PALETTE).toBe('slate');
  });

  it('persistDockPaletteSelection updates readDockPalette checkmark state only', () => {
    persistDockPaletteSelection('indigo');
    expect(readDockPalette()).toBe('indigo');
    persistDockPaletteSelection('slate');
    expect(readDockPalette()).toBe('slate');
  });

  it('dockMenuIconStrokeColors does not change when palette picker changes', () => {
    const before = dockMenuIconStrokeColors();
    persistDockPaletteSelection('amber');
    expect(dockMenuIconStrokeColors()).toEqual(before);
    persistDockPaletteSelection('slate');
  });
});
