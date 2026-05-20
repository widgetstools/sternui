// ─────────────────────────────────────────────────────────────
//  FI Design System — Semantic Tokens
//  Stockflux SLATE BLUE (`data-palette="slate"`) — single theme.
//  Canonical hex: tokens/stockfluxSlate.ts
// ─────────────────────────────────────────────────────────────

import { colors, typography, radius, spacing, opacity, transition, shadow } from './primitives';
import { stockfluxSlateHex, stockfluxSlateShadcn } from './stockfluxSlate';

// ── Color Scheme Type ──
export interface ColorScheme {
  primary: {
    color:      string;  // CTA fill (shadcn --primary)
    hover:      string;  // CTA hover
    display:    string;  // link / accent (sf-teal)
    highlight:  string;  // hover highlight (sf-teal-hi)
    pressed:    string;  // pressed (sf-teal-lo)
    foreground: string;
    soft:       string;
    ring:       string;
  };
  surface: {
    ground:     string;
    sunken:     string;
    primary:    string;
    secondary:  string;
    tertiary:   string;
    quaternary: string;
    muted:      string;
    popover:    string;
  };
  text: {
    primary:   string;
    secondary: string;
    muted:     string;
    faint:     string;
    disabled:  string;
  };
  border: {
    primary:   string;
    secondary: string;
    tertiary:  string;
  };
  accent: {
    positive:      string;
    positiveHover: string;
    negative:      string;
    negativeHover: string;
    warning:       string;
    info:          string;
    infoHover:     string;
    highlight:     string;
    purple:        string;
  };
  trade: {
    flat:          string;
    positiveStrip: string;
    negativeStrip: string;
    bidFill:       string;
    askFill:       string;
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
    negativeSoft:  string;
    warningSoft:   string;
    infoSoft:      string;
    positiveRing:  string;
    negativeRing:  string;
    warningRing:   string;
    infoRing:      string;
    neutralSoft:   string;
    neutralRing:   string;
  };
  chart: readonly [string, string, string, string, string];
  sidebar: {
    background:          string;
    foreground:            string;
    primary:               string;
    primaryForeground:     string;
    accent:                string;
    accentForeground:      string;
    border:                string;
    ring:                  string;
  };
  cvd: {
    buy:  string;
    sell: string;
  };
  scrollbar: string;
  elevation: {
    card:    string;
    overlay: string;
    glow:    string;
  };
  /** shadcn/ui HSL channel triplets — must match Stockflux palettes.css slate */
  shadcn: typeof stockfluxSlateShadcn.dark | typeof stockfluxSlateShadcn.light;
}

function schemeFromStockflux(
  hex: typeof stockfluxSlateHex.dark | typeof stockfluxSlateHex.light,
  shadcn: typeof stockfluxSlateShadcn.dark | typeof stockfluxSlateShadcn.light,
  mode: 'dark' | 'light',
): ColorScheme {
  const isDark = mode === 'dark';
  return {
    primary: {
      color:      isDark ? hex.brandLo : hex.brand,
      hover:      isDark ? hex.brand : hex.brandHi,
      display:    hex.brand,
      highlight:  hex.brandHi,
      pressed:    hex.brandLo,
      foreground: '#ffffff',
      soft:       hex.brandSoft,
      ring:       hex.brandRing,
    },
    surface: {
      ground:     hex.bg,
      sunken:     hex.bg1,
      primary:    hex.bg2,
      secondary:  hex.bg3,
      tertiary:   hex.bg4,
      quaternary: hex.bg5,
      muted:      hex.mutedSurface,
      popover:    hex.popoverSurface,
    },
    text: {
      primary:   hex.t0,
      secondary: hex.t1,
      muted:     hex.t2,
      faint:     hex.t3,
      disabled:  hex.t4,
    },
    border: {
      primary:   hex.border,
      secondary: hex.border2,
      tertiary:  hex.border3,
    },
    accent: {
      positive:      hex.up,
      positiveHover: hex.upHi,
      negative:      hex.down,
      negativeHover: hex.downHi,
      warning:       hex.warn,
      info:          hex.info,
      infoHover:     isDark ? colors.cyan.darkHov : colors.cyan.lightHov,
      highlight:     isDark ? colors.cyan.highlightDark : colors.cyan.highlightLight,
      purple:        isDark ? colors.purple.dark : colors.purple.light,
    },
    trade: {
      flat:          hex.flat,
      positiveStrip: hex.upStrip,
      negativeStrip: hex.downStrip,
      bidFill:       hex.bidFill,
      askFill:       hex.askFill,
    },
    action: {
      buyBg:    hex.up,
      buyText:  '#ffffff',
      sellBg:   hex.down,
      sellText: '#ffffff',
    },
    state: {
      focusRing:    isDark ? hex.brandLo : hex.brand,
      focusRingBg:  hex.brandSoft,
      disabledBg:   hex.bg4,
      disabledFg:   hex.t4,
      hoverOverlay: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.045)',
      selection:    isDark ? 'rgba(59,130,246,0.20)' : 'rgba(37,99,235,0.12)',
    },
    overlay: {
      positiveSoft: hex.upSoft,
      positiveRing: hex.upSoft,
      negativeSoft: hex.downSoft,
      negativeRing: hex.downSoft,
      warningSoft:  hex.warnSoft,
      warningRing:  hex.warnSoft,
      infoSoft:     hex.infoSoft,
      infoRing:     hex.infoSoft,
      neutralSoft:  isDark ? 'rgba(143,147,154,0.13)' : 'rgba(82,93,108,0.08)',
      neutralRing:  isDark ? 'rgba(143,147,154,0.24)' : 'rgba(82,93,108,0.14)',
    },
    chart: [
      isDark ? hex.brandLo : hex.brand,
      hex.up,
      isDark ? hex.warn : hex.warn,
      isDark ? colors.purple.dark : colors.purple.light,
      hex.down,
    ],
    sidebar: {
      background:       hex.sidebarGround,
      foreground:       hex.t0,
      primary:          isDark ? hex.brandLo : hex.brand,
      primaryForeground: isDark ? '#0b0f14' : '#ffffff',
      accent:           hex.mutedSurface,
      accentForeground: hex.t0,
      border:           isDark ? hex.bg3 : hex.border,
      ring:             isDark ? hex.brandLo : hex.brand,
    },
    cvd: {
      buy:  isDark ? colors.cvd.buyDark : colors.cvd.buyLight,
      sell: isDark ? colors.cvd.sellDark : colors.cvd.sellLight,
    },
    scrollbar: hex.scrollbar,
    elevation: {
      card:    isDark
        ? '0 1px 2px rgba(0,0,0,0.4)'
        : '0 1px 2px rgba(12,29,48,0.06)',
      overlay: isDark
        ? '0 4px 12px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.04) inset'
        : '0 2px 8px rgba(12,29,48,0.08), 0 1px 0 rgba(255,255,255,0.6) inset',
      glow:    isDark
        ? '0 0 0 3px rgba(59,130,246,0.38)'
        : '0 0 0 3px rgba(37,99,235,0.22)',
    },
    shadcn,
  };
}

export const dark: ColorScheme = schemeFromStockflux(
  stockfluxSlateHex.dark,
  stockfluxSlateShadcn.dark,
  'dark',
);

export const light: ColorScheme = schemeFromStockflux(
  stockfluxSlateHex.light,
  stockfluxSlateShadcn.light,
  'light',
);

export const shared = {
  typography,
  radius,
  spacing,
  opacity,
  transition,
  shadow,
} as const;

export const semantic = { dark, light, shared } as const;
