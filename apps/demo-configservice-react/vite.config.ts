import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  // Port 5190 is owned by apps/demo-react (the plain-DexieAdapter demo).
  // 5191 = the ConfigService-backed sibling; separate port = both can
  // run concurrently for side-by-side comparison.
  server: { port: 5191, open: true },
  resolve: {
    alias: {
      // Alias core + markets-grid to source so Vite bundles them via
      // the consumer's tree (avoids the Monaco-worker resolution issue
      // that hits consumers reading core's prebuilt dist).
      '@marketsui/core': resolve(__dirname, '../../packages/core/src'),
      '@marketsui/markets-grid': resolve(__dirname, '../../packages/markets-grid/src'),
    },
  },
  build: {
    // Monaco + AG-Grid Enterprise chunks legitimately exceed 500 kB;
    // raise the warn threshold to 2 MB so real regressions still surface.
    chunkSizeWarningLimit: 4500,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // Radix-UI + lucide-react "use client" directives are RSC
        // markers irrelevant in a plain client bundle — false positive.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        // Sourcemap-reporting errors are a knock-on; suppressed together.
        if (warning.code === 'SOURCEMAP_ERROR') return;
        defaultHandler(warning);
      },
    },
  },
});
