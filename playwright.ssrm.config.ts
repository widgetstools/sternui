import { defineConfig } from '@playwright/test';

/**
 * Isolated e2e config for the SSRM STOMP provider V2 pull plane
 * (`e2e/ssrm-pull/*.spec.ts` — docs/SSRM_PROVIDER_V2_DESIGN.md, P5).
 *
 * This is the coverage class whose absence hid the V1 bugs: multi-tab
 * worker sharing, reload-with-peer, restart/generation adoption, edit
 * convergence and live-feed aggregate behaviour, driven against the
 * REAL stack — stomp-view-server (ws://localhost:8081) → provider
 * SharedWorker (Perspective table) → AG Grid SSRM in the lab spike
 * (`/spikes/ssrmGrid.html` on :5300).
 *
 * Separate from the main `playwright.config.ts` on purpose: the suite
 * needs the STOMP feed server (which the main topology doesn't boot),
 * and one worker — the specs share one live feed and several open two
 * tabs on ONE SharedWorker, so parallel contexts would fight over
 * broker CPU and make tick-timing assertions flaky.
 *
 *   npm run e2e:ssrm
 *   npx playwright test -c playwright.ssrm.config.ts
 */
export default defineConfig({
  testDir: './e2e/ssrm-pull',
  // Cold runs pay vite's first transform of the spike + Perspective wasm
  // boot inside the SharedWorker before the seed even starts.
  timeout: 120_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5300',
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      // The STOMP feed (snapshot + live ticks) the provider worker dials.
      command: 'npm --prefix apps run dev -w @starui/stomp-view-server',
      port: 8081,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // Lab app serving the spike page. `--force` for the same reason as
      // the main config: clobber a stale `.vite/deps` prebundle.
      command: 'npm --prefix apps run dev -w @starui/markets-grid-lab -- --no-open --force',
      port: 5300,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
