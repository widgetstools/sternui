// ─────────────────────────────────────────────────────────────
//  Chroma Desk — Primitive Tokens
//  Raw palette, type scale, spacing, radius, opacity, timing.
//
//  One theme, two modes:
//    - LIGHT  — cool graphite-grey chrome, deep cool-charcoal text,
//               vivid accents AA/AAA-audited against the grey ground.
//               Designed for traders running the app 12+ hours; ground
//               sits at ~88–89% L so it's never glaring under office
//               fluorescents or late-night ambient light.
//    - DARK   — balanced graphite chrome, vivid mint-teal & rose,
//               signature cyan brand moment.
//
//  Typography: Geist sans + JetBrains Mono in both modes.
//  Accents: identical hue family across modes (teal/rose/amber/cyan/
//  brand-cyan), tuned per mode for contrast against its surface.
//  Warning is pure amber, never copper or brown.
// ─────────────────────────────────────────────────────────────

export const colors = {
  // ── Warm paper (light chrome) ─────────────────────────────
  // Trader-friendly warm cream, low-glare, Bloomberg-adjacent.
  paper: {
    50:  '#fbf8f2',  // card (warmer than pure white)
    100: '#f5f1ea',  // ground
    200: '#ece6da',  // hover
    300: '#e0d8c8',  // pressed
    400: '#d5ccb8',  // accent band
    500: '#c9bfab',  // border primary
    600: '#b4a98f',  // border secondary
  },
  // ── Warm charcoal (light text) ────────────────────────────
  // Deep warm charcoals — never pure black.
  ink: {
    0:   '#2a2519',  // primary body   (13.1:1 AAA on paper-100)
    1:   '#524a38',  // secondary      (7.8:1  AAA)
    2:   '#6d6550',  // muted          (5.2:1  AA)
    3:   '#8a806a',  // faint / UI     (3.5:1  UI only)
  },
  // ── Balanced graphite (dark chrome) ───────────────────────
  // Slightly cool but not clinical — the Chroma Desk dark body.
  graphite: {
    975: '#0b0d10',  // ground
    950: '#14171b',  // card
    900: '#1c2025',  // hover / header
    850: '#252a31',  // pressed
    800: '#31373f',  // accent band
    700: '#3e4552',  // border secondary
    600: '#2b3139',  // border primary
    500: '#565d68',  // dark faint text   (2.7:1  UI only)
    400: '#7d8694',  // dark muted        (4.6:1  AA)
    300: '#aab3bf',  // dark secondary    (7.6:1  AAA)
    50:  '#ecf0f5',  // dark primary text (14.8:1 AAA)
  },
  // ── Teal / positive ──────────────────────────────────────
  // Light: teal-green (4.82:1 AA on chromeLight-100).
  // Dark:  vivid mint-teal (AAA on graphite).
  teal: {
    light:    '#0e7c5b',   // light positive   (4.89:1 AA)
    lightHov: '#0a6448',
    dark:     '#22e3a8',   // dark positive    (11.1:1 AAA)
    darkHov:  '#3fecb8',
  },
  // ── Rose / negative ──────────────────────────────────────
  // Light: red-rose (5.22:1 AA on chromeLight-100).
  // Dark:  vivid rose (AA on graphite).
  rose: {
    light:    '#bf2052',   // light negative   (5.59:1 AA)
    lightHov: '#9e1843',
    dark:     '#ff5a82',   // dark negative    (6.02:1 AA)
    darkHov:  '#ff7898',
  },
  // ── Amber / warning ──────────────────────────────────────
  // Pure amber, unmistakable from rose. Semantic-only.
  amber: {
    light:    '#8a6410',   // 5.07:1 AA on chromeLight-100
    dark:     '#f5c14b',   // 10.6:1 AAA on graphite
  },
  // ── Brand / info ─────────────────────────────────────────
  // Light: deep confident blue.
  // Dark:  signature cyan — Chroma Desk's wow moment.
  brand: {
    light:    '#1e4fb8',
    lightHov: '#1a43a0',
    dark:     '#22d3ee',   // signature cyan
    darkHov:  '#4ae0f2',
  },
  // ── Highlight / selected ─────────────────────────────────
  cyan: {
    light:    '#047987',
    dark:     '#22d3ee',
  },
  // ── Purple / tertiary ────────────────────────────────────
  purple: {
    light:    '#6d28d9',
    dark:     '#a78bfa',
  },
  // ── CVD-safe alternates ──────────────────────────────────
  // Deuteranopia/protanopia-safe mapping: blue=buy, orange=sell.
  cvd: {
    buyLight:  '#1e4fb8',
    sellLight: '#c2410c',
    buyDark:   '#7aa6ff',
    sellDark:  '#ff9d4e',
  },
} as const;

