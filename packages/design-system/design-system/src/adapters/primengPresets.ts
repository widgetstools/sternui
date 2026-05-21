// ─────────────────────────────────────────────────────────────
//  PrimeNG Aura presets — Stockflux palettes (reference: staruidesign1)
//  Requires peer `@primeng/themes`. Prefer CSS-var `primengPreset` when
//  using `data-palette` on `<html>`; use these with PrimeNG `usePreset()`.
// ─────────────────────────────────────────────────────────────
/*
 * StarUI Design System — PrimeNG Angular Preset
 *
 * Drop-in theme preset for an Angular 17+ / 18+ / 21 project using
 * PrimeNG with the v18 Theming API (Aura preset + definePreset).
 *
 * USAGE
 * ─────────────────────────────────────────────────────────────
 *
 *   npm install primeng @primeng/themes
 *
 *   // app.config.ts
 *   import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
 *   import { providePrimeNG } from 'primeng/config';
 *   import { StarUITealPreset } from './starui-primeng-preset';
 *
 *   export const appConfig: ApplicationConfig = {
 *     providers: [
 *       provideAnimationsAsync(),
 *       providePrimeNG({
 *         theme: {
 *           preset: StarUITealPreset,
 *           options: {
 *             darkModeSelector: '.dark-mode',  // or '[data-theme="dark"]'
 *             cssLayer: { name: 'primeng', order: 'tailwind-base, primeng, tailwind-utilities' }
 *           }
 *         }
 *       })
 *     ]
 *   };
 *
 * Switch palettes at runtime via the PrimeNG `usePreset()` API.
 */

import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';

/* ── Shared token surface (typography, spacing, motion) ─────────── */
const sharedTokens = {
  primitive: {
    borderRadius: {
      none: '0',
      xs: '2px',
      sm: '3px',
      md: '4px',
      lg: '6px',
      xl: '8px',
    },
  },
  components: {
    button: {
      root: {
        paddingX: '0.875rem',
        paddingY: '0.5rem',
        borderRadius: '3px',
        gap: '0.4rem',
        fontWeight: '600',
      },
      sm: { fontSize: '0.75rem',  paddingX: '0.625rem', paddingY: '0.375rem' },
      lg: { fontSize: '0.95rem',  paddingX: '1.125rem', paddingY: '0.625rem' },
    },
    inputtext: {
      root: {
        paddingX: '0.625rem',
        paddingY: '0.4rem',
        borderRadius: '3px',
        fontSize: '0.8125rem',
      },
    },
    card: {
      root: { borderRadius: '3px' },
    },
    datatable: {
      headerCell: {
        padding: '0.4rem 0.625rem',
        fontWeight: '700',
        gap: '0.4rem',
      },
      bodyCell: {
        padding: '0.4rem 0.625rem',
      },
    },
  },
};

/* ── Five-stop semantic scale used by every palette ────────────── */
type PrimaryScale = Record<
  '50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | '950',
  string
>;

function buildPrimary(p: PrimaryScale): PrimaryScale {
  return {
    50:  p[50],  100: p[100], 200: p[200], 300: p[300], 400: p[400],
    500: p[500], 600: p[600], 700: p[700], 800: p[800], 900: p[900], 950: p[950],
  };
}

