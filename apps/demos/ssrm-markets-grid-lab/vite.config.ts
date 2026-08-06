import { defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { staruiConsumerViteConfig, appDirFromConfig } from '../../../scripts/staruiConsumerVite.mjs';

/**
 * The dedicated lab for `@starui/ssrm-engine` under MarketsGrid.
 *
 * `worker: true` matters: the book lives in a SharedWorker, and
 * `new URL('../workers/ssrmBookWorker.ts', import.meta.url)` is what makes Vite
 * emit it as its own chunk. A string path would ship verbatim and 404 in a
 * production build.
 *
 * **Port 5321, `strictPort` on both.** Measuring somebody else's stale build is
 * indistinguishable from measuring your own, and this repo has already lost
 * time to a port occupied by another session's preview server. A hard failure
 * on a busy port is the cheap version of that lesson.
 */
export default defineConfig(
  mergeConfig(staruiConsumerViteConfig(appDirFromConfig(import.meta.url), { worker: true }), {
    plugins: [react()],
    server: { port: 5321, strictPort: true, open: true },
    preview: { port: 5321, strictPort: true },
    build: { target: 'esnext' },
    worker: { format: 'es' },
  }),
);
