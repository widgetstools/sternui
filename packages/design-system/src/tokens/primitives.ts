// ─────────────────────────────────────────────────────────────
//  FI Design System — Primitive Tokens
//  Raw palette, type scale, spacing, radius, opacity, timing.
//  No semantic meaning — just values.
//
//  Palette direction:
//    - Punchy, saturated accents. Nothing washed out.
//    - No earthy tones, no browns. Warning is pure orange, not copper.
//    - Cool-neutral charcoal for dark chrome and cool off-white
//      for light chrome. No warm cream anywhere.
// ─────────────────────────────────────────────────────────────

export const colors = {
  // Cool-neutral grayscale. No warm shift — surfaces read as clean
  // cool chrome, letting the saturated accents carry all the color.
  charcoal: {
    0:   '#ffffff',
    50:  '#f3f5f9',  // light theme ground (cool off-white)
    100: '#ebeef3',  // light hover
    150: '#dde2ea',  // light pressed
    200: '#d9dee8',  // light border primary
    300: '#c3cad7',  // light border secondary
    400: '#9ca3af',  // light faint text
    500: '#6b7280',  // muted text (both themes)
    600: '#4f5665',  // light secondary text
    700: '#4d586a',  // dark faint text
    800: '#323b49',  // dark border secondary
    850: '#2e3744',  // dark border primary
    900: '#242c38',  // dark tertiary surface
    925: '#1a212b',  // dark secondary surface
    950: '#121820',  // dark primary surface (card)
    975: '#0a0e14',  // dark ground
  },
  // Vibrant teal-green — reads clearly positive, no neon haze.
  teal: {
    50:  '#e6fbf3',
    100: '#c1f5de',
    200: '#8cecc3',
    300: '#4ee1a5',
    400: '#14d9a0',  // dark theme positive (punchy)
    500: '#0fb88a',  // dark hover / buy bg
    600: '#0ea870',  // light theme positive
    700: '#0b8959',  // light hover
    800: '#086b47',
    900: '#065234',
  },
  // Vivid coral-pink-red. Saturated but not fire-engine.
  red: {
    50:  '#ffe8ed',
    100: '#ffc5d0',
    200: '#ff94a7',
    300: '#ff6c86',
    400: '#ff4d6d',  // dark negative (punchy)
    500: '#e8304e',  // dark hover / sell bg
    600: '#e02e47',  // light negative
    700: '#b81e37',  // light hover
    800: '#91162b',
    900: '#6e1020',
  },
  // PURE ORANGE — warning semantic. Deliberately NOT copper, NOT
  // brown. Clearly distinct from red (hue ≈22°) and unmistakably
  // orange (no yellow character).
  orange: {
    300: '#ffc195',
    400: '#ffa872',
    500: '#ff8c42',  // dark warning (vivid)
    600: '#e86a1c',  // dark hover / light warning
    700: '#c75b18',  // light hover
  },
  // Punchy saturated blue — brand accent. Replaces Binance yellow.
  blue: {
    50:  '#eaf3ff',
    100: '#d0e2ff',
    200: '#a1c4ff',
    300: '#6fa5fc',
    400: '#60a5fa',
    500: '#3b82f6',  // dark brand (punchy)
    600: '#2563eb',  // light brand / dark hover
    700: '#1d4ed8',  // light hover
  },
  // Bright cyan for highlights and selected states.
  cyan: {
    300: '#67e8f9',
    400: '#22d3ee',  // dark highlight
    500: '#06b6d4',  // light highlight
    600: '#0891b2',
    700: '#0e7490',
  },
  // Saturated purple — tertiary accent.
  purple: {
    300: '#c4b5fd',
    400: '#a855f7',  // dark
    500: '#9333ea',
    600: '#7c3aed',  // light
  },
} as const;

export const typography = {
  fontFamily: {
    mono: "'JetBrains Mono', monospace",
    sans: "'Geist', sans-serif",
  },
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