/* ── TEAL (Stockflux signature) ────────────────────────────────── */
export const StarUITealPreset = definePreset(Aura, {
  ...sharedTokens,
  semantic: {
    primary: buildPrimary({
      50:  '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf',
      500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e',
    }),
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff', 50: '#f3f7f9', 100: '#eef3f6', 200: '#e3ecf0', 300: '#cfd9df',
          400: '#a3b3bd', 500: '#7d92a0', 600: '#506876', 700: '#28415a', 800: '#19324a', 900: '#0c1d30', 950: '#070f1d',
        },
        primary: { color: '#0f766e', contrastColor: '#ffffff', hoverColor: '#0a5d56', activeColor: '#115e59' },
        formField: {
          background:        '{surface.0}',
          disabledBackground:'{surface.200}',
          filledBackground:  '{surface.50}',
          borderColor:       '{surface.300}',
          hoverBorderColor:  '{surface.400}',
          focusBorderColor:  '{primary.color}',
          invalidBorderColor:'{red.500}',
          color:             '{surface.900}',
          disabledColor:     '{surface.500}',
          placeholderColor:  '{surface.500}',
          floatLabelColor:   '{surface.500}',
          floatLabelFocusColor:'{primary.color}',
        },
        text: { color: '{surface.900}', hoverColor: '{surface.950}', mutedColor: '{surface.500}', hoverMutedColor: '{surface.700}' },
        content: { background: '{surface.0}', hoverBackground: '{surface.100}', borderColor: '{surface.300}', color: '{surface.900}', hoverColor: '{surface.950}' },
        overlay: {
          select:  { background: '{surface.0}', borderColor: '{surface.300}', color: '{surface.900}' },
          popover: { background: '{surface.0}', borderColor: '{surface.300}', color: '{surface.900}' },
          modal:   { background: '{surface.0}', borderColor: '{surface.300}', color: '{surface.900}' },
        },
      },
      dark: {
        surface: {
          0: '#ffffff', 50: '#1d3147', 100: '#15293e', 200: '#102236', 300: '#0f2034',
          400: '#25394e', 500: '#3e5365', 600: '#607585', 700: '#8aa0ad', 800: '#c3d2d4', 900: '#e6efee', 950: '#ffffff',
        },
        primary: { color: '#2dd4bf', contrastColor: '#042f2e', hoverColor: '#5eead4', activeColor: '#14b8a6' },
        formField: {
          background:        '#0f2034',
          disabledBackground:'#15293e',
          filledBackground:  '#102236',
          borderColor:       '#2c4660',
          hoverBorderColor:  '#3b5a78',
          focusBorderColor:  '#2dd4bf',
          invalidBorderColor:'#f25668',
          color:             '#e6efee',
          disabledColor:     '#607585',
          placeholderColor:  '#8aa0ad',
          floatLabelColor:   '#8aa0ad',
          floatLabelFocusColor: '#2dd4bf',
        },
        text: { color: '#e6efee', hoverColor: '#ffffff', mutedColor: '#8aa0ad', hoverMutedColor: '#c3d2d4' },
        content: { background: '#102236', hoverBackground: '#15293e', borderColor: '#1f344a', color: '#e6efee', hoverColor: '#ffffff' },
        overlay: {
          select:  { background: '#15293e', borderColor: '#2c4660', color: '#e6efee' },
          popover: { background: '#15293e', borderColor: '#2c4660', color: '#e6efee' },
          modal:   { background: '#102236', borderColor: '#2c4660', color: '#e6efee' },
        },
      },
    },
  },
});

/* ── INDIGO ────────────────────────────────────────────────────── */
export const StarUIIndigoPreset = definePreset(Aura, {
  ...sharedTokens,
  semantic: {
    primary: buildPrimary({
      50:  '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8',
      500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81', 950: '#1e1b4b',
    }),
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff', 50: '#f5f5f7', 100: '#edeef1', 200: '#e2e3e8', 300: '#d8dade',
          400: '#aaadb4', 500: '#797c84', 600: '#51545c', 700: '#2f323a', 800: '#1a1c22', 900: '#181a1f', 950: '#0a0c0f',
        },
        primary: { color: '#4f46e5', contrastColor: '#ffffff', hoverColor: '#4338ca', activeColor: '#3730a3' },
        formField: {
          background: '#ffffff', borderColor: '#bbbdc4', hoverBorderColor: '#94969d',
          focusBorderColor: '#4f46e5', color: '#181a1f', placeholderColor: '#797c84',
          floatLabelColor: '#797c84', floatLabelFocusColor: '#4f46e5',
        },
        text: { color: '#181a1f', mutedColor: '#51545c' },
        content: { background: '#ffffff', hoverBackground: '#edeef1', borderColor: '#d8dade', color: '#181a1f' },
      },
      dark: {
        surface: {
          0: '#ffffff', 50: '#2c2e33', 100: '#252830', 200: '#222428', 300: '#1f2125',
          400: '#383a40', 500: '#494b51', 600: '#6a6c73', 700: '#92949a', 800: '#c2c3c7', 900: '#ecedee', 950: '#ffffff',
        },
        primary: { color: '#818cf8', contrastColor: '#1e1b4b', hoverColor: '#a5b4fc', activeColor: '#6366f1' },
        formField: {
          background: '#1f2125', borderColor: '#3d3f45', hoverBorderColor: '#56585f',
          focusBorderColor: '#818cf8', color: '#ecedee', placeholderColor: '#92949a',
          floatLabelColor: '#92949a', floatLabelFocusColor: '#818cf8',
        },
        text: { color: '#ecedee', mutedColor: '#92949a' },
        content: { background: '#222428', hoverBackground: '#252830', borderColor: '#2c2e33', color: '#ecedee' },
      },
    },
  },
});

