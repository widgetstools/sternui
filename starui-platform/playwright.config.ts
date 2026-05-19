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
      command: 'npm run dev --workspace=@starui/demo-react',
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
      command: 'npm run dev --workspace=@starui/markets-ui-react-reference',
      port: 5174,
      reuseExistingServer: true,
      timeout: 90_000,
    },
  ],
});
