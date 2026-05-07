import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  server: { port: 5192, open: true },
  resolve: {
    alias: {
      '@starui/core': resolve(__dirname, '../../packages/shared/core/src'),
      '@starui/markets-grid': resolve(__dirname, '../../packages/react/markets-grid/src'),
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
