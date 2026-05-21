// ─────────────────────────────────────────────────────────────
//  ColorScheme builder — maps StarUI hex/shadcn packs to semantic tokens
// ─────────────────────────────────────────────────────────────

import { colors } from './primitives';
import type { ColorScheme } from './colorScheme';
import type { StarUIHexMode, StarUIPalettePack, StarUIShadcnMode } from './starui/types';

export function buildColorScheme(
  hex: StarUIHexMode,
  shadcn: StarUIShadcnMode,
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
      selection:    hex.brandSoft,
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
      hex.warn,
      isDark ? colors.purple.dark : colors.purple.light,
      hex.down,
    ],
    sidebar: {
      background:        hex.sidebarGround,
      foreground:        hex.t0,
      primary:           isDark ? hex.brandLo : hex.brand,
      primaryForeground: isDark ? hex.bg : '#ffffff',
      accent:            hex.mutedSurface,
      accentForeground:  hex.t0,
      border:            isDark ? hex.bg3 : hex.border,
      ring:              isDark ? hex.brandLo : hex.brand,
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
      glow:    `0 0 0 3px ${hex.brandRing}`,
    },
    shadcn,
  };
}

export function buildSchemesForPack(pack: StarUIPalettePack): { dark: ColorScheme; light: ColorScheme } {
  return {
    dark:  buildColorScheme(pack.hex.dark, pack.shadcn.dark, 'dark'),
    light: buildColorScheme(pack.hex.light, pack.shadcn.light, 'light'),
  };
}
