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
    // widgets-react ships SimpleBlotter, BlotterGrid, the Provider
    // Editor (DataProviderEditor + TypeSelectionDialog +
    // ProviderForm + the STOMP/REST 4-tab configurators), and the
    // DataProviderSelector. JIT must scan it or these surfaces
    // render unstyled (e.g. dialogs become invisible cards).
    // Note: the previous `packages/widgets/src/**` glob pointed at
    // a path that no longer exists in this monorepo — replaced.
    '../../packages/widgets-react/src/**/*.{ts,tsx}',
  ],
};

export default config;
