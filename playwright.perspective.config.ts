import { defineConfig } from '@playwright/test';

/**
 * Isolated e2e config for the Perspective pull path
 * (apps/demos/minimal-perspective-table against the STOMP fixture).
 *
 * Separate from `playwright.config.ts` for three reasons, each of them a
 * property of this surface rather than a preference:
 *
 *   1. **Production build, never the dev server.** Vite dev serves every
 *      `@starui/*` import as a separate module request; the Perspective demo
 *      loads a 5 MB engine chunk on top of that, and under Chromium's
 *      connection cap the page can simply never finish. Every measurement on
 *      this path has had to be taken against `vite preview`, so the spec runs
 *      there too. That is why the webServer builds first.
 *   2. **The book is external.** It comes from the in-repo STOMP view server,
 *      which takes ~18 s to deliver its 20,000-row snapshot — hence the long
 *      timeouts below and the wait on the status bar rather than on rows.
 *   3. **One worker.** All windows share ONE worker-held Table, and the
 *      Perspective SharedWorker survives page reloads; parallel workers would
 *      contend for the same engine and make timings meaningless.
 *
 *   npx playwright test -c playwright.perspective.config.ts
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'perspective-*.spec.ts',
  // `perspective-column-window.spec.ts` matches that glob and belongs to a
  // different app on a different port with no broker — see
  // `playwright.perspective-lab.config.ts`.
  testIgnore: 'perspective-column-window.spec.ts',
  // The snapshot alone is ~18 s and a cold worker boot adds to it.
  timeout: 120_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5273',
    headless: true,
    // Taller than the shared suite's 800: the settings sheet's grouped nav
    // menubar is clipped under its own header at 800, and the alerts panel
    // cannot be reached at all.
    viewport: { width: 1400, height: 1000 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'npm run dev:stomp',
      port: 8081,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // Build then preview: see (1) above. `reuseExistingServer` keeps a local
      // preview you already have running from being rebuilt on every run.
      command:
        'npm --prefix apps run build -w @starui/minimal-perspective-table && npm --prefix apps run preview -w @starui/minimal-perspective-table -- --port 5273 --strictPort',
      port: 5273,
      reuseExistingServer: true,
      timeout: 300_000,
    },
  ],
});
