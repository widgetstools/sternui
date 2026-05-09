import { describe, it, expect } from 'vitest';
import { dark, light, type ColorScheme } from '../../src/tokens/semantic';

const requiredKeys: ReadonlyArray<keyof ColorScheme> = [
  'surface', 'text', 'border', 'accent', 'action',
  'state', 'overlay', 'cvd', 'scrollbar', 'elevation',
];

const requiredSurfaceKeys = ['ground', 'primary', 'secondary', 'tertiary', 'quaternary'] as const;
const requiredAccentKeys = [
  'positive', 'positiveHover', 'negative', 'negativeHover',
  'warning', 'info', 'infoHover', 'highlight', 'purple',
] as const;
const requiredCvdKeys = ['buy', 'sell'] as const;

describe('ColorScheme contract', () => {
  for (const [name, scheme] of [['dark', dark], ['light', light]] as const) {
    describe(name, () => {
      it.each(requiredKeys)('has %s block', (key) => {
        expect(scheme[key]).toBeDefined();
      });

      it.each(requiredSurfaceKeys)('surface.%s is a non-empty string', (key) => {
        expect(typeof scheme.surface[key]).toBe('string');
        expect(scheme.surface[key].length).toBeGreaterThan(0);
      });

      it.each(requiredAccentKeys)('accent.%s is a non-empty string', (key) => {
        expect(typeof scheme.accent[key]).toBe('string');
        expect(scheme.accent[key].length).toBeGreaterThan(0);
      });

      it.each(requiredCvdKeys)('cvd.%s is a non-empty string', (key) => {
        expect(typeof scheme.cvd[key]).toBe('string');
        expect(scheme.cvd[key].length).toBeGreaterThan(0);
      });
    });
  }

  it('dark and light have distinct ground surfaces', () => {
    expect(dark.surface.ground).not.toBe(light.surface.ground);
  });

  it('cvd.buy and cvd.sell differ from accent.positive/negative in both schemes', () => {
    expect(dark.cvd.buy).not.toBe(dark.accent.positive);
    expect(dark.cvd.sell).not.toBe(dark.accent.negative);
    expect(light.cvd.buy).not.toBe(light.accent.positive);
    expect(light.cvd.sell).not.toBe(light.accent.negative);
  });
});
