// ─────────────────────────────────────────────────────────────
//  FI Design System — Component Tokens
//  Per-component overrides that both shadcn and PrimeNG map to.
//  Values reference semantic tokens or primitives directly.
// ─────────────────────────────────────────────────────────────

import { typography, radius, spacing } from './primitives';
import type { ColorScheme } from './semantic';

export function componentTokens(scheme: ColorScheme) {
  return {
    // ── Button ──
    button: {
      fontFamily:     typography.fontFamily.mono,
      fontSize:       typography.fontSize.md,
      fontWeight:     typography.fontWeight.bold,
      letterSpacing:  typography.letterSpacing.normal,
      borderRadius:   radius.lg,
      paddingX:       `${spacing[4]}px`,
      paddingY:       `${spacing[2.5]}px`,
      primary: {
        background:      scheme.accent.info,
        backgroundHover: scheme.accent.highlight,
        color:           '#ffffff',
      },
      buy: {
        background:      scheme.action.buyBg,
        backgroundHover: scheme.accent.positiveHover,
        color:           scheme.action.buyText,
      },
      sell: {
        background:      scheme.action.sellBg,
        backgroundHover: scheme.accent.negativeHover,
        color:           scheme.action.sellText,
      },
      ghost: {
        background:      'transparent',
        backgroundHover: scheme.surface.tertiary,
        color:           scheme.text.secondary,
        borderColor:     scheme.border.secondary,
      },
    },

    // ── Input / Form Field ──
    input: {
      fontFamily:      typography.fontFamily.mono,
      fontSize:        typography.fontSize.sm,
      background:      'transparent',
      color:           scheme.text.primary,
      borderColor:     scheme.border.secondary,
      borderColorFocus:scheme.accent.warning,
      borderRadius:    radius.md,
      placeholderColor:scheme.text.muted,
      paddingX:        `${spacing[2.5]}px`,
      paddingY:        `${spacing[1.5]}px`,
    },

    // ── Tab Navigation ──
    tab: {
      fontFamily:      typography.fontFamily.sans,
      fontSize:        typography.fontSize.sm,
      fontWeight:      typography.fontWeight.medium,
      color:           scheme.text.secondary,
      colorActive:     scheme.text.primary,
      indicatorColor:  scheme.accent.warning,
      indicatorWidth:  '2px',
      paddingX:        `${spacing[3]}px`,
      paddingY:        `${spacing[2]}px`,
    },

    // ── Badge / Status Chip ──
    badge: {
      fontFamily:   typography.fontFamily.mono,
      fontSize:     typography.fontSize.xs,
      fontWeight:   typography.fontWeight.medium,
      borderRadius: radius.sm,
      paddingX:     `${spacing[1.5]}px`,
      paddingY:     '1px',
      // Order status badges
      filled: {
        background: `rgba(45,212,191,0.12)`,
        color:      scheme.accent.positive,
        border:     `rgba(45,212,191,0.3)`,
      },
      partial: {
        background: `rgba(240,185,11,0.12)`,
        color:      scheme.accent.warning,
        border:     `rgba(240,185,11,0.3)`,
      },
      pending: {
        background: `rgba(30,144,255,0.12)`,
        color:      scheme.accent.info,
        border:     `rgba(30,144,255,0.3)`,
      },
      error: {
        background: `rgba(248,113,113,0.10)`,
        color:      scheme.accent.negative,
        border:     `rgba(248,113,113,0.3)`,
      },
      // Quote type badges (order book)
      stream: {
        background: `rgba(45,212,191,0.12)`,
        color:      scheme.accent.positive,
      },
      rfq: {
        background: `rgba(30,144,255,0.12)`,
        color:      scheme.accent.info,
      },
      indicative: {
        background: `rgba(240,185,11,0.12)`,
        color:      scheme.accent.warning,
      },
    },

    // ── Instrument Context Bar ──
    instrumentBar: {
      fontFamily:   typography.fontFamily.mono,
      background:   `rgba(0,188,212,0.04)`,
      borderColor:  scheme.border.primary,
      tickerColor:  scheme.accent.highlight,
      tickerSize:   typography.fontSize.sm,
      metaColor:    scheme.text.muted,
      metaSize:     typography.fontSize.xs,
    },

    // ── Countdown Ring ──
    countdownRing: {
      size:         28,
      strokeWidth:  2.5,
      trackColor:   scheme.surface.secondary,
      activeColor:  scheme.accent.info,
      warningColor: scheme.accent.warning,
      dangerColor:  scheme.accent.negative,
      fontSize:     typography.fontSize.xs,
      fontFamily:   typography.fontFamily.mono,
    },

    // ── Data Table ──
    table: {
      fontFamily:          typography.fontFamily.mono,
      fontSize:            typography.fontSize.sm,
      headerFontSize:      typography.fontSize.xs,
      headerFontWeight:    typography.fontWeight.regular,
      headerLetterSpacing: typography.letterSpacing.wide,
      headerBackground:    scheme.surface.secondary,
      headerColor:         scheme.text.secondary,
      rowBackground:       scheme.surface.primary,
      rowBackgroundHover:  scheme.surface.secondary,
      rowBorderColor:      `${scheme.border.primary}99`,
      cellPaddingX:        `${spacing[2.5]}px`,
      cellPaddingY:        `${spacing[1.5]}px`,
    },

    // ── Card / Panel ──
    card: {
      background:  scheme.surface.primary,
      borderColor: scheme.border.primary,
      borderRadius: radius.lg,
    },

    // ── Tooltip ──
    tooltip: {
      fontFamily:   typography.fontFamily.mono,
      fontSize:     typography.fontSize.sm,
      background:   scheme.surface.secondary,
      color:        scheme.text.primary,
      borderColor:  scheme.border.primary,
      borderRadius: radius.md,
      paddingX:     `${spacing[2.5]}px`,
      paddingY:     `${spacing[1.5]}px`,
    },

    // ── Scrollbar ──
    scrollbar: {
      width:      '3px',
      thumbColor: scheme.scrollbar,
      trackColor: 'transparent',
      radius:     radius.sm,
    },
  } as const;
}
