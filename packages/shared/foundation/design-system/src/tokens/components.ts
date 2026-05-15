// ─────────────────────────────────────────────────────────────
//  FI Design System — Component Tokens
//  Per-component overrides that both shadcn and PrimeNG consume.
//  Values reference semantic-scheme slots, never primitives directly.
//
//  `scheme.primary` is reserved for brand CTAs, focus rings, active tabs,
//  and primary framework hooks. `scheme.accent.*` is reserved for semantic
//  status accents: positive, negative, warning, info, highlight, purple.
// ─────────────────────────────────────────────────────────────

import { typography, radius, spacing } from './primitives';
import type { ColorScheme } from './semantic';
import { controls } from './controls';

export function componentTokens(scheme: ColorScheme) {
  return {
    control: controls,

    button: {
      fontFamily:    typography.fontFamily.sans,
      fontSize:      typography.fontSize.md,
      fontWeight:    typography.fontWeight.semibold,
      letterSpacing: typography.letterSpacing.normal,
      borderRadius:  radius.md,
      paddingX:      `${spacing[4]}px`,
      paddingY:      `${spacing[2]}px`,
      primary: {
        background:       scheme.primary.color,
        backgroundHover:  scheme.primary.hover,
        color:            scheme.primary.foreground,
      },
      buy: {
        background:       scheme.action.buyBg,
        backgroundHover:  scheme.accent.positiveHover,
        color:            scheme.action.buyText,
      },
      sell: {
        background:       scheme.action.sellBg,
        backgroundHover:  scheme.accent.negativeHover,
        color:            scheme.action.sellText,
      },
      ghost: {
        background:       'transparent',
        backgroundHover:  scheme.state.hoverOverlay,
        color:            scheme.text.secondary,
        borderColor:      scheme.border.secondary,
      },
      disabled: {
        background: scheme.state.disabledBg,
        color:      scheme.state.disabledFg,
        opacity:    0.6,
      },
    },

    input: {
      fontFamily:       typography.fontFamily.sans,
      fontSize:         typography.fontSize.sm,
      background:       'transparent',
      color:            scheme.text.primary,
      borderColor:      scheme.border.secondary,
      borderColorHover: scheme.primary.color,
      borderColorFocus: scheme.primary.color,
      focusRingBg:      scheme.state.focusRingBg,
      borderRadius:     radius.sm,
      placeholderColor: scheme.text.muted,
      paddingX:         `${spacing[2.5]}px`,
      paddingY:         `${spacing[1.5]}px`,
      disabledBg:       scheme.state.disabledBg,
      disabledColor:    scheme.state.disabledFg,
    },

    tab: {
      fontFamily:     typography.fontFamily.sans,
      fontSize:       typography.fontSize.sm,
      fontWeight:     typography.fontWeight.medium,
      color:          scheme.text.secondary,
      colorActive:    scheme.text.primary,
      indicatorColor: scheme.primary.color,
      indicatorWidth: '2px',
      paddingX:       `${spacing[3]}px`,
      paddingY:       `${spacing[2]}px`,
    },

    badge: {
      fontFamily:   typography.fontFamily.mono,
      fontSize:     typography.fontSize.xs,
      fontWeight:   typography.fontWeight.medium,
      borderRadius: radius.sm,
      paddingX:     `${spacing[1.5]}px`,
      paddingY:     '1px',
      filled:    { background: scheme.overlay.positiveSoft, color: scheme.accent.positive, border: scheme.overlay.positiveRing },
      partial:   { background: scheme.overlay.warningSoft,  color: scheme.accent.warning,  border: scheme.overlay.warningRing },
      pending:   { background: scheme.overlay.infoSoft,     color: scheme.accent.info,     border: scheme.overlay.infoRing },
      error:     { background: scheme.overlay.negativeSoft, color: scheme.accent.negative, border: scheme.overlay.negativeRing },
      neutral:   { background: scheme.overlay.neutralSoft,  color: scheme.text.muted,      border: scheme.overlay.neutralRing },
    },

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
      rowBorderColor:      scheme.border.primary,
      selectedRowBg:       scheme.primary.soft,
      cellPaddingX:        `${spacing[2.5]}px`,
      cellPaddingY:        `${spacing[1.5]}px`,
    },

    card: {
      background:   scheme.surface.primary,
      borderColor:  scheme.border.primary,
      borderRadius: radius.md,
      shadow:       scheme.elevation.card,
    },

    tooltip: {
      fontFamily:   typography.fontFamily.sans,
      fontSize:     typography.fontSize.sm,
      background:   scheme.surface.secondary,
      color:        scheme.text.primary,
      borderColor:  scheme.border.primary,
      borderRadius: radius.sm,
      paddingX:     `${spacing[2.5]}px`,
      paddingY:     `${spacing[1.5]}px`,
    },

    scrollbar: {
      width:      '10px',
      thumbColor: scheme.scrollbar,
      trackColor: 'transparent',
      radius:     radius.lg,
    },
  } as const;
}
