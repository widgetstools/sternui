import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {
  staruiConsumerViteConfig,
  appDirFromConfig,
} from '../../../scripts/staruiConsumerVite.mjs';

const appDir = appDirFromConfig(import.meta.url);
const repoRoot = resolve(appDir, '../../..');

/**
 * `@starui/perspective-grid` resolves through the shared consumer aliases now
 * that it is a packed member of the react-grid bucket. These two remain
 * explicit because they are deep module paths rather than package roots:
 * host-data's export map points at `dist/`, which a dev checkout does not
 * build from source. UNSHIFTED because Vite takes the first matching alias.
 */
const base = staruiConsumerViteConfig(appDir, { worker: true });
base.resolve.alias.unshift(
  {
    find: /^@starui\/host-data\/runtime\/perspective$/,
    replacement: resolve(repoRoot, 'packages/data/host-data/src/runtime/perspective/index.ts'),
  },
  {
    find: /^@starui\/host-data\/runtime\/providers\/transports\/stomp$/,
    replacement: resolve(
      repoRoot,
      'packages/data/host-data/src/runtime/providers/transports/stomp.ts',
    ),
  },
);

/**
 * Every page shares ONE SharedWorker, so they must be built together —
 * `new SharedWorker(new URL('./perspectiveWorker.ts', import.meta.url))` has to
 * resolve to the same emitted chunk from each page, or every window gets its
 * own worker and its own copy of the book, which is the bug being measured.
 *
 * `esnext` is not optional: `@perspective-dev/client/inline` initializes its
 * embedded wasm with top-level await.
 */
export default defineConfig(
  mergeConfig(base, {
    plugins: [react()],
    server: { port: 5220 },
    preview: { port: 5221 },
    worker: { format: 'es' },
    build: {
      target: 'esnext',
      rollupOptions: {
        input: {
          index: resolve(appDir, 'index.html'),
          blotter: resolve(appDir, 'blotter.html'),
          marketsgrid: resolve(appDir, 'marketsgrid.html'),
        },
      },
    },
    optimizeDeps: { esbuildOptions: { target: 'esnext' } },
  }),
);
