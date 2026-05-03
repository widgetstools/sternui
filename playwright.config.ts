import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  // Parallelize across 4 workers. Default is 1 on a single project,
  // which made the suite run serially in ~12-19 min on Windows.
  // Playwright workers each get an isolated browser context, so tests
  // don't share state. Tests that mutate document.documentElement
  // theme can interleave inside the same context — those are the
  // ones to watch for parallelism-induced flakes.
  workers: 4,
  use: {
    baseURL: 'http://localhost:5190',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: [
    {
      command: 'npm run dev -w @marketsui/demo-react',
      port: 5190,
      reuseExistingServer: true,
      timeout: 90_000,
    },
    // demo-configservice-react runs on port 5191. The
    // v2-template-create-apply spec parameterises across both demos
    // (Dexie-direct on 5190 vs ConfigService on 5191) — without this
    // entry the 5191 cases hit ERR_CONNECTION_REFUSED.
    {
      command: 'npm run dev -w @marketsui/demo-configservice-react',
      port: 5191,
      reuseExistingServer: true,
      timeout: 90_000,
    },
    // markets-ui-react-reference runs on port 5174 (vite default).
    // The hosted-markets-grid spec exercises BlottersMarketsGrid at
    // /blotters/marketsgrid against the real reference app — both
    // pre-migration (HostedFeatureView chain) and post-migration
    // (HostedMarketsGrid wrapper) must keep this spec green.
    {
      command: 'npm run dev -w @marketsui/markets-ui-react-reference',
      port: 5174,
      reuseExistingServer: true,
      timeout: 90_000,
    },
  ],
});
