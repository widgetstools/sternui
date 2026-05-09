import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * apps/config-admin-web — operator-facing multi-app admin SPA.
 *
 * The build artifact is consumed by `@starui/config-service-server`,
 * which copies `dist/` into its own `dist/admin-web/` and serves it
 * from `/` via `express.static`. So the SPA must:
 *
 *   1. Use a relative `base` ("./") so all asset URLs resolve from
 *      whatever path the server mounts the static dir on.
 *   2. Build to plain `dist/` (default).
 *
 * Dev mode runs on a port disjoint from every other dev surface in
 * the repo so multiple apps can run side-by-side. Operators won't
 * normally use the dev server — production usage is the bundled
 * artifact served by config-service-server.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5180,
    // Proxy API + seed-config requests through to the live server in
    // dev mode so the SPA's `RestConfigClient({ baseUrl: '/api/v1' })`
    // call works even though Vite is on a different port.
    proxy: {
      '/api': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
