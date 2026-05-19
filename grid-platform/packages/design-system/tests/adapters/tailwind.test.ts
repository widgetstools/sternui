import { describe, it, expect } from 'vitest';
import { tailwindPreset } from '../../src/adapters/tailwind';

describe('tailwindPreset', () => {
  it('sets darkMode to data-theme attribute selector', () => {
    expect(tailwindPreset.darkMode).toEqual(['selector', '[data-theme="dark"]']);
  });

  it('exposes shadcn-compat color names via theme.extend.colors', () => {
    const colors = tailwindPreset.theme?.extend?.colors as Record<string, unknown>;
    for (const k of [
      'background', 'foreground', 'card', 'popover', 'primary', 'secondary',
      'muted', 'accent', 'destructive', 'border', 'input', 'ring',
      'success', 'warning', 'info',
    ]) {
      expect(colors[k]).toBeDefined();
    }
  });

  it('exposes surface scale 50..950 for parity with PrimeNG', () => {
    const colors = tailwindPreset.theme?.extend?.colors as any;
    for (const k of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
      expect(colors.surface[k]).toBeDefined();
    }
  });

  it('matches snapshot', () => {
    expect(tailwindPreset).toMatchSnapshot();
  });
});