/* ── AMBER (Bloomberg-inspired) ────────────────────────────────── */
export const StarUIAmberPreset = definePreset(Aura, {
  ...sharedTokens,
  semantic: {
    primary: buildPrimary({
      50:  '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24',
      500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03',
    }),
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff', 50: '#f6f1e8', 100: '#efe9db', 200: '#e3dbc9', 300: '#d8ccae',
          400: '#bcae8b', 500: '#8e7e62', 600: '#6c5d44', 700: '#463a26', 800: '#2d2519', 900: '#271f15', 950: '#100c08',
        },
        primary: { color: '#92400e', contrastColor: '#ffffff', hoverColor: '#7c2d12', activeColor: '#631e09' },
        formField: {
          background: '#ffffff', borderColor: '#bcae8b', hoverBorderColor: '#94876a',
          focusBorderColor: '#92400e', color: '#271f15', placeholderColor: '#8e7e62',
        },
        text: { color: '#271f15', mutedColor: '#6c5d44' },
        content: { background: '#ffffff', hoverBackground: '#efe9db', borderColor: '#d8ccae', color: '#271f15' },
      },
      dark: {
        surface: {
          0: '#ffffff', 50: '#28251e', 100: '#211e17', 200: '#1d1b16', 300: '#1a1814',
          400: '#343026', 500: '#463f30', 600: '#716c62', 700: '#9b958a', 800: '#c8c3b8', 900: '#f0ede6', 950: '#ffffff',
        },
        primary: { color: '#fbbf24', contrastColor: '#110f0c', hoverColor: '#fcd34d', activeColor: '#f59e0b' },
        formField: {
          background: '#1a1814', borderColor: '#3b372d', hoverBorderColor: '#534e3f',
          focusBorderColor: '#fbbf24', color: '#f0ede6', placeholderColor: '#9b958a',
        },
        text: { color: '#f0ede6', mutedColor: '#9b958a' },
        content: { background: '#1d1b16', hoverBackground: '#211e17', borderColor: '#2b2820', color: '#f0ede6' },
      },
    },
  },
});

