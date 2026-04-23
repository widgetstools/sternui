import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  server: { port: 5190, open: true },
  resolve: {
    alias: {
      '@marketsui/core': resolve(__dirname, '../../packages/core/src'),
      '@marketsui/markets-grid': resolve(__dirname, '../../packages/markets-grid/src'),
    },
  },
});
