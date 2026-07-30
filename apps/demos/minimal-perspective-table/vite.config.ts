import { defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { staruiConsumerViteConfig, appDirFromConfig } from '../../../scripts/staruiConsumerVite.mjs';

/**
 * `esnext` is not optional here. The window loads
 * `@perspective-dev/client/inline`, whose embedded wasm is initialized with a
 * top-level await — anything lower fails to build.
 */
export default defineConfig(
  mergeConfig(staruiConsumerViteConfig(appDirFromConfig(import.meta.url), { worker: true }), {
    plugins: [react()],
    server: { port: 5214, open: true },
    preview: { port: 5215 },
    build: { target: 'esnext' },
    optimizeDeps: { esbuildOptions: { target: 'esnext' } },
  }),
);
