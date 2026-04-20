// ─────────────────────────────────────────────────────────────
//  FI Design System — Semantic Tokens
//  Maps primitives to purpose-driven roles.
//  Each color scheme (dark/light) gets its own mappings.
//
//  Design intent:
//    - Punchy, saturated accents — colors pop against neutral chrome.
//    - No earthy tones or brown/copper. Warning is pure orange.
//    - Dark: cool charcoal grounds, vivid accents.
//    - Light: cool off-white (never cream), charcoal text, vivid
//      accents that stay WCAG AA on the light ground.
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
    warning:       string;  // caution, pending (pure orange, never brown)
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
  scrollbar: string;
}

// ── Dark Scheme ─────────────────────────────────────────────
// Deep cool charcoal chrome + vibrant saturated accents.
export const dark: ColorScheme = {
  surface: {
    ground:    colors.charcoal[975],  // #0a0e14
    primary:   colors.charcoal[950],  // #121820 — card
    secondary: colors.charcoal[925],  // #1a212b — hover/header
    tertiary:  colors.charcoal[900],  // #242c38 — pressed
  },
  text: {
    primary:   '#e6e9ef',             // warm off-white (never pure white)
    secondary: '#a7b0bd',
    muted:     colors.charcoal[500],  // #6b7280
    faint:     colors.charcoal[700],  // #4d586a
  },
  border: {
    primary:   colors.charcoal[850],  // #2e3744
    secondary: colors.charcoal[800],  // #323b49
  },
  accent: {
    positive:      colors.teal[400],   // #14d9a0 — vivid teal
    positiveHover: colors.teal[500],   // #0fb88a
    negative:      colors.red[400],    // #ff4d6d — vivid coral
    negativeHover: colors.red[500],    // #e8304e
    warning:       colors.orange[500], // #ff8c42 — pure orange
    info:          colors.blue[500],   // #3b82f6 — punchy brand
    infoHover:     colors.blue[600],   // #2563eb
    highlight:     colors.cyan[400],   // #22d3ee — bright cyan
    purple:        colors.purple[400], // #a855f7
  },
  action: {
    buyBg:    colors.teal[500],   // #0fb88a
    buyText:  '#ffffff',
    sellBg:   colors.red[500],    // #e8304e
    sellText: '#ffffff',
  },
  state: {
    focusRing:    colors.blue[500],
    focusRingBg:  'rgba(59,130,246,0.30)',       // blue-500 @ 30%
    disabledBg:   colors.charcoal[900],
    disabledFg:   colors.charcoal[700],
    hoverOverlay: 'rgba(255,255,255,0.05)',
  },
  overlay: {
    positiveSoft:  'rgba(20,217,160,0.15)',  // teal-400 @ 15%
    positiveRing:  'rgba(20,217,160,0.35)',
    negativeSoft:  'rgba(255,77,109,0.15)',  // red-400 @ 15%
    negativeRing:  'rgba(255,77,109,0.35)',
    warningSoft:   'rgba(255,140,66,0.15)',  // orange-500 @ 15%
    warningRing:   'rgba(255,140,66,0.38)',
    infoSoft:      'rgba(59,130,246,0.15)',  // blue-500 @ 15%
    infoRing:      'rgba(59,130,246,0.35)',
    neutralSoft:   'rgba(107,114,128,0.20)', // charcoal-500 @ 20%
    neutralRing:   'rgba(107,114,128,0.30)',
  },
  scrollbar: colors.charcoal[800],
};

// ── Light Scheme ────────────────────────────────────────────
// Cool off-white (NOT cream, NOT warm) + charcoal text + vivid
// accents that pop without glare. WCAG AA across all text tiers.
export const light: ColorScheme = {
  surface: {
    ground:    colors.charcoal[50],   // #f3f5f9 — cool off-white
    primary:   '#fbfcfd',             // soft paper-cool (not pure #fff)
    secondary: colors.charcoal[100],  // #ebeef3
    tertiary:  colors.charcoal[150],  // #dde2ea
  },
  text: {
    primary:   '#1a1f2e',             // deep cool charcoal (never pure black)
    secondary: colors.charcoal[600],  // #4f5665
    muted:     colors.charcoal[500],  // #6b7280 — AA on off-white
    faint:     colors.charcoal[400],  // #9ca3af
  },
  border: {
    primary:   colors.charcoal[200],  // #d9dee8
    secondary: colors.charcoal[300],  // #c3cad7
  },
  accent: {
    positive:      colors.teal[600],   // #0ea870 — vivid emerald
    positiveHover: colors.teal[700],   // #0b8959
    negative:      colors.red[600],    // #e02e47 — vivid pink-red
    negativeHover: colors.red[700],    // #b81e37
    warning:       colors.orange[600], // #e86a1c — vivid orange (no brown)
    info:          colors.blue[600],   // #2563eb — punchy brand
    infoHover:     colors.blue[700],   // #1d4ed8
    highlight:     colors.cyan[500],   // #06b6d4
    purple:        colors.purple[600], // #7c3aed
  },
  action: {
    buyBg:    colors.teal[600],   // #0ea870
    buyText:  '#ffffff',
    sellBg:   colors.red[600],    // #e02e47
    sellText: '#ffffff',
  },
  state: {
    focusRing:    colors.blue[600],
    focusRingBg:  'rgba(37,99,235,0.22)',       // blue-600 @ 22%
    disabledBg:   colors.charcoal[100],
    disabledFg:   colors.charcoal[400],
    hoverOverlay: 'rgba(0,0,0,0.045)',
  },
  overlay: {
    positiveSoft:  'rgba(14,168,112,0.12)',  // teal-600 @ 12%
    positiveRing:  'rgba(14,168,112,0.32)',
    negativeSoft:  'rgba(224,46,71,0.10)',   // red-600 @ 10%
    negativeRing:  'rgba(224,46,71,0.32)',
    warningSoft:   'rgba(232,106,28,0.12)',  // orange-600 @ 12%
    warningRing:   'rgba(232,106,28,0.35)',
    infoSoft:      'rgba(37,99,235,0.10)',   // blue-600 @ 10%
    infoRing:      'rgba(37,99,235,0.32)',
    neutralSoft:   'rgba(79,86,101,0.08)',   // charcoal-600 @ 8%
    neutralRing:   'rgba(79,86,101,0.22)',
  },
  scrollbar: '#c3cad7',
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
