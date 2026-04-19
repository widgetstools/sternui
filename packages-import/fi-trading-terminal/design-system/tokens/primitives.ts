// ─────────────────────────────────────────────────────────────
//  FI Design System — Primitive Tokens
//  Raw palette, type scale, spacing, radius, opacity, timing.
//  No semantic meaning — just values.
//
//  Palette direction:
//    - Binance-inspired dark chrome, but softened for long sessions.
//    - No yellow brand accent — soft azure blue replaces it.
//    - All accents desaturated: reduces glare and fatigue for
//      traders looking at the UI for 8+ hours.
// ─────────────────────────────────────────────────────────────

export const colors = {
  // Cool-leaning charcoals. Slightly warmer than pure neutral so
  // the dark theme doesn't feel clinical. Used for backgrounds,
  // borders, muted text.
  charcoal: {
    0:   '#ffffff',
    50:  '#f5f3ed',  // warm cream (light theme ground)
    100: '#edeae1',  // light hover
    200: '#dfdbd1',  // light border primary
    300: '#cbc6ba',  // light border secondary
    400: '#a8abb0',  // light faint text
    500: '#757982',  // muted text (both themes)
    600: '#575b62',  // light secondary text
    700: '#4d586a',  // dark faint text
    800: '#323b49',  // dark border secondary
    850: '#2e3744',  // dark border subtle
    900: '#242c38',  // dark surface tertiary
    925: '#1a212b',  // dark surface secondary
    950: '#121820',  // dark surface primary (card)
    975: '#0a0e14',  // dark ground (deepest)
  },
  // Muted forest/teal — reads positive without being neon.
  teal: {
    50:  '#ecf6f2',
    100: '#cfe9df',
    200: '#a7d4c3',
    300: '#7abfa6',
    400: '#3dbfa0',  // dark theme positive
    500: '#2fa88a',  // dark theme positive hover / buy bg
    600: '#1f8c6e',  // light theme positive
    700: '#156b53',  // light theme positive hover
    800: '#0f513f',
    900: '#0a3a2d',
  },
  // Soft coral → brick. Never fire-engine saturation.
  red: {
    50:  '#fbeeee',
    100: '#f7d6d4',
    200: '#efb0ac',
    300: '#e58984',
    400: '#e56464',  // dark theme negative
    500: '#d04f4f',  // dark theme negative hover / sell bg
    600: '#b8463f',  // light theme negative
    700: '#963028',  // light theme negative hover
    800: '#7a241e',
    900: '#5e1915',
  },
  // Muted amber — RESERVED for warning semantic only.
  // No longer a brand accent. Never used for primary/focus/tab indicator.
  amber: {
    300: '#e3c178',
    400: '#d9b458',
    500: '#d4a84a',  // dark theme warning
    600: '#b8902f',
    700: '#b27a1f',  // light theme warning
  },
  // Soft azure — the new brand accent (replaces yellow).
  // Calm, professional, easy to look at over long sessions.
  blue: {
    50:  '#eef4fb',
    100: '#d4e3f4',
    200: '#a8c6e8',
    300: '#7dacdc',
    400: '#6ba4e8',  // dark theme info / brand
    500: '#4e8bd1',  // dark theme info hover
    600: '#2f6fb3',  // light theme info / brand
    700: '#245a95',  // light theme info hover
  },
  // Soft sky — used for highlight / selected states.
  cyan: {
    300: '#9dcce3',
    400: '#7db4e3',  // dark theme highlight
    500: '#4a8cc4',  // light theme highlight
    600: '#2f6d9e',
    700: '#1e5478',
  },
  // Muted lavender — tertiary accent (rare use).
  purple: {
    300: '#c4b0de',
    400: '#a48ad4',  // dark theme purple
    500: '#8b6bc4',
    600: '#7b5ba8',  // light theme purple
  },
} as const;

export const typography = {
  fontFamily: {
    mono: "'JetBrains Mono', monospace",
    sans: "'Geist', sans-serif",
  },
  // Min size bumped 9→10px for better legibility.
  // sm stays at 11px to avoid horizontal reflow of dense tables.
  fontSize: {
    xs: '10px',  // column headers, badges, timestamps, captions
    sm: '11px',  // body text, table cells, data values (DEFAULT)
    md: '13px',  // section titles, nav tabs, CTA buttons
    lg: '18px',  // KPI headline numbers
  },
  fontWeight: {
    regular:  400,
    medium:   500,
    semibold: 600,
    bold:     700,
  },
  letterSpacing: {
    tight:  '0.02em',
    normal: '0.03em',
    wide:   '0.04em',
    wider:  '0.05em',
  },
  lineHeight: {
    none:    1,
    tight:   1.25,
    normal:  1.5,
    relaxed: 1.8,
  },
} as const;

export const spacing = {
  0:  0,
  px: 1,
  0.5: 2,
  1:  4,
  1.5: 6,
  2:  8,
  2.5: 10,
  3:  12,
  3.5: 14,
  4:  16,
  5:  20,
  6:  24,
  8:  32,
} as const;

export const radius = {
  none: '0px',
  sm:   '2px',
  md:   '3px',
  lg:   '4px',
  xl:   '6px',
  full: '9999px',
} as const;

export const opacity = {
  muted:  0.06,
  subtle: 0.08,
  light:  0.12,
  medium: 0.25,
  heavy:  0.35,
  solid:  1.0,
} as const;

export const transition = {
  fast:   '150ms ease',
  normal: '200ms ease',
  slow:   '500ms ease-out',
} as const;

export const shadow = {
  none: 'none',
  sm:   '0 1px 2px rgba(0,0,0,0.15)',
  md:   '0 2px 6px rgba(0,0,0,0.2)',
  lg:   '0 4px 12px rgba(0,0,0,0.25)',
} as const;

export const primitives = {
  colors,
  typography,
  spacing,
  radius,
  opacity,
  transition,
  shadow,
} as const;
