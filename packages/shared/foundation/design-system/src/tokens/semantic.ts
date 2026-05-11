// ─────────────────────────────────────────────────────────────
//  FI Design System — Semantic Tokens  (v2)
//  Maps primitives to purpose-driven roles.
//
//  Design intent:
//    - LIGHT = "Refined Classic" — warm paper ground, deep warm
//      charcoal text, understated teal / rose accents.
//      Editorial IBM Plex typography. Trader-friendly, low-glare.
//    - DARK  = "Chroma Desk"     — balanced graphite chrome,
//      vivid mint-teal & rose, signature cyan brand moment.
//      Geist + JetBrains Mono.
//
//  All accents WCAG-audited against their paired surface.
//  Warning is pure amber — visually distinct from negative.
//
//  CVD (color-vision-deficiency) is an opt-in override layer.
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

// ── Light Scheme — "Refined Classic" ────────────────────────
export const light: ColorScheme = {
  surface: {
    ground:     colors.paper[100],   // #f5f1ea — warm cream paper
    primary:    colors.paper[50],    // #fbf8f2 — card
    secondary:  colors.paper[200],   // #ece6da — hover
    tertiary:   colors.paper[300],   // #e0d8c8 — pressed
    quaternary: colors.paper[400],   // #d5ccb8 — accent band
  },
  text: {
    primary:   colors.ink[0],        // #2a2519  AAA 13.1:1
    secondary: colors.ink[1],        // #524a38  AAA  7.8:1
    muted:     colors.ink[2],        // #6d6550  AA   5.2:1
    faint:     colors.ink[3],        // #8a806a  UI   3.5:1
  },
  border: {
    primary:   colors.paper[500],    // #c9bfab
    secondary: colors.paper[600],    // #b4a98f
  },
  accent: {
    positive:      colors.teal.light,       // #0a7d5a  AA 4.82:1
    positiveHover: colors.teal.lightHov,    // #086647
    negative:      colors.rose.light,       // #c81d5a  AA 5.22:1
    negativeHover: colors.rose.lightHov,    // #a5174a
    warning:       colors.amber.light,      // #8a6410  AA 5.07:1
    info:          colors.brand.light,      // #1e4fb8  AA 6.91:1
    infoHover:     colors.brand.lightHov,   // #1a43a0
    highlight:     colors.cyan.light,       // #047987
    purple:        colors.purple.light,     // #6d28d9
  },
  action: {
    buyBg:    colors.teal.light,
    buyText:  '#ffffff',
    sellBg:   colors.rose.light,
    sellText: '#ffffff',
  },
  state: {
    focusRing:    colors.brand.light,
    focusRingBg:  'rgba(30,79,184,0.22)',
    disabledBg:   colors.paper[200],
    disabledFg:   colors.ink[3],
    hoverOverlay: 'rgba(42,37,25,0.045)',
    selection:    'rgba(30,79,184,0.18)',
  },
  overlay: {
    positiveSoft:  'rgba(14,124,91,0.09)',
    positiveRing:  'rgba(14,124,91,0.30)',
    negativeSoft:  'rgba(191,32,82,0.09)',
    negativeRing:  'rgba(191,32,82,0.30)',
    warningSoft:   'rgba(138,100,16,0.10)',
    warningRing:   'rgba(138,100,16,0.35)',
    infoSoft:      'rgba(30,79,184,0.08)',
    infoRing:      'rgba(30,79,184,0.32)',
    neutralSoft:   'rgba(82,74,56,0.07)',
    neutralRing:   'rgba(82,74,56,0.22)',
  },
  cvd: {
    buy:  colors.cvd.buyLight,    // #1e4fb8
    sell: colors.cvd.sellLight,   // #c2410c
  },
  scrollbar: colors.paper[600],
  elevation: {
    card:    shadow.sm,
    overlay: shadow.md,
    glow:    `0 0 0 3px rgba(30,79,184,0.18)`,
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
