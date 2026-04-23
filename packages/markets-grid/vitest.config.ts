import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Vitest config for `@marketsui/markets-grid`.
 *
 * Covers:
 *   - FormattingToolbar component integration tests (mount inside a
 *     <GridProvider>, fake GridApi, click buttons, assert module state).
 *   - Future SettingsSheet / MarketsGrid wiring tests.
 *
 * We alias `@marketsui/core` → its source index rather than
 * going through the published `dist/`. Two reasons:
 *   - Tests see the CURRENT source; no "did you remember to `npm run
 *     build` first?" footgun between commits.
 *   - The core package's build step has a pre-existing tooling issue
 *     (a `ssf` type shim) unrelated to this test work; routing tests
 *     through source sidesteps it cleanly.
 *
 * The core package's OWN tests already resolve internally via relative
 * paths, so nothing there changes.
 */
const coreSrc = resolve(__dirname, '../core/src/index.ts');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@marketsui/core': coreSrc },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    testTimeout: 10_000,
  },
});
