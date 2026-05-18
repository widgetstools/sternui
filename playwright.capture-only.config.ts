/**
 * Capture-only playwright config — reuses the same project/timeout
 * settings as the main config but ASSUMES an external dev server is
 * already running on :5190. Used by the visual-reference capture
 * workflow when driving v1 from a sandbox that can't bootstrap all
 * three webServers from inside the playwright run.
 *
 * Boot the demo separately, then:
 *
 *     npx playwright test --config=playwright.capture-only.config.ts \
 *       e2e/visual-reference-capture.spec.ts
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5190',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
