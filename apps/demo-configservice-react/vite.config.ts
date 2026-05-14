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
  // Port 5190 is owned by apps/demo-react (fixtures + showcase demo,
  // single-user). 5191 = the ConfigService-backed sibling that surfaces
  // the user-switcher and Config Browser; separate port = both can run
  // concurrently for side-by-side comparison.
  server: { port: 5191, open: true },
  resolve: {
    extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
    alias: workspaceAliases,
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
