const marketsPreset = require('@marketsui/tokens-primeng/tailwind-preset');

/** @type {import('tailwindcss').Config}
 *
 * Uses the canonical MarketsUI preset. Extra content paths for the
 * ConfigService browser integration (unique to this demo).
 */
module.exports = {
  presets: [marketsPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/core/src/**/*.{ts,tsx}',
    '../../packages/markets-grid/src/**/*.{ts,tsx}',
    '../../packages/config-browser-react/src/**/*.{ts,tsx}',
    '../../packages/config-service/src/**/*.{ts,tsx}',
  ],
};
