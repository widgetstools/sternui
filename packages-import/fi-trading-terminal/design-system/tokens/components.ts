// ─────────────────────────────────────────────────────────────
//  FI Design System — Component Tokens
//  Per-component overrides that both shadcn and PrimeNG map to.
//  Values reference semantic tokens or primitives directly.
//
//  Brand accent is `scheme.accent.info` (soft azure / steel blue).
//  `scheme.accent.warning` is SEMANTIC ONLY — never used for
//  primary buttons, focus rings, or tab indicators.
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
        backgroundHover: scheme.accent.infoHover,
        backgroundActive:scheme.accent.infoHover,
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
        backgroundHover: scheme.state.hoverOverlay,
        color:           scheme.text.secondary,
        borderColor:     scheme.border.secondary,
      },
      disabled: {
        background: scheme.state.disabledBg,
        color:      scheme.state.disabledFg,
        opacity:    0.6,
      },
    },

    // ── Input / Form Field ──
    input: {
      fontFamily:       typography.fontFamily.mono,
      fontSize:         typography.fontSize.sm,
      background:       'transparent',
      color:            scheme.text.primary,
      borderColor:      scheme.border.secondary,
      borderColorHover: scheme.accent.info,
      borderColorFocus: scheme.accent.info,   // brand ring, not warning/yellow
      focusRingBg:      scheme.state.focusRingBg,
      borderRadius:     radius.md,
      placeholderColor: scheme.text.muted,
      paddingX:         `${spacing[2.5]}px`,
      paddingY:         `${spacing[1.5]}px`,
      disabledBg:       scheme.state.disabledBg,
      disabledColor:    scheme.state.disabledFg,
    },

    // ── Tab Navigation ──
    tab: {
      fontFamily:      typography.fontFamily.sans,
      fontSize:        typography.fontSize.sm,
      fontWeight:      typography.fontWeight.medium,
      color:           scheme.text.secondary,
      colorActive:     scheme.text.primary,
      indicatorColor:  scheme.accent.info,    // brand, not yellow
      indicatorWidth:  '2px',
      paddingX:        `${spacing[3]}px`,
      paddingY:        `${spacing[2]}px`,
    },

    // ── Badge / Status Chip ──
    // All tints pulled from scheme.overlay — single source of truth.
    badge: {
      fontFamily:   typography.fontFamily.mono,
      fontSize:     typography.fontSize.xs,
      fontWeight:   typography.fontWeight.medium,
      borderRadius: radius.sm,
      paddingX:     `${spacing[1.5]}px`,
      paddingY:     '1px',
      filled: {
        background: scheme.overlay.positiveSoft,
        color:      scheme.accent.positive,
        border:     scheme.overlay.positiveRing,
      },
      partial: {
        background: scheme.overlay.warningSoft,
        color:      scheme.accent.warning,
        border:     scheme.overlay.warningRing,
      },
      pending: {
        background: scheme.overlay.infoSoft,
        color:      scheme.accent.info,
        border:     scheme.overlay.infoRing,
      },
      error: {
        background: scheme.overlay.negativeSoft,
        color:      scheme.accent.negative,
        border:     scheme.overlay.negativeRing,
      },
      neutral: {
        background: scheme.overlay.neutralSoft,
        color:      scheme.text.muted,
        border:     scheme.overlay.neutralRing,
      },
      // Quote type badges (order book)
      stream: {
        background: scheme.overlay.positiveSoft,
        color:      scheme.accent.positive,
      },
      rfq: {
        background: scheme.overlay.infoSoft,
        color:      scheme.accent.info,
      },
      indicative: {
        background: scheme.overlay.warningSoft,
        color:      scheme.accent.warning,
      },
    },

    // ── Instrument Context Bar ──
    instrumentBar: {
      fontFamily:   typography.fontFamily.mono,
      background:   scheme.overlay.infoSoft,
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
      selectedRowBg:       scheme.overlay.infoSoft,
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
