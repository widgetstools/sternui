// ─────────────────────────────────────────────────────────────
//  Tailwind Preset — consumed by every React + Angular app.
//
//  Emits both shadcn-compat color names (bg-primary, bg-card,
//  text-foreground, etc.) AND a surface scale (bg-surface-50 …
//  bg-surface-950) for parity with tailwindcss-primeui's plugin.
//  All values reference CSS custom properties on <html>, so theme
//  switching is just `data-theme="dark|light"` flips.
// ─────────────────────────────────────────────────────────────

import primeui from 'tailwindcss-primeui';
import animate from 'tailwindcss-animate';
import type { Config } from 'tailwindcss';

const hsl = (v: string) => `hsl(var(${v}))`;

export const tailwindPreset: Partial<Config> = {
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--ds-font-sans)'],
        mono: ['var(--ds-font-mono)'],
        serif: ['var(--ds-font-serif)'],
      },
      borderRadius: {
        sm: 'var(--ds-radius-sm)',
        md: 'var(--ds-radius-md)',
        lg: 'var(--ds-radius-lg)',
        xl: 'var(--ds-radius-xl)',
      },
      colors: {
        // shadcn-compat names (HSL channel vars)
        background: hsl('--background'),
        foreground: hsl('--foreground'),
        card: {
          DEFAULT: hsl('--card'),
          foreground: hsl('--card-foreground'),
        },
        popover: {
          DEFAULT: hsl('--popover'),
          foreground: hsl('--popover-foreground'),
        },
        primary: {
          DEFAULT: hsl('--primary'),
          foreground: hsl('--primary-foreground'),
        },
        secondary: {
          DEFAULT: hsl('--secondary'),
          foreground: hsl('--secondary-foreground'),
        },
        muted: {
          DEFAULT: hsl('--muted'),
          foreground: hsl('--muted-foreground'),
        },
        accent: {
          DEFAULT: hsl('--accent'),
          foreground: hsl('--accent-foreground'),
        },
        destructive: {
          DEFAULT: hsl('--destructive'),
          foreground: hsl('--destructive-foreground'),
        },
        success: {
          DEFAULT: hsl('--success'),
          foreground: hsl('--success-foreground'),
        },
        warning: {
          DEFAULT: hsl('--warning'),
          foreground: hsl('--warning-foreground'),
        },
        info: {
          DEFAULT: hsl('--info'),
          foreground: hsl('--info-foreground'),
        },
        border: hsl('--border'),
        input: hsl('--input'),
        ring: hsl('--ring'),

        // Surface scale — parity with tailwindcss-primeui
        surface: {
          50:  hsl('--surface-50'),
          100: hsl('--surface-100'),
          200: hsl('--surface-200'),
          300: hsl('--surface-300'),
          400: hsl('--surface-400'),
          500: hsl('--surface-500'),
          600: hsl('--surface-600'),
          700: hsl('--surface-700'),
          800: hsl('--surface-800'),
          900: hsl('--surface-900'),
          950: hsl('--surface-950'),
        },
      },
      boxShadow: {
        card:    'var(--ds-elevation-card)',
        overlay: 'var(--ds-elevation-overlay)',
        glow:    'var(--ds-elevation-glow)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate, primeui],
};
