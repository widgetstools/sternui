/**
 * Vite config for an OpenFin consumer app.
 *
 * `worker: true` is required: data-services runs in a SharedWorker whose
 * bundled entry is imported via `?url` in `dataServices.mainThread.ts`.
 */
import react from '@vitejs/plugin-react';
import { defineConfig, mergeConfig } from 'vite';
import { staruiConsumerViteConfig, appDirFromConfig } from '../../../scripts/staruiConsumerVite.mjs';
/** Keep in sync with `src/constants.ts` DEV_PORT. */
const DEV_PORT = 5180;

const appDir = appDirFromConfig(import.meta.url);

export default defineConfig(
  mergeConfig(staruiConsumerViteConfig(appDir, { worker: true }), {
    plugins: [react()],
    server: {
      port: DEV_PORT,
      strictPort: true,
    },
  }),
);
