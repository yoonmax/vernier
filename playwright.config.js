import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4178',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        // Full Chromium in new headless mode. The separate headless shell lacks Pointer Lock.
        channel: 'chromium',
        launchOptions: { args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] },
      },
    },
    { name: 'firefox', use: { browserName: 'firefox' }, testMatch: 'browsers.spec.js' },
    { name: 'webkit', use: { browserName: 'webkit' }, testMatch: 'browsers.spec.js' },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4178 --strictPort',
    url: 'http://localhost:4178',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
