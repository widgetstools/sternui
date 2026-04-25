import type { Config } from 'tailwindcss';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const marketsPreset = require('@marketsui/tokens-primeng/tailwind-preset') as Partial<Config>;

/**
 * Uses the canonical MarketsUI preset — single source of truth for
 * shadcn semantic colour mappings, border radius, accordion
 * animations, and `darkMode: 'class'`. Apps list only their own
 * content paths + any app-specific plugins.
 */
const config: Config = {
  presets: [marketsPreset as Config],
  content: [
    './src/**/*.{ts,tsx}',
    './index.html',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/widgets/src/**/*.{ts,tsx}',
  ],
};

export default config;
