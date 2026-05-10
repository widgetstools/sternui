// ─────────────────────────────────────────────────────────────
//  AG Grid Theme Params
//
//  Two minimal Quartz-based theme param objects (dark + light) that
//  every AG Grid in the monorepo composes via:
//
//    themeQuartz.withParams({ ...agGridDarkParams, ...overrides })
//
//  Blotter variants apply ultra-dense sizing on top of the same base
//  for high-density trading grids (rowHeight 22, headerHeight 26,
//  fontSize 11).
// ─────────────────────────────────────────────────────────────

const darkBase = {
  backgroundColor: '#1f2836',
  browserColorScheme: 'dark' as const,
  chromeBackgroundColor: {
    ref: 'foregroundColor',
    mix: 0.07,
    onto: 'backgroundColor',
  },
  fontFamily: {
    googleFont: 'IBM Plex Mono',
  },
  foregroundColor: '#FFF',
  wrapperBorderRadius: 0,
};

const lightBase = {
  browserColorScheme: 'light' as const,
};

const ultraDensity = {
  rowHeight: 22,
  headerHeight: 26,
  fontSize: 11,
  spacing: 4,
};

export const agGridDarkParams         = darkBase;
export const agGridLightParams        = lightBase;
export const agGridBlotterDarkParams  = { ...darkBase,  ...ultraDensity };
export const agGridBlotterLightParams = { ...lightBase, ...ultraDensity };
