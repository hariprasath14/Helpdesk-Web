import { defineConfig, devices } from '@playwright/test';

/**
 * Builds the demo's sample data (e2e/demo/seed.demo.ts) against the real local API: `npm run
 * demo:snapshot`. Separate from the end-to-end suite, which never runs it.
 */
export default defineConfig({
  testDir: 'e2e/demo',
  testMatch: '*.demo.ts',
  workers: 1,
  reporter: [['list']],
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://localhost:5173', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
