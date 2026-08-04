import { defineConfig } from '@playwright/test';

/**
 * Isolated e2e config for the wide-book Perspective lab
 * (`apps/demos/perspective-ssrm-lab`, port 5301).
 *
 * Separate from `playwright.perspective.config.ts`, which drives
 * `minimal-perspective-table` on 5273 against the STOMP fixture. Three reasons,
 * all properties of the surface rather than preferences:
 *
 *   1. **No broker.** This lab generates its book inside the SharedWorker, so
 *      nothing here waits on a 20,000-row snapshot that "sometimes wedges".
 *      Coupling a column-window test to that fixture would give it a documented
 *      pre-existing failure to inherit.
 *   2. **Only this app has a wide grid.** A column window means nothing over a
 *      book narrower than a viewport; the Stress tab's 404-column variant is
 *      the only wide surface in the repo.
 *   3. **Production build, never the dev server** — same reason as the sibling
 *      config: Vite dev serves hundreds of module requests per window and the
 *      page can simply never finish.
 *
 *   npx playwright test -c playwright.perspective-lab.config.ts
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'perspective-column-window.spec.ts',
  // The 50,000-row book is generated in the worker on first attach; a cold
  // profile takes 12-15 s to the first row and each test opens a fresh page.
  timeout: 300_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5301',
    headless: true,
    viewport: { width: 1600, height: 1000 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command:
        'npm --prefix apps run build -w @starui/perspective-ssrm-lab && npm --prefix apps run preview -w @starui/perspective-ssrm-lab -- --port 5301 --strictPort',
      port: 5301,
      reuseExistingServer: true,
      timeout: 300_000,
    },
  ],
});
