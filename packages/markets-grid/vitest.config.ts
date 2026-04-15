import { defineConfig } from 'vitest/config';

/**
 * Vitest config for `@grid-customizer/markets-grid`.
 * Pure-helper unit tests live alongside the source they cover.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
