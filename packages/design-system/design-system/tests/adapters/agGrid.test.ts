import { describe, it, expect } from 'vitest';
import {
  agGridDarkParams, agGridLightParams,
  agGridComfortDarkParams, agGridComfortLightParams,
  agGridBlotterDarkParams, agGridBlotterLightParams,
} from '../../src/adapters/agGrid';

describe('agGrid params', () => {
  it.each([['agGridDarkParams', agGridDarkParams]] as const)
    ('%s defines backgroundColor', (_n, p) => {
      // legacy AG Grid v33 used backgroundColor; v35 uses backgroundColor too
      expect((p as any).backgroundColor).toBeDefined();
    });

  it('dark and light differ in backgroundColor', () => {
    expect((agGridDarkParams as any).backgroundColor)
      .not.toBe((agGridLightParams as any).backgroundColor);
  });

  it('blotter variants exist', () => {
    expect(agGridBlotterDarkParams).toBeDefined();
    expect(agGridBlotterLightParams).toBeDefined();
  });

  it('comfort variants exist', () => {
    expect(agGridComfortDarkParams).toBeDefined();
    expect(agGridComfortLightParams).toBeDefined();
  });

  it('matches snapshot', () => {
    expect({
      dark: agGridDarkParams, light: agGridLightParams,
      comfortDark: agGridComfortDarkParams, comfortLight: agGridComfortLightParams,
      blotterDark: agGridBlotterDarkParams, blotterLight: agGridBlotterLightParams,
    }).toMatchSnapshot();
  });
});
