import { defineConfig, devices } from '@playwright/test';

// Browser tests (e2e/). They run the built app against e2e/server.mjs: the real server functions on
// a throwaway local database, with all outside network calls blocked. Never against a real site.
//   npm run build && npm run e2e
const PORT = Number(process.env.E2E_PORT || 8888);

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: 'block',
    timezoneId: 'Asia/Kolkata',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node e2e/server.mjs',
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/api/auth`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
