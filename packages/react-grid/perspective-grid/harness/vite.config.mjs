import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// `new URL('.', import.meta.url).pathname` yields "/C:/…" on Windows, which
// `resolve()` then mangles. `fileURLToPath` is the portable form.
const here = dirname(fileURLToPath(import.meta.url));

/**
 * Harness build. Three pages share one SharedWorker, so they must be built
 * together — `new SharedWorker(new URL('./pspHost.mjs', import.meta.url))` has
 * to resolve to the SAME emitted chunk from every page or each window gets its
 * own worker and its own copy of the book, which is the bug we are measuring
 * the absence of.
 *
 * `esnext` everywhere is not optional: `@perspective-dev/client/inline` uses
 * top-level await to initialize its embedded wasm.
 */
export default defineConfig({
  root: here,
  server: { port: 5199 },
  preview: { port: 5199 },
  worker: { format: 'es' },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        index: resolve(here, 'index.html'),
        plumbing: resolve(here, 'plumbing.html'),
        blotter: resolve(here, 'blotter.html'),
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
  },
});
