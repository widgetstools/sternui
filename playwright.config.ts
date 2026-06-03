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
      command: 'cross-env STARUI_DEV_SOURCE=1 npm --prefix apps run dev -w @starui/demo-react-workspace',
      port: 5190,
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      command: 'npm --prefix apps run dev -w @starui/demo-configservice-react-workspace',
      port: 5191,
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      command: 'cross-env STARUI_DEV_SOURCE=1 npm --prefix apps run dev -w @starui/markets-ui-react-reference-workspace',
      port: 5174,
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      command: 'npm --prefix apps run dev -w @starui/e2e-browser-blotter-workspace',
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
      // Port matches `apps/workspace/markets-grid-lab/vite.config.ts`.
      command: 'cross-env STARUI_DEV_SOURCE=1 npm --prefix apps run dev -w @starui/markets-grid-lab-workspace -- --no-open --force',
      port: 5300,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // Platform hooks demo — AppData bootstrap + grid event bindings.
      // Port matches `apps/workspace/platform-hooks-demo/vite.config.ts`.
      // host-data resolves to dist exports — build before dev so bootstrap JSON parsing is current.
      command: 'npm run build --workspace=@starui/host-data && npm run build --workspace=@starui/widgets-react && cross-env STARUI_DEV_SOURCE=1 npm --prefix apps run dev -w @starui/platform-hooks-demo-workspace -- --no-open --force',
      port: 5214,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
