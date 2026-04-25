const marketsPreset = require('@marketsui/tokens-primeng/tailwind-preset');

/** @type {import('tailwindcss').Config}
 *
 * Uses the canonical MarketsUI preset — single source of truth for
 * shadcn semantic colour mappings, border radius, accordion
 * animations, and `darkMode: 'class'`. Apps list only their own
 * content paths + any app-specific plugins.
 */
module.exports = {
  presets: [marketsPreset],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  plugins: [require('tailwindcss-animate')],
};
