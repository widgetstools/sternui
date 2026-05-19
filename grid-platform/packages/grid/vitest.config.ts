import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@stargrid/grid': resolve(__dirname, 'src/index.ts'),
      '@stargrid/grid/customizer': resolve(__dirname, 'src/customizer/index.ts'),
      '@stargrid/engine': resolve(__dirname, '../engine/src/index.ts'),
      '@stargrid/types': resolve(__dirname, '../types/src/index.ts'),
      '@stargrid/host': resolve(__dirname, '../host/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    testTimeout: 15_000,
  },
});
