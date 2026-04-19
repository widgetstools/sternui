// ─────────────────────────────────────────────────────────────
//  FI Design System — Semantic Tokens
//  Maps primitives to purpose-driven roles.
//  Each color scheme (dark/light) gets its own mappings.
//
//  Readability priorities:
//    - Both themes desaturated — no neon, no pure white/black.
//    - Light theme uses warm paper tones, not clinical white.
//    - Brand accent is soft azure blue (never yellow) — calm on
//      the eyes across a full trading day.
//    - Trading greens/reds are muted but still unambiguous.
//    - WCAG AA contrast on all text tiers.
// ─────────────────────────────────────────────────────────────

import { colors, typography, radius, spacing, opacity, transition } from './primitives';

// ── Color Scheme Type ──
export interface ColorScheme {
  surface: {
    ground:    string;  // page/app background
    primary:   string;  // card/panel background
    secondary: string;  // hover, header background
    tertiary:  string;  // active/pressed, accent bg
  };
  text: {
    primary:   string;  // main body text
    secondary: string;  // labels, descriptions
    muted:     string;  // captions, timestamps
    faint:     string;  // disabled, placeholder
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
    warning:       string;  // caution, pending (semantic only — not brand)
    info:          string;  // BRAND / primary / informational / links
    infoHover:     string;
    highlight:     string;  // emphasis, selected
    purple:        string;  // tertiary accent
  };
  action: {
    buyBg:    string;  // buy CTA button background
    buyText:  string;
    sellBg:   string;  // sell CTA button background
    sellText: string;
  };
  // Interactive state tokens — applied across buttons, inputs, tabs.
  state: {
    focusRing:   string;  // keyboard focus outline (brand color)
    focusRingBg: string;  // focus ring halo (rgba of brand)
    disabledBg:  string;
    disabledFg:  string;
    hoverOverlay:string;  // subtle wash on hover (rgba)
  };
  // Soft tinted backgrounds used by status badges, order book fills,
  // rating chips. Defined once here so cell-renderers, components.ts,
  // and themes all share the same opacity tiers.
  overlay: {
    positiveSoft:  string;  // filled badge bg
    positiveRing:  string;  // filled badge border
    negativeSoft:  string;
    negativeRing:  string;
    warningSoft:   string;
    warningRing:   string;
    infoSoft:      string;
    infoRing:      string;
    neutralSoft:   string;  // stale/cancelled chips
    neutralRing:   string;
  };
  scrollbar: string;
}

// ── Dark Scheme ─────────────────────────────────────────────
// Binance-inspired chrome: deep charcoal backgrounds with strong
// contrast between ground and card, minimal borders.
// Softened: no yellow brand, desaturated accents, warm off-white text.
export const dark: ColorScheme = {
  surface: {
    ground:    colors.charcoal[975],  // #0a0e14
    primary:   colors.charcoal[950],  // #121820 — card
    secondary: colors.charcoal[925],  // #1a212b — hover/header
    tertiary:  colors.charcoal[900],  // #242c38 — pressed/active
  },
  text: {
    primary:   '#e6e9ef',             // warm off-white (never pure white)
    secondary: '#a7b0bd',
    muted:     colors.charcoal[500],  // #757982
    faint:     colors.charcoal[700],  // #4d586a
  },
  border: {
    primary:   colors.charcoal[850],  // #2e3744 — subtle panel border
    secondary: colors.charcoal[800],  // #323b49 — interactive
  },
  accent: {
    positive:      colors.teal[400],   // #3dbfa0 — muted teal (no neon)
    positiveHover: colors.teal[500],   // #2fa88a
    negative:      colors.red[400],    // #e56464 — soft coral (not fire engine)
    negativeHover: colors.red[500],    // #d04f4f
    warning:       colors.amber[500],  // #d4a84a — semantic only, never brand
    info:          colors.blue[400],   // #6ba4e8 — BRAND / primary
    infoHover:     colors.blue[500],   // #4e8bd1
    highlight:     colors.cyan[400],   // #7db4e3 — soft sky (selected)
    purple:        colors.purple[400], // #a48ad4
  },
  action: {
    buyBg:    colors.teal[500],   // #2fa88a
    buyText:  '#ffffff',
    sellBg:   colors.red[500],    // #d04f4f
    sellText: '#ffffff',
  },
  state: {
    focusRing:    colors.blue[400],                // brand ring
    focusRingBg:  'rgba(107,164,232,0.25)',        // blue-400 @ 25%
    disabledBg:   colors.charcoal[900],
    disabledFg:   colors.charcoal[700],
    hoverOverlay: 'rgba(255,255,255,0.04)',
  },
  overlay: {
    positiveSoft:  'rgba(61,191,160,0.12)',  // teal-400 @ 12%
    positiveRing:  'rgba(61,191,160,0.30)',
    negativeSoft:  'rgba(229,100,100,0.12)', // red-400 @ 12%
    negativeRing:  'rgba(229,100,100,0.30)',
    warningSoft:   'rgba(212,168,74,0.12)',  // amber-500 @ 12%
    warningRing:   'rgba(212,168,74,0.30)',
    infoSoft:      'rgba(107,164,232,0.12)', // blue-400 @ 12%
    infoRing:      'rgba(107,164,232,0.30)',
    neutralSoft:   'rgba(117,121,130,0.18)', // charcoal-500 @ 18%
    neutralRing:   'rgba(117,121,130,0.25)',
  },
  scrollbar: colors.charcoal[800],
};

