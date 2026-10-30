import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests drive the real app in a real browser against the real API. Locally, start
 * helpdesk-api first (npm run dev in that repo); Playwright starts this app's dev server itself.
 * From Step 0b the pipeline runs them against dev.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // One browser at a time locally (more crashed Chromium on a developer machine with ~1 GB free);
  // two in the pipeline.
  workers: process.env.CI ? 2 : 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  // A busy developer machine can take more than the default 5 s to draw a page the first time;
  // each check waits up to 10 s, and a test up to a minute.
  expect: { timeout: 10_000 },
  timeout: 60_000,
  use: {
    baseURL,
    // The temporary dev server's test mailbox has a shared password.
    ...(process.env.E2E_SITE_USER && process.env.E2E_SITE_PASSWORD
      ? {
          httpCredentials: {
            username: process.env.E2E_SITE_USER,
            password: process.env.E2E_SITE_PASSWORD,
          },
        }
      : {}),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Every screen must work at phone width (done gate point 4).
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
