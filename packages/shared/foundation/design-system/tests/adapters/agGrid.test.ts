import { describe, it, expect } from 'vitest';
import {
  agGridDarkParams, agGridLightParams,
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

  it('matches snapshot', () => {
    expect({
      dark: agGridDarkParams, light: agGridLightParams,
      blotterDark: agGridBlotterDarkParams, blotterLight: agGridBlotterLightParams,
    }).toMatchSnapshot();
  });
});
