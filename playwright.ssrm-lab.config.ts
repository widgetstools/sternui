import { defineConfig } from '@playwright/test';

/**
 * e2e config for the dedicated SSRM MarketsGrid lab
 * (`apps/demos/ssrm-markets-grid-lab`, port 5321).
 *
 * This is the config the ssrm surface never had. Session 6 recorded the gap
 * plainly: the interaction on that surface is covered by committed Playwright
 * PROBES — real input against a production build, reproducible from the README
 * — but not by a spec under `e2e/`, because adding one meant a fourth Playwright
 * config with its own web server. This is that config, and the app it points at
 * is the reason it is now worth having: one engine, one grid, no query
 * parameter deciding what is mounted, so a spec cannot silently assert against
 * the wrong surface.
 *
 * Three properties inherited from the sibling configs, each for a measured
 * reason rather than a preference:
 *
 *   1. **Production build, never the dev server.** Vite dev serves hundreds of
 *      module requests per window and a page can simply never finish loading.
 *   2. **`workers: 1`, no parallelism.** The book lives in a SharedWorker keyed
 *      by script URL and name, so two pages share ONE book — which is the point
 *      of the architecture and makes concurrent specs interfere by design.
 *   3. **A long timeout.** The 50,000-row book is generated in the worker on
 *      first attach; a cold profile is seconds to the first row, and each test
 *      opens a fresh page.
 *
 *   npx playwright test -c playwright.ssrm-lab.config.ts
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'ssrm-marketsgrid.spec.ts',
  timeout: 300_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5321',
    headless: true,
    viewport: { width: 1600, height: 1000 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command:
        'npm --prefix apps run build -w @starui/ssrm-markets-grid-lab && npm --prefix apps run preview -w @starui/ssrm-markets-grid-lab -- --port 5321 --strictPort',
      port: 5321,
      reuseExistingServer: true,
      timeout: 300_000,
    },
  ],
});
