// ─────────────────────────────────────────────────────────────
//  FI Design System — PrimeNG Adapter
//  Generates a preset config object compatible with
//  definePreset(Aura, config) in Angular PrimeNG v19+.
//  Import this in your Angular app's providePrimeNG() config.
// ─────────────────────────────────────────────────────────────

import { colors, typography, radius } from '../tokens/primitives';
import { dark, light } from '../tokens/semantic';
import { componentTokens } from '../tokens/components';

/**
 * Generate the PrimeNG preset override object.
 * Usage in Angular:
 *
 * ```typescript
 * import { definePreset } from 'primeng/api';
 * import { Aura } from 'primeng/themes';
 * import { generatePrimeNGPreset } from '@fi-design-system/adapters/primeng';
 *
 * const FiTheme = definePreset(Aura, generatePrimeNGPreset());
 *
 * providePrimeNG({
 *   theme: {
 *     preset: FiTheme,
 *     options: { darkModeSelector: '[data-theme="dark"]' }
 *   }
 * })
 * ```
 */
export function generatePrimeNGPreset() {
  const darkComp = componentTokens(dark);

  return {
    // ── Primitive overrides ──
    primitive: {
      borderRadius: {
        none: radius.none,
        xs:   radius.sm,
        sm:   radius.md,
        md:   radius.lg,
        lg:   radius.xl,
        xl:   '8px',
      },
    },

    // ── Semantic overrides ──
    semantic: {
      // Map blue scale → primary. Brand accent is soft azure/steel blue,
      // NOT yellow. Trading greens still indicate positive/buy actions
      // at the component level (button.buy, not primary).
      primary: {
        50:  colors.blue[50],
        100: colors.blue[100],
        200: colors.blue[200],
        300: colors.blue[300],
        400: colors.blue[400],
        500: colors.blue[500],
        600: colors.blue[600],
        700: colors.blue[700],
        800: colors.charcoal[800],
        900: colors.charcoal[900],
      },
      // Status colors
      success: { 500: colors.teal[500] },
      warning: { 500: colors.orange[500] },
      danger:  { 500: colors.red[500] },
      info:    { 500: colors.blue[500] },

      // Font
      fontFamily: typography.fontFamily.sans,

      // Per-scheme surface and text
      colorScheme: {
        light: {
          surface: {
            0:   light.surface.primary,
            50:  light.surface.ground,
            100: light.surface.secondary,
            200: light.surface.tertiary,
            300: colors.charcoal[300],
            400: colors.charcoal[400],
            500: colors.charcoal[500],
            600: colors.charcoal[600],
            700: colors.charcoal[700],
            800: colors.charcoal[800],
            900: colors.charcoal[900],
            950: colors.charcoal[950],
          },
          primary: {
            color:         light.accent.info,
            contrastColor: '#ffffff',
            hoverColor:    light.accent.infoHover,
            activeColor:   colors.blue[700],
          },
          text: {
            color:          light.text.primary,
            hoverColor:     light.text.primary,
            mutedColor:     light.text.muted,
            hoverMutedColor:light.text.secondary,
          },
          content: {
            background:  light.surface.primary,
            hoverBackground: light.surface.secondary,
            borderColor: light.border.primary,
            color:       light.text.primary,
            hoverColor:  light.text.primary,
          },
          formField: {
            background:       light.surface.primary,
            disabledBackground: light.state.disabledBg,
            filledBackground:   light.surface.secondary,
            borderColor:      light.border.secondary,
            hoverBorderColor: light.accent.info,
            focusBorderColor: light.accent.info,   // brand focus, not warning
            color:            light.text.primary,
            disabledColor:    light.state.disabledFg,
            placeholderColor: light.text.muted,
          },
        },
        dark: {
          surface: {
            0:   dark.surface.ground,
            50:  dark.surface.primary,
            100: dark.surface.secondary,
            200: dark.surface.tertiary,
            300: colors.charcoal[800],
            400: colors.charcoal[700],
            500: colors.charcoal[600],
            600: colors.charcoal[500],
            700: colors.charcoal[400],
            800: colors.charcoal[300],
            900: colors.charcoal[200],
            950: colors.charcoal[100],
          },
          primary: {
            color:         dark.accent.info,
            contrastColor: '#ffffff',
            hoverColor:    dark.accent.infoHover,
            activeColor:   colors.blue[300],
          },
          text: {
            color:          dark.text.primary,
            hoverColor:     dark.text.primary,
            mutedColor:     dark.text.muted,
            hoverMutedColor:dark.text.secondary,
          },
          content: {
            background:  dark.surface.primary,
            hoverBackground: dark.surface.secondary,
            borderColor: dark.border.primary,
            color:       dark.text.primary,
            hoverColor:  dark.text.primary,
          },
          formField: {
            background:       dark.surface.primary,
            disabledBackground: dark.state.disabledBg,
            filledBackground:   dark.surface.tertiary,
            borderColor:      dark.border.secondary,
            hoverBorderColor: dark.accent.info,
            focusBorderColor: dark.accent.info,   // brand focus, not warning
            color:            dark.text.primary,
            disabledColor:    dark.state.disabledFg,
            placeholderColor: dark.text.muted,
          },
        },
      },
    },

    // ── Component overrides ──
    components: {
      button: {
        borderRadius: darkComp.button.borderRadius,
        paddingX:     darkComp.button.paddingX,
        paddingY:     darkComp.button.paddingY,
        fontWeight:   String(darkComp.button.fontWeight),
      },
      inputtext: {
        borderRadius: darkComp.input.borderRadius,
        paddingX:     darkComp.input.paddingX,
        paddingY:     darkComp.input.paddingY,
      },
      datatable: {
        headerCellPadding: `${darkComp.table.cellPaddingY} ${darkComp.table.cellPaddingX}`,
        bodyCellPadding:   `${darkComp.table.cellPaddingY} ${darkComp.table.cellPaddingX}`,
      },
      tab: {
        activeBorderColor: dark.accent.info,     // brand, not warning/yellow
      },
    },
  };
}
