// ─────────────────────────────────────────────────────────────
//  Chroma Desk — Semantic Tokens
//  Maps primitives to purpose-driven roles.
//
//  ONE theme — Chroma Desk — with two modes (light, dark).
//  Both modes share the same typographic voice (Geist sans +
//  JetBrains Mono), the same accent hues (teal/rose/amber/brand/
//  cyan/purple), the same component spacing language, and the same
//  signature cyan brand moment. They differ only in surface luminance
//  and per-mode contrast tuning of accents.
//
//  - LIGHT mode: cool graphite-grey chrome at ~89% L ground, deep
//    cool-charcoal text. Designed for traders running 12+ hour
//    sessions; never glaring under office light or late-night ambient.
//  - DARK mode: balanced graphite chrome, vivid mint-teal/rose
//    accents, signature cyan brand.
//
//  All accents WCAG-audited against their paired surface.
//  Warning is pure amber — visually distinct from negative.
//
//  CVD (color-vision-deficiency) is an opt-in override layer: a
//  `[data-cvd="on"]` attribute swaps positive/negative accents to
//  blue (buy) / orange (sell) globally. It is not a separate scheme;
//  see the css adapter for how it's emitted.
// ─────────────────────────────────────────────────────────────

import { colors, typography, radius, spacing, opacity, transition, shadow } from './primitives';

// ── Color Scheme Type ──
export interface ColorScheme {
  surface: {
    ground:    string;  // page/app background
    primary:   string;  // card/panel background
    secondary: string;  // hover, header background
    tertiary:  string;  // active/pressed, accent bg
    quaternary:string;  // accent band
  };
  text: {
    primary:   string;  // main body text
    secondary: string;  // labels, descriptions
    muted:     string;  // captions, timestamps
    faint:     string;  // disabled, placeholder, UI-only
  };
  border: {
    primary:   string;  // panel borders, dividers
    secondary: string;  // interactive borders (inputs, buttons)
  };
  accent: {
    positive:      string;  // buy, gain, success
    positiveHover: string;
    negative:      string;  // sell, loss, error
    negativeHover: string;
    warning:       string;  // caution, pending (pure amber)
    info:          string;  // BRAND / primary / informational / links
    infoHover:     string;
    highlight:     string;  // emphasis, selected
    purple:        string;  // tertiary accent
  };
  action: {
    buyBg:    string;
    buyText:  string;
    sellBg:   string;
    sellText: string;
  };
  state: {
    focusRing:    string;
    focusRingBg:  string;
    disabledBg:   string;
    disabledFg:   string;
    hoverOverlay: string;
    selection:    string;
  };
  overlay: {
    positiveSoft:  string;
    positiveRing:  string;
    negativeSoft:  string;
    negativeRing:  string;
    warningSoft:   string;
    warningRing:   string;
    infoSoft:      string;
    infoRing:      string;
    neutralSoft:   string;
    neutralRing:   string;
  };
  cvd: {
    // Deuteranopia/protanopia-safe alternates (blue buy, orange sell).
    buy:  string;
    sell: string;
  };
  scrollbar: string;
  elevation: {
    card:    string;  // drop shadow
    overlay: string;  // dialog / popover
    glow:    string;  // focus glow
  };
}

// ── Chroma Desk · Light ─────────────────────────────────────
// Neutral grey ground, near-black text, signature cyan-teal brand.
// Reference: Direction C "Chroma Desk" light — exact match.
export const light: ColorScheme = {
  surface: {
    ground:     colors.chromeLight[100],  // #edeeed  neutral grey ground
    primary:    colors.chromeLight[50],   // #f7f8f7  card / panel
    secondary:  colors.chromeLight[200],  // #e3e5e3  hover
    tertiary:   colors.chromeLight[300],  // #d6d8d6  pressed
    quaternary: colors.chromeLight[400],  // #c5c8c5  accent band
  },
  text: {
    primary:   colors.coolInk[0],         // #14181a  AAA 15.8:1
    secondary: colors.coolInk[1],         // #3d4347  AAA  8.9:1
    muted:     colors.coolInk[2],         // #5c6267  AA   5.5:1
    faint:     colors.coolInk[3],         // #7d8287  UI   3.4:1
  },
  border: {
    primary:   colors.chromeLight[500],   // #c7cac7  border primary
    secondary: colors.chromeLight[600],   // #abafab  border secondary
  },
  accent: {
    positive:      colors.teal.light,       // #0a7d5a  AA 4.82:1
    positiveHover: colors.teal.lightHov,    // #086647
    negative:      colors.rose.light,       // #c81d5a  AA 5.22:1
    negativeHover: colors.rose.lightHov,    // #a5174a
    warning:       colors.amber.light,      // #8a6410  AA 5.07:1
    info:          colors.brand.light,      // #0b7b8a  signature cyan-teal
    infoHover:     colors.brand.lightHov,   // #086470
    highlight:     colors.cyan.light,       // #0b7b8a  matches brand
    purple:        colors.purple.light,     // #5821b8
  },
  action: {
    buyBg:    colors.teal.light,
    buyText:  '#ffffff',
    sellBg:   colors.rose.light,
    sellText: '#ffffff',
  },
  state: {
    focusRing:    colors.brand.light,
    focusRingBg:  'rgba(11,123,138,0.30)',
    disabledBg:   colors.chromeLight[200],
    disabledFg:   colors.coolInk[3],
    hoverOverlay: 'rgba(20,24,26,0.045)',
    selection:    'rgba(11,123,138,0.14)',
  },
  overlay: {
    positiveSoft:  'rgba(10,125,90,0.10)',
    positiveRing:  'rgba(10,125,90,0.32)',
    negativeSoft:  'rgba(200,29,90,0.10)',
    negativeRing:  'rgba(200,29,90,0.32)',
    warningSoft:   'rgba(138,100,16,0.11)',
    warningRing:   'rgba(138,100,16,0.35)',
    infoSoft:      'rgba(11,123,138,0.10)',
    infoRing:      'rgba(11,123,138,0.38)',
    neutralSoft:   'rgba(61,67,71,0.07)',
    neutralRing:   'rgba(61,67,71,0.22)',
  },
  cvd: {
    buy:  colors.cvd.buyLight,    // #1a52c4
    sell: colors.cvd.sellLight,   // #c2410c
  },
  scrollbar: colors.chromeLight[600],
  elevation: {
    card:    '0 1px 2px rgba(20,24,26,0.06), 0 4px 12px rgba(20,24,26,0.06)',
    overlay: '0 1px 2px rgba(20,24,26,0.06), 0 4px 12px rgba(20,24,26,0.06)',
    glow:    '0 0 0 3px rgba(11,123,138,0.30)',
  },
};

