const marketsPreset = require('@starui/tokens-primeng/tailwind-preset');

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
    '../../packages/shared/core/src/**/*.{ts,tsx}',
    '../../packages/react/markets-grid/src/**/*.{ts,tsx}',
  ],
};
