/**
 * MarketsUI Tailwind Preset
 *
 * Shared theme configuration consumed by both React and Angular apps.
 * Maps CSS custom properties from tokens.css to Tailwind utility classes.
 *
 * Usage in tailwind.config.cjs:
 *   const marketsPreset = require('@marketsui/tokens/tailwind-preset');
 *   module.exports = { presets: [marketsPreset], content: [...] };
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      /* ── Colors ── */
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /* Brand — warm amber for trading branding, editor accents */
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-foreground))",
        },
        /* Trading semantic colors */
        bid: "hsl(var(--mdl-bid))",
        ask: "hsl(var(--mdl-ask))",
        success: "hsl(var(--mdl-success))",
        "pnl-positive": "hsl(var(--mdl-pnl-positive))",
        "pnl-negative": "hsl(var(--mdl-pnl-negative))",
        "flash-up": "hsl(var(--mdl-flash-up))",
        "flash-down": "hsl(var(--mdl-flash-down))",
      },
      /* ── Border Radius ── */
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      /* ── Component Sizing ── */
      height: {
        "control-sm": "var(--mdl-height-sm)",
        control: "var(--mdl-height-default)",
        "control-lg": "var(--mdl-height-lg)",
      },
      /* ── Typography ── */
      fontFamily: {
        sans: ["var(--mdl-font-family)"],
        mono: ["var(--mdl-font-mono)"],
      },
      /* ── Animations ── */
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [],
};
