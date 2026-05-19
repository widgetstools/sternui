import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './apps/demo-react/e2e',
  timeout: 30_000,
  retries: 0,
  workers: 4,
  use: {
    baseURL: 'http://localhost:5190',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run dev --workspace=@stargrid/demo-react',
    port: 5190,
    reuseExistingServer: true,
    timeout: 90_000,
  },
});
