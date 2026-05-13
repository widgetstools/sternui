// ─────────────────────────────────────────────────────────────
//  FI Design System — Semantic Tokens
//  Maps primitives to purpose-driven roles.
//
//  Design intent:
//    - Exchange-terminal accents — colors pop against neutral chrome.
//    - No earthy tones or brown/copper. Warning is pure orange.
//    - Dark: cool charcoal grounds, vivid accents.
//    - Light: cool off-white (never cream), charcoal text, vivid
//      accents that stay readable on the light ground.
//
//  CVD (color-vision-deficiency) remains an opt-in override layer.
// ─────────────────────────────────────────────────────────────

import { colors, typography, radius, spacing, opacity, transition, shadow } from './primitives';

// ── Color Scheme Type ──
export interface ColorScheme {
  primary: {
    color:      string;  // brand primary: CTA, focus, active nav
    hover:      string;
    foreground: string;
    soft:       string;
    ring:       string;
  };
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
    info:          string;  // informational / links / pending statuses
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

// ── Light Scheme ────────────────────────────────────────────
// Cool clinical: airy #F8F9FB canvas, white cards, quiet dividers,
// cobalt primary accents, and rationed semantic color.
export const light: ColorScheme = {
  primary: {
    color:      colors.brand.light,       // #6b6498 — deep greyish lavender
    hover:      colors.brand.lightHov,    // #544e7c
    foreground: '#ffffff',
    soft:       'rgba(107,100,152,0.10)',
    ring:       'rgba(107,100,152,0.30)',
  },
  surface: {
    ground:     colors.paper[100],   // #f8f9fb — cool clinical canvas
    primary:    colors.paper[50],    // #ffffff — card / grid cells
    secondary:  colors.paper[200],   // #f3f5f8 — raised header / hover
    tertiary:   colors.paper[300],   // #edf1f5 — pressed
    quaternary: colors.paper[400],   // #e5eaf1 — accent band
  },
  text: {
    primary:   colors.ink[0],        // #111827
    secondary: colors.ink[1],        // #4b5563
    muted:     colors.ink[2],        // #6b7280
    faint:     colors.ink[3],        // #9aa3af
  },
  border: {
    primary:   colors.paper[500],    // #d8dee8
    secondary: colors.paper[600],    // #c4ccd8
  },
  accent: {
    positive:      colors.teal.light,       // #1f7a5c
    positiveHover: colors.teal.lightHov,    // #176247
    negative:      colors.rose.light,       // #a43f4b
    negativeHover: colors.rose.lightHov,    // #84313b
    warning:       colors.amber.light,      // #8a5f1f — muted ochre
    info:          colors.cyan.light,       // #3d6f99 — informational accent
    infoHover:     colors.cyan.lightHov,    // #315a7c
    highlight:     colors.cyan.highlightLight, // #06b6d4
    purple:        colors.purple.light,     // #7c3aed
  },
  action: {
    buyBg:    colors.teal.light,
    buyText:  '#ffffff',
    sellBg:   colors.rose.light,
    sellText: '#ffffff',
  },
  state: {
    focusRing:    colors.brand.light,
    focusRingBg:  'rgba(107,100,152,0.16)',
    disabledBg:   colors.paper[200],
    disabledFg:   colors.ink[3],
    hoverOverlay: 'rgba(0,0,0,0.045)',
    selection:    'rgba(107,100,152,0.12)',
  },
  overlay: {
    positiveSoft:  'rgba(31,122,92,0.08)',
    positiveRing:  'rgba(31,122,92,0.22)',
    negativeSoft:  'rgba(164,63,75,0.08)',
    negativeRing:  'rgba(164,63,75,0.24)',
    warningSoft:   'rgba(138,95,31,0.08)',
    warningRing:   'rgba(138,95,31,0.24)',
    infoSoft:      'rgba(61,111,153,0.08)',
    infoRing:      'rgba(61,111,153,0.24)',
    neutralSoft:   'rgba(75,85,99,0.05)',
    neutralRing:   'rgba(75,85,99,0.14)',
  },
  cvd: {
    buy:  colors.cvd.buyLight,    // #1e4fb8
    sell: colors.cvd.sellLight,   // #c2410c
  },
  scrollbar: colors.paper[600],
  elevation: {
    card:    shadow.sm,
    overlay: shadow.md,
    glow:    `0 0 0 3px rgba(107,100,152,0.16)`,
  },
};

// ── Dark Scheme ─────────────────────────────────────────────
// Deep cool charcoal chrome with electric exchange-terminal accents.
export const dark: ColorScheme = {
  primary: {
    color:      colors.brand.dark,       // #b5add8 — pale greyish lavender
    hover:      colors.brand.darkHov,    // #c9c2e4
    foreground: '#1a1726',               // dark plum for AA contrast on the pale lavender
    soft:       'rgba(181,173,216,0.22)',
    ring:       'rgba(181,173,216,0.44)',
  },
  surface: {
    ground:     colors.graphite[975], // #0a0e14
    primary:    colors.graphite[950], // #121820  card
    secondary:  colors.graphite[900], // #1a212b  hover
    tertiary:   colors.graphite[850], // #242c38  pressed
    quaternary: colors.graphite[800], // #242c38  accent band
  },
  text: {
    primary:   colors.graphite[50],   // #e6e9ef
    secondary: colors.graphite[300],  // #a7b0bd
    muted:     colors.graphite[400],  // #6b7280
    faint:     colors.graphite[500],  // #4d586a
  },
  border: {
    primary:   colors.graphite[600],  // #2e3744
    secondary: colors.graphite[700],  // #323b49
  },
  accent: {
    positive:      colors.teal.dark,     // #00f5a0
    positiveHover: colors.teal.darkHov,  // #31ffc1
    negative:      colors.rose.dark,     // #ff3366
    negativeHover: colors.rose.darkHov,  // #ff5c85
    warning:       colors.amber.dark,    // #ff9f1a — restrained orange
    info:          colors.cyan.dark,     // #48e6ff — informational accent
    infoHover:     colors.cyan.darkHov,  // #7eeeff
    highlight:     colors.cyan.highlightDark, // #00e5ff
    purple:        colors.purple.dark,   // #b56cff
  },
  action: {
    buyBg:    colors.teal.dark,
    buyText:  '#061c28',
    sellBg:   colors.rose.dark,
    sellText: '#061c28',
  },
  state: {
    focusRing:    colors.brand.dark,
    focusRingBg:  'rgba(181,173,216,0.30)',
    disabledBg:   colors.graphite[850],
    disabledFg:   colors.graphite[500],
    hoverOverlay: 'rgba(255,255,255,0.05)',
    selection:    'rgba(181,173,216,0.24)',
  },
  overlay: {
    positiveSoft:  'rgba(0,245,160,0.18)',
    positiveRing:  'rgba(0,245,160,0.45)',
    negativeSoft:  'rgba(255,51,102,0.18)',
    negativeRing:  'rgba(255,51,102,0.45)',
    warningSoft:   'rgba(255,159,26,0.16)',
    warningRing:   'rgba(255,159,26,0.38)',
    infoSoft:      'rgba(72,230,255,0.16)',
    infoRing:      'rgba(72,230,255,0.40)',
    neutralSoft:   'rgba(107,114,128,0.20)',
    neutralRing:   'rgba(107,114,128,0.30)',
  },
  cvd: {
    buy:  colors.cvd.buyDark,    // #7aa6ff
    sell: colors.cvd.sellDark,   // #ff9d4e
  },
  scrollbar: colors.graphite[700],
  elevation: {
    card:    shadow.sm,
    overlay: shadow.lg,
    glow:    `0 0 0 2px rgba(181,173,216,0.42), 0 0 28px rgba(181,173,216,0.20)`,
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
