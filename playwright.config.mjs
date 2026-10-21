import { defineConfig } from '@playwright/test';

// A separate, owned loopback server: never attach tests to a user's open app.
const port = Number(process.env.QUOTELENS_SMOKE_PORT || 4832);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('QUOTELENS_SMOKE_PORT must be an integer from 1024 to 65535');
}
const browser = process.env.QUOTELENS_SMOKE_BROWSER || 'chrome';
if (!['chrome', 'msedge', 'chromium'].includes(browser)) {
  throw new Error('QUOTELENS_SMOKE_BROWSER must be chrome, msedge or chromium');
}

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30_000,
  globalTimeout: 180_000,
  expect: { timeout: 5_000 },
  outputDir: 'browser-artifacts/runs',
  reporter: [
    ['line'],
    ['json', { outputFile: 'browser-artifacts/results.json' }],
    ['html', { outputFolder: 'browser-artifacts/report', open: 'never' }],
  ],
  use: {
    browserName: 'chromium',
    // Uses an already installed Chrome by default. No browser download or user profile.
    channel: browser === 'chromium' ? undefined : browser,
    headless: true,
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    acceptDownloads: true,
    serviceWorkers: 'block',
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node scripts/serve.mjs --dist --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 10_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
