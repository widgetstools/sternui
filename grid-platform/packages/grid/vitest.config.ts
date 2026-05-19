import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      {
        find: '@stargrid/design-system/adapters/ag-grid',
        replacement: resolve(__dirname, '../design-system/dist/adapters/agGrid.js'),
      },
      {
        find: '@stargrid/design-system/tokens',
        replacement: resolve(__dirname, '../design-system/dist/tokens/index.js'),
      },
      {
        find: '@stargrid/design-system',
        replacement: resolve(__dirname, '../design-system/dist/index.js'),
      },
      { find: '@stargrid/grid/customizer', replacement: resolve(__dirname, 'src/customizer/index.ts') },
      { find: '@stargrid/grid', replacement: resolve(__dirname, 'src/index.ts') },
      { find: '@stargrid/engine', replacement: resolve(__dirname, '../engine/src/index.ts') },
      { find: '@stargrid/types', replacement: resolve(__dirname, '../types/src/index.ts') },
      { find: '@stargrid/host', replacement: resolve(__dirname, '../host/src/index.ts') },
      { find: '@stargrid/ui', replacement: resolve(__dirname, '../ui/dist/index.js') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    testTimeout: 15_000,
  },
});