/* ── SLATE-BLUE ─────────────────────────────────────────────────── */
export const StarUISlatePreset = definePreset(Aura, {
  ...sharedTokens,
  semantic: {
    primary: buildPrimary({
      50:  '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa',
      500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#172554',
    }),
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff', 50: '#f1f3f6', 100: '#e9ecf0', 200: '#dde1e7', 300: '#d4d8de',
          400: '#abb1bb', 500: '#7a8392', 600: '#525d6c', 700: '#2f3a4a', 800: '#1c2735', 900: '#18222f', 950: '#0a1018',
        },
        primary: { color: '#2563eb', contrastColor: '#ffffff', hoverColor: '#1d4ed8', activeColor: '#1e40af' },
        formField: {
          background: '#ffffff', borderColor: '#b6bbc4', hoverBorderColor: '#8e94a0',
          focusBorderColor: '#2563eb', color: '#18222f', placeholderColor: '#7a8392',
        },
        text: { color: '#18222f', mutedColor: '#525d6c' },
        content: { background: '#ffffff', hoverBackground: '#e9ecf0', borderColor: '#d4d8de', color: '#18222f' },
      },
      dark: {
        surface: {
          0: '#ffffff', 50: '#2c2f34', 100: '#252830', 200: '#212429', 300: '#1e2125',
          400: '#383c42', 500: '#4b4f57', 600: '#686d73', 700: '#8f939a', 800: '#c1c4c9', 900: '#ebedef', 950: '#ffffff',
        },
        primary: { color: '#60a5fa', contrastColor: '#0b0f14', hoverColor: '#93c5fd', activeColor: '#3b82f6' },
        formField: {
          background: '#1e2125', borderColor: '#3e4148', hoverBorderColor: '#565a61',
          focusBorderColor: '#60a5fa', color: '#ebedef', placeholderColor: '#8f939a',
        },
        text: { color: '#ebedef', mutedColor: '#8f939a' },
        content: { background: '#212429', hoverBackground: '#252830', borderColor: '#2c2f34', color: '#ebedef' },
      },
    },
  },
});

/* ── GREY (Tufte minimal) ──────────────────────────────────────── */
export const StarUIGreyPreset = definePreset(Aura, {
  ...sharedTokens,
  semantic: {
    primary: buildPrimary({
      50:  '#fafafa', 100: '#f4f4f5', 200: '#e4e4e7', 300: '#d4d4d8', 400: '#a1a1aa',
      500: '#71717a', 600: '#52525b', 700: '#3f3f46', 800: '#27272a', 900: '#18181b', 950: '#09090b',
    }),
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff', 50: '#f8f9fa', 100: '#f2f3f4', 200: '#e6e7e9', 300: '#e3e4e6',
          400: '#a1a2a5', 500: '#717276', 600: '#515257', 700: '#25262a', 800: '#16171a', 900: '#0c0d0e', 950: '#000000',
        },
        primary: { color: '#171819', contrastColor: '#f8f9fa', hoverColor: '#25262a', activeColor: '#3e3f43' },
        formField: {
          background: '#ffffff', borderColor: '#d2d3d5', hoverBorderColor: '#a1a2a5',
          focusBorderColor: '#171819', color: '#0c0d0e', placeholderColor: '#717276',
        },
        text: { color: '#0c0d0e', mutedColor: '#515257' },
        content: { background: '#ffffff', hoverBackground: '#f2f3f4', borderColor: '#e3e4e6', color: '#0c0d0e' },
      },
      dark: {
        surface: {
          0: '#ffffff', 50: '#1f2022', 100: '#1a1b1d', 200: '#17181a', 300: '#141517',
          400: '#2a2b2d', 500: '#3a3b3d', 600: '#717275', 700: '#a1a2a5', 800: '#d2d3d5', 900: '#f8f9fa', 950: '#ffffff',
        },
        primary: { color: '#f8f9fa', contrastColor: '#0c0c0d', hoverColor: '#ffffff', activeColor: '#e3e4e6' },
        formField: {
          background: '#141517', borderColor: '#3e3f43', hoverBorderColor: '#515255',
          focusBorderColor: '#f8f9fa', color: '#f8f9fa', placeholderColor: '#a1a2a5',
        },
        text: { color: '#f8f9fa', mutedColor: '#a1a2a5' },
        content: { background: '#17181a', hoverBackground: '#1a1b1d', borderColor: '#25262a', color: '#f8f9fa' },
      },
    },
  },
});

/* ── Map exposed for runtime swap via PrimeNG `usePreset()` ─────── */
export const StarUIPresets = {
  teal:   StarUITealPreset,
  indigo: StarUIIndigoPreset,
  amber:  StarUIAmberPreset,
  slate:  StarUISlatePreset,
  grey:   StarUIGreyPreset,
} as const;

export type StarUIPaletteName = keyof typeof StarUIPresets;
