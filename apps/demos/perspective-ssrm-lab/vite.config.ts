import { defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { staruiConsumerViteConfig, appDirFromConfig } from '../../../scripts/staruiConsumerVite.mjs';

/**
 * Perspective 3.8 + Vite: wasm as assets; prebundle CJS deps (chroma-js) so
 * perspective-viewer-datagrid's `import chroma from "chroma-js"` works.
 * @see https://github.com/perspective-dev/perspective/tree/master/examples/vite-example
 */
export default defineConfig(
  mergeConfig(staruiConsumerViteConfig(appDirFromConfig(import.meta.url), { worker: true }), {
    plugins: [react()],
    server: { port: 5301, open: true },
    preview: { port: 5301, strictPort: true },
    assetsInclude: ['**/*.md', '**/*.wasm'],
    build: { target: 'esnext' },
    optimizeDeps: {
      include: ['chroma-js', 'regular-table'],
      esbuildOptions: {
        supported: { 'top-level-await': true },
      },
    },
    worker: { format: 'es' },
  }),
);
