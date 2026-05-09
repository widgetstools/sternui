// ─────────────────────────────────────────────────────────────
//  PrimeNG Preset — for definePreset(Aura, primengPreset)
//
//  Color values are var(--ds-*) references (live-themed).
//  Apps wire via providePrimeNG() — see SECTION 4 of the spec.
// ─────────────────────────────────────────────────────────────

import { colors, radius } from '../tokens/primitives';

const v = (name: string) => `var(--ds-${name})`;

export const primengPreset = {
  primitive: {
    borderRadius: {
      none: '0px',
      xs:   radius.sm,
      sm:   radius.sm,
      md:   radius.md,
      lg:   radius.lg,
      xl:   radius.xl,
    },
  },
  semantic: {
    primary: {
      50:  colors.brand.light,
      100: colors.brand.light,
      200: colors.brand.light,
      300: colors.brand.light,
      400: colors.brand.lightHov,
      500: v('accent-info'),
      600: v('accent-info-hover'),
      700: colors.brand.lightHov,
      800: colors.brand.lightHov,
      900: colors.brand.lightHov,
    },
    success: { 500: v('accent-positive') },
    warning: { 500: v('accent-warning') },
    danger:  { 500: v('accent-negative') },
    info:    { 500: v('accent-info') },
    fontFamily: 'var(--ds-font-sans)',
    colorScheme: {
      light: {
        surface: {
          0:   v('surface-primary'),
          50:  v('surface-ground'),
          100: v('surface-secondary'),
          200: v('surface-tertiary'),
          300: v('surface-quaternary'),
          400: v('border-secondary'),
          500: v('border-primary'),
          600: v('text-faint'),
          700: v('text-muted'),
          800: v('text-secondary'),
          900: v('text-primary'),
          950: v('surface-ground'),
        },
        primary: {
          color:         v('accent-info'),
          contrastColor: '#ffffff',
          hoverColor:    v('accent-info-hover'),
          activeColor:   v('accent-info-hover'),
        },
        text: {
          color:           v('text-primary'),
          hoverColor:      v('text-primary'),
          mutedColor:      v('text-muted'),
          hoverMutedColor: v('text-secondary'),
        },
        content: {
          background:      v('surface-primary'),
          hoverBackground: v('surface-secondary'),
          borderColor:     v('border-primary'),
          color:           v('text-primary'),
          hoverColor:      v('text-primary'),
        },
        formField: {
          background:         v('surface-primary'),
          disabledBackground: v('state-disabled-bg'),
          filledBackground:   v('surface-secondary'),
          borderColor:        v('border-secondary'),
          hoverBorderColor:   v('accent-info'),
          focusBorderColor:   v('accent-info'),
          color:              v('text-primary'),
          disabledColor:      v('state-disabled-fg'),
          placeholderColor:   v('text-muted'),
        },
      },
      dark: {
        surface: {
          0:   v('surface-ground'),
          50:  v('surface-primary'),
          100: v('surface-secondary'),
          200: v('surface-tertiary'),
          300: v('surface-quaternary'),
          400: v('border-secondary'),
          500: v('border-primary'),
          600: v('text-faint'),
          700: v('text-muted'),
          800: v('text-secondary'),
          900: v('text-primary'),
          950: v('text-primary'),
        },
        primary: {
          color:         v('accent-info'),
          contrastColor: '#0b2b20',
          hoverColor:    v('accent-info-hover'),
          activeColor:   v('accent-info-hover'),
        },
        text: {
          color:           v('text-primary'),
          hoverColor:      v('text-primary'),
          mutedColor:      v('text-muted'),
          hoverMutedColor: v('text-secondary'),
        },
        content: {
          background:      v('surface-primary'),
          hoverBackground: v('surface-secondary'),
          borderColor:     v('border-primary'),
          color:           v('text-primary'),
          hoverColor:      v('text-primary'),
        },
        formField: {
          background:         v('surface-primary'),
          disabledBackground: v('state-disabled-bg'),
          filledBackground:   v('surface-tertiary'),
          borderColor:        v('border-secondary'),
          hoverBorderColor:   v('accent-info'),
          focusBorderColor:   v('accent-info'),
          color:              v('text-primary'),
          disabledColor:      v('state-disabled-fg'),
          placeholderColor:   v('text-muted'),
        },
      },
    },
  },
  components: {
    button: {
      borderRadius: radius.md,
      paddingX:     '16px',
      paddingY:     '8px',
      fontWeight:   '600',
    },
    inputtext: {
      borderRadius: radius.sm,
      paddingX:     '10px',
      paddingY:     '6px',
    },
    datatable: {
      headerCellPadding: '6px 10px',
      bodyCellPadding:   '6px 10px',
    },
    tabs: {
      activeBorderColor: v('accent-info'),
    },
  },
} as const;
