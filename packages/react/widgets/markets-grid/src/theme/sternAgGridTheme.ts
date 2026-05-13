/**
 * Stern AG Grid themes — canonical dark and light variants built on themeQuartz.
 *
 * Source of truth lives here in markets-grid; widgets-react re-exports for
 * back-compat. MarketsGrid resolves the right variant internally via
 * `useGridTheme`, driven by `[data-theme]` on `<html>` — apps don't pass a
 * theme prop, they flip the host attribute.
 */

import { themeQuartz } from 'ag-grid-community';

// Shared typography — both themes use the same font stack and sizes so
// switching `data-theme` is a colour-only flip.
const sternTypography = {
  fontFamily:       { googleFont: 'IBM Plex Mono' },
  fontSize:         12,
  headerFontFamily: { googleFont: 'IBM Plex Mono' },
  headerFontSize:   11,
} as const;

// Keys defined in dark MUST be defined in light, and vice versa —
// otherwise AG Grid can carry the previous theme's value across a
// `data-theme` swap (param missing → no CSS reset → stale value).
export const sternDarkTheme = themeQuartz.withParams({
  ...sternTypography,
  accentColor:           '#59BCC2',
  // 10% darker than the previous `#1B1D1E` baseline — each RGB channel
  // multiplied by 0.9 so the rest of the dark palette keeps its
  // relative contrast. Chrome and header surfaces walked in lockstep.
  backgroundColor:       '#181A1B',
  borderColor:           '#FFFFFF17',
  borderRadius:          2,
  browserColorScheme:    'dark',
  cellTextColor:         '#E3E3E3',
  chromeBackgroundColor: '#1A1A1B',
  columnBorder:          true,
  foregroundColor:       '#FFF',
  headerBackgroundColor: '#2324278F',
  headerFontWeight:      500,
  headerTextColor:       '#E3E3E3',
  spacing:               6,
  wrapperBorderRadius:   2,
});

export const sternLightTheme = themeQuartz.withParams({
  ...sternTypography,
  accentColor:           '#70A0A9',
  backgroundColor:       '#F8F8F8',
  borderColor:           '#0000001A',
  borderRadius:          2,
  browserColorScheme:    'light',
  cellTextColor:         '#181D1F',
  chromeBackgroundColor: '#F0F0F0',
  columnBorder:          true,
  foregroundColor:       '#181D1F',
  headerBackgroundColor: '#F0F0F0BA',
  headerFontWeight:      500,
  headerTextColor:       '#181D1F',
  spacing:               6,
  wrapperBorderRadius:   2,
});
