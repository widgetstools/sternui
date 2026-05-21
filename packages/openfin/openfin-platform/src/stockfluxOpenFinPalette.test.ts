import { describe, expect, it } from 'vitest';
import {
  buildOpenFinThemePalettes,
  stockfluxSchemeToOpenFinPalette,
  stockfluxIconStrokeColors,
} from './stockfluxOpenFinPalette';

describe('stockfluxOpenFinPalette', () => {
  it('maps teal dark primary to brandPrimary', () => {
    const palette = stockfluxSchemeToOpenFinPalette('teal', 'dark');
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
    const palette = stockfluxSchemeToOpenFinPalette('slate', 'dark', {
      brandPrimary: '#ABCDEF',
    });
    expect(palette.brandPrimary).toBe('#ABCDEF');
    expect(palette.brandPrimaryHover).toBeTruthy();
  });

  it('returns per-mode accent strokes for icons', () => {
    const strokes = stockfluxIconStrokeColors('amber');
    expect(strokes.dark).toMatch(/^#[0-9a-f]{6}$/i);
    expect(strokes.light).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
