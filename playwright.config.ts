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
      command: 'npm --prefix apps run dev:source -w @starui/demo-react',
      port: 5190,
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      command: 'npm --prefix apps run dev:source -w @starui/demo-configservice-react',
      port: 5191,
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      command: 'npm --prefix apps run dev:source -w @starui/markets-ui-react-reference',
      port: 5174,
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      command: 'npm --prefix apps run dev:source -w @starui/e2e-browser-blotter',
      port: 5180,
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      // Lab app's `dev:source` sets `STARUI_DEV_SOURCE=1` so vite resolves
      // @starui/grid straight out of `packages/` source. `--no-open` keeps CI
      // from popping a browser tab. `--force` clobbers any stale `.vite/deps`
      // prebundle — required because the e2e suite often runs minutes
      // after a fresh `npm ci`, when the optimizer prebundle would still
      // reflect whatever subset of `@starui/grid` source happened to be on
      // disk during the first dev start. Without it, newly-added grid
      // modules (alerts, etc.) get silently dropped from the served bundle.
      // Port matches `apps/demos/markets-grid-lab/vite.config.ts`.
      command: 'npm --prefix apps run dev:source -w @starui/markets-grid-lab -- --no-open --force',
      port: 5300,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // Platform hooks demo — AppData bootstrap + grid event bindings.
      // Port matches `apps/demos/platform-hooks-demo/vite.config.ts`.
      // host-data resolves to dist exports — build before dev so bootstrap JSON parsing is current.
      command: 'npm run build --workspace=@starui/host-data && npm run build --workspace=@starui/widgets-react && npm --prefix apps run dev:source -w @starui/platform-hooks-demo -- --no-open --force',
      port: 5214,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // STOMP minimal app — hosts the DataProvider editor's Columns tab,
      // which lives in `@starui/widgets-react`. That package resolves to its
      // dist exports (only `@starui/grid` is consumed as source), so build it
      // first or the editor serves stale code. Port matches
      // `apps/demos/stomp-marketsgrid-minimal/vite.config.ts`.
      command: 'npm run build --workspace=@starui/widgets-react && npm --prefix apps run dev:source -w @starui/stomp-marketsgrid-minimal -- --no-open --force',
      port: 5213,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