// ── Light Scheme ────────────────────────────────────────────
// Warm paper tones — NOT pure white. Soothing for long sessions.
// Charcoal text (never pure black). Muted accents retain clarity
// without glare. WCAG AA across all text tiers.
export const light: ColorScheme = {
  surface: {
    ground:    '#f5f3ed',   // warm cream page background
    primary:   '#fbfaf6',   // soft paper-tone cards (never #ffffff)
    secondary: '#edeae1',   // hover / header
    tertiary:  '#e1ddd1',   // pressed / active
  },
  text: {
    primary:   '#2a2d31',   // dark charcoal (never pure black)
    secondary: colors.charcoal[600],  // #575b62
    muted:     colors.charcoal[500],  // #757982 — AA on cream bg
    faint:     colors.charcoal[400],  // #a8abb0
  },
  border: {
    primary:   colors.charcoal[200],  // #dfdbd1 — soft warm border
    secondary: colors.charcoal[300],  // #cbc6ba
  },
  accent: {
    positive:      colors.teal[600],   // #1f8c6e — forest teal (muted)
    positiveHover: colors.teal[700],   // #156b53
    negative:      colors.red[600],    // #b8463f — brick red (muted)
    negativeHover: colors.red[700],    // #963028
    warning:       colors.amber[700],  // #b27a1f — dark amber, semantic only
    info:          colors.blue[600],   // #2f6fb3 — steel blue BRAND
    infoHover:     colors.blue[700],   // #245a95
    highlight:     colors.cyan[500],   // #4a8cc4
    purple:        colors.purple[600], // #7b5ba8
  },
  action: {
    buyBg:    colors.teal[600],   // #1f8c6e
    buyText:  '#ffffff',
    sellBg:   colors.red[600],    // #b8463f
    sellText: '#ffffff',
  },
  state: {
    focusRing:    colors.blue[600],                // brand ring
    focusRingBg:  'rgba(47,111,179,0.18)',         // blue-600 @ 18%
    disabledBg:   colors.charcoal[100],
    disabledFg:   colors.charcoal[400],
    hoverOverlay: 'rgba(0,0,0,0.035)',
  },
  overlay: {
    positiveSoft:  'rgba(31,140,110,0.10)',  // teal-600 @ 10%
    positiveRing:  'rgba(31,140,110,0.28)',
    negativeSoft:  'rgba(184,70,63,0.08)',   // red-600 @ 8%
    negativeRing:  'rgba(184,70,63,0.28)',
    warningSoft:   'rgba(178,122,31,0.10)',  // amber-700 @ 10%
    warningRing:   'rgba(178,122,31,0.30)',
    infoSoft:      'rgba(47,111,179,0.08)',  // blue-600 @ 8%
    infoRing:      'rgba(47,111,179,0.28)',
    neutralSoft:   'rgba(87,91,98,0.08)',    // charcoal-600 @ 8%
    neutralRing:   'rgba(87,91,98,0.20)',
  },
  scrollbar: '#c6c2b7',
};

// ── Shared (non-theme-dependent) ──
export const shared = {
  typography,
  radius,
  spacing,
  opacity,
  transition,
} as const;

export const semantic = { dark, light, shared } as const;
