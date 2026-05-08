import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Vitest config for `@starui/core`.
 *
 * After PR-8 extracted React surfaces to `@starui/grid-react`, every
 * surviving test in this package is pure TS. We keep `environment: 'jsdom'`
 * because `openFin.test.ts` stubs `window.fin` and needs the DOM globals.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Self-reference so tests that import from the package entry
      // resolve against src/ rather than the published dist/. Keeps
      // vitest insulated from the `tsc && vite build` pipeline.
      '@starui/core': resolve(__dirname, 'src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // AG-Grid heaviness slows cold start; bump per-test timeout a touch.
    testTimeout: 10_000,
  },
});
