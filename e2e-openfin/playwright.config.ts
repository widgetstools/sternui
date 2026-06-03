/**
 * Playwright config for the OpenFin e2e harness.
 *
 * Independent of the root /e2e/ Playwright config — different webServer
 * (apps/tarball/e2e-openfin-workspace on :5181), different fixture set, single
 * worker because the OpenFin runtime holds the CDP port.
 *
 * The launchOpenFin fixture spawns the OpenFin platform via
 * @openfin/node-adapter, then attaches Playwright to the runtime via
 * chromium.connectOverCDP(). Specs receive a Playwright Page pointing
 * at the blotter view.
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    headless: true,
  },
  webServer: {
    command: 'npm --prefix .. run dev:openfin-workspace',
    url: 'http://localhost:5181',
    reuseExistingServer: true,
    timeout: 90_000,
  },
});