// ── Chroma Desk · Dark ──────────────────────────────────────
// Balanced graphite chrome, vivid teal/rose, signature cyan brand.
export const dark: ColorScheme = {
  surface: {
    ground:     colors.graphite[975], // #0b0d10
    primary:    colors.graphite[950], // #14171b  card
    secondary:  colors.graphite[900], // #1c2025  hover
    tertiary:   colors.graphite[850], // #252a31  pressed
    quaternary: colors.graphite[800], // #31373f  accent band
  },
  text: {
    primary:   colors.graphite[50],   // #ecf0f5  AAA 14.8:1
    secondary: colors.graphite[300],  // #aab3bf  AAA  7.6:1
    muted:     colors.graphite[400],  // #7d8694  AA   4.6:1
    faint:     colors.graphite[500],  // #565d68  UI   2.7:1
  },
  border: {
    primary:   colors.graphite[600],  // #2b3139
    secondary: colors.graphite[700],  // #3e4552
  },
  accent: {
    positive:      colors.teal.dark,     // #22e3a8  AAA 11.1:1
    positiveHover: colors.teal.darkHov,  // #3fecb8
    negative:      colors.rose.dark,     // #ff5a82  AA  6.02:1
    negativeHover: colors.rose.darkHov,  // #ff7898
    warning:       colors.amber.dark,    // #f5c14b  AAA 10.6:1
    info:          colors.brand.dark,    // #22d3ee  signature cyan
    infoHover:     colors.brand.darkHov, // #4ae0f2
    highlight:     colors.cyan.dark,     // #22d3ee
    purple:        colors.purple.dark,   // #a78bfa
  },
  action: {
    // CTA backgrounds in dark use slightly-muted variants so
    // white CTA text remains readable.
    buyBg:    colors.teal.dark,
    buyText:  '#0b2b20',   // deep teal-black — AAA on mint-teal
    sellBg:   colors.rose.dark,
    sellText: '#2a0810',   // deep rose-black — AAA on rose
  },
  state: {
    focusRing:    colors.brand.dark,
    focusRingBg:  'rgba(34,211,238,0.30)',
    disabledBg:   colors.graphite[850],
    disabledFg:   colors.graphite[500],
    hoverOverlay: 'rgba(255,255,255,0.05)',
    selection:    'rgba(34,211,238,0.22)',
  },
  overlay: {
    positiveSoft:  'rgba(34,227,168,0.12)',
    positiveRing:  'rgba(34,227,168,0.40)',
    negativeSoft:  'rgba(255,90,130,0.12)',
    negativeRing:  'rgba(255,90,130,0.40)',
    warningSoft:   'rgba(245,193,75,0.13)',
    warningRing:   'rgba(245,193,75,0.40)',
    infoSoft:      'rgba(34,211,238,0.12)',
    infoRing:      'rgba(34,211,238,0.45)',
    neutralSoft:   'rgba(170,179,191,0.10)',
    neutralRing:   'rgba(170,179,191,0.25)',
  },
  cvd: {
    buy:  colors.cvd.buyDark,    // #7aa6ff
    sell: colors.cvd.sellDark,   // #ff9d4e
  },
  scrollbar: colors.graphite[700],
  elevation: {
    card:    '0 1px 0 rgba(255,255,255,0.04) inset, 0 2px 6px rgba(0,0,0,0.5)',
    overlay: shadow.lg,
    glow:    `0 0 0 2px rgba(34,211,238,0.40), 0 0 28px rgba(34,211,238,0.18)`,
  },
};

// ── Shared (non-theme-dependent) ──
export const shared = {
  typography,
  radius,
  spacing,
  opacity,
  transition,
  shadow,
} as const;

export const semantic = { dark, light, shared } as const;
