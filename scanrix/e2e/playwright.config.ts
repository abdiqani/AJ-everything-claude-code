import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: '../test-results/e2e-report' }]],
  use: {
    baseURL: process.env.WEB_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Start local dev server automatically for E2E tests
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev --workspace=packages/web',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
