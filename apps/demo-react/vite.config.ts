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
  build: {
    // Monaco Editor + AG-Grid Enterprise legitimately push chunks past
    // 500 kB; bumping the warn threshold prevents useless noise on every
    // build without masking a real regression (we still warn past 2 MB).
    chunkSizeWarningLimit: 4500,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // Radix-UI + lucide-react ship `"use client"` directives for
        // React Server Components compatibility. We bundle for a plain
        // client runtime where they're always client, so the directive
        // is irrelevant — Rollup's warning is a false positive.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        // Sourcemap-reporting errors are a knock-on from the same
        // "use client" lines; cosmetic when the underlying warning is suppressed.
        if (warning.code === 'SOURCEMAP_ERROR') return;
        defaultHandler(warning);
      },
    },
  },
});
