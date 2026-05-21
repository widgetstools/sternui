import { describe, it, expect } from 'vitest';
import {
  StarUIPresets,
  StarUISlatePreset,
  type StarUIPrimengPaletteName,
} from '../../src/adapters/primengPresets';

describe('primengPresets', () => {
  it('exports five named presets', () => {
    const names = Object.keys(StarUIPresets) as StarUIPrimengPaletteName[];
    expect(names.sort()).toEqual(['amber', 'grey', 'indigo', 'slate', 'teal']);
  });

  it('slate preset defines primary semantic scale', () => {
    const primary = StarUISlatePreset.semantic?.primary as Record<string, string> | undefined;
    expect(primary?.['500']).toMatch(/^#/);
  });
});
