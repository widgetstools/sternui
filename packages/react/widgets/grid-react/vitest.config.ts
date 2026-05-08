import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Vitest config for `@starui/grid-react`.
 *
 * Aliases `@starui/core` to its source index so tests see current
 * source rather than the published `dist/` (mirrors markets-grid's
 * setup; see comments there for rationale).
 */
const coreSrc = resolve(__dirname, '../../../shared/core/src/index.ts');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@starui/core': coreSrc },
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