export const typography = {
  fontFamily: {
    // Refined Classic: editorial IBM Plex family.
    sans:  "'IBM Plex Sans', 'Inter', system-ui, sans-serif",
    mono:  "'IBM Plex Mono', 'JetBrains Mono', monospace",
    serif: "'IBM Plex Serif', Georgia, serif",
    // Chroma Desk aliases (dark):
    sansDark: "'Geist', 'Inter', system-ui, sans-serif",
    monoDark: "'JetBrains Mono', 'Geist Mono', monospace",
  },
  fontSize: {
    '2xs': '10px',
    xs:    '11px',   // badges, timestamps
    sm:    '12px',   // table cells, body default
    md:    '13px',   // section titles, nav tabs
    lg:    '14px',   // CTA buttons
    xl:    '16px',   // card headers
    '2xl': '20px',   // widget headlines
    '3xl': '26px',   // KPI numbers
    '4xl': '36px',   // hero
  },
  fontWeight: {
    regular:  400,
    book:     450,   // optical weight for small body text
    medium:   500,
    semibold: 600,
    bold:     700,
  },
  letterSpacing: {
    tight:   '-0.02em',
    snug:    '-0.01em',
    normal:  '0',
    wide:    '0.02em',
    wider:   '0.04em',
    widest:  '0.06em',
  },
  lineHeight: {
    none:    1,
    tight:   1.2,
    snug:    1.35,
    normal:  1.5,
    relaxed: 1.65,
  },
} as const;

export const spacing = {
  0:   0,
  px:  1,
  0.5: 2,
  1:   4,
  1.5: 6,
  2:   8,
  2.5: 10,
  3:   12,
  4:   16,
  5:   20,
  6:   24,
  8:   32,
  10:  40,
} as const;

export const radius = {
  none: '0px',
  sm:   '3px',
  md:   '5px',
  lg:   '8px',
  xl:   '12px',
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

// Motion — tuned for data clarity. `tickFlash` is the signature
// price-cell pulse; never override it below 600ms or users will
// miss the flash during a fast tape.
export const transition = {
  instant:   '80ms cubic-bezier(0.4,0,0.6,1)',
  fast:      '140ms cubic-bezier(0.4,0,0.2,1)',
  normal:    '220ms cubic-bezier(0.4,0,0.2,1)',
  slow:      '420ms cubic-bezier(0.4,0,0.2,1)',
  emphasis:  '640ms cubic-bezier(0.2,0.8,0.2,1)',
  tickFlash: '900ms cubic-bezier(0.25,0.1,0.25,1)',
} as const;

export const shadow = {
  none: 'none',
  sm:   '0 1px 2px rgba(42,37,25,0.06)',
  md:   '0 1px 2px rgba(42,37,25,0.06), 0 4px 14px rgba(42,37,25,0.08)',   // light — refined classic
  lg:   '0 1px 0 rgba(255,255,255,0.04) inset, 0 2px 6px rgba(0,0,0,0.5), 0 8px 22px rgba(0,0,0,0.4)', // dark
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
