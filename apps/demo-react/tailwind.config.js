const marketsPreset = require('@marketsui/tokens-primeng/tailwind-preset');

/** @type {import('tailwindcss').Config}
 *
 * Uses the canonical MarketsUI preset — single source of truth for
 * shadcn semantic colour mappings, border radius, accordion
 * animations, and `darkMode: 'class'`. Apps list their own content
 * paths + any app-specific plugins.
 */
module.exports = {
  presets: [marketsPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/core/src/**/*.{ts,tsx}',
    '../../packages/markets-grid/src/**/*.{ts,tsx}',
  ],
};
