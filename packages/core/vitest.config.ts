import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Vitest config for `@grid-customizer/core`.
 *
 * Covers:
 *  - Module-level units (modules/*) — pure logic, no DOM needed but jsdom is
 *    cheap and available so RTL/hook tests work too.
 *  - Hook tests (hooks/*) using @testing-library/react `renderHook`.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // AG-Grid heaviness slows cold start; bump per-test timeout a touch.
    testTimeout: 10_000,
  },
});
