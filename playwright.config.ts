import { defineConfig, devices } from '@playwright/test';

// Playwright E2E config. The dev server (client + server) is started automatically
// by the webServer block below when running `npm run test:e2e`.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:45273',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:45273',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
