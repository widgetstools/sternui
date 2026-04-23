/**
 * MarketsUI PrimeNG Preset — Teal accent
 *
 * Overrides PrimeNG's Aura preset so Angular components visually match
 * the shadcn/React components — teal primary accent, true black dark
 * mode, warm gray surfaces.
 *
 * Usage in app.config.ts:
 *   import { marketsPreset } from '@marketsui/tokens/primeng-preset';
 *   providePrimeNG({ theme: { preset: marketsPreset, options: { darkModeSelector: '.dark' } } })
 */

import { definePreset } from "@primeuix/themes";
import Aura from "@primeuix/themes/aura";

export const marketsPreset = definePreset(Aura, {
  semantic: {
    /* Teal scale — primary actions, selected states, focus rings.
       Stands out on both light and dark backgrounds. */
    primary: {
      50: "#F0FDFA",
      100: "#CCFBF1",
      200: "#99F6E4",
      300: "#5EEAD4",
      400: "#2DD4BF",
      500: "#1DA898",  /* ← Core teal — matches light mode --mdl-primary */
      600: "#0D9488",
      700: "#0F766E",
      800: "#115E59",
      900: "#134E4A",
      950: "#042F2E",
    },
    colorScheme: {
      light: {
        primary: {
          color: "#1DA898",            /* Teal 40% lightness — readable on white */
          inverseColor: "#ffffff",
          hoverColor: "#0D9488",
          activeColor: "#0F766E",
        },
        highlight: {
          background: "#1DA898",
          focusBackground: "#0D9488",
          color: "#ffffff",
          focusColor: "#ffffff",
        },
        surface: {
          0: "#ffffff",
          50: "#FAFAFA",
          100: "#F5F5F5",
          200: "#EEEEEE",
          300: "#E0E0E0",
          400: "#BDBDBD",
          500: "#9E9E9E",
          600: "#757575",
          700: "#616161",
          800: "#424242",
          900: "#212121",
          950: "#181A20",
        },
      },
      dark: {
        primary: {
          color: "#21B8A4",            /* Teal 46% lightness — bright on dark */
          inverseColor: "#0B0E11",
          hoverColor: "#2DD4BF",
          activeColor: "#14B8A6",
        },
        highlight: {
          background: "rgba(33, 184, 164, 0.16)",
          focusBackground: "rgba(33, 184, 164, 0.24)",
          color: "rgba(33, 184, 164, 0.87)",
          focusColor: "rgba(33, 184, 164, 0.87)",
        },
        /* Binance dark surfaces — warm grays, not cool zinc */
        surface: {
          0: "#0B0E11",   /* True black background */
          50: "#14161A",
          100: "#1E2026",  /* Card surface */
          200: "#2B2F36",  /* Elevated surface */
          300: "#3B4046",  /* Input background */
          400: "#474D57",  /* Input border on focus */
          500: "#5E6673",  /* Tertiary text */
          600: "#848E9C",  /* Secondary text */
          700: "#AEB4BC",
          800: "#D1D4D9",
          900: "#EAECEF",  /* Primary text */
          950: "#F5F5F5",
        },
      },
    },
  },
});

export default marketsPreset;
