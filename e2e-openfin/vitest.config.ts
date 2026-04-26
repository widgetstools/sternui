import { defineConfig } from 'vitest/config';

/**
 * Vitest config for OpenFin-driven end-to-end tests.
 *
 * These specs launch a real OpenFin runtime via @openfin/node-adapter,
 * connect over the local websocket, and drive the platform via the
 * test bridge IAB channel installed by the markets-ui-reference dev
 * server in DEV mode.
 *
 * Prerequisites — see ./README.md:
 *   - OpenFin runtime installed (auto-downloaded on first launch)
 *   - A display (Windows GUI / xvfb on Linux); not headless
 *   - Markets-UI dev server reachable at http://localhost:5174
 *
 * Run via the root npm script:  npm run test:e2e:openfin
 */
export default defineConfig({
  test: {
    // Node environment — node-adapter runs in plain Node, not jsdom
    environment: 'node',
    globals: true,

    // OpenFin platform launch + first-time runtime download can be slow
    testTimeout: 60_000,
    hookTimeout: 90_000,

    // Run specs sequentially — multiple OpenFin platforms racing to bind
    // ports / Dexie databases would just confuse each other
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },

    include: ['specs/**/*.e2e.spec.ts'],

    // No retries in dev — if a flake shows up, surface it
    retry: 0,

    reporters: ['verbose'],
  },
});
