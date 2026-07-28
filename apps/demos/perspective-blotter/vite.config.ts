import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vite';
import {
  staruiConsumerViteConfig,
  appDirFromConfig,
} from '../../../scripts/staruiConsumerVite.mjs';

const appDir = appDirFromConfig(import.meta.url);
const repoRoot = resolve(appDir, '../../..');

/**
 * Resolve the two packages this demo needs straight from source.
 *
 * The shared consumer aliases are built from `libs/manifest.json`, which only
 * lists packages `propagate` packs — and `@starui/perspective-grid` is private,
 * so it is not in there. These are UNSHIFTED ahead of the shared list because
 * Vite takes the first matching alias.
 */
const base = staruiConsumerViteConfig(appDir, { worker: true });
base.resolve.alias.unshift(
  {
    find: /^@starui\/perspective-grid$/,
    replacement: resolve(repoRoot, 'packages/react-grid/perspective-grid/src/index.ts'),
  },
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
    server: { port: 5220 },
    preview: { port: 5221 },
    worker: { format: 'es' },
    build: {
      target: 'esnext',
      rollupOptions: {
        input: {
          index: resolve(appDir, 'index.html'),
          blotter: resolve(appDir, 'blotter.html'),
        },
      },
    },
    optimizeDeps: { esbuildOptions: { target: 'esnext' } },
  }),
);
