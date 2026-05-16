// ─────────────────────────────────────────────────────────────
//  FI Design System — Primitive Tokens
//  Raw palette, type scale, spacing, radius, opacity, timing.
//
//  Blue-slate (Stockflux SLATE) palette:
//    - Industrial-cool pewter chrome with a sapphire brand accent.
//    - Trading semantics are palette-locked (mint-teal up / rose down)
//      per Stockflux-design/palettes.css.
// ─────────────────────────────────────────────────────────────

export const colors = {
  // ── Cool paper (light chrome) — Stockflux slate-light sf-bg scale
  paper: {
    50:  '#ffffff',  // sf-bg-1 / sf-bg-2 card
    75:  '#f8fafc',  // AG Grid odd-row only (not sf-bg-*)
    100: '#f1f3f6',  // sf-bg ground
    200: '#e9ecf0',  // sf-bg-3
    300: '#dde1e7',  // sf-bg-4
    400: '#c8cdd5',  // sf-bg-5
    500: '#d4d8de',  // sf-border
    600: '#b6bbc4',  // sf-border-2
    700: '#8e94a0',  // sf-border-3
  },
  // ── Pewter ink (light text) — Stockflux slate-light sf-t scale
  ink: {
    0:   '#18222f',
    1:   '#2f3a4a',
    2:   '#525d6c',
    3:   '#7a8392',
    4:   '#abb1bb',
  },
  // ── Pewter graphite (dark chrome) — Stockflux slate-dark sf-bg scale
  graphite: {
    975: '#171a1d',
    960: '#1e2125',
    950: '#212429',
    900: '#2c2f34',
    850: '#383c42',
    800: '#4b4f57',
    700: '#3e4148',
    600: '#2c2f34',
    500: '#686d73',
    400: '#8f939a',
    300: '#c1c4c9',
    50:  '#ebedef',
    450: '#494c52',  // sf-t-4 disabled
    650: '#565a61',  // sf-border-3
  },
  // ── Teal / positive (Stockflux palette-locked trade up) ──
  teal: {
    light:    '#0f766e',
    lightHov: '#0a5d56',
    dark:     '#2dd4bf',
    darkHov:  '#5eead4',
  },
  // ── Red / negative (Stockflux palette-locked trade down) ──
  rose: {
    light:    '#be1f43',
    lightHov: '#9e1838',
    dark:     '#f25668',
    darkHov:  '#ff7484',
  },
  // ── Warning (Stockflux palette-locked) ──
  amber: {
    light:    '#b27607',
    dark:     '#f5c14b',
  },
  // ── Brand / sapphire (sf-teal naming in Stockflux) ──
  brand: {
    light:    '#2563eb',
    lightHov: '#1d4ed8',
    lightLo:  '#1e40af',
    dark:     '#3b82f6',
    darkHov:  '#60a5fa',
    darkHi:   '#93c5fd',
  },
  // ── Info (Stockflux palette-locked sf-info) ──
  cyan: {
    light:          '#0e7490',
    lightHov:       '#0c6378',
    dark:           '#38bdf8',
    darkHov:        '#7dd3fc',
    highlightLight: '#06b6d4',
    highlightDark:  '#00e5ff',
  },
  // ── Purple / chart accent (Stockflux slate chart-4) ──
  purple: {
    light:    '#7631c4',
    dark:     '#af7de8',
  },
  // ── CVD-safe alternates ──
  cvd: {
    buyLight:  '#1e4fb8',
    sellLight: '#c2410c',
    buyDark:   '#7aa6ff',
    sellDark:  '#ff9d4e',
  },
} as const;

export const typography = {
  fontFamily: {
    sans:  "'Inter', system-ui, -apple-system, 'Segoe UI', 'Geist', sans-serif",
    mono:  "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, 'SF Mono', monospace",
    serif: "'Geist', Georgia, serif",
    sansDark: "'Inter', system-ui, -apple-system, 'Segoe UI', 'Geist', sans-serif",
    monoDark: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, 'SF Mono', monospace",
  },
  fontSize: {
    '2xs': '10px',
    xs:    '11px',
    sm:    '12px',
    md:    '13px',
    lg:    '14px',
    xl:    '16px',
    '2xl': '20px',
    '3xl': '28px',
    '4xl': '40px',
    '5xl': '56px',
  },
  fontWeight: {
    regular:  400,
    book:     450,
    medium:   500,
    semibold: 600,
    bold:     700,
  },
  letterSpacing: {
    tight:   '-0.02em',
    snug:    '-0.005em',
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
  fontVariantNumeric: {
    tabular: 'tabular-nums',
    lining:  'lining-nums',
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
  md:   '3px',
  lg:   '3px',
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
  instant:   '80ms cubic-bezier(0.4,0,0.6,1)',
  fast:      '140ms cubic-bezier(0.4,0,0.2,1)',
  normal:    '220ms cubic-bezier(0.4,0,0.2,1)',
  slow:      '420ms cubic-bezier(0.4,0,0.2,1)',
  emphasis:  '640ms cubic-bezier(0.2,0.8,0.2,1)',
  tickFlash: '900ms cubic-bezier(0.25,0.1,0.25,1)',
} as const;

export const shadow = {
  none: 'none',
  sm:   '0 1px 2px rgba(12,29,48,0.06)',
  md:   '0 2px 8px rgba(12,29,48,0.08), 0 1px 0 rgba(255,255,255,0.6) inset',
  lg:   '0 12px 32px rgba(12,29,48,0.12), 0 1px 0 rgba(255,255,255,0.6) inset',
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
