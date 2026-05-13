import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { buildPackageAliases } from '@starui/vite-workspace-aliases';

// Auto-discover every `@starui/*` workspace package and produce one
// alias per declared export → its source path. Removes the hand-
// maintained list of three packages that used to live here and
// missed several workspace packages used at runtime via dist.
// See `@starui/vite-workspace-aliases` for the algorithm.
const workspaceAliases = buildPackageAliases({
  packagesRoot: resolve(__dirname, '../../packages'),
});

export default defineConfig({
  plugins: [react()],
  server: { port: 5190, open: true },
  resolve: {
    // Prefer source extensions over compiled ones — guards against
    // stale `.js` siblings emitted by stray `tsc -b` runs shadowing
    // live `.tsx` source during HMR.
    extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
    alias: workspaceAliases,
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
