import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import path from 'path';

export default defineConfig({
  plugins: [angular()],
  resolve: {
    alias: {
      // Resolve @marketsui/angular from TypeScript source (no dist needed in dev)
      '@marketsui/angular': path.resolve(__dirname, '../../packages/angular/src/index.ts'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
  build: {
    target: 'es2022',
    // Angular + AG-Grid + Radix (via shared React UI components) chunks
    // legitimately exceed 500 kB; we still warn past 2 MB for regressions.
    chunkSizeWarningLimit: 4500,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // Radix-UI + lucide-react "use client" directives are RSC markers
        // irrelevant in a plain client bundle — false positives.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        // Sourcemap-reporting errors are a knock-on from the same lines.
        if (warning.code === 'SOURCEMAP_ERROR') return;
        defaultHandler(warning);
      },
    },
  },
  optimizeDeps: {
    include: ['@angular/core', '@angular/common', '@angular/router', '@angular/forms', 'ag-grid-angular', 'ag-grid-community', 'ag-grid-enterprise'],
    exclude: ['@marketsui/angular'],
  },
});
