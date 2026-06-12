import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import {
  rgbStringToHex,
  buildPaletteFromThemeScope,
  buildOpenFinPalettesFromDesignSystem,
  paletteContrastRatio,
  FALLBACK_OPENFIN_DARK_PALETTE,
} from './openfinPalette';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokensCssPath = resolve(
  __dirname,
  '../../../design-system/design-system/src/tokens/starui-tokens.css',
);

describe('rgbStringToHex', () => {
  it('converts rgb() to hex', () => {
    expect(rgbStringToHex('rgb(10, 118, 211)')).toBe('#0A76D3');
  });

  it('passes through existing hex', () => {
    expect(rgbStringToHex('#0A76D3')).toBe('#0A76D3');
  });
});

describe('buildOpenFinPalettesFromDesignSystem', () => {
  beforeAll(() => {
    const style = document.createElement('style');
    style.setAttribute('data-test-tokens', 'true');
    style.textContent = readFileSync(tokensCssPath, 'utf8');
    document.head.appendChild(style);
  });

  it('resolves Azure primary from dark tokens (not legacy OpenFin blue)', () => {
    const html = document.documentElement;
    html.setAttribute('data-theme', 'dark');
    const scope = document.createElement('div');
    document.body.appendChild(scope);

    const palette = buildPaletteFromThemeScope(scope);
    scope.remove();

    // starui-tokens dark --primary ≈ Azure hue 256; legacy OpenFin brand was #0A76D3
    expect(palette.brandPrimary).not.toBe(FALLBACK_OPENFIN_DARK_PALETTE.brandPrimary);
    expect(palette.brandPrimary).toMatch(/^#[0-9A-F]{6}$/);
    expect(palette.background1).toMatch(/^#[0-9A-F]{6}$/);
    expect(palette.contentBackground4).toBe(palette.background4);
  });

  it('resolves distinct palettes when html data-theme flips', () => {
    const html = document.documentElement;
    const probe = document.createElement('div');
    document.body.appendChild(probe);

    html.setAttribute('data-theme', 'dark');
    const darkBg = buildPaletteFromThemeScope(probe).background1;

    html.setAttribute('data-theme', 'light');
    const lightBg = buildPaletteFromThemeScope(probe).background1;

    probe.remove();
    html.setAttribute('data-theme', 'dark');

    expect(darkBg).not.toBe(lightBg);
  });

  it('returns distinct dark and light palettes', () => {
    const { dark, light } = buildOpenFinPalettesFromDesignSystem();
    expect(dark.background1).not.toBe(light.background1);
    expect(dark.brandPrimary).toMatch(/^#[0-9A-F]{6}$/);
    expect(light.brandPrimary).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('light palette keeps readable text on active browser tab chrome', () => {
    const { light } = buildOpenFinPalettesFromDesignSystem();
    expect(light.brandPrimaryText).toMatch(/^#[0-9A-F]{6}$/);
    expect(paletteContrastRatio(light.brandPrimaryText!, light.brandPrimary)).toBeGreaterThanOrEqual(4.5);
    expect(light.brandPrimaryFocused).toBe(light.brandPrimaryText);
  });
});
