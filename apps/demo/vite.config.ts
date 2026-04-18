import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5190, open: true },
  resolve: {
    alias: {
      '@grid-customizer/core': resolve(__dirname, '../../packages/core/src'),
      '@grid-customizer/markets-grid': resolve(__dirname, '../../packages/markets-grid/src'),
    },
  },
});
