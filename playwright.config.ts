import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 4,
  use: {
    baseURL: 'http://localhost:5190',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'STARUI_DEV_SOURCE=1 npm run dev --workspace=@starui/demo-react',
      port: 5190,
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      command: 'npm run dev --workspace=@starui/demo-configservice-react',
      port: 5191,
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      command: 'STARUI_DEV_SOURCE=1 npm run dev --workspace=@starui/markets-ui-react-reference',
      port: 5174,
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: 'npm run dev --workspace=@starui/e2e-browser-blotter',
      port: 5180,
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      // Lab app uses `STARUI_DEV_SOURCE=1` so vite resolves @starui/grid
      // straight out of `packages/` source. `--no-open` keeps CI from
      // popping a browser tab. `--force` clobbers any stale `.vite/deps`
      // prebundle — required because the e2e suite often runs minutes
      // after a fresh `npm ci`, when the optimizer prebundle would still
      // reflect whatever subset of `@starui/grid` source happened to be on
      // disk during the first dev start. Without it, newly-added grid
      // modules (alerts, etc.) get silently dropped from the served bundle.
      // Port matches `apps/markets-grid-lab/vite.config.ts`.
      command: 'STARUI_DEV_SOURCE=1 npm run dev --workspace=@starui/markets-grid-lab -- --no-open --force',
      port: 5300,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
