const marketsPreset = require('@starui/tokens-primeng/tailwind-preset');

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
    '../../packages/shared/core/src/**/*.{ts,tsx}',
    '../../packages/react/widgets/markets-grid/src/**/*.{ts,tsx}',
    '../../packages/react/config-browser-react/src/**/*.{ts,tsx}',
    '../../packages/shared/services/config-service/src/**/*.{ts,tsx}',
  ],
};
