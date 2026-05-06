import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  server: { port: 5192, open: true },
  resolve: {
    alias: {
      '@marketsui/core': resolve(__dirname, '../../packages/core/src'),
      '@marketsui/markets-grid': resolve(__dirname, '../../packages/markets-grid/src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 4500,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        if (warning.code === 'SOURCEMAP_ERROR') return;
        defaultHandler(warning);
      },
    },
  },
});
