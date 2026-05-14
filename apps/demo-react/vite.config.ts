import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// demo-react consumes every `@starui/*` library from the tarballs in
// /libs (see scripts/pack-libs.mjs). That makes this app a true
// "external consumer" — same shape someone installing the libraries
// from a registry would see — and surfaces packaging bugs (missing
// files in `files`, wrong main/exports, etc.) at build time instead
// of months later in production.
//
// The previous `buildPackageAliases({ packagesRoot: '../../packages' })`
// branch is intentionally NOT used here: it would point Vite at the
// workspace source and bypass the tarballs entirely.

export default defineConfig({
  plugins: [react()],
  server: { port: 5190, open: true },
  resolve: {
    extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
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
