// ─────────────────────────────────────────────────────────────
//  FI Design System — Primitive Tokens
//  Raw palette, type scale, spacing, radius, opacity, timing.
//
//  Imported direction from fi-trading-terminal/design-system:
//    - Dark mode keeps high-chroma exchange accents.
//    - Light mode follows the cool-clinical reference: airy, neutral,
//      and cobalt-accented.
//    - No earthy tones, no browns. Warning is pure orange, not copper.
//    - Cool-neutral charcoal for dark chrome and cool off-white for
//      light chrome. No warm cream anywhere.
// ─────────────────────────────────────────────────────────────

export const colors = {
  // ── Cool clinical (light chrome) ──────────────────────────
  // Reference direction: canvas #F8F9FB, crisp white cells/cards,
  // cobalt primary, and rationed semantic color.
  paper: {
    50:  '#ffffff',  // card / grid cells
    100: '#f8f9fb',  // app ground
    200: '#f3f5f8',  // raised header / hover
    300: '#edf1f5',  // pressed / pinned panels
    400: '#e5eaf1',  // accent band
    500: '#d8dee8',  // border primary
    600: '#c4ccd8',  // border secondary
  },
  // ── Clinical graphite (light text) ────────────────────────
  // Cool slate text, never pure black; readable without harshness.
  ink: {
    0:   '#111827',  // primary body
    1:   '#4b5563',  // secondary
    2:   '#6b7280',  // muted
    3:   '#9aa3af',  // faint / UI
  },
  // ── Cool charcoal (dark chrome) ───────────────────────────
  // Source: fi-trading-terminal charcoal 700..975 dark scale.
  graphite: {
    975: '#0a0e14',  // ground
    950: '#121820',  // card
    900: '#1a212b',  // hover / header
    850: '#242c38',  // pressed
    800: '#242c38',  // accent band
    700: '#323b49',  // border secondary
    600: '#2e3744',  // border primary
    500: '#4d586a',  // dark faint text
    400: '#6b7280',  // dark muted
    300: '#a7b0bd',  // dark secondary
    50:  '#e6e9ef',  // dark primary text
  },
  // ── Teal / positive ──────────────────────────────────────
  // Exchange-terminal teal-green. Dark mode goes electric; light mode
  // is desaturated for comfort while staying contrast-safe.
  teal: {
    light:    '#1f7a5c',
    lightHov: '#176247',
    dark:     '#00f5a0',
    darkHov:  '#31ffc1',
  },
  // ── Red / negative ───────────────────────────────────────
  // Vivid exchange red. Light mode is softened for reduced visual vibration.
  rose: {
    light:    '#a43f4b',
    lightHov: '#84313b',
    dark:     '#ff3366',
    darkHov:  '#ff5c85',
  },
  // ── Orange / warning ─────────────────────────────────────
  // Pure orange — not copper, not brown, no yellow character.
  amber: {
    light:    '#8a5f1f',
    dark:     '#ff9f1a',
  },
  // ── Brand / info ─────────────────────────────────────────
  // Primary brand: greyish lavender — separate per-mode shades chosen
  // for AA contrast against each surface tier. Light = deeper lavender
  // on white; dark = paler lavender on charcoal. Hover states walk one
  // step in the direction that increases contrast.
  brand: {
    light:    '#6b6498',  // deep greyish lavender — CTA on white
    lightHov: '#544e7c',  // darker on hover (light mode)
    dark:     '#b5add8',  // pale greyish lavender — CTA on charcoal
    darkHov:  '#c9c2e4',  // lighter on hover (dark mode)
  },
  // ── Info / highlight ─────────────────────────────────────
  // Info is a semantic status/link accent, separate from primary brand.
  // Highlight is brighter decorative emphasis.
  cyan: {
    light:          '#3d6f99',
    lightHov:       '#315a7c',
    dark:           '#48e6ff',
    darkHov:        '#7eeeff',
    highlightLight: '#06b6d4',
    highlightDark:  '#00e5ff',
  },
  // ── Purple / tertiary ────────────────────────────────────
  purple: {
    light:    '#6650b6',
    dark:     '#b56cff',
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
    sans:  "'Geist', 'Inter', system-ui, sans-serif",
    mono:  "'JetBrains Mono', monospace",
    serif: "'Geist', Georgia, serif",
    sansDark: "'Geist', 'Inter', system-ui, sans-serif",
    monoDark: "'JetBrains Mono', monospace",
  },
  fontSize: {
    '2xs': '9px',
    xs:    '10px',   // column headers, badges, timestamps, captions
    sm:    '11px',   // body text, table cells, data values
    md:    '13px',   // section titles, nav tabs
    lg:    '18px',   // KPI headline numbers
    xl:    '20px',   // card headers
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

// Design-system radius scale.
//
// Standard rectangular components (buttons, inputs, cards, panels,
// tooltips, popovers, badges, table rows, etc.) all land on the same
// 2px baseline — `sm`, `md`, and `lg` resolve to the same value so a
// component asking for "medium" radius doesn't accidentally read as
// rounder than its peers. Cases that legitimately need higher radii
// (skeleton loaders, banners, fully-rounded shapes) opt in via `xl`
// or `full`.
//
// Inherently round / pill-shaped controls — pills, avatars, checkbox
// ticks, toggle-switch tracks + knobs, radio buttons, progress bar
// caps — should reach for `radius.full` directly.
export const radius = {
  none: '0px',
  sm:   '2px',
  md:   '2px',
  lg:   '2px',
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
  sm:   '0 1px 2px rgba(15,23,42,0.08)',
  md:   '0 1px 2px rgba(15,23,42,0.06), 0 10px 28px rgba(15,23,42,0.10)',
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
