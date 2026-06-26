import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ rollupTypes: true })],
  build: {
    lib: {
      // Multi-entry: the main barrel plus a pure, DOM-free `worker` entry
      // (expression engine + formatters) that the SSRM data worker bundles
      // without dragging in the rest of the engine. Outputs index.{js,cjs}
      // + worker.{js,cjs}. See src/worker/index.ts + docs/SSRM_WORKER_PLAN.md.
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        worker: resolve(__dirname, 'src/worker/index.ts'),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [
        '@starui/types',
        'ag-grid-community',
        'ag-grid-enterprise',
        'ag-grid-react',
        'ssf',
        'zustand',
      ],
      onwarn(warning, defaultHandler) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        if (warning.code === 'SOURCEMAP_ERROR') return;
        defaultHandler(warning);
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Self-imports in src/ use the package name; map to source during the lib build.
      '@starui/engine': resolve(__dirname, 'src/index.ts'),
    },
  },
});
